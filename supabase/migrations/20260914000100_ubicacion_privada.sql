-- ============================================================================
-- La direccion exacta, latitud y longitud dejan de vivir en `propiedades`.
--
-- Fuga confirmada (ver el commit anterior a este, con la prueba en rojo
-- contra el esquema viejo): 20260827000600 hace
-- GRANT SELECT ON public.propiedades TO anon, authenticated -- tabla
-- completa. 20260831000300 le revoca a `anon` el SELECT de tabla y se lo deja
-- solo sobre las columnas publicas, pero A `authenticated` NO SE LE QUITA
-- NADA -- el comentario de esa migracion lo dice explicito. RLS filtra FILAS,
-- no columnas: propiedades_lectura_publica (estado = 'publicada') deja ver la
-- fila entera a CUALQUIER authenticated, y con el registro abierto (limite de
-- 3 altas por hora por IP) basta con crearse una cuenta para recoger la
-- direccion de todo el catalogo.
--
-- El arreglo: DOS TABLAS, el mismo patron que leads/leads_contacto (SP4,
-- 20260911000300) para el correo/telefono del comprador. Con RLS POR FILA en
-- vez de privilegios de columna, "quien puede ver esta fila" queda escrito
-- una sola vez en una politica y no depende de mantener sincronizados un
-- GRANT de columna en una migracion con la lista de columnas publicas de
-- otra.
--
-- Fuera de alcance: el comprador no tiene ninguna politica aqui. Esa llega en
-- SP5, para la ventana de 2 horas antes de una visita confirmada.
-- ============================================================================

CREATE TABLE public.propiedades_ubicacion (
  propiedad_id  uuid PRIMARY KEY REFERENCES public.propiedades(id) ON DELETE CASCADE,
  direccion     text,
  latitud       double precision,
  longitud      double precision
);

-- Copiar los datos existentes ANTES de borrar nada: ninguna propiedad de las
-- que ya tienen direccion, latitud o longitud pierde el dato en la migracion.
INSERT INTO public.propiedades_ubicacion (propiedad_id, direccion, latitud, longitud)
SELECT id, direccion, latitud, longitud
FROM public.propiedades
WHERE direccion IS NOT NULL OR latitud IS NOT NULL OR longitud IS NOT NULL;

-- Al borrar las columnas, Postgres retira con ellas el GRANT SELECT (columna)
-- que 20260831000300 le habia dado a `anon` sobre las 18 columnas publicas --
-- direccion/latitud/longitud nunca estuvieron en esa lista, asi que no hay
-- nada que tocar en esa migracion.
ALTER TABLE public.propiedades
  DROP COLUMN direccion,
  DROP COLUMN latitud,
  DROP COLUMN longitud;

ALTER TABLE public.propiedades_ubicacion ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Privilegios, y aqui esta la trampa mas cara del proyecto: pg_default_acl
-- concede el CRUD completo (arwdDxtm) a `authenticated` en TODA tabla nueva.
-- 20260831000400 solo redujo el privilegio por defecto de `anon` (a SELECT);
-- el de `authenticated` nunca se toco. Sin el REVOKE explicito de abajo, esta
-- tabla nace escribible -- y legible -- por cualquier autenticado aunque
-- tenga RLS encima.
--
-- `anon` deberia heredar solo SELECT por ese mismo ALTER DEFAULT PRIVILEGES
-- de 20260831000400, pero esta tabla no debe darle ni eso -- no hay ningun
-- caso de uso publico. El REVOKE ALL de abajo cubre ambos roles de una vez;
-- se comprueba contra la base real, no solo por lectura del default, en el
-- reporte de esta tarea (pg_class.relacl no debe traer nada para `anon`).
-- ----------------------------------------------------------------------------

REVOKE ALL ON public.propiedades_ubicacion FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propiedades_ubicacion TO authenticated;

-- ----------------------------------------------------------------------------
-- Politicas. Ojo con la otra trampa conocida, la misma que documenta
-- 20260911000300 para leads_contacto: `propiedades` tiene TRES politicas
-- permisivas de SELECT que Postgres combina con OR, y una es
-- `estado = 'publicada'`. Un EXISTS que solo compruebe que la propiedad
-- exista -- apoyandose en que "ya la filtra RLS de propiedades" -- deja ver
-- las publicadas de CUALQUIER vendedor: exactamente la fuga que se esta
-- cerrando. El filtro por dueno va escrito EXPLICITO dentro de esta politica,
-- nunca delegado a la RLS de la tabla referenciada.
-- ----------------------------------------------------------------------------

CREATE POLICY ubicacion_lectura_dueno ON public.propiedades_ubicacion
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedades_ubicacion.propiedad_id
      AND p.vendedor_id = (SELECT auth.uid())
  ));

CREATE POLICY ubicacion_insercion_dueno ON public.propiedades_ubicacion
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedades_ubicacion.propiedad_id
      AND p.vendedor_id = (SELECT auth.uid())
  ));

CREATE POLICY ubicacion_actualizacion_dueno ON public.propiedades_ubicacion
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedades_ubicacion.propiedad_id
      AND p.vendedor_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedades_ubicacion.propiedad_id
      AND p.vendedor_id = (SELECT auth.uid())
  ));

CREATE POLICY ubicacion_borrado_dueno ON public.propiedades_ubicacion
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedades_ubicacion.propiedad_id
      AND p.vendedor_id = (SELECT auth.uid())
  ));

-- El super admin modera: ve y ajusta la ubicacion de cualquier propiedad,
-- igual que ya puede con el resto de columnas de `propiedades`
-- (propiedades_lectura_super_admin / propiedades_actualizacion_super_admin).
CREATE POLICY ubicacion_lectura_super_admin ON public.propiedades_ubicacion
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

CREATE POLICY ubicacion_actualizacion_super_admin ON public.propiedades_ubicacion
  FOR UPDATE TO authenticated
  USING (public.es_super_admin())
  WITH CHECK (public.es_super_admin());
