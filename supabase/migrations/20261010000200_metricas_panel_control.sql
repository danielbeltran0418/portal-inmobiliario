-- ============================================================================
-- Metricas del panel de control, agregadas en la base.
--
-- src/lib/admin/metricas.ts descargaba tablas enteras para contarlas en
-- JavaScript (propiedades, leads, citas, pagos y TODOS los mensajes de la IA
-- con su texto), y ademas consultaba columnas que no existen:
--   conversaciones_ia.estado   (es estado_conversacion)
--   mensajes_ia.rol/metadatos  (es emisor; metadatos no existe)
-- Esas consultas fallaban y la telemetria de IA salia siempre en cero. Los
-- tokens se "estimaban" por longitud del texto teniendo tokens_entrada y
-- tokens_salida reales en cada mensaje. Y "citas completadas" contaba un
-- estado que estado_cita no tiene: ahora son las confirmadas cuya hora paso.
--
-- SECURITY INVOKER: corre con los permisos de quien llama, asi que RLS sigue
-- decidiendo que filas ve. Ademas exige super admin: no es un listado que un
-- vendedor tenga por que consultar, ni siquiera sobre sus propias filas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.metricas_panel_control()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT public.es_super_admin() THEN
    RAISE EXCEPTION 'Solo el super admin consulta las metricas' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'propiedades', (
      SELECT jsonb_build_object(
        'total', count(*),
        'publicadas', count(*) FILTER (WHERE estado = 'publicada'),
        'borradores', count(*) FILTER (WHERE estado = 'borrador'),
        'pausadas_o_rechazadas', count(*) FILTER (WHERE estado IN ('pausada', 'rechazada')),
        'destacadas', count(*) FILTER (WHERE destacada)
      ) FROM public.propiedades
    ),
    'leads', (
      SELECT jsonb_build_object(
        'total', count(*),
        'nuevos', count(*) FILTER (WHERE estado = 'nuevo'),
        'aceptados', count(*) FILTER (WHERE estado = 'aceptado'),
        'descartados', count(*) FILTER (WHERE estado = 'descartado')
      ) FROM public.leads
    ),
    'citas', (
      SELECT jsonb_build_object(
        'total', count(*),
        'confirmadas', count(*) FILTER (WHERE estado = 'confirmada'),
        'canceladas', count(*) FILTER (WHERE estado = 'cancelada'),
        'realizadas', count(*) FILTER (WHERE estado = 'confirmada' AND upper(rango) <= now())
      ) FROM public.citas
    ),
    'posicionamiento', (
      SELECT jsonb_build_object(
        'total', count(*),
        'activos', count(*) FILTER (WHERE estado = 'activo'),
        'monto', coalesce(sum(monto), 0)
      ) FROM public.pagos_posicionamiento
    ),
    'conversaciones', (
      SELECT jsonb_build_object(
        'total', count(*),
        'cerradas', count(*) FILTER (WHERE estado_conversacion = 'cerrada')
      ) FROM public.conversaciones_ia
    ),
    'mensajes', (
      SELECT jsonb_build_object(
        'total', count(*),
        'comprador', count(*) FILTER (WHERE emisor = 'comprador'),
        'agente_ia', count(*) FILTER (WHERE emisor = 'agente_ia'),
        'sistema', count(*) FILTER (WHERE emisor IN ('sistema', 'vendedor')),
        'tokens_entrada', coalesce(sum(tokens_entrada), 0),
        'tokens_salida', coalesce(sum(tokens_salida), 0)
      ) FROM public.mensajes_ia
    ),
    'incidentes_limite', (
      SELECT count(*) FROM public.registro_auditoria
      WHERE accion IN ('bloqueo_por_intentos', 'ia_limite_alcanzado')
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.metricas_panel_control() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_panel_control() TO authenticated, service_role;
