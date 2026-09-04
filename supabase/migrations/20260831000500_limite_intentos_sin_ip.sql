-- ============================================================================
-- El limitador acepta "IP desconocida" y degrada a ventana por correo.
--
-- Contexto: src/lib/http/ip-cliente.ts deja de leer la primera entrada de
-- x-forwarded-for, que la manda el cliente. Cuando no hay una IP en la que
-- confiar -- despliegue sin la cabecera de plataforma configurada, cabecera
-- ausente, valor que no es una IP -- la aplicacion pasa NULL en vez de
-- inventarse una direccion.
--
-- Sin esta migracion no habia forma de expresar eso. `intentos_login.ip` era
-- NOT NULL y las dos funciones comparaban con `ip = p_ip`, asi que la unica
-- salida habria sido un centinela ('0.0.0.0', '127.0.0.1'). Eso es peor de lo
-- que parece: un centinela es indistinguible de una IP real, asi que mezcla en
-- el mismo bucket a los clientes que de verdad vengan de esa direccion, y no
-- deja ver en la tabla que ese intento se conto a ciegas. NULL es la forma
-- honesta de decir "no se sabe".
--
-- ----------------------------------------------------------------------------
-- Que significa p_ip NULL
-- ----------------------------------------------------------------------------
-- "Ventana por correo, sin discriminar IP": se cuentan los fallos de ese
-- correo vengan de donde vengan. Es un limite MAS ESTRICTO que el normal, no
-- mas laxo, y es el unico que no se puede falsificar, porque el correo lo fija
-- el formulario y no una cabecera.
--
-- La contrapartida, explicita para que sea decision y no descuido: en modo
-- degradado, cinco fallos bloquean la cuenta durante 15 minutos aunque vengan
-- de un atacante distinto al dueno. Ese es el precio de no tener IP fiable, y
-- es preferible a la alternativa -- un limite por IP que cualquiera apaga
-- rotando una cabecera. El modo normal, con la cabecera de plataforma
-- configurada, no tiene ese problema.
--
-- ----------------------------------------------------------------------------
-- Detalle que costaria un fallo silencioso
-- ----------------------------------------------------------------------------
-- `ip = p_ip` con p_ip NULL no es falso: es NULL, y por tanto nunca cierto. Si
-- solo se hubiera quitado el NOT NULL de la columna, el DELETE de limpieza
-- tras un login exitoso no habria borrado NADA en modo degradado, y la ventana
-- de fallos de un usuario legitimo no se habria vaciado jamas. De ahi el
-- `(p_ip IS NULL OR ip = p_ip)` en las tres consultas, y no solo en la de
-- conteo.
-- ============================================================================

ALTER TABLE public.intentos_login ALTER COLUMN ip DROP NOT NULL;

COMMENT ON COLUMN public.intentos_login.ip IS
  'IP de confianza del intento. NULL = no se pudo determinar una IP fiable; '
  'ese intento cuenta en la ventana por correo. Ver src/lib/http/ip-cliente.ts.';

CREATE OR REPLACE FUNCTION public.login_bloqueado(p_correo text, p_ip inet)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*) >= 5
  FROM public.intentos_login
  WHERE correo = lower(p_correo)
    AND (p_ip IS NULL OR ip = p_ip)
    AND exitoso = false
    AND creado_en > now() - interval '15 minutes';
$$;

CREATE OR REPLACE FUNCTION public.registrar_intento_login(
  p_correo text, p_ip inet, p_exitoso boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.intentos_login (correo, ip, exitoso)
  VALUES (lower(p_correo), p_ip, p_exitoso);

  IF p_exitoso THEN
    DELETE FROM public.intentos_login
    WHERE correo = lower(p_correo)
      AND (p_ip IS NULL OR ip = p_ip)
      AND exitoso = false;
  END IF;

  DELETE FROM public.intentos_login WHERE creado_en < now() - interval '24 hours';
END $$;

-- CREATE OR REPLACE conserva la ACL de la funcion, asi que los REVOKE de
-- 20260831000100 siguen en pie. Se repiten de todos modos: es barato, y deja
-- el archivo autocontenido para quien lo lea sin ir a buscar la migracion
-- anterior. tests/rls/limite-intentos.test.ts asserta el 42501 desde anon y
-- desde authenticated, con su caso positivo, y avisaria si dejara de ser asi.
REVOKE EXECUTE ON FUNCTION public.login_bloqueado(text, inet)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_bloqueado(text, inet)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.registrar_intento_login(text, inet, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_login(text, inet, boolean)
  TO service_role;
