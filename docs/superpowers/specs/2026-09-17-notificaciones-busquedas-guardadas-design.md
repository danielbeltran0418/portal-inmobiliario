# Motor de Alertas por Email para Búsquedas Guardadas

**Fecha:** 2026-09-17
**Estado:** Aprobado para implementación
**Rama base:** `main` (SP0 a SP7 y SP2 mergeados)
**Rama de trabajo:** `notificaciones-busquedas-guardadas`

---

## 1. Contexto y Objetivo

SP2 introdujo `busquedas_guardadas` con la columna `notificaciones_activas` y el toggle
correspondiente en `/mi-cuenta/busquedas`, pero nunca se construyó el mecanismo que
efectivamente envía algo cuando esa columna está en `true`. Hoy es una promesa vacía: el
comprador puede activarla y nunca recibirá nada.

Este proyecto cierra ese hueco: un cron diario que, para cada búsqueda guardada activa, revisa
si hay propiedades publicadas nuevas que coincidan con sus filtros y, si las hay, envía un
correo con el digest de esas coincidencias.

No existe hoy ningún proveedor de email de propósito general en el proyecto — solo los correos
transaccionales nativos de Supabase Auth (verificación de cuenta, magic links), que no sirven
para enviar contenido arbitrario. Este proyecto introduce **Resend** como proveedor.

---

## 2. Decisiones de Diseño Confirmadas

| Decisión | Elección | Justificación |
|---|---|---|
| **Frecuencia** | Digest diario | Sigue el mismo patrón de cron ya establecido en SP6 (`procesar-leads`); agrupa coincidencias en un solo correo por búsqueda en vez de spamear por cada propiedad publicada. |
| **Proveedor de email** | Resend | SDK oficial de Node/TypeScript, tier gratuito suficiente, estándar de facto en el ecosistema Next.js/Vercel. |
| **Unsubscribe** | Toggle en la UI + enlace de un clic en el correo | El toggle ya existe (SP2); el enlace de baja usa un token opaco propio (no la sesión), para que funcione sin login directamente desde el correo. |
| **Un correo por comprador o por búsqueda si hay varias coincidencias el mismo día** | Un correo por búsqueda guardada | Más simple de razonar, testear y depurar que agregar todas las búsquedas de un comprador en un solo correo. |
| **Historial de envíos** | No se crea tabla de historial | `ultima_notificacion_en` en `busquedas_guardadas`, actualizado solo tras un envío exitoso, es suficiente para no reenviar ni perder coincidencias ante un fallo transitorio de Resend. YAGNI: no se necesita auditoría de envíos para este alcance. |

---

## 3. Modelo de Datos

Migración: `supabase/migrations/20260919000100_notificaciones_busquedas.sql`

```sql
alter table public.busquedas_guardadas
  add column if not exists ultima_notificacion_en timestamptz not null default now(),
  add column if not exists token_baja uuid not null default gen_random_uuid();

create unique index if not exists idx_busquedas_token_baja on public.busquedas_guardadas(token_baja);
```

- `ultima_notificacion_en` se inicializa en `now()` (no en `creado_en`) para que una búsqueda
  recién creada **no** dispare un correo retroactivo con todo el historial de propiedades que ya
  existían antes de guardarla — solo notifica propiedades publicadas después de guardar la
  búsqueda.
- `token_baja` es un UUID aleatorio, no derivado de datos del usuario, para que el enlace de baja
  en el correo no sea adivinable. No se expone en ninguna respuesta de API salvo dentro del cuerpo
  del correo enviado por Resend.
- No se agregan políticas RLS nuevas: la tabla ya tiene RLS por dueño desde SP2, y el cron accede
  con el cliente admin (bypassa RLS), igual que `procesarLeadsNuevos` de SP6.

---

## 4. Lógica de Matching

Nuevo módulo `src/lib/notificaciones/busquedas.ts`, mismo patrón que
`src/lib/ia/despachador.ts` (SP6):

```
obtenerBusquedasParaNotificar(): Promise<ResultadoNotificacion[]>
```

Para cada fila de `busquedas_guardadas` con `notificaciones_activas = true`, usando el cliente
admin:

1. Resolver `barrio_id` a partir de `filtros.barrio` (slug).
2. Consultar `propiedades` con:
   - `estado = 'publicada'`
   - `barrio_id = <resuelto>`
   - `creado_en > ultima_notificacion_en`
   - `operacion = filtros.operacion` (si está definida)
   - `tipo_inmueble = filtros.tipo` (si está definido)
   - `precio >= filtros.precio_min` (si está definido)
   - `precio <= filtros.precio_max` (si está definido)
3. Si no hay coincidencias: no se hace nada, `ultima_notificacion_en` **no se actualiza** (se
   reintenta mañana con la ventana ampliada; no hay costo en reintentar).
4. Si hay coincidencias: se arma el digest y se envía. `ultima_notificacion_en` se actualiza a
   `now()` **solo si el envío de Resend fue exitoso**, para no perder coincidencias ante un fallo
   transitorio del proveedor.
5. Un comprador con varias búsquedas guardadas que coincidan el mismo día con la misma propiedad
   recibe **un correo por cada búsqueda** (no se deduplica ni se consolida).

---

## 5. Envío y Plantilla

- `src/lib/notificaciones/resend.ts`: cliente delgado sobre el SDK de Resend. Variable de entorno
  nueva `RESEND_API_KEY`, documentada en `.env.local.example` y en el README.
- Plantilla de correo en HTML simple + versión texto plano (sin `@react-email` ni otra
  dependencia de plantillas — un solo tipo de correo no justifica esa infraestructura). Contenido:
  nombre de la búsqueda, lista de propiedades nuevas (foto, título, precio formateado, barrio,
  enlace a la ficha pública), y pie con el enlace de baja.
- Todo texto interpolado en el HTML (títulos de propiedad, nombre de la búsqueda) se trata como
  **contenido no confiable** y se escapa antes de insertarse — misma disciplina que ya aplica el
  proyecto a las descripciones generadas por IA (heredada de SP0/SP6).
- Nueva ruta pública `src/app/notificaciones/baja/route.ts`:
  - `GET` con `?token=<token_baja>`.
  - `UPDATE busquedas_guardadas SET notificaciones_activas = false WHERE token_baja = $1`
    (cliente admin, sin requerir sesión).
  - Idempotente: repetir la baja no produce error, solo confirma que ya estaba desactivada.
  - Redirige a una página de confirmación simple (`/notificaciones/baja/confirmado`), sin
    exponer qué búsqueda era ni datos del comprador.

---

## 6. Endpoint de Cron

`src/app/api/cron/notificar-busquedas/route.ts`, mismo patrón que `procesar-leads`:

```ts
export async function GET(req: NextRequest) {
  // valida Authorization: Bearer <CRON_SECRET>, igual que procesar-leads
  const resultado = await procesarNotificacionesBusquedas() // orquesta matching + envío
  return NextResponse.json({ ok: true, ...resultado })
}
```

Entrada nueva en `vercel.json`:

```json
{ "path": "/api/cron/notificar-busquedas", "schedule": "0 8 * * *" }
```

(8:00 UTC, distinto del cron de leads de SP6 a las 6:00 UTC, para no competir por recursos en el
plan Hobby de Vercel.)

---

## 7. Manejo de Errores

- Fallo de Resend en un envío puntual: se registra en log de servidor, no se actualiza
  `ultima_notificacion_en` para esa búsqueda, y se continúa con las demás búsquedas del batch
  (un fallo no debe bloquear el resto del digest diario).
- Búsqueda con `filtros.barrio` que ya no resuelve a un barrio existente (barrio eliminado o
  slug cambiado): se omite silenciosamente esa búsqueda, sin marcarla como error — no hay
  columna de estado de error en el modelo mínimo elegido.
- `RESEND_API_KEY` ausente en el entorno: el cron responde `500` inmediatamente sin intentar
  procesar nada, igual que otras variables de entorno obligatorias del proyecto (ver
  `urlPublica()` en `src/lib/catalogo/seo.ts` como precedente).

---

## 8. Testing

- **Unitario** (`tests/unit/notificaciones-busquedas.test.ts`): lógica de matching de filtros
  contra fixtures de propiedades (con/sin coincidencia, filtros parciales, ventana de
  `ultima_notificacion_en`), y que el HTML del correo escapa correctamente títulos con caracteres
  especiales.
- **RLS** (`tests/rls/notificaciones-busquedas.test.ts`): el token de baja permite desactivar
  `notificaciones_activas` sin sesión autenticada (ruta pública), pero no permite leer ni mutar
  ningún otro campo de la búsqueda; un token inválido o de otra búsqueda no tiene efecto.
- **E2E**: no se cubre el envío real de correo (dependencia externa de Resend); se verifica con
  un mock/stub del cliente de Resend en pruebas unitarias del endpoint de cron, confirmando que
  se llama con los destinatarios y el contenido esperados.
- **Verificación de cierre**: `npm run lint`, `npm run test:unit`, `npm run test:rls`,
  `npm run build`, `npm run verificar:render` en verde.

---

## 9. Criterios de Aceptación

| # | Criterio | Verificación |
|---|---|---|
| AC1 | Una búsqueda guardada con `notificaciones_activas = true` recibe un correo cuando se publica una propiedad nueva que cumple sus filtros. | Test unitario del matching + mock de envío. |
| AC2 | Una búsqueda sin coincidencias nuevas no genera ningún envío ni actualiza `ultima_notificacion_en`. | Test unitario. |
| AC3 | El enlace de baja del correo desactiva `notificaciones_activas` sin requerir sesión, y es idempotente. | Test RLS. |
| AC4 | Un token de baja inválido o ajeno no tiene ningún efecto. | Test RLS (falsificación). |
| AC5 | Un fallo de Resend en una búsqueda no bloquea el procesamiento de las demás búsquedas del batch. | Test unitario con mock que falla selectivamente. |
| AC6 | Cero regresiones: todas las suites existentes siguen en verde. | `npm run lint/test:unit/test:rls/build/verificar:render`. |
