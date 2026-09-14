-- ============================================================================
-- Leads: el mecanismo por el que un comprador con cuenta contacta sobre una
-- propiedad publicada.
--
-- DOS TABLAS, y ese es el nucleo del diseno. El vendedor ve el mensaje al
-- entrar el lead, pero el correo y el telefono solo cuando lo acepta. Eso no
-- se puede expresar con una politica sobre una sola tabla: RLS es por FILA, no
-- por columna. Y no se deja en manos de un RPC de lectura porque entonces no
-- lo hace cumplir la base -- el vendedor conservaria el SELECT y podria leer
-- la tabla directo por PostgREST.
--
-- Con dos tablas, la condicion "solo tras aceptar" es una politica de una sola
-- expresion sobre leads_contacto, y no es falsificable.
-- ============================================================================

CREATE TYPE public.estado_lead AS ENUM ('nuevo','aceptado','descartado');

CREATE TABLE public.leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id    uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  comprador_id    uuid NOT NULL REFERENCES public.perfiles(id)    ON DELETE CASCADE,
  -- Desnormalizado a proposito: la politica de RLS lo necesita. Con solo
  -- propiedad_id habria que subir a propiedades con un EXISTS, y propiedades
  -- tiene DOS politicas permisivas de SELECT que Postgres combina con OR -- una
  -- de ellas estado = 'publicada'. Apoyarse en "RLS ya filtra por dueno" es
  -- exactamente el fallo que costo la Task 11 de SP0.
  vendedor_id     uuid NOT NULL REFERENCES public.perfiles(id)    ON DELETE CASCADE,
  nombre_mostrado text NOT NULL,
  mensaje         text NOT NULL CHECK (char_length(mensaje) BETWEEN 10 AND 1000),
  estado          public.estado_lead NOT NULL DEFAULT 'nuevo',
  creado_en       timestamptz NOT NULL DEFAULT now(),
  respondido_en   timestamptz,
  CONSTRAINT leads_uno_por_comprador_y_propiedad UNIQUE (propiedad_id, comprador_id),
  CONSTRAINT leads_no_a_si_mismo CHECK (comprador_id <> vendedor_id)
);

CREATE TABLE public.leads_contacto (
  lead_id  uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  correo   text NOT NULL,
  telefono text NOT NULL
);

-- La bandeja: los nuevos primero, luego por fecha.
CREATE INDEX leads_bandeja_idx ON public.leads (vendedor_id, estado, creado_en DESC);
-- Un consumidor futuro (SP6) sondea por aqui sin que SP4 sepa que existe.
CREATE INDEX leads_nuevos_idx ON public.leads (creado_en) WHERE estado = 'nuevo';

ALTER TABLE public.leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_contacto ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Privilegios. Ni anon ni authenticated tienen INSERT en ninguna de las dos:
-- el unico camino de escritura es crear_lead() (20260911000400).
-- El vendedor solo puede tocar la columna `estado`, y de sus propios leads.
--
-- anon no necesita ningun REVOKE aqui: 20260831000400 dejo un
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres que reduce a SELECT los
-- privilegios de anon en TODA tabla nueva, verificado contra pg_default_acl
-- antes de escribir esta migracion (defaclacl trae "anon=r/postgres" para
-- relations). tests/rls/privilegios-anon.test.ts lo confirma barriendo todas
-- las tablas de public en tiempo de ejecucion, esta incluida.
--
-- authenticated es otro cuento: ese mismo pg_default_acl trae
-- "authenticated=arwdDxtm/postgres" -- CRUD completo de fabrica en toda tabla
-- nueva, sin tocar. Por eso hace falta el REVOKE explicito de abajo, con el
-- mismo patron de perfiles.sql (Capa 1: REVOKE de tabla, GRANT de columna) y
-- de escritores_auditoria.sql. Sin el, esta migracion seguiria el brief al
-- pie de la letra y la Task 3 quedaria roja: un authenticated con el UPDATE y
-- el DELETE de tabla intactos, contra un lead_id que no existe y sin ninguna
-- politica de UPDATE/DELETE que lo cubra, no recibe 42501 -- RLS sin politica
-- aplicable equivale a USING (false), que en UPDATE/DELETE filtra la fila
-- objetivo como si no existiera y la sentencia termina con 0 filas afectadas
-- y SIN error (ver el comentario de 20260831000700 sobre esta misma trampa
-- en registro_auditoria e intentos_login). El permiso denegado a nivel de
-- tabla, en cambio, se comprueba antes de evaluar la clausula WHERE o RLS, y
-- por eso es 42501 exista o no la fila. Esto se verifico en la base local
-- antes de escribir el resto de la migracion: es el codigo real, no el brief,
-- el que decide aqui.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.leads, public.leads_contacto FROM authenticated;

GRANT SELECT                 ON public.leads          TO authenticated;
GRANT UPDATE (estado)        ON public.leads          TO authenticated;
GRANT SELECT                 ON public.leads_contacto TO authenticated;

CREATE POLICY leads_lectura_vendedor ON public.leads
  FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()));

CREATE POLICY leads_lectura_comprador ON public.leads
  FOR SELECT TO authenticated
  USING (comprador_id = (SELECT auth.uid()));

CREATE POLICY leads_lectura_super_admin ON public.leads
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

-- USING sin WITH CHECK haria las veces de ambos; se declara el WITH CHECK
-- explicito para que la fila resultante tambien tenga que seguir siendo suya.
CREATE POLICY leads_actualizacion_vendedor ON public.leads
  FOR UPDATE TO authenticated
  USING      (vendedor_id = (SELECT auth.uid()))
  WITH CHECK (vendedor_id = (SELECT auth.uid()));

-- El corazon del diseno: el contacto solo es legible cuando el lead padre ya
-- salio de 'nuevo'. Quitar ese AND pone roja la prueba de la Task 3.
CREATE POLICY contacto_lectura_vendedor ON public.leads_contacto
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = leads_contacto.lead_id
      AND l.vendedor_id = (SELECT auth.uid())
      AND l.estado <> 'nuevo'
  ));

-- El comprador lee su propio contacto siempre: es suyo.
CREATE POLICY contacto_lectura_comprador ON public.leads_contacto
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = leads_contacto.lead_id
      AND l.comprador_id = (SELECT auth.uid())
  ));

CREATE POLICY contacto_lectura_super_admin ON public.leads_contacto
  FOR SELECT TO authenticated
  USING (public.es_super_admin());
