-- Auditoria de seguridad (CN-005, CN-014, CN-017).

-- CN-005: cualquier usuario autenticado, tambien un comprador, podia insertar
-- propiedades por PostgREST (el proxy solo le cierra la interfaz /panel). La
-- politica solo comprobaba vendedor_id = auth.uid(). Se exige el rol, igual que
-- ya hace disponibilidad_semanal.
DROP POLICY propiedades_insercion_dueno ON public.propiedades;
CREATE POLICY propiedades_insercion_dueno ON public.propiedades
  FOR INSERT TO authenticated
  WITH CHECK (
    vendedor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol IN ('vendedor', 'super_admin')
    )
  );

-- CN-014: favoritos aceptaba cualquier propiedad_id; el error de la FK servia
-- de oraculo de existencia de anuncios no publicados.
DROP POLICY "Comprador puede marcar favoritos" ON public.favoritos;
CREATE POLICY "Comprador puede marcar favoritos" ON public.favoritos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = usuario_id
    AND EXISTS (
      SELECT 1 FROM public.propiedades p
      WHERE p.id = propiedad_id AND p.estado = 'publicada'
    )
  );

-- CN-014: el comprador podia reescribir token_baja (el secreto de baja del
-- correo) y ultima_notificacion_en (cursor del cron). Solo edita lo suyo.
REVOKE UPDATE ON public.busquedas_guardadas FROM authenticated;
GRANT UPDATE (nombre, filtros, notificaciones_activas) ON public.busquedas_guardadas TO authenticated;

-- CN-014: telefono sin tope. NOT VALID: solo vigila las filas nuevas, para no
-- romper la migracion si ya hubiera datos antiguos largos.
ALTER TABLE public.leads_contacto
  ADD CONSTRAINT leads_contacto_telefono_largo CHECK (char_length(telefono) <= 30) NOT VALID;

-- CN-017: authenticated y anon conservaban privilegios por defecto que la API
-- no expone pero que no tienen por que existir (TRUNCATE se salta RLS).
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated;
