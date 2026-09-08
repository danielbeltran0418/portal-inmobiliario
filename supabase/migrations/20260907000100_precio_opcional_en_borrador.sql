-- Hallazgo Medio de la revision de la Task 8 (server actions de propiedad):
-- crearBorrador insertaba precio = 1 como marcador para satisfacer el
-- NOT NULL + CHECK (precio > 0) de 20260827000600. Ese marcador es
-- indistinguible de un precio real para faltantesParaPublicar
-- (src/lib/propiedades/completitud.ts), que solo mira "no tiene precio o es
-- <= 0": un borrador recien creado aparecia en el panel como si el vendedor
-- ya hubiera puesto el precio, y en teoria podria publicarse a 1 peso.
--
-- La causa es forzar un dato que genuinamente no existe todavia. La columna
-- pasa a admitir NULL; el CHECK (precio > 0) sigue vigente para cualquier
-- valor que SI se ponga -- en Postgres un CHECK se cumple si la expresion es
-- verdadera O NULL, asi que esto no abre ningun precio invalido (cero o
-- negativo siguen rechazados), solo permite representar "todavia sin
-- precio" sin recurrir a un numero falso.
ALTER TABLE public.propiedades ALTER COLUMN precio DROP NOT NULL;

-- Consecuencia directa de lo anterior: ahora que precio SI puede ser NULL en
-- la base, y "publicacion directa" (SP0) significa que PostgREST puede poner
-- estado = 'publicada' sin pasar por el panel, hace falta la misma linea de
-- defensa que ya existe para las imagenes. Sin este trigger, un PATCH
-- directo contra PostgREST podria publicar una propiedad sin precio: la
-- aplicacion ya no lo permitiria (esquemaPropiedad exige precio positivo al
-- actualizar), pero eso es responsabilidad del formulario, no de la base.
--
-- 20260904000300 llamo a la exigencia de imagen "la unica excepcion a
-- publicacion directa" porque en ese momento lo era. Esta migracion la
-- convierte en la primera de dos excepciones, no en la unica: el precio pasa
-- a ser, igual que la imagen, un requisito de BASE para publicar, no solo
-- guia del panel. barrio y descripcion siguen siendo SOLO guia -- una
-- propiedad publicada sin barrio o con descripcion corta no rompe el
-- catalogo -- pero un precio nulo si: es la columna que ordena el indice
-- parcial propiedades_publicadas_idx (20260827000600) y la que cualquier
-- catalogo publico usara para filtrar y mostrar.
CREATE OR REPLACE FUNCTION public.exigir_precio_para_publicar() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.estado = 'publicada'::public.estado_propiedad
     AND (TG_OP = 'INSERT'
          OR OLD.estado IS DISTINCT FROM 'publicada'::public.estado_propiedad)
     AND NEW.precio IS NULL
  THEN
    RAISE EXCEPTION 'Una propiedad publicada necesita un precio'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER propiedades_exigir_precio
  BEFORE INSERT OR UPDATE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.exigir_precio_para_publicar();
