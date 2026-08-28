CREATE TABLE public.perfiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol           public.rol_usuario NOT NULL DEFAULT 'comprador',
  nombre        text NOT NULL,
  telefono      text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- Capa 1: privilegio a nivel de columna. 'rol' simplemente no es actualizable.
REVOKE UPDATE ON public.perfiles FROM authenticated;
GRANT  UPDATE (nombre, telefono) ON public.perfiles TO authenticated;
GRANT  SELECT ON public.perfiles TO authenticated;

-- Capa 2: RLS a nivel de fila.
CREATE POLICY perfil_lectura_propia ON public.perfiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY perfil_actualizacion_propia ON public.perfiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Capa 3: trigger como red de seguridad.
--
-- auth.role() devuelve el rol del JWT: 'authenticated', 'anon' o 'service_role'.
-- En SQL directo (migraciones y seed) no hay JWT y devuelve NULL, por eso el
-- COALESCE lo trata como service_role: el rol SI se puede fijar por SQL.
CREATE OR REPLACE FUNCTION public.bloquear_cambio_rol() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.rol IS DISTINCT FROM OLD.rol
     AND COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'El rol no se modifica desde la aplicacion';
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

CREATE TRIGGER perfiles_bloquear_rol
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambio_rol();

-- Ayudante de rol, usado por las politicas de super_admin de esta y otras tablas.
-- Es SECURITY DEFINER a proposito: debe leer perfiles saltando la RLS de
-- perfiles, o la politica se llamaria a si misma en un ciclo infinito.
CREATE OR REPLACE FUNCTION public.es_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = auth.uid() AND rol = 'super_admin'
  );
$$;

CREATE POLICY perfil_lectura_super_admin ON public.perfiles
  FOR SELECT TO authenticated
  USING (public.es_super_admin());
