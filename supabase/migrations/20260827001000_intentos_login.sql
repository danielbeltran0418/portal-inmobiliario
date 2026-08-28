CREATE TABLE public.intentos_login (
  id        bigserial PRIMARY KEY,
  correo    text NOT NULL,
  ip        inet NOT NULL,
  exitoso   boolean NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX intentos_login_ventana_idx
  ON public.intentos_login (correo, ip, creado_en DESC);

ALTER TABLE public.intentos_login ENABLE ROW LEVEL SECURITY;
-- Sin politicas y sin GRANT: ningun rol de aplicacion accede.

-- Se limita por correo + IP combinados: solo por IP se castiga a usuarios
-- legitimos detras de un NAT compartido; solo por correo queda abierto el
-- barrido distribuido de cuentas.
CREATE OR REPLACE FUNCTION public.login_bloqueado(p_correo text, p_ip inet)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*) >= 5
  FROM public.intentos_login
  WHERE correo = lower(p_correo)
    AND ip = p_ip
    AND exitoso = false
    AND creado_en > now() - interval '15 minutes';
$$;

CREATE OR REPLACE FUNCTION public.registrar_intento_login(
  p_correo text, p_ip inet, p_exitoso boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.intentos_login (correo, ip, exitoso)
  VALUES (lower(p_correo), p_ip, p_exitoso);

  -- Un login exitoso limpia la ventana de esa combinacion.
  IF p_exitoso THEN
    DELETE FROM public.intentos_login
    WHERE correo = lower(p_correo) AND ip = p_ip AND exitoso = false;
  END IF;

  -- Purga de registros viejos para que la tabla no crezca sin limite.
  DELETE FROM public.intentos_login WHERE creado_en < now() - interval '24 hours';
END $$;

REVOKE EXECUTE ON FUNCTION public.login_bloqueado FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_intento_login FROM anon, authenticated;
