-- El brief de la Task 2 crea la tabla perfiles y sus tres capas de defensa
-- sobre 'rol', pero no incluye ningun mecanismo para poblarla cuando se
-- registra un usuario. Sin esto, ni ayudantes.ts (crearUsuarioDePrueba hace
-- un UPDATE, no un INSERT, sobre una fila que nunca llega a existir) ni un
-- registro real de un usuario producirian jamas una fila en perfiles.
--
-- SECURITY DEFINER: se ejecuta con los privilegios del dueño de la funcion,
-- no de quien dispara el INSERT en auth.users, para poder escribir en
-- public.perfiles pese a que esa tabla tiene RLS activo y ninguna politica
-- de INSERT propia (por diseño: la fila la crea este trigger, no el cliente).
CREATE OR REPLACE FUNCTION public.manejar_usuario_nuevo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, telefono)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    NEW.raw_user_meta_data->>'telefono'
  );
  RETURN NEW;
END $$;

CREATE TRIGGER usuarios_crear_perfil
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.manejar_usuario_nuevo();
