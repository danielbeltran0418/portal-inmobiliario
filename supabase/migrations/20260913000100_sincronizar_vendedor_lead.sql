-- ============================================================================
-- Hallazgo I2 de la revision final de SP4 (sp4-leads,
-- .superpowers/sdd/2026-09-11-sp4-leads/revision-final.md): `leads.vendedor_id`
-- esta desnormalizado a proposito (20260911000300 lo documenta: toda la RLS
-- de leads se apoya en el, para no depender de un EXISTS contra las dos
-- politicas de SELECT de `propiedades`), pero nada lo mantenia sincronizado
-- si `propiedades.vendedor_id` cambiaba despues de creado el lead.
--
-- El camino real: `propiedades_actualizacion_super_admin`
-- (20260827000600) tiene WITH CHECK (public.es_super_admin()) SIN
-- restriccion sobre vendedor_id -- a diferencia de la politica del dueno, que
-- si exige vendedor_id = auth.uid() y por tanto un vendedor normal NUNCA
-- puede reasignar su propia propiedad a otro. El revisor lo reprodujo con una
-- sesion super_admin AUTENTICA (no service_role) sobre PostgREST: tras
-- reasignar, el vendedor ORIGINAL seguia viendo el lead en su bandeja, podia
-- ACEPTARLO y ver correo y telefono reales del comprador; el vendedor NUEVO
-- (dueno real) no veia nada.
--
-- Hoy no es explotable -- no hay ninguna interfaz en `src/` que reasigne
-- propiedades -- pero SP7 (panel del super admin) es la candidata natural
-- para construir esa funcion, y dejar esto sin resolver es poner una mina
-- para quien la escriba.
--
-- ----------------------------------------------------------------------------
-- Decision: que hacer con los leads que YA estan 'aceptado' o 'descartado'
-- ----------------------------------------------------------------------------
-- Este trigger sincroniza SOLO los leads en estado 'nuevo'. Los que ya
-- salieron de 'nuevo' ('aceptado' o 'descartado') se quedan con el vendedor
-- ORIGINAL, deliberadamente. Razonamiento:
--
-- 1. No hay nada nuevo que proteger. El vendedor original ya vio el correo y
--    el telefono reales del comprador en el momento en que acepto -- eso ya
--    paso, y no hay forma de que mover la fila despues se lo "quite": el dato
--    ya lo tiene, dentro o fuera de la base. La preocupacion de
--    confidencialidad que motiva TODO el diseno de leads/leads_contacto
--    (20260911000300) es sobre CONTACTO NUNCA VISTO, no sobre contacto ya
--    entregado. Por eso este trigger si actua sobre 'nuevo': ahi la
--    reasignacion puede evitar una exposicion que TODAVIA no ocurrio (el
--    vendedor original podria aceptar el lead DESPUES de dejar de ser el
--    dueno, y ver un contacto que nunca deberia haber visto -- exactamente
--    la reproduccion en vivo del revisor).
--
-- 2. Es la lectura correcta de "quien es dueno de este lead" para un trato ya
--    cerrado. aceptar/descartar es una decision que el vendedor ORIGINAL ya
--    tomo, con su propia auditoria (registro_auditoria.actor_id apunta a el,
--    escrita por validar_transicion_lead) y potencialmente su propia gestion
--    fuera de la aplicacion (una llamada, un correo). Migrarlo al vendedor
--    nuevo pondria en su bandeja una conversacion que nunca tuvo, con un
--    comprador que no conoce, como si fuera un lead fresco suyo -- confunde
--    mas de lo que soluciona, y no le da al vendedor nuevo ninguna
--    capacidad legitima nueva (el trato ya esta resuelto).
--
-- 3. El vendedor NUEVO si necesita ver los leads ABIERTOS de la propiedad que
--    ahora administra -- esos son consultas activas que le corresponde
--    atender a partir de ahora. Por eso 'nuevo' se sincroniza sin excepcion.
--
-- No es la unica decision defendible (mover TODO simplificaria el invariante
-- "leads.vendedor_id siempre es el dueno actual de la propiedad"), pero deja
-- el historial de un trato ya cerrado con quien lo cerro, y cierra la unica
-- via de exposicion de contacto NUEVO que el revisor pudo reproducir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sincronizar_vendedor_lead() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- SECURITY DEFINER por necesidad: authenticated solo tiene
  -- GRANT UPDATE (estado) sobre `leads` (20260911000300) -- vendedor_id no es
  -- suya para escribir, ni siquiera para el super_admin que dispara este
  -- trigger reasignando la propiedad. La funcion corre con los privilegios de
  -- quien la creo, que si puede escribir cualquier columna de `leads`.
  --
  -- Solo los leads en 'nuevo': ver la decision documentada arriba.
  UPDATE public.leads
     SET vendedor_id = NEW.vendedor_id
   WHERE propiedad_id = NEW.id
     AND estado = 'nuevo';

  RETURN NEW;
END $$;

-- AFTER UPDATE, y no BEFORE: esta fila (la de `propiedades`) no se modifica a
-- si misma, solo dispara una escritura sobre otra tabla. La condicion WHEN
-- evita tocar `leads` en cada UPDATE de `propiedades` -- precio, estado,
-- fotos -- y limita el trabajo a los UPDATE que de verdad cambian el dueno.
CREATE TRIGGER propiedades_sincronizar_vendedor_lead
  AFTER UPDATE ON public.propiedades
  FOR EACH ROW
  WHEN (NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id)
  EXECUTE FUNCTION public.sincronizar_vendedor_lead();

REVOKE EXECUTE ON FUNCTION public.sincronizar_vendedor_lead() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sincronizar_vendedor_lead() TO service_role;
