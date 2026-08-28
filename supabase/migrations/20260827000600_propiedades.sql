CREATE OR REPLACE FUNCTION public.marcar_actualizacion() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

CREATE TABLE public.propiedades (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id    uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z]+(-[a-z]+)*$'),
  titulo         text NOT NULL CHECK (length(titulo) BETWEEN 10 AND 120),
  descripcion    text NOT NULL,
  operacion      public.tipo_operacion NOT NULL,
  tipo_inmueble  public.tipo_inmueble NOT NULL,
  precio         numeric(14,2) NOT NULL CHECK (precio > 0),
  moneda         text NOT NULL DEFAULT 'COP',
  habitaciones   smallint CHECK (habitaciones >= 0),
  banos          smallint CHECK (banos >= 0),
  area_m2        numeric(8,2) CHECK (area_m2 > 0),
  barrio_id      uuid REFERENCES public.barrios(id),
  direccion      text,
  latitud        double precision,
  longitud       double precision,
  estado         public.estado_propiedad NOT NULL DEFAULT 'borrador',
  destacada      boolean NOT NULL DEFAULT false,
  destacada_hasta timestamptz,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX propiedades_publicadas_idx
  ON public.propiedades (barrio_id, operacion, precio)
  WHERE estado = 'publicada';

ALTER TABLE public.propiedades ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.propiedades TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.propiedades TO authenticated;

-- El publico solo ve lo publicado.
CREATE POLICY propiedades_lectura_publica ON public.propiedades
  FOR SELECT TO anon, authenticated
  USING (estado = 'publicada');

-- El vendedor ve todo lo suyo, en cualquier estado.
CREATE POLICY propiedades_lectura_dueno ON public.propiedades
  FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()));

CREATE POLICY propiedades_insercion_dueno ON public.propiedades
  FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = (SELECT auth.uid()));

CREATE POLICY propiedades_actualizacion_dueno ON public.propiedades
  FOR UPDATE TO authenticated
  USING (vendedor_id = (SELECT auth.uid()))
  WITH CHECK (vendedor_id = (SELECT auth.uid()));

CREATE POLICY propiedades_borrado_dueno ON public.propiedades
  FOR DELETE TO authenticated
  USING (vendedor_id = (SELECT auth.uid()));

-- El super admin modera: ve y ajusta cualquier propiedad en cualquier estado.
CREATE POLICY propiedades_lectura_super_admin ON public.propiedades
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

CREATE POLICY propiedades_actualizacion_super_admin ON public.propiedades
  FOR UPDATE TO authenticated
  USING (public.es_super_admin())
  WITH CHECK (public.es_super_admin());

CREATE TRIGGER propiedades_actualizar_marca
  BEFORE UPDATE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.marcar_actualizacion();
