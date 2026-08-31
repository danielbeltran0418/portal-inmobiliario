-- ============================================================================
-- imagenes_actualizacion_dueno: WITH CHECK explicito.
--
-- CORRECCION DE LA PREMISA. El mandato decia que la politica, al tener USING
-- sin WITH CHECK, dejaba a un vendedor mover una imagen suya a la propiedad de
-- otro. Es falso, y se comprobo contra esta misma base:
--
--   - Con el esquema original (sin esta migracion), el vendedor A intentando
--     poner propiedad_id de una propiedad del vendedor B recibe 42501
--     "new row violates row-level security policy".
--   - Repro minima en PostgreSQL 17.6: politica FOR UPDATE con USING y sin
--     WITH CHECK. El UPDATE que deja la fila dentro del predicado -> UPDATE 1.
--     El UPDATE que la saca fuera -> ERROR: new row violates row-level
--     security policy.
--
-- Es el comportamiento documentado de CREATE POLICY: si no se define WITH
-- CHECK, la expresion de USING se usa TAMBIEN para validar la fila resultante.
-- La proteccion ya existia; estaba implicita.
--
-- Entonces por que esta migracion. Porque un control de seguridad que depende
-- de un valor por defecto es fragil ante la siguiente edicion: el dia que
-- alguien amplie el USING (por ejemplo para dejar moderar al super_admin), el
-- WITH CHECK implicito se ampliaria con el, en silencio y sin que nadie lo
-- decida. Escribirlo aparte convierte "que filas puedo tocar" y "como pueden
-- quedar" en dos decisiones separadas, que es lo que son.
--
-- Este cambio NO arregla un agujero: no cambia ningun comportamiento
-- observable. Lo que faltaba de verdad era la prueba, y esa esta en
-- tests/rls/imagenes.test.ts.
--
-- Se recrea la politica entera (DROP + CREATE) porque la migracion original no
-- se toca.
-- ============================================================================

DROP POLICY imagenes_actualizacion_dueno ON public.imagenes_propiedad;

CREATE POLICY imagenes_actualizacion_dueno ON public.imagenes_propiedad
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ));
