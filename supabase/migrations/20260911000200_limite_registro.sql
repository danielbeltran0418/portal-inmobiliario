-- ============================================================================
-- La regla de registro. NO es la del login, y esa es la razon de ser de esta
-- migracion.
--
-- El login cuenta FALLOS: cinco intentos fallidos sobre un correo. El spam de
-- altas son registros EXITOSOS, cada uno con un correo distinto -- un
-- limitador que contara fallos de registro no bloquearia a nadie.
--
-- Y con p_ip nula no hay degradacion posible: "contar por clave" contaria uno,
-- porque cada alta usa otro correo. Para el login esa degradacion es MAS
-- estricta; aqui seria SIN LIMITE, que es justo el modo de fallo que
-- src/lib/http/ip-cliente.ts se escribio para evitar. Se falla cerrado.
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
    ELSE true
  END;
$$;

-- CREATE OR REPLACE conserva la ACL, asi que los REVOKE de 20260911000100
-- siguen en pie. Se repiten porque es barato y deja el fichero autocontenido.
REVOKE EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  TO service_role;
