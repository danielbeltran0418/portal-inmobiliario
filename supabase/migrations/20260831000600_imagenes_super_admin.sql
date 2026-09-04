-- ============================================================================
-- El super_admin puede moderar imagenes.
--
-- imagenes_propiedad era la unica tabla del modelo sin politica de super_admin.
-- perfiles, propiedades, barrios y registro_auditoria si la tienen. El spec le
-- asigna la moderacion al super_admin, y moderar un portal inmobiliario es en
-- buena parte moderar FOTOS: sin estas politicas, una imagen indebida en la
-- propiedad de otro vendedor no la podia quitar nadie desde la aplicacion.
--
-- ----------------------------------------------------------------------------
-- Politicas SEPARADAS, no un USING ampliado
-- ----------------------------------------------------------------------------
-- Se podria haber metido `OR public.es_super_admin()` dentro de las politicas
-- del dueno. No se hace, y el motivo esta escrito en 20260831000200: en una
-- politica de UPDATE, ampliar el USING amplia con el el WITH CHECK cuando este
-- es implicito. Alli se separaron a mano justamente para que "que filas puedo
-- tocar" y "como pueden quedar" no se movieran juntas sin que nadie lo
-- decidiera -- y esta migracion es exactamente el cambio que aquel comentario
-- anticipaba. Politicas aparte: las de RLS son permisivas y se combinan con
-- OR, asi que el efecto es el mismo y cada rol queda legible por separado.
--
-- ----------------------------------------------------------------------------
-- Por que tambien UPDATE, y no solo SELECT + DELETE
-- ----------------------------------------------------------------------------
-- Por consistencia con propiedades, donde el super_admin si tiene UPDATE: la
-- moderacion incluye corregir, no solo borrar (un alt_text abusivo se arregla
-- editandolo, y borrar la foto de una propiedad legitima por un texto malo es
-- desproporcionado). El WITH CHECK va explicito por lo dicho arriba.
--
-- Sin politica de INSERT: el super_admin modera lo que suben otros, no publica
-- fotos en nombre de un vendedor. Anadirla seria darle una capacidad que nadie
-- ha pedido y que enturbiaria la autoria de una imagen.
--
-- ----------------------------------------------------------------------------
-- Storage: el borrado tiene que llegar hasta el archivo
-- ----------------------------------------------------------------------------
-- Borrar la fila de imagenes_propiedad y dejar el objeto en el bucket seria
-- una moderacion aparente: el bucket es public=true, asi que el archivo sigue
-- descargable en su URL publica aunque ya no lo referencie ninguna fila. Por
-- eso se anaden tambien las dos politicas sobre storage.objects.
--
-- Las del vendedor se limitan a su propia carpeta ((storage.foldername(name))[1]
-- = auth.uid()); las del super_admin cubren el bucket entero, que es lo que
-- necesita quien modera contenido ajeno. Sigue sin haber politica de INSERT
-- para el super_admin, por el mismo motivo que en la tabla.
--
-- Lo que esto NO resuelve, y queda donde ya estaba: que un bucket public=true
-- se sirve por /object/public/ sin consultar RLS. Es la decision aplazada al
-- SP3 sobre fotos de propiedades en borrador, y ninguna politica la arregla.
-- ============================================================================

CREATE POLICY imagenes_lectura_super_admin ON public.imagenes_propiedad
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

CREATE POLICY imagenes_actualizacion_super_admin ON public.imagenes_propiedad
  FOR UPDATE TO authenticated
  USING (public.es_super_admin())
  WITH CHECK (public.es_super_admin());

CREATE POLICY imagenes_borrado_super_admin ON public.imagenes_propiedad
  FOR DELETE TO authenticated
  USING (public.es_super_admin());

CREATE POLICY storage_propiedades_lectura_super_admin ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'propiedades' AND public.es_super_admin());

CREATE POLICY storage_propiedades_borrado_super_admin ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'propiedades' AND public.es_super_admin());
