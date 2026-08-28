CREATE TABLE public.registro_auditoria (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  accion     text NOT NULL,
  entidad    text NOT NULL,
  entidad_id uuid,
  metadatos  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         inet,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_reciente_idx ON public.registro_auditoria (creado_en DESC);

ALTER TABLE public.registro_auditoria ENABLE ROW LEVEL SECURITY;

-- Sin GRANT de INSERT: solo el servidor escribe, con service_role.
GRANT SELECT ON public.registro_auditoria TO authenticated;

CREATE POLICY auditoria_lectura_super_admin ON public.registro_auditoria
  FOR SELECT TO authenticated
  USING (public.es_super_admin());
