-- Completa 20261014000100_mfa_super_admin.sql en bases donde esa version nunca
-- corrio.
--
-- En produccion la version 20261014000100 ya estaba registrada por
-- limite_login_5_minutos (antes de renumerarla a 000400), asi que Supabase dio
-- por aplicada mfa_super_admin sin ejecutarla. Las funciones del limitador
-- (rama 'mfa', auditoria) llegaron por 000400; lo que faltaba es esto:
--
-- 1. es_super_admin() exige ademas el token aal2 (segundo factor verificado).
-- 2. La restriccion de slugs reservados incluye 'doble-factor' y 'sitemaps'.
--
-- Ambas sentencias son idempotentes: en una base que ya las tiene (db reset)
-- esta migracion no cambia nada.

CREATE OR REPLACE FUNCTION public.es_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     AND EXISTS (
       SELECT 1 FROM public.perfiles
       WHERE id = auth.uid() AND rol = 'super_admin'
     );
$$;

-- Misma lista que RUTAS_RESERVADAS (src/lib/catalogo/rutas.ts).
ALTER TABLE public.barrios DROP CONSTRAINT IF EXISTS barrios_slug_no_reservado;
ALTER TABLE public.barrios ADD CONSTRAINT barrios_slug_no_reservado CHECK (slug NOT IN (
  'api', 'buscar', 'catalogo', 'ciudad', 'confirmar', 'control', 'doble-factor', 'imagen', 'login',
  'mi-cuenta', 'notificaciones', 'panel', 'recuperar', 'registro', 'restablecer', 'sitemaps',
  'verificar-correo'
));
