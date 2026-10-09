-- Ventana de bloqueo de login de 15 a 5 minutos (la de 'mfa' sigue en 15).
--
-- Antes compartia version (20261014000100) con mfa_super_admin: dos PRs
-- redefinieron las mismas funciones, se mergearon los dos y `db reset` fallaba
-- con schema_migrations_pkey sin aplicar las migraciones siguientes. Va DESPUES
-- de mfa_super_admin y parte de SU version de las funciones (rama 'mfa' y
-- auditoria generalizada), cambiando solo la ventana de login y
-- minutos_bloqueo, que ahora depende de la accion.

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
        AND creado_en > now() - interval '5 minutes'
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
    -- Sin discriminar IP a proposito: quien adivina codigos ya tiene la
    -- contrasena, y rotar de IP no debe darle mas intentos.
    WHEN 'mfa' THEN (
      SELECT count(*) >= 5
      FROM public.intentos_accion
      WHERE accion = 'mfa'
        AND clave = lower(p_clave)
        AND exitoso = false
        AND creado_en > now() - interval '15 minutes'
    )
    ELSE true
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Auditoria de los intentos de segundo factor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_intento_accion(
  p_accion text, p_clave text, p_ip inet, p_exitoso boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor           uuid;
  v_bloqueado_antes boolean;
  v_metadatos       jsonb;
BEGIN
  IF p_accion = 'mfa' THEN
    -- En 'mfa' la clave ya es el id del usuario.
    SELECT p.id INTO v_actor FROM public.perfiles p WHERE p.id::text = lower(p_clave);
    v_metadatos := jsonb_build_object('ip_confiable', p_ip IS NOT NULL);
  ELSE
    SELECT p.id INTO v_actor
    FROM public.perfiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = lower(p_clave);
    v_metadatos := jsonb_build_object(
      'correo',       lower(p_clave),
      'ip_confiable', p_ip IS NOT NULL
    );
  END IF;

  v_bloqueado_antes := public.accion_bloqueada(p_accion, p_clave, p_ip);

  INSERT INTO public.intentos_accion (accion, clave, ip, exitoso)
  VALUES (p_accion, lower(p_clave), p_ip, p_exitoso);

  IF p_exitoso AND p_accion IN ('login', 'mfa') THEN
    DELETE FROM public.intentos_accion
    WHERE accion = p_accion
      AND clave = lower(p_clave)
      AND (p_accion = 'mfa' OR p_ip IS NULL OR ip = p_ip)
      AND exitoso = false;
  END IF;

  IF p_accion IN ('login', 'mfa') THEN
    PERFORM public.registrar_evento_auditoria(
      p_accion || CASE WHEN p_exitoso THEN '_exitoso' ELSE '_fallido' END,
      'sesion', v_actor, v_actor, v_metadatos, p_ip
    );
    IF NOT p_exitoso
       AND NOT v_bloqueado_antes
       AND public.accion_bloqueada(p_accion, p_clave, p_ip) THEN
      PERFORM public.registrar_evento_auditoria(
        'bloqueo_por_intentos', 'sesion', v_actor, v_actor,
        v_metadatos || jsonb_build_object('minutos_bloqueo', CASE WHEN p_accion = 'mfa' THEN 15 ELSE 5 END),
        p_ip
      );
    END IF;
  END IF;

  DELETE FROM public.intentos_accion WHERE creado_en < now() - interval '24 hours';
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_intento_accion(text, text, inet, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_accion(text, text, inet, boolean)
  TO service_role;
