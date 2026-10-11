ALTER TABLE public.barrios ADD COLUMN codigo_postal text CHECK (codigo_postal ~ '^[0-9]{6}$');
GRANT SELECT (codigo_postal) ON public.barrios TO anon, authenticated;
GRANT INSERT (codigo_postal), UPDATE (codigo_postal) ON public.barrios TO authenticated;