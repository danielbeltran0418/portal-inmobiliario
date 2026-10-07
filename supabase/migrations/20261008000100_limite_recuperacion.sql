-- ============================================================================
-- Rama 'recuperar' del limitador ("¿Olvidaste tu contraseña?").
--
-- Cada peticion se registra como exitosa (src/app/(auth)/recuperar/acciones.ts)
-- y se cuentan PETICIONES, no fallos:
--   * 3 por correo y hora, desde cualquier IP: frena el bombardeo de correos de
--     recuperacion contra una victima.
--   * 10 por IP de confianza y hora: un solo origen no recorre la base de
--     correos.
-- Con p_ip nula queda solo el limite por correo, que sigue acotado (a
-- diferencia del registro, donde cada alta usa otro correo).
--
-- El cuerpo de 'login' y 'registro' es IDENTICO al de 20260911000200.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accion_bloqueada(p_accion text, p_clave text, p_ip inet)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE p_accion
    WHEN 'login' THEN (
      SELECT count(*) >= 5
      FROM public.intentos_accion
      WHERE accion = 'login'
        AND clave = lower(p_clave)
        AND (p_ip IS NULL OR ip = p_ip)
        AND exitoso = false
        AND creado_en > now() - interval '15 minutes'
    )
    WHEN 'registro' THEN (
      CASE WHEN p_ip IS NULL THEN true
      ELSE (
        SELECT count(*) >= 3
        FROM public.intentos_accion
        WHERE accion = 'registro'
          AND ip = p_ip
          AND exitoso = true
          AND creado_en > now() - interval '60 minutes'
      )
      END
    )
    WHEN 'recuperar' THEN (
      (
        SELECT count(*) >= 3
        FROM public.intentos_accion
        WHERE accion = 'recuperar'
          AND clave = lower(p_clave)
          AND creado_en > now() - interval '60 minutes'
      )
      OR (
        p_ip IS NOT NULL AND (
          SELECT count(*) >= 10
          FROM public.intentos_accion
          WHERE accion = 'recuperar'
            AND ip = p_ip
            AND creado_en > now() - interval '60 minutes'
        )
      )
    )
    ELSE true
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  TO service_role;
