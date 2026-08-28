CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rol public.rol_usuario;
BEGIN
  -- Lista blanca. 'super_admin' no esta aqui: cualquier otro valor cae en comprador.
  v_rol := CASE NEW.raw_user_meta_data->>'rol_solicitado'
             WHEN 'vendedor' THEN 'vendedor'::public.rol_usuario
             ELSE 'comprador'::public.rol_usuario
           END;

  INSERT INTO public.perfiles (id, rol, nombre, telefono)
  VALUES (
    NEW.id,
    v_rol,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre'), ''), 'Usuario'),
    NEW.raw_user_meta_data->>'telefono'
  );
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
