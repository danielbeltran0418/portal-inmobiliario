-- Ticket de alta prioridad: se puede VACIAR el precio de una propiedad ya
-- PUBLICADA.
--
-- exigir_precio_para_publicar() (20260907000100) solo vigilaba la TRANSICION
-- hacia 'publicada':
--
--   IF NEW.estado = 'publicada'
--      AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'publicada')
--      AND NEW.precio IS NULL
--   THEN RAISE EXCEPTION ...
--
-- Con OLD.estado = 'publicada' Y NEW.estado = 'publicada' (un UPDATE que dela
-- estado como estaba), la segunda condicion es falsa y el UPDATE pasa aunque
-- NEW.precio sea NULL. Reproducido con
-- `UPDATE propiedades SET precio = NULL WHERE id = <una publicada>`.
--
-- La condicion de transicion tenia sentido cuando el unico riesgo que se
-- vigilaba era "publicar sin precio" (entrar al estado). Pero desde que
-- precio admite NULL (esa misma migracion 20260907000100), tambien se puede
-- SALIR con precio NULL sin cambiar de estado: actualizarPropiedad()
-- (src/app/(vendedor)/panel/propiedades/acciones.ts) manda `precio: null`
-- EXPLICITO cuando el vendedor vacia el campo del formulario y pulsa
-- "Guardar cambios" (paraElUpdate() convierte el opcional vaciado en NULL
-- explicito para que SI viaje en el PATCH -- ver el comentario de esa
-- funcion). Ese UPDATE no toca `estado`: si la propiedad ya estaba
-- publicada, sigue publicada, y el trigger -- mirando solo la transicion --
-- no tenia nada que decir.
--
-- El arreglo: la comprobacion deja de mirar CUALQUIER cosa sobre TG_OP u
-- OLD.estado. Aplica siempre que el estado RESULTANTE (NEW.estado) sea
-- 'publicada' -- sea INSERT, sea una transicion hacia publicada, o sea un
-- UPDATE de una fila que YA estaba publicada y se queda publicada. En los
-- tres casos el invariante es el mismo: una fila publicada, en el instante
-- en que el trigger termina, tiene precio. Esto hace que el criterio del
-- precio sea MAS ESTRICTO que el que usa exigir_imagen_para_publicar()
-- (20260904000300) para las imagenes: ese trigger SÍ conserva
-- `AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'publicada')`,
-- permitiendo vaciar fotos de una propiedad ya publicada siempre que NO sea
-- una transicion hacia publicada. El hueco equivalente (vaciar fotos de una
-- publicada borrando sus filas imagenes_propiedad) sigue abierto: la politica
-- imagenes_borrado_dueno deja al dueno borrar sin consultar estado, y no hay
-- trigger en imagenes_propiedad que lo impida. Esta diferencia y ese hueco
-- estan parqueados con ticket propio.
--
-- Que SI sigue funcionando (decision de diseno que esta migracion NO
-- revoca): vaciar el precio de un BORRADOR. Un borrador tiene
-- NEW.estado = 'borrador' (o el estado que sea, pero no 'publicada'), asi que
-- la condicion `NEW.estado = 'publicada'` es falsa y el trigger no dice nada.
-- Eso es exactamente lo que crearBorrador() y "guardar un borrador sin
-- precio" necesitan seguir permitiendo (ver 20260907000100 y
-- accion-propiedades.test.ts).
--
-- Impacto en la aplicacion: NINGUNO en el camino normal. actualizarPropiedad()
-- solo manda `precio: null` cuando el INPUT del formulario llega vacio; para
-- una propiedad publicada con precio real, el input es no-controlado con
-- `defaultValue={precio}` (formulario-datos.tsx), asi que un guardado que NO
-- toca el precio reenvia el mismo valor que ya tenia -- nunca NULL. Este
-- trigger mas estricto solo se activa cuando el vendedor de verdad vacia el
-- campo de precio de una propiedad publicada y guarda: exactamente el hueco
-- que este ticket cierra. Ese UPDATE ahora falla con 23514 (check_violation)
-- y actualizarPropiedad() ya lo captura como cualquier otro error de
-- UPDATE (MENSAJE_GENERICO, ver src/lib/errores/mapear.ts) -- no se filtra
-- texto crudo de Postgres al vendedor.
CREATE OR REPLACE FUNCTION public.exigir_precio_para_publicar() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.estado = 'publicada'::public.estado_propiedad
     AND NEW.precio IS NULL
  THEN
    RAISE EXCEPTION 'Una propiedad publicada necesita un precio'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- El trigger propiedades_exigir_precio (20260907000100) ya invoca esta
-- funcion por nombre: CREATE OR REPLACE FUNCTION le basta para que la nueva
-- logica quede activa sin recrear el trigger.
