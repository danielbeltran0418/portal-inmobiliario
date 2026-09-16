-- ============================================================================
-- SP6 — Agentes de IA: Esquema de base de datos
-- Tablas conversaciones_ia y mensajes_ia, con RLS explicita y control estricto
-- de mutaciones (solo service_role). Flag auto_confirmar_citas en disponibilidad.
-- ============================================================================

-- 1. Configuracion de auto-confirmacion por vendedor
ALTER TABLE public.disponibilidad_semanal
  ADD COLUMN IF NOT EXISTS auto_confirmar_citas boolean NOT NULL DEFAULT false;

-- 2. Tabla de conversaciones agénticas asociadas a leads
CREATE TABLE public.conversaciones_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  propiedad_id uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  comprador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado_conversacion text NOT NULL DEFAULT 'activa'
    CHECK (estado_conversacion IN ('activa', 'calificada', 'cita_propuesta', 'cita_confirmada', 'cerrada')),
  franja_propuesta timestamptz,
  resumen_calificacion text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversacion_por_lead UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS conversaciones_ia_comprador_idx ON public.conversaciones_ia (comprador_id, estado_conversacion);
CREATE INDEX IF NOT EXISTS conversaciones_ia_vendedor_idx ON public.conversaciones_ia (vendedor_id, estado_conversacion);
CREATE INDEX IF NOT EXISTS conversaciones_ia_propiedad_idx ON public.conversaciones_ia (propiedad_id);

-- 3. Tabla de mensajes inmutables
CREATE TABLE public.mensajes_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES public.conversaciones_ia(id) ON DELETE CASCADE,
  comprador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emisor text NOT NULL CHECK (emisor IN ('comprador', 'agente_ia', 'vendedor', 'sistema')),
  contenido text NOT NULL,
  tokens_entrada integer,
  tokens_salida integer,
  modelo text,
  tool_calls jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensajes_ia_comprador_idx ON public.mensajes_ia (comprador_id, creado_en);
CREATE INDEX IF NOT EXISTS mensajes_ia_vendedor_idx ON public.mensajes_ia (vendedor_id, creado_en);
CREATE INDEX IF NOT EXISTS mensajes_ia_conversacion_idx ON public.mensajes_ia (conversacion_id, creado_en);

-- 4. Inmutabilidad y revocacion de privilegios por defecto (pg_default_acl)
REVOKE ALL ON public.conversaciones_ia FROM anon, authenticated, public;
REVOKE ALL ON public.mensajes_ia FROM anon, authenticated, public;

ALTER TABLE public.conversaciones_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_ia ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.conversaciones_ia TO authenticated;
GRANT SELECT ON public.mensajes_ia TO authenticated;

-- 5. Politicas RLS explicitas directas (sin subconsultas EXISTS)
-- public.conversaciones_ia
CREATE POLICY conversaciones_ia_lectura_comprador ON public.conversaciones_ia
  FOR SELECT TO authenticated
  USING (comprador_id = (SELECT auth.uid()));

CREATE POLICY conversaciones_ia_lectura_vendedor ON public.conversaciones_ia
  FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()));

CREATE POLICY conversaciones_ia_lectura_super_admin ON public.conversaciones_ia
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

-- public.mensajes_ia
CREATE POLICY mensajes_ia_lectura_comprador ON public.mensajes_ia
  FOR SELECT TO authenticated
  USING (comprador_id = (SELECT auth.uid()));

CREATE POLICY mensajes_ia_lectura_vendedor ON public.mensajes_ia
  FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()));

CREATE POLICY mensajes_ia_lectura_super_admin ON public.mensajes_ia
  FOR SELECT TO authenticated
  USING (public.es_super_admin());
