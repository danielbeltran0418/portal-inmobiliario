-- ============================================================================
-- SEED DE DESARROLLO. SOLO LOCAL Y STAGING.
--
-- Estas contrasenas son publicas: circularon en texto plano y estan en el
-- repositorio. Un super_admin con contrasena conocida es control total del
-- portal.
--
-- La proteccion real, en orden de fuerza:
--   1. Produccion recibe UNICAMENTE migraciones (supabase db push), nunca
--      este archivo. Este es el control que de verdad importa.
--   2. El guardia de abajo es una segunda capa, no la primera: 'app.entorno'
--      es un marcador que NADIE fija automaticamente. Solo dispara si un
--      operador marco el entorno a mano antes de correr este archivo por
--      error; no detecta produccion por si solo.
--   3. El super admin real de produccion se crea a mano, una vez, con
--      contrasena generada y guardada en un gestor de contrasenas.
--
-- Por eso todo el archivo esta envuelto en una unica transaccion: un DO que
-- hace RAISE EXCEPTION solo revierte su propio bloque, no el resto del
-- script -- sin BEGIN/COMMIT, psql sin '-v ON_ERROR_STOP=1' (el editor SQL
-- de Supabase Studio, la mayoria de clientes GUI, un psql -f a secas)
-- imprime el error del guardia y sigue con el segundo bloque igual,
-- insertando las tres cuentas. El BEGIN/COMMIT es lo que hace que el aborto
-- realmente detenga el archivo entero: la excepcion dentro de la
-- transaccion la deja abortada, cada sentencia siguiente falla con
-- "current transaction is aborted", y el COMMIT final no tiene nada que
-- confirmar.
-- ============================================================================

BEGIN;

DO $guarda$
BEGIN
  -- Solo se comprueba 'app.entorno'. current_database() LIKE '%prod%' se
  -- quito a proposito: Supabase nombra la base de datos 'postgres' igual en
  -- local, staging y produccion, asi que esa condicion nunca disparaba y
  -- solo aparentaba ser una segunda deteccion. No volver a agregarla sin
  -- una forma real de distinguir el entorno por el nombre de la base.
  IF current_setting('app.entorno', true) = 'production' THEN
    RAISE EXCEPTION 'El seed de desarrollo no se ejecuta en produccion';
  END IF;
END
$guarda$;

DO $seed$
DECLARE
  v_id uuid;
  v_cuenta record;
BEGIN
  FOR v_cuenta IN
    SELECT * FROM (VALUES
      ('admin@portal.com',     'AdminPrueba2026*',     'super_admin', 'Admin Prueba'),
      ('vendedor@portal.com',  'VendedorPrueba2026*',  'vendedor',    'Vendedor Prueba'),
      ('comprador@portal.com', 'CompradorPrueba2026*', 'comprador',   'Comprador Prueba')
    ) AS t(correo, clave, rol, nombre)
  LOOP
    DELETE FROM auth.users WHERE email = v_cuenta.correo;

    v_id := gen_random_uuid();

    -- Nota (no esta en la SQL original del brief): GoTrue no tolera NULL en
    -- estas columnas de token -- falla con "Database error querying schema"
    -- al iniciar sesion. Se fijan explicitamente a '' como hace Supabase Auth.
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_cuenta.correo,
      -- Supabase Auth hashea con bcrypt; aqui se replica con pgcrypto.
      crypt(v_cuenta.clave, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nombre', v_cuenta.nombre, 'telefono', '3000000000'),
      now(), now(),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_cuenta.correo),
      'email', now(), now()
    );

    -- El trigger handle_new_user ya creo el perfil como comprador.
    -- El rol definitivo se fija por SQL directo, nunca desde la aplicacion.
    UPDATE public.perfiles SET rol = v_cuenta.rol::public.rol_usuario WHERE id = v_id;
  END LOOP;
END
$seed$;

COMMIT;
