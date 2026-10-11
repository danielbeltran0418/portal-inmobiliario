-- Evitar que un barrio oculte la nueva ruta de planes.
ALTER TABLE public.barrios ADD CONSTRAINT barrios_slug_no_planes CHECK (slug <> 'planes');