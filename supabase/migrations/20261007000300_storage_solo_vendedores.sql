-- CN-005 (parte de Storage): cualquier usuario autenticado, tambien un
-- comprador, podia subir archivos a su carpeta del bucket de propiedades. Solo
-- quien puede crear anuncios (vendedor o super_admin) tiene motivo para
-- hacerlo, igual que la politica de INSERT de public.propiedades.
DROP POLICY storage_propiedades_escritura ON storage.objects;
CREATE POLICY storage_propiedades_escritura ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'propiedades'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol IN ('vendedor', 'super_admin')
    )
  );
