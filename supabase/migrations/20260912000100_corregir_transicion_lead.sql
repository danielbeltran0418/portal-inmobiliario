-- ============================================================================
-- Hallazgo I1 de la revision final de SP4 (sp4-leads,
-- .superpowers/sdd/2026-09-11-sp4-leads/revision-final.md): reenviar el MISMO
-- estado terminal sobre un lead ya respondido ("aceptar" dos veces) tenia
-- EXITO EN SILENCIO en vez de rechazarse. Viola el criterio de aceptacion 6
-- del spec de SP4 ("un lead ya respondido no cambia, y no se reporta como
-- exito").
--
-- La version original de validar_transicion_lead() (20260911000500):
--
--   IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
--   IF OLD.estado <> 'nuevo' THEN RAISE EXCEPTION ...
--
-- evaluaba el atajo de no-op ANTES de comprobar si el lead ya estaba
-- respondido. Con un lead 'aceptado' y un segundo
-- UPDATE ... SET estado = 'aceptado', NEW.estado no es distinto de
-- OLD.estado: la funcion retornaba sin lanzar la excepcion, y el UPDATE
-- terminaba en exito (1 fila afectada, sin error). El CAMBIO entre estados
-- terminales distintos (aceptado -> descartado) SI se bloqueaba bien; el
-- hueco era especifico de reenviar el MISMO valor.
--
-- 20260911000500 ya esta APLICADA: no se edita. Este arreglo reemplaza la
-- funcion completa con CREATE OR REPLACE FUNCTION -- el trigger
-- leads_validar_transicion ya la invoca por nombre, y los privilegios
-- (REVOKE de PUBLIC/anon/authenticated, GRANT a service_role) que fijo esa
-- migracion sobre esta misma firma se conservan sin repetirlos, igual que
-- 20260908000400 hizo con exigir_precio_para_publicar().
--
-- ----------------------------------------------------------------------------
-- El arreglo, y el caso limite que hay que sostener a la vez
-- ----------------------------------------------------------------------------
-- No basta con mover el orden de las dos comprobaciones tal cual: un UPDATE
-- que no toca `estado` en absoluto (por ejemplo, un proceso administrativo
-- que corrija una columna desnormalizada de un lead ya respondido) tiene que
-- seguir funcionando -- si no, cualquier escritura futura sobre esas filas
-- quedaria bloqueada por este mismo trigger, aunque no tenga nada que ver con
-- el ciclo de vida del lead. Pero un UPDATE que reenvia el MISMO estado
-- terminal (estado = 'aceptado' sobre un lead ya 'aceptado') SI tiene que
-- fallar.
--
-- Mirando solo NEW.estado vs OLD.estado, estos dos casos son IDENTICOS: en
-- ambos NEW.estado = OLD.estado. Se distinguen por si ALGUNA OTRA columna de
-- la fila cambio. authenticated solo tiene GRANT UPDATE (estado) sobre
-- `leads` (20260911000300) -- es la UNICA columna que un vendedor puede
-- escribir -- asi que un reenvio suyo del mismo estado deja la fila IDENTICA
-- en todas las demas columnas (ninguna otra pudo cambiar: no tiene permiso).
-- Un UPDATE que si modifica otra columna, en cambio, no es un reenvio de
-- estado. Comparar la fila COMPLETA (NEW IS NOT DISTINCT FROM OLD) capta la
-- diferencia sin tener que enumerar de antemano que columna toca cada
-- llamador futuro.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validar_transicion_lead() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Transicion real: se pide un valor de estado distinto del que tenia la fila.
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF OLD.estado <> 'nuevo' THEN
      -- SQLSTATE propio (Hallazgo M2 de la misma revision): la version
      -- anterior usaba el generico P0001, mientras que crear_lead()
      -- (20260911000400) ya usa codigos propios LD001/LD002/LD003 para que
      -- ningun llamador tenga que distinguir causas por el TEXTO del
      -- mensaje. LD004 es el siguiente numero libre de esa misma clase.
      -- src/app/(vendedor)/panel/leads/acciones.ts y
      -- tests/rls/transicion-lead.test.ts se actualizan para distinguir por
      -- error.code en vez de una expresion regular sobre error.message.
      RAISE EXCEPTION 'Este lead ya fue respondido' USING ERRCODE = 'LD004';
    END IF;

    NEW.respondido_en := now();

    -- Por registrar_evento_auditoria() (20260831000700), y no un INSERT
    -- directo: esa funcion es el UNICO escritor documentado de
    -- registro_auditoria y protege contra 23503 si el actor ya no existe.
    PERFORM public.registrar_evento_auditoria(
      CASE NEW.estado WHEN 'aceptado' THEN 'lead_aceptado' ELSE 'lead_descartado' END,
      'lead',
      NEW.id,
      auth.uid(),
      jsonb_build_object('propiedad_id', NEW.propiedad_id)
    );

    RETURN NEW;
  END IF;

  -- NEW.estado coincide con el que ya tenia la fila. Ver el bloque de
  -- comentarios de arriba: se rechaza SOLO si, ademas, la fila queda
  -- exactamente igual en TODAS sus columnas (el reenvio de un vendedor, que
  -- no puede tocar nada mas que estado) y el lead ya salio de 'nuevo'. Un
  -- UPDATE que si cambia alguna otra columna pasa sin tocar respondido_en
  -- ni la auditoria: no es una transicion de estado.
  IF OLD.estado <> 'nuevo' AND NEW IS NOT DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Este lead ya fue respondido' USING ERRCODE = 'LD004';
  END IF;

  RETURN NEW;
END $$;
