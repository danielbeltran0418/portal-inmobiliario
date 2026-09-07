-- El panel del vendedor lista sus propiedades ordenadas por ultima
-- actualizacion: este indice cubre ese filtro + orden sin ordenar en memoria.
CREATE INDEX propiedades_del_vendedor_idx
  ON public.propiedades (vendedor_id, actualizado_en DESC);
