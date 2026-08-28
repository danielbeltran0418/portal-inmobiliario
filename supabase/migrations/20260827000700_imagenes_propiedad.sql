CREATE TABLE public.imagenes_propiedad (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  ruta_storage text NOT NULL,
  -- NOT NULL a proposito: el requisito de SEO "alt en todas las imagenes"
  -- deja de depender de que alguien se acuerde.
  alt_text     text NOT NULL CHECK (length(TRIM(alt_text)) >= 5),
  orden        smallint NOT NULL DEFAULT 0,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX imagenes_por_propiedad_idx ON public.imagenes_propiedad (propiedad_id, orden);

ALTER TABLE public.imagenes_propiedad ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.imagenes_propiedad TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.imagenes_propiedad TO authenticated;

-- Hereda la visibilidad de su propiedad.
CREATE POLICY imagenes_lectura_publica ON public.imagenes_propiedad
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.estado = 'publicada'
  ));

CREATE POLICY imagenes_lectura_dueno ON public.imagenes_propiedad
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ));

CREATE POLICY imagenes_escritura_dueno ON public.imagenes_propiedad
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ));

CREATE POLICY imagenes_actualizacion_dueno ON public.imagenes_propiedad
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ));

CREATE POLICY imagenes_borrado_dueno ON public.imagenes_propiedad
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ));

-- Bucket de Storage. La interfaz de carga la construye el SP3;
-- aqui quedan el bucket y sus politicas.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('propiedades', 'propiedades', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- No se otorga a anon: un caller anonimo no tiene auth.uid() y el listado
-- del bucket permitiria enumerar objetos de propiedades sin publicar. La
-- lectura publica de imagenes publicadas se sirve por URL publica de
-- Storage (bucket public=true), que no consulta RLS; esta politica solo
-- gobierna el listado/lectura autenticados de objetos, y se limita a la
-- carpeta propia del dueno, igual que escritura y borrado.
CREATE POLICY storage_propiedades_lectura ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'propiedades'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- Cada vendedor escribe solo dentro de su propia carpeta: <uid>/<archivo>
CREATE POLICY storage_propiedades_escritura ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'propiedades'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY storage_propiedades_borrado ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'propiedades'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
