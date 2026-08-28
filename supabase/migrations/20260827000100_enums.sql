CREATE TYPE public.rol_usuario      AS ENUM ('comprador','vendedor','super_admin');
CREATE TYPE public.tipo_operacion   AS ENUM ('venta','arriendo');
CREATE TYPE public.tipo_inmueble    AS ENUM ('apartamento','casa','local','lote','oficina');
CREATE TYPE public.estado_propiedad AS ENUM
  ('borrador','en_revision','publicada','pausada','vendida','rechazada');
