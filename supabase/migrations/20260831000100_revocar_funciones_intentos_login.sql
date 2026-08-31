-- ============================================================================
-- Cierra el bypass del limite de intentos.
--
-- 20260827001000 revocaba EXECUTE solo de anon y authenticated. Postgres
-- concede EXECUTE a PUBLIC por defecto en toda funcion nueva, y revocar de un
-- rol NO le quita lo que hereda via PUBLIC: ambas funciones seguian siendo
-- invocables sin autenticar por RPC de PostgREST. Como son SECURITY DEFINER,
-- eso permitia:
--   - registrar_intento_login(correo, ip, true)  -> limpia la ventana de
--     fallos de la victima: bypass total del limite de intentos.
--   - registrar_intento_login(correo, ip, false) repetido -> bloqueo
--     arbitrario de la cuenta de cualquiera.
--   - login_bloqueado(correo, ip) -> oraculo del estado de bloqueo ajeno.
--
-- El patron correcto es el de 20260827000900 linea 28: nombrar PUBLIC en el
-- REVOKE. REVOKE ... FROM PUBLIC exige la firma exacta de cada funcion.
-- Tras quitar PUBLIC, service_role tambien pierde el privilegio heredado, asi
-- que se le vuelve a conceder de forma explicita: es el unico rol que llama
-- estas funciones (src/lib/auth/limite-intentos.ts usa el cliente admin).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.login_bloqueado(text, inet)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_bloqueado(text, inet)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.registrar_intento_login(text, inet, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_login(text, inet, boolean)
  TO service_role;
