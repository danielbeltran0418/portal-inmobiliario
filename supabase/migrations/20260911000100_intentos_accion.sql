-- ============================================================================
-- Generalizacion del limitador de intentos.
--
-- SP4 exige cuenta para enviar un lead, asi que /registro pasa a ser la puerta
-- del spam. El limitador de SP0 solo cubre el login y esta atado a el hasta en
-- los nombres.
--
-- Esta migracion SOLO renombra y amplia la forma. La regla de registro entra
-- en 20260911000200: separadas a proposito, para que si algo se rompe se sepa
-- cual de los dos cambios fue.
-- ============================================================================

ALTER TABLE public.intentos_login RENAME TO intentos_accion;
ALTER TABLE public.intentos_accion RENAME COLUMN correo TO clave;

-- DEFAULT 'login' para que las filas existentes queden clasificadas, y se
-- retira acto seguido: a partir de aqui quien inserta dice que accion es.
ALTER TABLE public.intentos_accion ADD COLUMN accion text NOT NULL DEFAULT 'login';
ALTER TABLE public.intentos_accion ALTER COLUMN accion DROP DEFAULT;

COMMENT ON COLUMN public.intentos_accion.clave IS
  'Lo que identifica al sujeto del intento. En login es el correo en minusculas.';
COMMENT ON COLUMN public.intentos_accion.accion IS
  'Que se intento: login, registro. Cada una tiene su propio predicado en accion_bloqueada.';

-- NOTA: el brief de la tarea nombraba aqui "intentos_login_correo_idx", que no
-- existe -- el indice real, creado en 20260827001000, se llama
-- intentos_login_ventana_idx (correo, ip, creado_en DESC). Con IF EXISTS ese
-- nombre habria sido un no-op silencioso y el indice se habria quedado con
-- nombre de 'login' sobre la tabla ya generalizada. Se corrige al nombre real.
ALTER INDEX IF EXISTS intentos_login_ventana_idx RENAME TO intentos_accion_clave_idx;

CREATE INDEX IF NOT EXISTS intentos_accion_ventana_idx
  ON public.intentos_accion (accion, ip, creado_en DESC);

-- ----------------------------------------------------------------------------
-- Las funciones nuevas. El predicado de 'login' es IDENTICO al de
-- 20260831000500: cinco fallidos en quince minutos, y con p_ip nula se cuenta
-- por clave sin discriminar IP, que es un limite MAS estricto.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accion_bloqueada(p_accion text, p_clave text, p_ip inet)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE p_accion
    WHEN 'login' THEN (
      SELECT count(*) >= 5
      FROM public.intentos_accion
      WHERE accion = 'login'
        AND clave = lower(p_clave)
        AND (p_ip IS NULL OR ip = p_ip)
        AND exitoso = false
        AND creado_en > now() - interval '15 minutes'
    )
    -- Una accion desconocida se bloquea. Si alguien anade una accion y olvida
    -- su rama, el fallo es ruidoso y del lado seguro.
    ELSE true
  END;
$$;

-- CUIDADO: el cuerpo de abajo NO sale de 20260831000500, sino de
-- 20260831000700, que la reemplazo. La version vigente tambien ESCRIBE TRES
-- EVENTOS DE AUDITORIA (login_exitoso, login_fallido, bloqueo_por_intentos) y
-- consulta el bloqueo ANTES de insertar para saber si este intento es el que
-- cruza el umbral. Copiar la version de 20260831000500 borraria el arreglo del
-- hallazgo I5 en silencio; tests/rls/auditoria.test.ts lo cazaria, pero el
-- camino corto es no romperlo.
--
-- Antes de escribir esto, LEER supabase/migrations/20260831000700_escritores_auditoria.sql
-- lineas 148-196 y comprobar que este cuerpo sigue siendo fiel a aquel.
CREATE OR REPLACE FUNCTION public.registrar_intento_accion(
  p_accion text, p_clave text, p_ip inet, p_exitoso boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor           uuid;
  v_bloqueado_antes boolean;
  v_metadatos       jsonb;
BEGIN
  SELECT p.id INTO v_actor
  FROM public.perfiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(p_clave);

  v_metadatos := jsonb_build_object(
    'correo',       lower(p_clave),
    'ip_confiable', p_ip IS NOT NULL
  );

  v_bloqueado_antes := public.accion_bloqueada(p_accion, p_clave, p_ip);

  INSERT INTO public.intentos_accion (accion, clave, ip, exitoso)
  VALUES (p_accion, lower(p_clave), p_ip, p_exitoso);

  IF p_exitoso AND p_accion = 'login' THEN
    DELETE FROM public.intentos_accion
    WHERE accion = 'login'
      AND clave = lower(p_clave)
      AND (p_ip IS NULL OR ip = p_ip)
      AND exitoso = false;
  END IF;

  -- La auditoria de sesion es SOLO de login. El alta de usuario ya la escribe
  -- handle_new_user (20260831000700), asi que duplicarla aqui para 'registro'
  -- meteria dos filas por el mismo hecho.
  IF p_accion = 'login' THEN
    PERFORM public.registrar_evento_auditoria(
      CASE WHEN p_exitoso THEN 'login_exitoso' ELSE 'login_fallido' END,
      'sesion', v_actor, v_actor, v_metadatos, p_ip
    );

    IF NOT p_exitoso
       AND NOT v_bloqueado_antes
       AND public.accion_bloqueada('login', p_clave, p_ip) THEN
      PERFORM public.registrar_evento_auditoria(
        'bloqueo_por_intentos', 'sesion', v_actor, v_actor,
        v_metadatos || jsonb_build_object('minutos_bloqueo', 15),
        p_ip
      );
    END IF;
  END IF;

  DELETE FROM public.intentos_accion WHERE creado_en < now() - interval '24 hours';
END $$;

DROP FUNCTION IF EXISTS public.login_bloqueado(text, inet);
DROP FUNCTION IF EXISTS public.registrar_intento_login(text, inet, boolean);

-- PUBLIC va nombrado: Postgres le concede EXECUTE por defecto a toda funcion
-- nueva, y estas dos lo son (las viejas se acaban de borrar, no se reemplazan).
REVOKE EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.registrar_intento_accion(text, text, inet, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_accion(text, text, inet, boolean)
  TO service_role;
