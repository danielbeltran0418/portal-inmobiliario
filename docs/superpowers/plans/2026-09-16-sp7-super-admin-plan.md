# Plan de Implementación — SP7: Super Admin (Moderación, Métricas, Posicionamiento y Auditoría)

- **Estado:** listo para ejecución.
- **Rama:** `sp7-super-admin` (a crear desde `sp6-ia` tras saneamiento previo verificado).
- **Spec:** `docs/superpowers/specs/2026-09-16-portal-inmobiliario-sp7-design.md`
- **Mapeo de negocio:** cierre operativo del mapa general (`specs/2026-08-31-portal-inmobiliario-descomposicion.md`).

---

## Tarea 1: Esquema de Base de Datos y Políticas RLS (I7 + Posicionamiento)

**Files:**
- Create: `supabase/migrations/20260917000100_sp7_super_admin.sql`

**Interfaces:**
- Consumes: tablas `propiedades`, `imagenes_propiedad`, `perfiles`, `registro_auditoria`.
- Produces: tabla `pagos_posicionamiento`, función `actualizar_vigencia_destacadas()`, políticas RLS para `super_admin`.

- [ ] **Paso 1: Crear migración con RLS estricta.**
  - Enum `estado_pago_posicionamiento` (`activo`, `expirado`, `cancelado`).
  - Tabla `pagos_posicionamiento` con checks de fechas y FKs con CASCADE.
  - Cierre I7: políticas en `propiedades` e `imagenes_propiedad` para `super_admin`.
  - `REVOKE ALL` explícito para cumplir `pg_default_acl`.
  - Políticas de lectura de posicionamiento para vendedores (`vendedor_id = auth.uid()`).
  - Función `actualizar_vigencia_destacadas()` ejecutable exclusivamente por `service_role`.

- [ ] **Paso 2: Aplicar migración en base local.**
```powershell
npx supabase migration up
```

- [ ] **Paso 3: Commit.**
```bash
git add supabase/migrations/20260917000100_sp7_super_admin.sql
git commit -m "feat(sp7): migracion para pagos_posicionamiento y politicas rls de super_admin"
```

---

## Tarea 2: Pruebas de RLS y Ciclo de Falsificación

**Files:**
- Create: `tests/rls/super-admin.test.ts`
- Create: `tests/rls/posicionamiento.test.ts`

**Interfaces:**
- Consumes: clientes Supabase (anónimo, comprador, vendedor, super_admin).
- Produces: suite RLS con aserciones de código de error (`42501`) y casos positivos.

- [ ] **Paso 1: Implementar `tests/rls/super-admin.test.ts`.**
  - Comprador y vendedor reciben `42501` al intentar UPDATE/DELETE de propiedades ajenas o ver `pagos_posicionamiento` globales.
  - Super admin actualiza estado de propiedades ajenas y gestiona imágenes (I7 verificado).
  - Vendedor consulta únicamente sus propios acuerdos de posicionamiento.
  - Anónimo denegado en todas las operaciones administrativas.

- [ ] **Paso 2: Implementar `tests/rls/posicionamiento.test.ts`.**
  - Registro de pago activa `destacada = true` vía función de vigencia.
  - Falsificación 1: Quitar temporalmente `es_super_admin()` de la política $\to$ verificar que la prueba detecta la vulnerabilidad $\to$ revertir.
  - Falsificación 2: Intentar crear acuerdo con `fecha_fin <= fecha_inicio` $\to$ verificar rechazo por CHECK constraint `23514`.

- [ ] **Paso 3: Ejecutar pruebas.**
```powershell
npm run test:rls
```

- [ ] **Paso 4: Commit.**
```bash
git add tests/rls/super-admin.test.ts tests/rls/posicionamiento.test.ts
git commit -m "test(rls): suites de autorizacion y falsificacion para super admin y posicionamiento"
```

---

## Tarea 3: Servicios y Server Actions de Moderación

**Files:**
- Create: `src/lib/admin/moderacion.ts`
- Create: `src/app/(admin)/control/moderacion/acciones.ts`
- Create: `tests/unit/admin/moderacion.test.ts`

**Interfaces:**
- Consumes: cliente servidor autenticado con guarda de rol `super_admin`.
- Produces: Server Actions para suspender propiedad, reactivar propiedad y retirar imágenes infractoras con registro inmutable en `registro_auditoria`.

- [ ] **Paso 1: Implementar servicios en `src/lib/admin/moderacion.ts`.**
  - Función `suspenderPropiedad(propiedadId, motivo, adminId)`.
  - Función `reactivarPropiedad(propiedadId, adminId)`.
  - Emisión de evento `propiedad_moderada` con detalles tipados.

- [ ] **Paso 2: Implementar Server Actions en `src/app/(admin)/control/moderacion/acciones.ts`.**
  - Verificación estricta de rol `super_admin` con `exigirSuperAdmin()`.
  - Revalidación de rutas públicas del catálogo y panel `/control`.

- [ ] **Paso 3: Escribir pruebas unitarias.**
```powershell
npm run test:unit -- tests/unit/admin/moderacion.test.ts
```

- [ ] **Paso 4: Commit.**
```bash
git add src/lib/admin/moderacion.ts src/app/(admin)/control/moderacion/acciones.ts tests/unit/admin/moderacion.test.ts
git commit -m "feat(admin): servicios y server actions de moderacion con auditoria"
```

---

## Tarea 4: Servicios y Server Actions de Posicionamiento Pagado

**Files:**
- Create: `src/lib/admin/posicionamiento.ts`
- Create: `src/app/(admin)/control/posicionamiento/acciones.ts`
- Create: `tests/unit/admin/posicionamiento.test.ts`

**Interfaces:**
- Consumes: Zod schema de acuerdo de posicionamiento, cliente admin.
- Produces: funciones de alta manual de pago, sincronización de `destacada` y cancelación.

- [ ] **Paso 1: Implementar validación Zod y lógica de posicionamiento.**
  - Validación: `monto >= 0`, `fecha_fin > fecha_inicio`, `propiedad_id` existente y publicada.
  - Función `registrarPagoPosicionamiento(datos, adminId)`.
  - Emisión de evento `posicionamiento_activado` en auditoría.

- [ ] **Paso 2: Implementar Server Actions y pruebas unitarias.**
```powershell
npm run test:unit -- tests/unit/admin/posicionamiento.test.ts
```

- [ ] **Paso 3: Commit.**
```bash
git add src/lib/admin/posicionamiento.ts src/app/(admin)/control/posicionamiento/acciones.ts tests/unit/admin/posicionamiento.test.ts
git commit -m "feat(admin): servicios de posicionamiento pagado con vigencia y auditoria"
```

---

## Tarea 5: Motor de Métricas de Negocio e Inteligencia de IA

**Files:**
- Create: `src/lib/admin/metricas.ts`
- Create: `tests/unit/admin/metricas.test.ts`

**Interfaces:**
- Consumes: tablas `propiedades`, `leads`, `citas`, `mensajes_ia`, `conversaciones_ia`.
- Produces: agregaciones computadas para el embudo comercial y monitoreo de IA.

- [ ] **Paso 1: Implementar agregaciones en `src/lib/admin/metricas.ts`.**
  - `consultarMetricasEmbudo()`: conteo de propiedades, leads, aceptados/descartados y citas confirmadas.
  - `consultarMetricasIA()`: turnos totales, tokens in/out, estimación de costos (GPT-5.6 / Gemini), distribución por emisor y códigos de límite alcanzados.

- [ ] **Paso 2: Pruebas unitarias de agregación.**
  - Validar cálculos con mocks deterministas de filas y casos de división por cero (tasa de conversión cuando no hay leads).

- [ ] **Paso 3: Ejecutar pruebas.**
```powershell
npm run test:unit -- tests/unit/admin/metricas.test.ts
```

- [ ] **Paso 4: Commit.**
```bash
git add src/lib/admin/metricas.ts tests/unit/admin/metricas.test.ts
git commit -m "feat(admin): agregaciones de metricas comerciales y telemetria de ia"
```

---

## Tarea 6: Consultas y Filtrado de Auditoría

**Files:**
- Create: `src/lib/admin/auditoria.ts`
- Create: `tests/unit/admin/auditoria.test.ts`

**Interfaces:**
- Consumes: tabla `registro_auditoria`.
- Produces: consulta paginada y filtrable por tipo de evento, rango de fechas y actor.

- [ ] **Paso 1: Implementar `consultarEventosAuditoria(filtros, paginacion)`.**
  - Sanitización de parámetros y ordenación descendente por `creado_en`.

- [ ] **Paso 2: Pruebas unitarias.**
```powershell
npm run test:unit -- tests/unit/admin/auditoria.test.ts
```

- [ ] **Paso 3: Commit.**
```bash
git add src/lib/admin/auditoria.ts tests/unit/admin/auditoria.test.ts
git commit -m "feat(admin): modulo de consulta y filtrado para registro_auditoria"
```

---

## Tarea 7: UI del Panel de Control: Layout y Dashboard General

**Files:**
- Create: `src/app/(admin)/control/layout.tsx`
- Modify: `src/app/(admin)/control/page.tsx`
- Create: `src/components/admin/NavegacionAdmin.tsx`

**Interfaces:**
- Consumes: sesión con rol `super_admin`.
- Produces: cascarón visual con enlaces a Moderación, Posicionamiento, Métricas y Auditoría, más tarjetas de resumen en `/control`.

- [ ] **Paso 1: Construir `NavegacionAdmin` y `layout.tsx`.**
  - Diseño limpio y responsivo con enlaces activos y botón de volver al portal.
  - Metadatos con `robots: { index: false, follow: false }`.

- [ ] **Paso 2: Implementar `/control/page.tsx` con indicadores clave (KPIs rápidos).**

- [ ] **Paso 3: Commit.**
```bash
git add src/app/\(admin\)/control/layout.tsx src/app/\(admin\)/control/page.tsx src/components/admin/NavegacionAdmin.tsx
git commit -m "feat(ui): layout y pagina principal del panel de control super_admin"
```

---

## Tarea 8: UI de Moderación y Posicionamiento

**Files:**
- Create: `src/app/(admin)/control/moderacion/page.tsx`
- Create: `src/app/(admin)/control/moderacion/[id]/page.tsx`
- Create: `src/app/(admin)/control/posicionamiento/page.tsx`
- Create: `src/app/(admin)/control/posicionamiento/nuevo/page.tsx`
- Create: `src/components/admin/BotonModeracion.tsx`

**Interfaces:**
- Consumes: Server Actions de moderación y posicionamiento.
- Produces: pantallas funcionales con confirmaciones y alertas accesibles.

- [ ] **Paso 1: Vistas de Moderación.**
  - Lista de propiedades con badges de estado (`publicada`, `pausada`).
  - Inspección individual con visor de fotos firmadas y modal/botón de suspensión con campo de motivo obligatorio.

- [ ] **Paso 2: Vistas de Posicionamiento.**
  - Listado de acuerdos con fechas de vigencia y badge `activo`/`expirado`.
  - Formulario de alta para seleccionar propiedad, vendedor, monto y fechas.

- [ ] **Paso 3: Commit.**
```bash
git add src/app/\(admin\)/control/moderacion/ src/app/\(admin\)/control/posicionamiento/ src/components/admin/
git commit -m "feat(ui): interfaces de moderacion de publicaciones y gestion de posicionamiento"
```

---

## Tarea 9: UI de Métricas y Visor de Auditoría

**Files:**
- Create: `src/app/(admin)/control/metricas/page.tsx`
- Create: `src/app/(admin)/control/auditoria/page.tsx`
- Create: `src/components/admin/GraficoEmbudo.tsx`
- Create: `src/components/admin/TablaAuditoria.tsx`

**Interfaces:**
- Consumes: agregaciones de métricas y eventos de auditoría.
- Produces: dashboard analítico y visor de bitácora con filtros interactivos.

- [ ] **Paso 1: Pantalla `/control/metricas`.**
  - Tarjetas de embudo y porcentajes de conversión.
  - Panel de telemetría de IA: volumen de tokens, costo estimado en COP y gráfico de turnos.

- [ ] **Paso 2: Pantalla `/control/auditoria`.**
  - Tabla con timestamp, actor, tipo y payload JSON inspeccionable formateado.

- [ ] **Paso 3: Commit.**
```bash
git add src/app/\(admin\)/control/metricas/ src/app/\(admin\)/control/auditoria/ src/components/admin/
git commit -m "feat(ui): dashboard de metricas comerciales/ia y visor de auditoria"
```

---

## Tarea 10: Suite E2E y Verificación Final de Rama

**Files:**
- Create: `tests/e2e/super-admin.spec.ts`

**Interfaces:**
- Consumes: aplicación en ejecución completa, Playwright.
- Produces: validación end-to-end de moderación, activación de destacada y seguridad de acceso.

- [ ] **Paso 1: Resetear base de datos.**
```powershell
npx supabase db reset
```

- [ ] **Paso 2: Implementar `tests/e2e/super-admin.spec.ts`.**
  - Flujo 1: Acceso bloqueado a `/control` para comprador y vendedor (redirección comprobada).
  - Flujo 2: Super admin inicia sesión $\to$ modera una propiedad $\to$ verifica que desaparece del catálogo público $\to$ comprueba evento en `/control/auditoria`.
  - Flujo 3: Super admin activa acuerdo de posicionamiento $\to$ verifica badge "Destacada" en catálogo.
  - Flujo 4: Visita a `/control/metricas` muestra datos consistentes sin fallos de renderizado.

- [ ] **Paso 3: Ejecutar suite E2E y suites globales.**
```powershell
npm run test:unit
npm run test:rls
npm run test:e2e -- tests/e2e/super-admin.spec.ts
npm run lint
npm run build
npm run verificar:render
```
Esperado: 100% pruebas pasando, cero warnings, render dinámico validado.

- [ ] **Paso 4: Commit.**
```bash
git add tests/e2e/super-admin.spec.ts
git commit -m "test(e2e): suite completa de flujos para super admin y verificacion final de sp7"
```

---

## Mapeo de Criterios de Aceptación contra Tareas

| Criterio de Aceptación del Spec | Tarea que lo Cumple y Verifica |
|---|---|
| **AC1: Acceso Estricto a `/control`** | **Tarea 7** (layout y guardas) y **Tarea 10** (E2E). |
| **AC2: Moderación Reactiva de Propiedades** | **Tarea 3** (acciones), **Tarea 8** (UI) y **Tarea 10** (E2E). |
| **AC3: Moderación de Imágenes (Cierre I7)** | **Tarea 1** (RLS), **Tarea 2** (pruebas RLS) y **Tarea 8** (UI). |
| **AC4: Activación de Posicionamiento Auditable** | **Tarea 1** (esquema), **Tarea 4** (servicios) y **Tarea 8** (UI). |
| **AC5: Sincronización y Expiración de Destacadas** | **Tarea 1** (trigger/función) y **Tarea 2** (RLS). |
| **AC6: Métricas Comerciales y de IA** | **Tarea 5** (servicios) y **Tarea 9** (dashboard). |
| **AC7: Auditoría Inmutable Activa (Cierre I5)** | **Tarea 3, 4** (emisores), **Tarea 6** (lector) y **Tarea 9** (visor). |
| **AC8: Cero Regresiones y Verificación Global** | **Tarea 10** (verificación final de rama). |
