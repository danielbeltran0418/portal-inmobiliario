-- Auditoria de seguridad (M2): el super_admin entraba solo con contrasena. Una
-- contrasena filtrada era control total del portal: moderacion, barrios,
-- posicionamiento y los datos personales de leads y citas.
--
-- 1. es_super_admin() exige ademas que el token sea aal2 (segundo factor TOTP
--    verificado en esta sesion). Es la funcion que usan TODAS las politicas y
--    guardas de administracion, asi que un super_admin con solo la contrasena
--    queda, frente a la base, como un usuario sin privilegios -- tambien si
--    llama a PostgREST directo, sin pasar por la aplicacion.
--    El claim `aal` lo firma Supabase Auth: no se puede fabricar.
--
-- 2. Rama 'mfa' del limitador: 5 codigos fallidos por usuario en 15 minutos
--    bloquean la verificacion (la clave es el id del usuario, no el correo).
--    Un TOTP de 6 digitos sin limite se adivina por fuerza bruta.
--
-- 3. registrar_intento_accion audita tambien los intentos de segundo factor
--    (mfa_exitoso / mfa_fallido / bloqueo_por_intentos), igual que el login.
--    El cuerpo de 'login', 'registro' y 'recuperar' es IDENTICO al de
--    20261008000100 y 20260911000100.

-- ---------------------------------------------------------------------------
-- 1. Super admin = rol + segundo factor en esta sesion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     AND EXISTS (
       SELECT 1 FROM public.perfiles
       WHERE id = auth.uid() AND rol = 'super_admin'
     );
$$;

-- ---------------------------------------------------------------------------
-- 2. Limitador: rama 'mfa'
-- ---------------------------------------------------------------------------
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
        v_metadatos || jsonb_build_object('minutos_bloqueo', 15),
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

-- ---------------------------------------------------------------------------
-- 4. /doble-factor es una ruta del portal: ningun barrio puede usar ese slug.
--    Misma lista que RUTAS_RESERVADAS (src/lib/catalogo/rutas.ts).
-- ---------------------------------------------------------------------------
ALTER TABLE public.barrios DROP CONSTRAINT IF EXISTS barrios_slug_no_reservado;
ALTER TABLE public.barrios ADD CONSTRAINT barrios_slug_no_reservado CHECK (slug NOT IN (
  'api', 'buscar', 'catalogo', 'ciudad', 'confirmar', 'control', 'doble-factor', 'imagen', 'login',
  'mi-cuenta', 'notificaciones', 'panel', 'recuperar', 'registro', 'restablecer', 'sitemaps',
  'verificar-correo'
));
