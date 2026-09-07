-- El bucket nacio public=true en 20260827000700. Un bucket publico se sirve por
-- /object/public/<bucket>/<ruta> SIN consultar RLS, asi que las politicas de
-- storage.objects que esa misma migracion escribio no gobernaban nada frente a
-- quien conociera la ruta: las fotos de una propiedad en BORRADOR eran
-- descargables. Riesgo registrado en el spec de SP0 y aplazado al SP3.
--
-- Con public=false desaparece esa via y toda lectura pasa por RLS o por una
-- URL firmada emitida en el servidor.
UPDATE storage.buckets SET public = false WHERE id = 'propiedades';
