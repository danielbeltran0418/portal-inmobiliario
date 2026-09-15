-- ============================================================================
-- SP5: el comprador lee la direccion exacta desde 2 horas antes de su visita
-- confirmada hasta que termina.
--
-- Depende del arreglo fix/ubicacion-privada (20260914000100), que saco
-- direccion, latitud y longitud de `propiedades` a `propiedades_ubicacion`
-- con RLS por fila y dejo leer solo al dueno y al super admin. Esta migracion
-- solo ANADE la politica del comprador: no toca privilegios (authenticated ya
-- tiene SELECT desde el arreglo) ni las otras politicas.
--
-- El filtro `c.comprador_id = auth.uid()` va escrito aunque `citas` tenga
-- politica de comprador: `citas` tambien tiene las del vendedor y del super
-- admin, combinadas con OR, y el EXISTS las atraviesa todas. Sin el, el
-- vendedor de una visita -- que tras reasignar la propiedad ya no es su
-- dueno -- leeria la direccion. tests/rls/ubicacion-ventana.test.ts lo prueba.
--
-- Mover o cancelar arrastran la ventana sin hacer nada aqui: la politica lee
-- el rango y el estado actuales de la cita.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.propiedades_ubicacion') IS NULL THEN
    RAISE EXCEPTION
      'Falta public.propiedades_ubicacion: hay que mergear fix/ubicacion-privada (20260914000100) antes de SP5';
  END IF;
END $$;

CREATE POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.citas c
    WHERE c.propiedad_id = propiedades_ubicacion.propiedad_id
      AND c.comprador_id = (SELECT auth.uid())   -- explicito, no se confia en RLS
      AND c.estado = 'confirmada'
      AND now() >= lower(c.rango) - interval '2 hours'
      AND now() <  upper(c.rango)
  ));
