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
    RAISE EXCEPTION 'La propiedad no existe' USING ERRCODE = 'P0002';
  END IF;

  -- Mensajes DISTINTOS a proposito: mapear a ciegas un codigo compartido por
  -- dos comprobaciones es un defecto que este proyecto ya cometio.
  IF v_estado <> 'publicada' THEN
    RAISE EXCEPTION 'La propiedad no esta publicada' USING ERRCODE = 'P0001';
  END IF;

  IF v_vendedor = v_comprador THEN
    RAISE EXCEPTION 'No puedes contactar sobre tu propia propiedad' USING ERRCODE = 'P0001';
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
  INSERT INTO public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadatos)
  VALUES (v_comprador, 'lead_capturado', 'lead', v_lead,
          jsonb_build_object('propiedad_id', p_propiedad_id, 'vendedor_id', v_vendedor));

  RETURN v_lead;
END $$;

REVOKE EXECUTE ON FUNCTION public.crear_lead(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.crear_lead(uuid, text, text) TO authenticated, service_role;
