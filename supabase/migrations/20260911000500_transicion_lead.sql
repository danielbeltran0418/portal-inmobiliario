-- ============================================================================
-- Transiciones de estado de un lead: nuevo -> aceptado | descartado, y nunca
-- la vuelta.
--
-- Va en un trigger y no en el server action porque el vendedor SI escribe
-- directo aqui: tiene UPDATE (estado) sobre sus propios leads por RLS. La
-- interfaz no es el unico camino.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validar_transicion_lead() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado <> 'nuevo' THEN
    RAISE EXCEPTION 'Este lead ya fue respondido' USING ERRCODE = 'P0001';
  END IF;

  NEW.respondido_en := now();

  -- Por registrar_evento_auditoria() (20260831000700), y no un INSERT
  -- directo: esa funcion es el UNICO escritor documentado de
  -- registro_auditoria y protege contra 23503 si el actor ya no existe.
  -- crear_lead() (20260911000400) se corrigio para llamarla por el mismo
  -- motivo; duplicar el INSERT aqui reabriria la misma trampa.
  PERFORM public.registrar_evento_auditoria(
    CASE NEW.estado WHEN 'aceptado' THEN 'lead_aceptado' ELSE 'lead_descartado' END,
    'lead',
    NEW.id,
    auth.uid(),
    jsonb_build_object('propiedad_id', NEW.propiedad_id)
  );

  RETURN NEW;
END $$;

CREATE TRIGGER leads_validar_transicion
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.validar_transicion_lead();

REVOKE EXECUTE ON FUNCTION public.validar_transicion_lead() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.validar_transicion_lead() TO service_role;
