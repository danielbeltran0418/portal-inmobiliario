-- Se ejecuta ANTES de seed.sql en `supabase db reset` (config.toml, [db.seed]).
-- Marca la sesion como 'local' para que la guarda de seed.sql deje pasar el
-- reset local, pero SOLO si nadie marco el entorno antes: un SET incondicional
-- pisaria el marcador de una base 'production' y abriria el seed (super_admin
-- con contrasena publica) justo donde la guarda debe cerrarlo.
SELECT set_config('app.entorno', 'local', false)
WHERE coalesce(current_setting('app.entorno', true), '') = '';
