-- ============================================================================
-- Limite de contactos por comprador: 20 leads en 24 horas (LD005).
--
-- crear_lead() no tenia ningun tope: una cuenta (o un bot con una cuenta)
-- podia dejar un lead en cada propiedad publicada del pais. Cada lead le llega
-- al vendedor y abre una conversacion con el asistente de IA, que cuesta. 20
-- al dia sobra para una persona buscando vivienda en serio.
--
-- El resto del cuerpo es IDENTICO al de 20261009000200 (sin oraculo LD001).
-- LD005 es el siguiente codigo libre de la clase LD (LD004 = lead ya respondido).
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

  -- Inexistente y no publicada responden IGUAL (codigo y texto): ver la
  -- cabecera de 20261009000200. Para quien llama, las dos son "no disponible".
  IF v_vendedor IS NULL OR v_estado <> 'publicada' THEN
    RAISE EXCEPTION 'La propiedad no esta disponible' USING ERRCODE = 'LD002';
  END IF;

  -- Limite de contactos (20261013000100): 20 leads por comprador en 24 h.
  -- Antes del INSERT y despues de las comprobaciones de la propiedad, para que
  -- un id inventado siga respondiendo igual que antes (sin oraculo).
  IF (SELECT count(*) FROM public.leads
      WHERE comprador_id = v_comprador AND creado_en > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'Demasiados contactos en 24 horas' USING ERRCODE = 'LD005';
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

-- El conteo del limite filtra por comprador y fecha.
CREATE INDEX IF NOT EXISTS leads_comprador_reciente_idx ON public.leads (comprador_id, creado_en DESC);
