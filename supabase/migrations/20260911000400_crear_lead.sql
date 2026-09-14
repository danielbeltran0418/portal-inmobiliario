-- ============================================================================
-- El unico camino de escritura de un lead.
--
-- Por que una funcion y no un INSERT del cliente: el lead nace en DOS tablas a
-- la vez, y el telefono no va en `leads`. No hay forma de que un solo INSERT
-- del cliente coloque las dos filas, y dos INSERT separados dejarian la puerta
-- a un lead sin contacto.
--
-- Esto NO contradice el rechazo del RPC en la migracion anterior. Alli el
-- problema era de LECTURA: el vendedor conservaba el SELECT y podia saltarse la
-- funcion. Aqui es de ESCRITURA, y sin INSERT concedido no hay camino
-- alternativo -- lo hace cumplir la base, no el codigo de la aplicacion.
--
-- SECURITY DEFINER por necesidad: tiene que leer el correo de auth.users, a la
-- que authenticated no tiene acceso.
--
-- ----------------------------------------------------------------------------
-- Codigos de error propios, uno por comprobacion.
--
-- Las tres comprobaciones sobre la propiedad levantan MENSAJES distintos
-- (ver mas abajo), pero eso no basta: un llamador que necesite programatica
-- el motivo -- el server action de la Task 7, o cualquier otro futuro -- no
-- deberia tener que comparar texto para distinguirlos. Message es texto de
-- interfaz: cambia, se traduce, y quien dependa de el se rompe por motivos
-- que no son el comportamiento.
--
-- La primera version de esta migracion reutilizaba P0001 para "no publicada"
-- Y "propia" (dos comprobaciones, un solo codigo), exactamente el antipatron
-- que este mismo archivo denuncia mas abajo para 23514 en `propiedades`
-- (MENSAJE_REQUISITOS_PUBLICACION, src/lib/errores/mapear.ts): un codigo
-- compartido por dos causas obliga a mapear a ciegas o a leer el mensaje.
-- Se corrige aqui, antes de que nadie llegue a depender del codigo viejo.
--
-- P0001/P0002 se abandonan a proposito: son los genericos de PL/pgSQL
-- (RAISE EXCEPTION sin ERRCODE cae en P0001; ASSERT fallido en P0002) y ya
-- cargan ese significado generico en cualquier otra funcion PL/pgSQL de la
-- base. Apilarles ademas el significado de negocio de crear_lead() los
-- vuelve ambiguos igual que 23514. En su lugar se usa una clase propia,
-- 'LD' -- dentro del rango que el estandar SQL reserva para el uso de la
-- implementacion (clases que empiezan por un digito 5-9 o una letra I-Z;
-- las que empiezan por 0-4 o A-H son las que el estandar define y PostgreSQL
-- ya ocupa), y por tanto nunca choca con un codigo real de Postgres:
--
--   LD001  la propiedad no existe
--   LD002  la propiedad existe pero no esta publicada
--   LD003  la propiedad es del mismo usuario que intenta contactar
--
-- Cada una tiene su propio codigo Y su propio mensaje: ninguna herramienta
-- futura tiene que elegir entre programar contra el codigo o leer el texto.
-- ----------------------------------------------------------------------------
-- ============================================================================

CREATE OR REPLACE FUNCTION public.crear_lead(
  p_propiedad_id uuid, p_telefono text, p_mensaje text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_comprador uuid := auth.uid();
  v_vendedor  uuid;
  v_estado    public.estado_propiedad;
  v_nombre    text;
  v_correo    text;
  v_lead      uuid;
BEGIN
  IF v_comprador IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesion para contactar' USING ERRCODE = '42501';
  END IF;

  -- Se leen de la propiedad, no se creen al cliente. La funcion no acepta
  -- vendedor_id como parametro: no hay nada que falsificar.
  SELECT vendedor_id, estado INTO v_vendedor, v_estado
  FROM public.propiedades WHERE id = p_propiedad_id;

  IF v_vendedor IS NULL THEN
    RAISE EXCEPTION 'La propiedad no existe' USING ERRCODE = 'LD001';
  END IF;

  -- Mensajes Y CODIGOS distintos a proposito: mapear a ciegas un codigo
  -- compartido por dos comprobaciones es un defecto que este proyecto ya
  -- cometio (ver el bloque de comentarios de arriba).
  IF v_estado <> 'publicada' THEN
    RAISE EXCEPTION 'La propiedad no esta publicada' USING ERRCODE = 'LD002';
  END IF;

  IF v_vendedor = v_comprador THEN
    RAISE EXCEPTION 'No puedes contactar sobre tu propia propiedad' USING ERRCODE = 'LD003';
  END IF;

  SELECT nombre INTO v_nombre FROM public.perfiles WHERE id = v_comprador;
  SELECT email  INTO v_correo FROM auth.users      WHERE id = v_comprador;

  -- Las dos filas en la MISMA transaccion: un lead no existe sin su contacto.
  INSERT INTO public.leads (propiedad_id, comprador_id, vendedor_id, nombre_mostrado, mensaje)
  VALUES (p_propiedad_id, v_comprador, v_vendedor, v_nombre, p_mensaje)
  RETURNING id INTO v_lead;

  INSERT INTO public.leads_contacto (lead_id, correo, telefono)
  VALUES (v_lead, v_correo, p_telefono);

  -- La auditoria se escribe AQUI y no en el server action, por el mismo motivo
  -- que documenta 20260831000700: tiene que cubrir el evento, no el formulario.
  --
  -- Por registrar_evento_auditoria(), no por un INSERT directo: esa funcion
  -- (20260831000700) es el UNICO escritor documentado de registro_auditoria,
  -- y resuelve actor_id con una subconsulta que cae a NULL si el actor ya no
  -- existe en vez de reventar el INSERT con 23503 (FK). v_comprador siempre
  -- existe aqui -- viene de auth.uid() de la sesion que esta corriendo -- pero
  -- duplicar el INSERT en cada escritor es la misma trampa que esa migracion
  -- ya corrigio una vez: dos caminos que pueden divergir en vez de uno solo.
  PERFORM public.registrar_evento_auditoria(
    'lead_capturado',
    'lead',
    v_lead,
    v_comprador,
    jsonb_build_object('propiedad_id', p_propiedad_id, 'vendedor_id', v_vendedor)
  );

  RETURN v_lead;
END $$;

REVOKE EXECUTE ON FUNCTION public.crear_lead(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.crear_lead(uuid, text, text) TO authenticated, service_role;
