-- ============================================================================
-- Campos que el comprador colombiano filtra siempre (Fincaraiz y Metrocuadrado
-- los tienen): estrato, valor de la administracion, parqueaderos, antiguedad
-- (como año de construccion, que no envejece) y piso.
--
-- Todos opcionales: un lote no tiene piso ni administracion, y un local
-- comercial no tiene estrato residencial.
--
-- Privilegios por columna, con el mismo patron que el resto de la tabla:
--   * anon: SELECT (20260831000300 dejo a anon solo las columnas publicas; sin
--     esto, select('*') anonimo fallaria con 42501 -- tests/rls/propiedades).
--   * authenticated: UPDATE (20261007000100 restringio la escritura del
--     vendedor por columna). INSERT no: el alta solo lleva el titulo.
-- ============================================================================

ALTER TABLE public.propiedades
  ADD COLUMN estrato            smallint CHECK (estrato BETWEEN 1 AND 6),
  ADD COLUMN administracion     numeric(12, 2) CHECK (administracion >= 0 AND administracion <= 99999999),
  ADD COLUMN parqueaderos       smallint CHECK (parqueaderos BETWEEN 0 AND 50),
  ADD COLUMN anio_construccion  smallint CHECK (anio_construccion BETWEEN 1800 AND 2100),
  ADD COLUMN piso               smallint CHECK (piso BETWEEN -5 AND 200);

GRANT SELECT (estrato, administracion, parqueaderos, anio_construccion, piso)
  ON public.propiedades TO anon;

GRANT UPDATE (estrato, administracion, parqueaderos, anio_construccion, piso)
  ON public.propiedades TO authenticated;

-- El catalogo filtra por estrato dentro de un barrio y estado publicada.
CREATE INDEX IF NOT EXISTS propiedades_estrato_idx
  ON public.propiedades (barrio_id, estrato) WHERE estado = 'publicada';
