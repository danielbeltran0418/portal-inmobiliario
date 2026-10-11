ALTER TYPE public.tipo_operacion ADD VALUE IF NOT EXISTS 'temporal';
ALTER TABLE public.propiedades ADD COLUMN caracteristicas text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(caracteristicas) <= 5 AND caracteristicas <@ ARRAY['conjunto_cerrado','mascotas','balcon','piscina','amoblado']::text[]);
-- Hereda RLS de propiedades. Solo datos públicos; no se amplían los grants privados.
GRANT SELECT (caracteristicas) ON public.propiedades TO anon, authenticated;
GRANT INSERT (caracteristicas), UPDATE (caracteristicas) ON public.propiedades TO authenticated;