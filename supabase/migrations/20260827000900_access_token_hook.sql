CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_rol    text;
  v_claims jsonb;
BEGIN
  SELECT rol::text INTO v_rol
  FROM public.perfiles
  WHERE id = (event->>'user_id')::uuid;

  v_claims := event->'claims';

  IF v_claims->'app_metadata' IS NULL THEN
    v_claims := jsonb_set(v_claims, '{app_metadata}', '{}'::jsonb);
  END IF;

  v_claims := jsonb_set(
    v_claims, '{app_metadata,rol}',
    to_jsonb(COALESCE(v_rol, 'comprador'))
  );

  RETURN jsonb_set(event, '{claims}', v_claims);
END $$;

-- Solo el servicio de autenticacion puede ejecutar el hook.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- El hook necesita leer perfiles bajo su propio rol.
GRANT SELECT ON public.perfiles TO supabase_auth_admin;

CREATE POLICY perfiles_lectura_auth_admin ON public.perfiles
  FOR SELECT TO supabase_auth_admin
  USING (true);
