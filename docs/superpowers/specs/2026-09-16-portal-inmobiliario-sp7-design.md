# SP7 — Super Admin: Moderación, Métricas, Posicionamiento y Auditoría

Estado: diseño formal listo para revisión.
Depende de: SP0 (fundación, roles, auditoría), SP1 (catálogo y destacadas), SP3 (propiedades y fotos), SP4 (leads), SP5 (citas y agenda), SP6 (agentes de IA y telemetría).
Descomposición: `docs/superpowers/specs/2026-08-31-portal-inmobiliario-descomposicion.md`
Rama base: `sp6-ia` (con saneamiento previo verificado)

---

## 1. Qué es y por qué ahora

SP7 es el **cierre operativo del sistema**: dota al `super_admin` de las herramientas necesarias para supervisar, gobernar y monetizar el portal inmobiliario desde la ruta protegida `/control`:

$$\text{Observar} \longrightarrow \text{Moderar} \longrightarrow \text{Monetizar} \longrightarrow \text{Auditar}$$

Hasta SP6, el sistema cuenta con todas las piezas funcionales para vendedores, compradores y agentes autónomos de IA. Sin embargo, la operación interna carece de interfaz:
1. **Moderación**: Si una propiedad contiene fotos inapropiadas o datos engañosos, el administrador hoy no puede intervenir directamente desde la interfaz ni tiene políticas RLS completas sobre `imagenes_propiedad` (hallazgo I7 de SP0).
2. **Posicionamiento**: La columna `destacada` en `propiedades` existe pero su activación era un booleano manual sin modelo financiero, vigencia ni auditoría de cobro.
3. **Métricas**: Los datos de conversión comercial y la telemetría de IA (turnos, tokens, costos y rate limits) viven dispersos en tablas relacionales sin un panel centralizado de inteligencia de negocio.
4. **Auditoría**: La tabla `registro_auditoria` existe desde la migración `20260827000800_registro_auditoria.sql`, pero carecía de escritores en la capa de administración (hallazgo I5 de SP0).

---

## 2. Decisiones de Diseño Confirmadas

| Decisión | Elección | Justificación |
|---|---|---|
| **Modelo de Posicionamiento** | **Activación manual fuera de banda con registro auditable** | El super_admin confirma el pago recibido (transferencia bancaria, consignación o efectivo) y activa la condición `destacada = true` con ventana temporal (`fecha_inicio` y `fecha_fin`). No se añade pasarela externa (Wompi/Stripe) en esta fase, pero la tabla `pagos_posicionamiento` modela todos los campos necesarios para conectar webhooks en el futuro sin migraciones destructivas. |
| **Estilo de Moderación** | **Reactiva (post-publicación), NO preventiva** | El vendedor publica de inmediato al catálogo público (experiencia fluida sin fricción). El super_admin modera a posteriori desde `/control/moderacion`, pudiendo suspender/despublicar la propiedad o retirar imágenes que violen las directrices de la plataforma. |
| **Cierre Hallazgo I7** | **RLS explícita para `super_admin`** | Se concede a `super_admin` privilegios `SELECT, UPDATE, DELETE` sobre `public.propiedades` y `public.imagenes_propiedad` para moderación integral. |
| **Activación de Auditoría (I5)** | **Escritura determinista vía `registrar_evento_auditoria`** | Toda acción administrativa (suspensión, reactivación, asignación de destacado, cambio de parámetros) emite una fila inmutable en `registro_auditoria`. |
| **Privacidad en Métricas** | **Agregaciones anonimizadas** | El dashboard de métricas computa totales agregados (leads, tasas, tokens, costos) sin exponer datos sensibles ni violar las políticas de contacto de compradores. |

---

## 3. Modelo de Datos y Seguridad (RLS)

### 3.1. Tabla `public.pagos_posicionamiento`

Registra cada acuerdo de posicionamiento pagado para destacar propiedades en el catálogo:

```sql
CREATE TYPE estado_pago_posicionamiento AS ENUM ('activo', 'expirado', 'cancelado');

CREATE TABLE public.pagos_posicionamiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id UUID NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  vendedor_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  monto NUMERIC(12, 2) NOT NULL CHECK (monto >= 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'COP',
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  estado estado_pago_posicionamiento NOT NULL DEFAULT 'activo',
  registrado_por UUID NOT NULL REFERENCES public.perfiles(id),
  notas TEXT,
  referencia_externa VARCHAR(100),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_fechas_posicionamiento CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX idx_pagos_posicionamiento_propiedad ON public.pagos_posicionamiento(propiedad_id);
CREATE INDEX idx_pagos_posicionamiento_vendedor ON public.pagos_posicionamiento(vendedor_id);
CREATE INDEX idx_pagos_posicionamiento_vigencia ON public.pagos_posicionamiento(estado, fecha_inicio, fecha_fin);
```

### 3.2. Políticas RLS para `pagos_posicionamiento`

Siguiendo el principio de menor privilegio y la disciplina `pg_default_acl`:
```sql
ALTER TABLE public.pagos_posicionamiento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pagos_posicionamiento FROM anon, authenticated, public;

-- super_admin tiene control total para auditar y gestionar
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_posicionamiento TO authenticated;

CREATE POLICY super_admin_gestion_posicionamiento ON public.pagos_posicionamiento
  FOR ALL
  TO authenticated
  USING (public.es_super_admin())
  WITH CHECK (public.es_super_admin());

-- Vendedor puede consultar el historial de posicionamiento de sus propias propiedades
CREATE POLICY vendedor_lectura_posicionamiento ON public.pagos_posicionamiento
  FOR SELECT
  TO authenticated
  USING (vendedor_id = auth.uid());
```

### 3.3. Sincronización de Destacadas y Expiración

Función segura con `SECURITY DEFINER` para activar/desactivar el flag `destacada` en `propiedades`:
```sql
CREATE OR REPLACE FUNCTION public.actualizar_vigencia_destacadas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Marcar como destacadas las que tienen pagos activos vigentes
  UPDATE public.propiedades p
  SET destacada = true
  WHERE p.estado = 'publicada'
    AND EXISTS (
      SELECT 1 FROM public.pagos_posicionamiento pp
      WHERE pp.propiedad_id = p.id
        AND pp.estado = 'activo'
        AND now() >= pp.fecha_inicio
        AND now() <= pp.fecha_fin
    )
    AND p.destacada = false;

  -- 2. Quitar destacada a las que expiraron
  UPDATE public.propiedades p
  SET destacada = false
  WHERE p.destacada = true
    AND NOT EXISTS (
      SELECT 1 FROM public.pagos_posicionamiento pp
      WHERE pp.propiedad_id = p.id
        AND pp.estado = 'activo'
        AND now() >= pp.fecha_inicio
        AND now() <= pp.fecha_fin
    );

  -- 3. Marcar como expirados los registros de pago pasados
  UPDATE public.pagos_posicionamiento
  SET estado = 'expirado'
  WHERE estado = 'activo' AND now() > fecha_fin;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.actualizar_vigencia_destacadas() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.actualizar_vigencia_destacadas() TO service_role;
```

### 3.4. Cierre del Hallazgo I7: RLS de Moderación para `super_admin`

```sql
-- Políticas en propiedades para super_admin
CREATE POLICY super_admin_moderacion_propiedades ON public.propiedades
  FOR UPDATE
  TO authenticated
  USING (public.es_super_admin())
  WITH CHECK (public.es_super_admin());

-- Políticas en imagenes_propiedad para super_admin
CREATE POLICY super_admin_moderacion_imagenes ON public.imagenes_propiedad
  FOR ALL
  TO authenticated
  USING (public.es_super_admin())
  WITH CHECK (public.es_super_admin());
```

---

## 4. Auditoría Activa (Cierre del Hallazgo I5)

Eventos tipados a registrar mediante `public.registrar_evento_auditoria(p_tipo, p_detalles, p_actor)`:

1. `propiedad_moderada`:
   ```json
   {
     "propiedad_id": "uuid",
     "accion": "suspender" | "reactivar",
     "motivo": "string",
     "estado_anterior": "publicada",
     "estado_nuevo": "pausada"
   }
   ```
2. `posicionamiento_activado`:
   ```json
   {
     "pago_id": "uuid",
     "propiedad_id": "uuid",
     "monto": 150000,
     "fecha_inicio": "2026-09-16T00:00:00Z",
     "fecha_fin": "2026-10-16T00:00:00Z"
   }
   ```
3. `posicionamiento_cancelado`:
   ```json
   {
     "pago_id": "uuid",
     "motivo": "string"
   }
   ```
4. `usuario_suspendido`:
   ```json
   {
     "usuario_id": "uuid",
     "motivo": "string"
   }
   ```

---

## 5. Superficie de Rutas y Navegación en `/control`

Estructura de páginas en el App Router dentro de `src/app/(admin)/control`:

```
src/app/(admin)/control/
├── page.tsx                    # Resumen ejecutivo y accesos rápidos
├── layout.tsx                  # Navegación lateral / superior administrativa
├── moderacion/
│   ├── page.tsx                # Tabla de propiedades con filtros y acciones de moderación
│   └── [id]/page.tsx           # Ficha de inspección, visor seguro de fotos y bitácora
├── posicionamiento/
│   ├── page.tsx                # Listado de acuerdos, destacadas activas y formulario de alta
│   └── nuevo/page.tsx          # Formulario administrativo para registrar pago y activar HOT
├── metricas/
│   └── page.tsx                # Dashboard de métricas de negocio y telemetría de IA
└── auditoria/
    └── page.tsx                # Visor inmutable de eventos con filtrado por tipo, fecha y actor
```

### 5.1. Dashboard de Métricas (`/control/metricas`)
- **Embudo de Negocio**:
  - Propiedades activas en catálogo.
  - Total leads capturados.
  - Leads calificados (aceptados) vs. descartados.
  - Visitas solicitadas y confirmadas.
  - Tasa de conversión punta a punta ($Leads \to Visitas$).
- **Telemetría y Rendimiento de Agentes IA**:
  - Total de turnos de conversación.
  - Consumo agregado de tokens de entrada y salida.
  - Costo financiero acumulado estimado en COP y USD.
  - Conteo de activaciones de límites de abuso (`IA_TOPE_TURNOS`, `IA_TOPE_TOKENS`, `IA_RATE_LIMIT`, `IA_CONCURRENCIA`).
  - Tasa de atención exitosa sin contingencia.

---

## 6. Criterios de Aceptación Verificables

| # | Criterio | Método de Verificación |
|---|---|---|
| **AC1** | **Acceso Estricto**: Solamente usuarios con rol `super_admin` pueden acceder a `/control` y sus subrutas; compradores y vendedores son redirigidos a sus respectivos paneles. | Prueba E2E en `super-admin.spec.ts` y test RLS. |
| **AC2** | **Moderación Reactiva**: El super admin puede suspender una propiedad publicada ajena, lo que la retira de inmediato del catálogo público y registra `propiedad_moderada` en auditoría. | Test RLS y Server Action unit test. |
| **AC3** | **Moderación de Imágenes**: El super admin puede borrar o modificar imágenes de cualquier propiedad ajena (cierre I7). | Test RLS en `tests/rls/moderacion-imagenes.test.ts`. |
| **AC4** | **Posicionamiento Registrado**: La creación de un acuerdo de posicionamiento en `pagos_posicionamiento` activa `destacada = true` en la propiedad y genera el evento de auditoría. | Test RLS y unitario. |
| **AC5** | **Expiración de Destacadas**: Al expirar el rango de fechas, la función de mantenimiento desmarca `destacada` y actualiza el estado a `expirado`. | Test RLS con simulación temporal. |
| **AC6** | **Métricas Consolidadas**: `/control/metricas` calcula correctamente los datos del embudo y los acumulados de tokens/costos de IA. | Test unitario con fixtures deterministas. |
| **AC7** | **Auditoría Inmutable**: La vista `/control/auditoria` expone los eventos reales sin permitir inserción, edición ni borrado manual directo. | Test RLS de inmutabilidad y E2E. |
| **AC8** | **Cero Regresiones**: 100% suites unitarias, RLS, render dinámico y build verdes. | Verificación final de rama. |
