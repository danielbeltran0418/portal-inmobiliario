-- ============================================================================
-- Cola de limpieza de Storage.
--
-- ON DELETE CASCADE borra las filas de imagenes_propiedad al borrar la
-- propiedad, pero los archivos siguen en Storage para siempre: borrar filas
-- de storage.objects por SQL no elimina los bytes del backend, eso solo lo
-- hace la API de Storage. Esta tabla es la cola intermedia: el trigger de
-- abajo solo ANOTA la ruta que quedo huerfana; sera un server action con
-- cliente admin (Task 9) quien la drene llamando a esa API y borre la fila
-- una vez que el archivo ya no exista.
-- ============================================================================

CREATE TABLE public.limpieza_almacenamiento (
  id        bigserial PRIMARY KEY,
  ruta      text NOT NULL,
  intentos  smallint NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX limpieza_pendiente_idx ON public.limpieza_almacenamiento (creado_en);

ALTER TABLE public.limpieza_almacenamiento ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Permisos: ninguno para anon ni para authenticated. Solo el servidor la toca,
-- con service_role, igual que registro_auditoria.
--
-- "Sin GRANT" no es lo mismo que "sin REVOKE". Supabase trae de fabrica un
-- ALTER DEFAULT PRIVILEGES sobre el esquema public que concede a authenticated
-- el CRUD completo (arwdDxtm) en TODA tabla nueva, y a anon el SELECT (r);
-- verificado en pg_default_acl antes de escribir esto, exactamente el mismo
-- hallazgo que documenta 20260831000700 sobre registro_auditoria. Una tabla
-- creada aqui sin REVOKE explicito nace con esos privilegios intactos aunque
-- el comentario diga "sin GRANT a nadie" -- ese fue el error que corrigio
-- 20260831000700 para registro_auditoria e intentos_login, y no tiene sentido
-- repetirlo en la tabla que se crea a continuacion.
--
-- A diferencia de registro_auditoria (que SI concede SELECT a authenticated
-- para el panel del super_admin), aqui no hay ningun lector de aplicacion:
-- se revoca tambien el SELECT.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.limpieza_almacenamiento FROM authenticated;
REVOKE SELECT ON public.limpieza_almacenamiento FROM anon;

-- ----------------------------------------------------------------------------
-- Nota para quien implemente la Task 8/9 (el drenado):
--
-- RLS esta ENABLE pero sin ninguna politica. Eso es una segunda capa
-- independiente del REVOKE de arriba: con RLS habilitada y cero politicas,
-- ninguna fila es visible ni insertable/actualizable/borrable por NINGUN rol
-- que no sea el dueno de la tabla (postgres) o tenga BYPASSRLS -- ni siquiera
-- si algun GRANT futuro le devolviera el privilegio de tabla a authenticated
-- o anon por error. Comprobado en vivo (ver task-4-report.md, seccion
-- FALSIFICACION): con "GRANT INSERT ... TO authenticated" ya aplicado, el
-- INSERT de un vendedor sigue fallando con 42501, pero ahora por
-- "new row violates row-level security policy" en vez de "permission denied
-- for table" -- RLS, no el GRANT, es quien de verdad protege esta cola.
--
-- service_role SI puede leer y escribir sin ningun GRANT explicito: hereda
-- arwdDxtm de los mismos privilegios por defecto y ademas tiene el atributo
-- BYPASSRLS, igual que el resto de tablas de este esquema.
--
-- SECURITY DEFINER en la funcion de abajo es por lo mismo que en
-- registrar_evento_auditoria: el vendedor que borra su imagen no tiene
-- ningun privilegio sobre esta tabla (ver los REVOKE de arriba), asi que sin
-- SECURITY DEFINER el INSERT del propio trigger fallaria con 42501. La
-- funcion la ejecuta su dueno (postgres), que es tambien el dueno de la
-- tabla: el dueno de una tabla queda exento de RLS salvo que se fije
-- FORCE ROW LEVEL SECURITY, que aqui no se fija.
CREATE OR REPLACE FUNCTION public.encolar_limpieza_imagen() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.limpieza_almacenamiento (ruta) VALUES (OLD.ruta_storage);
  RETURN OLD;
END $$;

-- Cubre tambien el borrado en cascada: al borrar la propiedad, CASCADE borra
-- sus imagenes (ON DELETE CASCADE en imagenes_propiedad.propiedad_id) y este
-- trigger dispara UNA VEZ POR CADA FILA borrada, sea cual sea el origen del
-- borrado. No hace falta un trigger separado sobre propiedades.
CREATE TRIGGER imagenes_encolar_limpieza
  AFTER DELETE ON public.imagenes_propiedad
  FOR EACH ROW EXECUTE FUNCTION public.encolar_limpieza_imagen();
