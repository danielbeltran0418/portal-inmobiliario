CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TYPE public.estado_cita AS ENUM ('confirmada', 'cancelada');

CREATE TABLE public.disponibilidad_semanal (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  dia_semana  smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),  -- ISO: 1 = lunes
  hora_inicio time NOT NULL,
  hora_fin    time NOT NULL,
  CHECK (hora_fin > hora_inicio),
  -- Las franjas empiezan en punto: sin minutos ni segundos.
  CHECK (date_trunc('hour', hora_inicio) = hora_inicio),
  CHECK (date_trunc('hour', hora_fin) = hora_fin)
);

CREATE TABLE public.fechas_bloqueadas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  desde       date NOT NULL,   -- fechas de calendario de BogotA
  hasta       date NOT NULL,
  CHECK (hasta >= desde)
);

CREATE TABLE public.citas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Desnormalizados a proposito, derivados del lead dentro de las funciones.
  propiedad_id   uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  comprador_id   uuid NOT NULL REFERENCES public.perfiles(id)    ON DELETE CASCADE,
  vendedor_id    uuid NOT NULL REFERENCES public.perfiles(id)    ON DELETE CASCADE,
  rango          tstzrange NOT NULL,
  estado         public.estado_cita NOT NULL DEFAULT 'confirmada',
  cancelada_por  uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (lower_inc(rango) AND NOT upper_inc(rango)),
  CHECK (upper(rango) - lower(rango) = interval '60 minutes'),
  CONSTRAINT citas_sin_solape_por_vendedor
    EXCLUDE USING gist (vendedor_id WITH =, rango WITH &&)
    WHERE (estado = 'confirmada')
);

CREATE UNIQUE INDEX citas_una_confirmada_por_lead
  ON public.citas (lead_id) WHERE estado = 'confirmada';

-- La costura hacia SP6: un consumidor observa las reservas nuevas por aqui.
CREATE INDEX citas_confirmadas_recientes_idx
  ON public.citas (creado_en) WHERE estado = 'confirmada';

-- Seguridad: pg_default_acl da CRUD completo por defecto, se revoca todo.
REVOKE ALL ON public.disponibilidad_semanal FROM anon, authenticated, public;
REVOKE ALL ON public.fechas_bloqueadas FROM anon, authenticated, public;
REVOKE ALL ON public.citas FROM anon, authenticated, public;

-- Asegurarse de que service_role puede hacer todo (pg_default_acl ya le da, pero por si acaso)
-- No hace falta explicitamente porque service_role hace bypass RLS y tiene superuser-like perms, 
-- pero el REVOKE a public es lo principal.

CREATE INDEX IF NOT EXISTS citas_comprador_idx ON public.citas (comprador_id, estado);
CREATE INDEX IF NOT EXISTS citas_vendedor_idx  ON public.citas (vendedor_id, estado);

ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.citas TO authenticated;

CREATE POLICY citas_lectura_comprador ON public.citas
  FOR SELECT TO authenticated
  USING (comprador_id = (SELECT auth.uid()));

CREATE POLICY citas_lectura_vendedor ON public.citas
  FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()));

CREATE POLICY citas_lectura_super_admin ON public.citas
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

ALTER TABLE public.disponibilidad_semanal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechas_bloqueadas ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.disponibilidad_semanal, public.fechas_bloqueadas TO authenticated;

CREATE POLICY disponibilidad_dueno ON public.disponibilidad_semanal
  FOR ALL TO authenticated
  USING (
    vendedor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'
    )
  )
  WITH CHECK (
    vendedor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'
    )
  );

CREATE POLICY disponibilidad_lectura_super_admin ON public.disponibilidad_semanal
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

CREATE POLICY fechas_bloqueadas_dueno ON public.fechas_bloqueadas
  FOR ALL TO authenticated
  USING (
    vendedor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'
    )
  )
  WITH CHECK (
    vendedor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'
    )
  );

CREATE POLICY fechas_bloqueadas_lectura_super_admin ON public.fechas_bloqueadas
  FOR SELECT TO authenticated
  USING (public.es_super_admin());
