-- actualizar_vigencia_destacadas() es mantenimiento del sistema: marca como
-- expirados los pagos de posicionamiento vencidos. 20260917000100 la dejo
-- ejecutable por `authenticated`, asi que cualquier usuario con sesion podia
-- invocarla por RPC. Hoy es inofensiva (solo expira lo que ya vencio), pero
-- una funcion SECURITY DEFINER que escribe no tiene por que estar abierta a
-- los usuarios: si algun dia cambia su cuerpo, el agujero ya estaria puesto.
--
-- Nadie en la aplicacion la llama con la sesion del usuario; queda solo para
-- service_role, como el resto de funciones de mantenimiento.
REVOKE EXECUTE ON FUNCTION public.actualizar_vigencia_destacadas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_vigencia_destacadas() TO service_role;
