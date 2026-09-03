-- ============================================================================
-- Hallazgo I5: la tabla registro_auditoria existia desde 20260827000800 y
-- NADIE escribia en ella. Una tabla de auditoria vacia es peor que no tenerla:
-- el super_admin abre el panel, ve cero filas y concluye que no ha pasado
-- nada, cuando lo que ocurre es que nunca se registro nada.
--
-- ----------------------------------------------------------------------------
-- Donde se escribe, y por que ahi
-- ----------------------------------------------------------------------------
-- Los cuatro eventos que SP0 tiene se registran EN LA BASE, no en el server
-- action, y esa es la decision principal de esta migracion:
--
--   * registro de usuario  -> public.handle_new_user (trigger de auth.users)
--   * login exitoso        -> public.registrar_intento_login
--   * login fallido        -> public.registrar_intento_login
--   * bloqueo por intentos -> public.registrar_intento_login
--
-- Escribirlos desde src/app/(auth)/*/acciones.ts habria dejado la auditoria
-- fuera de todo camino que no pase por el formulario: un POST directo a
-- /auth/v1/signup, el SDK desde una consola, o el propio seed. La auditoria
-- tiene que cubrir el evento, no el formulario. Puestos en el trigger y en la
-- funcion del limitador, cubren cualquier via -- y ademas es lo unico que la
-- suite RLS puede comprobar de verdad: un signUp real contra GoTrue deja la
-- fila, y eso no se puede fingir con un mock.
--
-- Consecuencia buscada: el usuario NO participa en la escritura de su propia
-- auditoria. No hay ningun camino por el que pueda insertar, omitir o falsear
-- una fila; las dos funciones que escriben son SECURITY DEFINER y ninguna es
-- invocable por anon ni por authenticated (ver el bloque de permisos al final).
--
-- ----------------------------------------------------------------------------
-- Volumen
-- ----------------------------------------------------------------------------
-- registro_auditoria no se purga (a diferencia de intentos_login): es un
-- registro de trazabilidad, no una ventana deslizante. Los fallos de login son
-- el unico evento que un atacante puede provocar en volumen, y estan acotados
-- por el propio limitador: a partir del quinto fallo la accion de login
-- rechaza ANTES de llamar a registrar_intento_login, asi que no se escriben
-- mas de cinco filas por (correo, ip) cada 15 minutos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- El unico escritor de la tabla.
--
-- p_actor_id se resuelve contra public.perfiles con una subconsulta en vez de
-- insertarse tal cual: registro_auditoria.actor_id tiene una FK a perfiles, y
-- un id que no exista ahi (un usuario ya borrado, un uuid inventado) reventaria
-- el INSERT con 23503 y se llevaria por delante la operacion que se estaba
-- auditando. La subconsulta devuelve NULL en ese caso, que es exactamente lo
-- que la columna significa: evento sin actor identificable. Auditar de menos es
-- malo; tumbar un login por un fallo de la auditoria es peor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_evento_auditoria(
  p_accion     text,
  p_entidad    text,
  p_entidad_id uuid    DEFAULT NULL,
  p_actor_id   uuid    DEFAULT NULL,
  p_metadatos  jsonb   DEFAULT '{}'::jsonb,
  p_ip         inet    DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadatos, ip)
  VALUES (
    (SELECT id FROM public.perfiles WHERE id = p_actor_id),
    p_accion,
    p_entidad,
    p_entidad_id,
    COALESCE(p_metadatos, '{}'::jsonb),
    p_ip
  );
END $$;

COMMENT ON FUNCTION public.registrar_evento_auditoria(text, text, uuid, uuid, jsonb, inet) IS
  'Unico escritor de public.registro_auditoria. SECURITY DEFINER: la tabla no '
  'tiene GRANT de INSERT para ningun rol de aplicacion. Solo service_role puede '
  'invocarla por RPC.';

-- ----------------------------------------------------------------------------
-- Registro de usuario.
--
-- Se anade al trigger que ya crea el perfil, y no al server action, porque es
-- el unico sitio que conoce el rol REALMENTE asignado: rol_solicitado es lo que
-- pidio el cliente y la lista blanca de abajo lo puede degradar (pedir
-- 'super_admin' produce un 'comprador'). Guardar los dos valores deja en la
-- auditoria la prueba de que el degradado ocurrio.
--
-- El resto del cuerpo es identico a 20260827000300; se reproduce entero porque
-- CREATE OR REPLACE sustituye la funcion completa.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rol public.rol_usuario;
BEGIN
  -- Lista blanca. 'super_admin' no esta aqui: cualquier otro valor cae en comprador.
  v_rol := CASE NEW.raw_user_meta_data->>'rol_solicitado'
             WHEN 'vendedor' THEN 'vendedor'::public.rol_usuario
             ELSE 'comprador'::public.rol_usuario
           END;

  INSERT INTO public.perfiles (id, rol, nombre, telefono)
  VALUES (
    NEW.id,
    v_rol,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre'), ''), 'Usuario'),
    NEW.raw_user_meta_data->>'telefono'
  );

  -- Despues del INSERT en perfiles, nunca antes: actor_id apunta a esa fila.
  PERFORM public.registrar_evento_auditoria(
    'usuario_registrado',
    'perfiles',
    NEW.id,
    NEW.id,
    jsonb_build_object(
      'rol_solicitado', NEW.raw_user_meta_data->>'rol_solicitado',
      'rol_asignado',   v_rol::text
    ),
    NULL
  );

  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- Login exitoso, login fallido y bloqueo.
--
-- El cuerpo es el de 20260831000500 mas la auditoria. Tres detalles que no son
-- obvios:
--
-- 1. El actor se busca por correo contra auth.users, no se recibe: quien llama
--    es el server action, que en un login fallido puede no saber siquiera si la
--    cuenta existe. Si no existe, actor_id queda NULL y el correo vive solo en
--    metadatos. El correo SI se guarda aqui, al contrario que en los logs de
--    servidor (ver src/lib/auth/limite-intentos.ts): la tabla la lee unicamente
--    el super_admin, y sin el correo un "login fallido" sin actor no dice nada.
--
-- 2. El bloqueo se registra en el CRUCE del umbral, comparando el estado antes
--    y despues de insertar el intento. Sin esa comparacion habria una fila de
--    bloqueo por cada fallo a partir del quinto, y el momento en que la cuenta
--    quedo cerrada -- que es el dato con valor -- se perderia entre repetidos.
--
-- 3. login_bloqueado es STABLE, asi que la segunda llamada, ya dentro de esta
--    funcion VOLATILE y despues del INSERT, ve el intento recien insertado.
--    tests/rls/auditoria.test.ts lo fija ejecutando seis fallos y exigiendo
--    exactamente una fila de bloqueo: si esa visibilidad cambiara, la prueba
--    lo dice.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_intento_login(
  p_correo text, p_ip inet, p_exitoso boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor           uuid;
  v_bloqueado_antes boolean;
  v_metadatos       jsonb;
BEGIN
  SELECT p.id INTO v_actor
  FROM public.perfiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(p_correo);

  v_metadatos := jsonb_build_object(
    'correo',       lower(p_correo),
    'ip_confiable', p_ip IS NOT NULL
  );

  v_bloqueado_antes := public.login_bloqueado(p_correo, p_ip);

  INSERT INTO public.intentos_login (correo, ip, exitoso)
  VALUES (lower(p_correo), p_ip, p_exitoso);

  -- Un login exitoso limpia la ventana de esa combinacion.
  IF p_exitoso THEN
    DELETE FROM public.intentos_login
    WHERE correo = lower(p_correo)
      AND (p_ip IS NULL OR ip = p_ip)
      AND exitoso = false;
  END IF;

  PERFORM public.registrar_evento_auditoria(
    CASE WHEN p_exitoso THEN 'login_exitoso' ELSE 'login_fallido' END,
    'sesion', v_actor, v_actor, v_metadatos, p_ip
  );

  IF NOT p_exitoso
     AND NOT v_bloqueado_antes
     AND public.login_bloqueado(p_correo, p_ip) THEN
    PERFORM public.registrar_evento_auditoria(
      'bloqueo_por_intentos', 'sesion', v_actor, v_actor,
      v_metadatos || jsonb_build_object('minutos_bloqueo', 15),
      p_ip
    );
  END IF;

  -- Purga de registros viejos para que la tabla no crezca sin limite.
  -- (Solo intentos_login: registro_auditoria no se purga, ver la cabecera.)
  DELETE FROM public.intentos_login WHERE creado_en < now() - interval '24 hours';
END $$;

-- ----------------------------------------------------------------------------
-- Permisos.
--
-- Mismo patron que 20260831000100 aplico a las funciones del limitador, y por
-- el mismo motivo: Postgres concede EXECUTE a PUBLIC por defecto en toda
-- funcion nueva, y revocar solo de anon y authenticated NO les quita lo que
-- heredan via PUBLIC. Sin nombrar a PUBLIC aqui, cualquiera podria invocar por
-- RPC una funcion SECURITY DEFINER que escribe en la auditoria: falsear filas,
-- inventar actores e inundar la tabla para tapar un evento real.
--
-- REVOKE ... FROM PUBLIC exige la firma exacta, de ahi la lista de tipos.
-- Quitar PUBLIC deja tambien a service_role sin el privilegio heredado, asi que
-- se le vuelve a conceder explicitamente: es el rol con el que el servidor
-- llama por RPC (src/lib/supabase/cliente-admin.ts).
--
-- handle_new_user y registrar_intento_login no necesitan este GRANT para
-- escribir: son SECURITY DEFINER y se ejecutan con los privilegios del dueno.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.registrar_evento_auditoria(text, text, uuid, uuid, jsonb, inet)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_evento_auditoria(text, text, uuid, uuid, jsonb, inet)
  TO service_role;

-- CREATE OR REPLACE conserva la ACL, asi que los REVOKE de 20260831000100
-- siguen en pie sobre registrar_intento_login. Se repiten igual que en
-- 20260831000500: es barato y deja el archivo autocontenido.
REVOKE EXECUTE ON FUNCTION public.registrar_intento_login(text, inet, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_login(text, inet, boolean)
  TO service_role;

-- ----------------------------------------------------------------------------
-- authenticated pierde la escritura sobre las dos tablas que solo escribe el
-- servidor.
--
-- 20260827000800 linea 16 dice "Sin GRANT de INSERT: solo el servidor escribe".
-- Es falso, y se comprobo en information_schema.role_table_grants antes de
-- escribir esto: authenticated tenia INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES y TRIGGER sobre registro_auditoria y sobre intentos_login, por el
-- mismo ALTER DEFAULT PRIVILEGES de fabrica de Supabase que describe
-- 20260831000400. Lo unico que frenaba el INSERT era RLS -- que denuncia con el
-- mismo 42501, asi que la prueba que lo afirmaba pasaba por el motivo
-- equivocado.
--
-- Lo que RLS NO frenaba:
--   * UPDATE y DELETE. RLS los filtra por la clausula USING, y sin politica
--     eso significa CERO filas afectadas y ningun error: la operacion se
--     acepta y no cambia nada. Hoy da igual porque no cambia nada; el dia que
--     alguien anada una politica de lectura FOR ALL en vez de FOR SELECT, el
--     mismo privilegio deja al usuario reescribir su propio rastro.
--   * TRUNCATE, que queda fuera del alcance de RLS por diseno de PostgreSQL.
--     Un authenticated con TRUNCATE sobre registro_auditoria puede vaciar la
--     auditoria entera, que es el ataque exacto contra el que existe la tabla.
--     PostgREST no expone TRUNCATE, asi que no es explotable por HTTP hoy, pero
--     es la unica operacion sin segunda capa.
--
-- 20260831000400 dejo a authenticated intacto a proposito, y con razon para
-- propiedades, imagenes_propiedad, perfiles y barrios: ahi la escritura del
-- vendedor es el modelo de datos y RLS la gobierna. Esa razon no alcanza a
-- estas dos tablas, donde authenticated no escribe nunca por ningun camino.
-- Solo se revoca la escritura: el SELECT se conserva, porque la politica
-- auditoria_lectura_super_admin lo necesita.
--
-- MAINTAIN se incluye por el mismo motivo que en 20260831000400: es de
-- PostgreSQL 17, information_schema no lo reporta, y tampoco lo mira RLS.
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.registro_auditoria, public.intentos_login FROM authenticated;
