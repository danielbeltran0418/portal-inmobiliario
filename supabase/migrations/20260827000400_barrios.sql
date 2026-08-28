CREATE TABLE public.barrios (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    text NOT NULL,
  slug      text NOT NULL UNIQUE CHECK (slug ~ '^[a-z]+(-[a-z]+)*$'),
  ciudad    text NOT NULL DEFAULT 'Barranquilla',
  activo    boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.barrios ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.barrios TO anon, authenticated;

CREATE POLICY barrios_lectura_publica ON public.barrios
  FOR SELECT TO anon, authenticated
  USING (activo = true);
