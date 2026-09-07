-- El CHECK original era '^[a-z]+(-[a-z]+)*$': sin digitos. El slug se genera
-- como <titulo>-<4 hex> para no colisionar, y ese sufijo no cabia.
ALTER TABLE public.propiedades DROP CONSTRAINT propiedades_slug_check;
ALTER TABLE public.propiedades ADD CONSTRAINT propiedades_slug_check
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
