-- ============================================================================
-- SP7: Super Admin — Moderación, Posicionamiento y Auditoría
-- ============================================================================

-- 1. Enum para estado de acuerdos de posicionamiento
CREATE TYPE public.estado_pago_posicionamiento AS ENUM ('activo', 'expirado', 'cancelado');

-- 2. Tabla pagos_posicionamiento
CREATE TABLE public.pagos_posicionamiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id UUID NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  vendedor_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  monto NUMERIC(12, 2) NOT NULL CHECK (monto >= 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'COP',
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  estado public.estado_pago_posicionamiento NOT NULL DEFAULT 'activo',
  registrado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  notas TEXT,
  referencia_externa VARCHAR(100),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_fechas_posicionamiento CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX idx_pagos_posicionamiento_propiedad ON public.pagos_posicionamiento(propiedad_id);
CREATE INDEX idx_pagos_posicionamiento_vendedor ON public.pagos_posicionamiento(vendedor_id);
CREATE INDEX idx_pagos_posicionamiento_vigencia ON public.pagos_posicionamiento(estado, fecha_inicio, fecha_fin);

-- 3. RLS sobre pagos_posicionamiento
ALTER TABLE public.pagos_posicionamiento ENABLE ROW LEVEL SECURITY;

-- Disciplina pg_default_acl: revocar privilegios heredados a anon y authenticated
REVOKE ALL ON public.pagos_posicionamiento FROM anon, authenticated, public;

-- Super admin y authenticated tienen SELECT
GRANT SELECT ON public.pagos_posicionamiento TO authenticated;
-- Super admin puede insertar, actualizar y borrar acuerdos
GRANT INSERT, UPDATE, DELETE ON public.pagos_posicionamiento TO authenticated;

CREATE POLICY super_admin_gestion_posicionamiento ON public.pagos_posicionamiento
  FOR ALL TO authenticated
  USING (public.es_super_admin())
  WITH CHECK (public.es_super_admin());

-- Vendedor puede consultar únicamente sus acuerdos de posicionamiento
CREATE POLICY vendedor_lectura_posicionamiento ON public.pagos_posicionamiento
  FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid());

-- 4. Política de borrado de propiedades para super_admin (para moderación)
CREATE POLICY propiedades_borrado_super_admin ON public.propiedades
  FOR DELETE TO authenticated
  USING (public.es_super_admin());

-- 5. Función trigger para sincronizar estado de destacadas en propiedades
-- NOTA CRÍTICA: Este trigger se ejecuta AFTER en pagos_posicionamiento.
-- NO debe hacer UPDATE sobre pagos_posicionamiento porque los triggers de sentencia
-- se disparan siempre (incluso con 0 filas afectadas) causando recursión infinita.
CREATE OR REPLACE FUNCTION public.sincronizar_destacadas_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Salvaguarda contra recursión en cascadas profundas
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  -- 1. Marcar como destacadas las propiedades publicadas con pago activo vigente
  UPDATE public.propiedades p
  SET destacada = true
  WHERE p.estado = 'publicada'
    AND p.destacada = false
    AND EXISTS (
      SELECT 1 FROM public.pagos_posicionamiento pp
      WHERE pp.propiedad_id = p.id
        AND pp.estado = 'activo'
        AND now() >= pp.fecha_inicio
        AND now() <= pp.fecha_fin
    );

  -- 2. Desmarcar destacada en propiedades que ya no tienen ningún pago activo vigente
  UPDATE public.propiedades p
  SET destacada = false
  WHERE p.destacada = true
    AND NOT EXISTS (
      SELECT 1 FROM public.pagos_posicionamiento pp
      WHERE pp.propiedad_id = p.id
        AND pp.estado = 'activo'
        AND now() >= pp.fecha_inicio
        AND now() <= pp.fecha_fin
    );

  RETURN NULL;
END;
$$;

CREATE TRIGGER trigger_sincronizar_destacadas
  AFTER INSERT OR UPDATE OR DELETE ON public.pagos_posicionamiento
  FOR EACH STATEMENT EXECUTE FUNCTION public.sincronizar_destacadas_trigger();

-- 6. Función para mantenimiento / cron de expiración de pagos
CREATE OR REPLACE FUNCTION public.actualizar_vigencia_destacadas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Marcar como expirados los pagos activos cuya fecha_fin ya pasó.
  -- El trigger trigger_sincronizar_destacadas se disparará una única vez
  -- tras este UPDATE y actualizará las propiedades destacadas correspondientes.
  UPDATE public.pagos_posicionamiento
  SET estado = 'expirado'
  WHERE estado = 'activo' AND now() > fecha_fin;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.actualizar_vigencia_destacadas() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.actualizar_vigencia_destacadas() TO authenticated, service_role;
