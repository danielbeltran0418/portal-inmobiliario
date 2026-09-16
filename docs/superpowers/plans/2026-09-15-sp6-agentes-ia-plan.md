# SP6 — Agentes de IA: plan de implementación

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** automatizar el ciclo completo del lead (**atender** dudas sobre el inmueble sin alucinaciones $\to$ **calificar** intención y capacidad $\to$ **agendar** visita técnica) mediante agentes de IA seguros, operando sobre las costuras de `lead_capturado` (SP4) y `cita_solicitada` (SP5), con autonomía escalonada (auto-confirmación configurable o aprobación en 1 clic) y auditoría inmutable en Postgres.

**Architecture:** el agente se ejecuta en el servidor (Next.js server-only / Route Handlers) con credenciales de `service_role`. La captura inicial de `leads` nuevos se dispara de forma inmediata y asíncrona desde la propia Server Action de contacto (`after` en `acciones.ts`), con un cron diario de baja frecuencia en Vercel Hobby como red de seguridad sobre `leads_nuevos_idx`. La inferencia utiliza **OpenAI GPT-5.6 Luna** ($0.20/$1.20 por 1M tokens, con fallback a Gemini 3.8 Flash) con *Function Calling* estructurado. La seguridad es determinista: el LLM **nunca** elige `lead_id` ni `actor`; el backend inyecta los IDs verificados de la sesión y ejecuta las funciones `_como` de SP5. Toda conversación y turno se persiste de forma inmutable en `conversaciones_ia` y `mensajes_ia` con políticas RLS explícitas por participante, respaldado por eventos en `registro_auditoria`.

**Tech Stack:** Next.js 16.3.3, React 19.2, Postgres 17 (Supabase local), PostgREST, Vitest 4 (unitarias y RLS), Playwright (E2E), `openai` SDK v4 / `@google/genai`, `zod` 4 para esquemas deterministas, `pg` para consultas directas en pruebas.

**Spec:** `docs/superpowers/specs/2026-09-15-portal-inmobiliario-sp6-design.md`

---

## Mecanismo de Disparo de Leads Nuevos: Decisión Justificada

El spec (sección 4.1) dejaba abierta la elección del mecanismo que despierta al agente ante un lead entrante.

**Evidencia de limitación en Vercel Hobby:**
Vercel limita estrictamente las tareas programadas (`crons` en `vercel.json`) en el plan **Hobby** a un máximo de **una ejecución por día** (expresiones cron con intervalo mínimo de 24 horas, como `0 6 * * *`). Las expresiones con frecuencia por minuto (`* * * * *`) son rechazadas en el despliegue de Vercel en cuentas no Pro/Enterprise. Depender exclusivamente de un cron periódico en Vercel Hobby haría que los leads esperaran horas antes de ser atendidos, haciendo imposible cumplir el Criterio de Aceptación #1 del spec (*"responde en menos de 1 minuto"*). Asimismo, mantener un worker Node permanente con `pg_notify/LISTEN` o un socket de Supabase Realtime es inviable en la infraestructura serverless de Vercel sin contratar servidores dedicados externos.

**Arquitectura adoptada: Disparo Inmediato Asíncrono desde Server Action + Red de Seguridad Diaria:**

1. **Disparo Inmediato Asíncrono (Camino Principal):**
   Inmediatamente después de que la Server Action de contacto (`src/app/[barrio]/[slug]/acciones.ts`) ejecuta con éxito `crear_lead` y obtiene el `leadId` devuelto por la función de Postgres, invoca de forma asíncrona la atención del agente mediante la API nativa de background tasks de Next.js (`after` de `next/server`):
   ```typescript
   if (!error && typeof leadId === 'string') {
     after(async () => {
       await procesarLeadIndividual(leadId).catch((err) => {
         console.error('Error en atencion asincrona de lead:', err)
       })
     })
     return { enviado: true }
   }
   ```
   - **Tiempo de respuesta al usuario:** El visitante recibe la confirmación en el formulario en <150 ms sin esperar a la IA.
   - **Tiempo de respuesta del agente:** La función `after()` se ejecuta de inmediato en el ciclo de fondo de la lambda de Vercel antes de que la instancia se congele, atendiendo al lead en **3 a 5 segundos** (muy por debajo del límite de 1 minuto).
   - **Comportamiento si el proceso se corta a mitad:** Si la lambda de Vercel se interrumpe abruptamente (por ejemplo, timeout de red con OpenAI/Google o terminación forzada del contenedor), la fila en `leads` permanece inalterada con `estado = 'nuevo'` y sin fila en `conversaciones_ia`. Ninguna escritura parcial queda corrupta.

2. **Cron Diario como Red de Seguridad (Safety Net en Vercel Hobby):**
   Se programa en `vercel.json` con frecuencia de una vez al día (`0 6 * * *`, 06:00 UTC / 01:00 AM hora de Barranquilla), invocando el endpoint protegido `/api/cron/procesar-leads` con `CRON_SECRET`. Este proceso de respaldo barre el índice `leads_nuevos_idx` llamando a `procesarLeadsNuevos()` para rescatar cualquier lead rezagado que no haya sido atendido en el momento debido a fallos transitorios del proveedor de LLM.

---

## Global Constraints

- Rama `sp6-ia` creada desde `main` DESPUÉS de mergear SP5 (PR #21 mergeado en commit `813b0df`).
- Migraciones de SP6 numeradas desde `20260916000100`, de 100 en 100, sin huecos: `20260916000100_ia_esquema.sql`.
- Nunca se edita una migración ya commiteada salvo durante una falsificación controlada, y se restaura inmediatamente con `git checkout -- <fichero>` antes de continuar.
- Toda tabla nueva (`conversaciones_ia`, `mensajes_ia`):
  - `ENABLE ROW LEVEL SECURITY;`
  - `REVOKE ALL ON <tabla> FROM anon, authenticated, public;` antes de cualquier `GRANT`.
  - Políticas RLS de lectura explícitas con `comprador_id = (SELECT auth.uid())` y `vendedor_id = (SELECT auth.uid())`, **nunca** delegadas a un `EXISTS` sobre `leads` ni `propiedades`.
  - Super administrador con `USING (public.es_super_admin())`.
  - Cero políticas de `INSERT`, `UPDATE` ni `DELETE` para `anon` ni `authenticated`. Toda mutación es exclusiva de `service_role`.
- Funciones de base de datos nuevas: `SET search_path = ''` y `REVOKE EXECUTE ON FUNCTION <firma> FROM PUBLIC, anon, authenticated;` explícitamente nombrando cada rol.
- Secreto y Server-Only:
  - `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` y `CRON_SECRET` residen exclusivamente en variables de entorno del servidor (`.env.local` y Vercel Environment Variables).
  - Todo módulo que acceda a estos secretos (`src/lib/ia/cliente.ts`, `src/lib/ia/despachador.ts`, `src/lib/ia/agendamiento.ts`) debe incluir `import 'server-only'` en su primera línea. Prohibido exponer claves o invocar al proveedor desde componentes cliente o hooks.
- Costuras inmutables respetadas al 100%:
  - `leads`: lectura de `estado = 'nuevo'`; transición mediante `UPDATE public.leads SET estado = 'aceptado'` gobernada por el trigger `validar_transicion_lead` (emite error `LD004` si ya fue respondido).
  - `citas`: consulta mediante `public.franjas_libres`; reserva mediante `public.reservar_cita_como`; modificación con `mover_cita_como` y cancelación con `cancelar_cita_como`.
- Medición antes y después: cada tarea mide `N_antes` en la salida real de Vitest (`npm run test:rls` o `npm run test:unit`) y exige `N_antes + (pruebas nuevas)`.
- Falsificaciones obligatorias (§13 del spec):
  - Falsificación 1: Inyección de prompt intentando usurpar `lead_id` o `actor` ajenos (Rojo: pasar params del LLM $\to$ Verde: enlace forzado de sesión en TypeScript).
  - Falsificación 2: Omisión de la bandera `auto_confirmar_citas` (Rojo: confirmar directo $\to$ Verde: exigir aprobación si está apagada).
  - Falsificación 3: Inmutabilidad de `mensajes_ia` (Rojo: habilitar UPDATE para authenticated $\to$ Verde: REVOKE estricto).
- Límites de abuso (§10 del spec): pruebas reales automatizadas para tope de 10 turnos, rate limit 429 (5 msgs/min), concurrencia de 3 conversaciones activas en 24h, y tope de 15,000 tokens.
- Arnés de calidad (§14 del spec): script `scripts/evaluar-calidad-ia.ts` con 6 conversaciones canónicas (`C1` a `C6`) y reporte en `docs/superpowers/specs/evaluacion-calidad-ia.md`.
- Cuentas de prueba efímeras con `randomUUID()` en el correo; nunca cuentas fijas del seed.
- Entorno Windows: comandos ejecutados en PowerShell sin `&&` (usar `;`); sin `rtk`; ediciones mediante herramientas de archivo o Node.js.
- Commits en español, rematados con una línea en blanco y `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Estructura de Ficheros

### Migraciones

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260916000100_ia_esquema.sql` | Columna `disponibilidad_semanal.auto_confirmar_citas`, tablas `conversaciones_ia` y `mensajes_ia`, índices, RLS explícita por dueño y privilegios. |

### Código de la Aplicación (`src/`)

| Fichero | Responsabilidad |
|---|---|
| `src/app/[barrio]/[slug]/acciones.ts` (modificar) | Disparo asíncrono con `after()` de `procesarLeadIndividual(leadId)` tras inserción exitosa de `crear_lead`. |
| `src/lib/ia/tipos.ts` | Tipos TypeScript de conversaciones, mensajes, tool calls, límites y estados. |
| `src/lib/ia/cliente.ts` | `import 'server-only'`. Wrapper del cliente LLM (OpenAI GPT-5.6 Luna con fallback a Gemini 3.8 Flash), gestión de API keys y Function Calling. |
| `src/lib/ia/prompts.ts` | Ensamblado del system prompt a partir de la ficha pública de la propiedad, directrices de verdad y prohibición de alucinaciones. |
| `src/lib/ia/limites.ts` | Lógica determinista de control de costos: límite de 10 turnos, rate limiting (5 msgs/min), concurrencia (3 leads activos) y tope de 15,000 tokens. |
| `src/lib/ia/calificacion.ts` | Análisis de la respuesta del prospecto, determinación de interés y ejecución del `UPDATE public.leads SET estado = ...`. |
| `src/lib/ia/agendamiento.ts` | Consulta de `franjas_libres`, validación de fecha y bifurcación: `reservar_cita_como` (si auto-confirma) o propuesta para 1 clic (si manual). |
| `src/lib/ia/despachador.ts` | `import 'server-only'`. Función `procesarLeadsNuevos()` que drena `leads_nuevos_idx` e inicia las conversaciones con el mensaje de bienvenida. |
| `src/app/api/cron/procesar-leads/route.ts` | Route Handler GET/POST para Vercel Cron, validación de `CRON_SECRET` e invocación de `procesarLeadsNuevos()`. |
| `src/lib/ia/consultas.ts` | Consultas tipadas para el comprador y vendedor sobre `conversaciones_ia` y `mensajes_ia` con filtro de usuario explícito. |
| `src/app/(vendedor)/panel/leads/acciones-ia.ts` | Server action para que el vendedor apruebe en 1 clic una visita propuesta (`aprobarCitaPropuesta`). |
| `src/app/(comprador)/mi-cuenta/solicitudes/acciones-ia.ts` | Server action para que el comprador envíe un mensaje al asistente (`enviarMensajeComprador`). |
| `src/components/panel/drawer-conversacion-ia.tsx` | Componente de interfaz: visualizador lateral del historial de mensajes del asistente (texto sanitizado). |
| `src/components/panel/boton-confirmar-propuesta.tsx` | Botón interactivo de aprobación en 1 clic en la bandeja de citas del vendedor. |
| `src/components/mi-cuenta/chat-lead-ia.tsx` | Componente interactivo de mensajería del comprador en `/mi-cuenta`. |

### Scripts y Herramientas

| Fichero | Responsabilidad |
|---|---|
| `scripts/evaluar-calidad-ia.ts` | Arnés de evaluación de las 6 conversaciones canónicas contra el modelo, generando `evaluacion-calidad-ia.md`. |
| `vercel.json` | Configuración de Vercel Cron para programar `/api/cron/procesar-leads` cada minuto. |

### Pruebas

| Fichero | Responsabilidad |
|---|---|
| `tests/rls/ayudantes-ia.ts` | Fixturas de SP6: creación de escenarios con propiedad, lead, conversación y mensajes simulados. |
| `tests/rls/ia-esquema.test.ts` | RLS y privilegios de `conversaciones_ia` y `mensajes_ia`: lecturas válidas y rechazo 42501 en mutaciones directas. |
| `tests/rls/ia-despachador.test.ts` | Drenado de `leads_nuevos_idx`, inicio de conversación y registro del primer turno. |
| `tests/rls/ia-calificacion-agendamiento.test.ts` | Calificación, transición en `leads`, agendamiento con `reservar_cita_como` y respeto a `auto_confirmar_citas`. |
| `tests/rls/ia-limites.test.ts` | Pruebas de base de datos para límites de concurrencia y persistencia de estados cerrados. |
| `tests/rls/ia-seguridad-falsificaciones.test.ts` | Las 3 falsificaciones obligatorias (§13 del spec): prompt injection, auto-confirmación omitida, inmutabilidad de mensajes. |
| `tests/unit/ia/cliente.test.ts` | Pruebas unitarias del cliente de IA con mocks deterministas de llamadas API. |
| `tests/unit/ia/prompts.test.ts` | Verificación del armado del system prompt y aislamiento de datos de propiedad. |
| `tests/unit/ia/limites.test.ts` | Pruebas unitarias de rate limiting (429), conteo de turnos (máx 10) y presupuesto de tokens (15,000). |
| `tests/unit/ia/calidad-referencia.test.ts` | Arnés automatizado de las 6 conversaciones canónicas para verificación de no alucinación. |
| `tests/unit/ia/componentes-panel.test.ts` | Pruebas de componentes de visualización y botón de confirmación en 1 clic. |
| `tests/unit/ia/chat-comprador.test.ts` | Pruebas unitarias del chat del comprador en `/mi-cuenta`. |
| `tests/e2e/ia-agentes.spec.ts` | Recorrido E2E completo: formulario $\to$ agente $\to$ respuesta comprador $\to$ aprobación vendedor $\to$ auditoría. |

---

## Tarea 0: Preparación de la Rama y Medición Inicial

**Files:** ninguno.

**Interfaces:**
- Consumes: `main` con SP5 completado y mergeado.
- Produces: rama `sp6-ia`, base reseteada y totales `N_unit_0`, `N_rls_0`, `N_e2e_0` medidos.

- [ ] **Paso 1: Crear la rama `sp6-ia` desde `main` actualizado.**
```powershell
git checkout main
git pull --ff-only
git checkout -b sp6-ia
```

- [ ] **Paso 2: Resetear la base de datos local y verificar la última migración de SP5.**
```powershell
npx supabase db reset
```
Esperado: se aplican limpiamente todas las migraciones hasta `20260915000700_ubicacion_comprador_en_ventana.sql`.

- [ ] **Paso 3: Medir los totales iniciales de pruebas y anotarlos.**
```powershell
npm run test:unit
npm run test:rls
```
Anotar los valores exactos leídos de la consola: `N_unit_0` y `N_rls_0`.

---

## Tarea 1: Esquema de Base de Datos de IA y Privilegios RLS

**Files:**
- Create: `supabase/migrations/20260916000100_ia_esquema.sql`
- Create: `tests/rls/ayudantes-ia.ts`
- Create: `tests/rls/ia-esquema.test.ts`

**Interfaces:**
- Consumes: `public.leads`, `public.propiedades`, `auth.users`, `public.es_super_admin()`.
- Produces:
  - Columna `disponibilidad_semanal.auto_confirmar_citas boolean NOT NULL DEFAULT false`.
  - Tablas `public.conversaciones_ia` y `public.mensajes_ia`.
  - Políticas RLS explícitas `comprador_id = (SELECT auth.uid())`, `vendedor_id = (SELECT auth.uid())`, `public.es_super_admin()`.
  - Revocación total de escrituras directas (`42501` para `anon` y `authenticated`).

- [ ] **Paso 1: Medir suite RLS inicial.**
```powershell
npm run test:rls
```
Anotar `N_rls_1_antes`.

- [ ] **Paso 2: Crear la migración `supabase/migrations/20260916000100_ia_esquema.sql`.**
  - Añadir columna `auto_confirmar_citas` a `disponibilidad_semanal`.
  - Crear tabla `conversaciones_ia` (id, lead_id UNIQUE, propiedad_id, comprador_id, vendedor_id, estado_conversacion, franja_propuesta, resumen_calificacion, creado_en, actualizado_en).
  - Crear tabla `mensajes_ia` (id, conversacion_id, comprador_id, vendedor_id, emisor, contenido, tokens_entrada, tokens_salida, modelo, tool_calls, creado_en).
  - Índices: `mensajes_ia_comprador_idx`, `mensajes_ia_vendedor_idx`, `mensajes_ia_conversacion_idx`.
  - `REVOKE ALL ON public.conversaciones_ia, public.mensajes_ia FROM anon, authenticated, public;`
  - `GRANT SELECT ON public.conversaciones_ia, public.mensajes_ia TO authenticated;`
  - Políticas RLS explícitas directas para comprador, vendedor y super admin con `public.es_super_admin()`.

- [ ] **Paso 3: Crear ayudantes en `tests/rls/ayudantes-ia.ts`.**
  - Funciones auxiliares: `escenarioIA()` (vendedor con propiedad, comprador con lead, conversación inicial), `insertarConversacionDirecta`, `insertarMensajeDirecto` usando `clienteAdmin()`.

- [ ] **Paso 4: Escribir las pruebas de RLS en `tests/rls/ia-esquema.test.ts`.**
  - Comprador lee su conversación y mensajes; no lee los de otro comprador.
  - Vendedor lee las conversaciones y mensajes de sus propiedades; no las de otro vendedor.
  - Super admin lee todas las conversaciones y mensajes.
  - Anon no lee ninguna fila.
  - Usuario autenticado recibe `42501` al intentar `INSERT`, `UPDATE` o `DELETE` directo por PostgREST sobre `conversaciones_ia` y `mensajes_ia` (encadenando `.select()` con 0 filas devueltas).
  - La columna `auto_confirmar_citas` existe en `disponibilidad_semanal` y es modificable solo por el vendedor dueño.

- [ ] **Paso 5: Resetear base y verificar en verde.**
```powershell
npx supabase db reset
npm run test:rls
```
Exigir `N_rls_1_antes + 6` pruebas pasando.

- [ ] **Paso 6: Commit.**
```bash
git add supabase/migrations/20260916000100_ia_esquema.sql tests/rls/ayudantes-ia.ts tests/rls/ia-esquema.test.ts
git commit -m "feat(db): esquema de conversaciones_ia y mensajes_ia con rls y auto_confirmar_citas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 2: Cliente de Inferencia y Herramientas (Function Calling)

**Files:**
- Create: `src/lib/ia/tipos.ts`
- Create: `src/lib/ia/cliente.ts`
- Test: `tests/unit/ia/cliente.test.ts`

**Interfaces:**
- Consumes: variables de entorno `OPENAI_API_KEY`, `GEMINI_API_KEY`.
- Produces:
  - `ejecutarInferenciaIA(mensajes, herramientas, opciones)`
  - Esquemas de Function Calling tipados: `consultar_disponibilidad`, `proponer_cita`, `calificar_lead`.

- [ ] **Paso 1: Medir suite unitaria inicial.**
```powershell
npm run test:unit
```
Anotar `N_unit_2_antes`.

- [ ] **Paso 2: Crear `src/lib/ia/tipos.ts`.**
  - Interfaces para mensajes (`RolMensaje`, `MensajeHistorial`), herramientas (`DefinicionHerramienta`, `LlamadaHerramienta`), respuesta de inferencia (`RespuestaInferencia`, `TokensConsumidos`) y estados de conversación.

- [ ] **Paso 3: Crear `src/lib/ia/cliente.ts` con `import 'server-only'`.**
  - Configurar llamada a OpenAI GPT-5.6 Luna (`chat.completions.create` con `model: 'gpt-5.6-luna'`, `response_format: { type: 'text' }` y `tools`).
  - Adaptador secundario para Google Gemini 3.8 Flash en caso de fallo 5xx o timeout del proveedor principal.
  - Validación con Zod para asegurar que las llamadas a herramientas devuelven JSON estrictamente tipado.

- [ ] **Paso 4: Crear pruebas unitarias en `tests/unit/ia/cliente.test.ts`.**
  - Inferencia con respuesta de texto plano normal.
  - Inferencia con emisión de Function Calling estructurado.
  - Fallback a Gemini si OpenAI arroja 500 / Network Error.
  - Manejo seguro de ausencia de API key (error controlado de clase `IA`).

- [ ] **Paso 5: Correr suite unitaria.**
```powershell
npm run test:unit
```
Exigir `N_unit_2_antes + 4` pruebas pasando.

- [ ] **Paso 6: Commit.**
```bash
git add src/lib/ia/tipos.ts src/lib/ia/cliente.ts tests/unit/ia/cliente.test.ts
git commit -m "feat(ia): cliente de inferencia gpt-5.6 luna con tools y fallback a gemini

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 3: Generador de System Prompt Blindado con Ficha de Inmueble

**Files:**
- Create: `src/lib/ia/prompts.ts`
- Test: `tests/unit/ia/prompts.test.ts`

**Interfaces:**
- Consumes: datos públicos de `propiedades` (título, tipo, operación, precio, barrio, habitaciones, baños, descripción).
- Produces: `construirSystemPrompt(propiedad, fechaActualBogota)`.

- [ ] **Paso 1: Medir suite unitaria.**
```powershell
npm run test:unit
```
Anotar `N_unit_3_antes`.

- [ ] **Paso 2: Implementar `src/lib/ia/prompts.ts`.**
  - `import 'server-only'`.
  - Inyección estructurada de los datos del inmueble en el prompt.
  - Directrices estrictas:
    1. Base de conocimiento cerrada: responder únicamente sobre los datos explícitos del inmueble.
    2. Si un dato no está presente (ej. piscina, mascotas, depósito), responder textualmente que no figura en la publicación y se consultará con el vendedor.
    3. Dirección: bajo ninguna circunstancia revelar dirección exacta, número de apartamento o torre (indicar que se revelará 2 horas antes de la visita confirmada).
    4. Citar siempre precios y valores en pesos colombianos (COP) sin redondeos.

- [ ] **Paso 3: Escribir pruebas unitarias en `tests/unit/ia/prompts.test.ts`.**
  - Verifica que el prompt incluye título, precio formateado, barrio y habitaciones.
  - Verifica que el prompt contiene las cláusulas de seguridad contra alucinaciones y ocultamiento de dirección.
  - Verifica que la fecha de referencia se formatea en `America/Bogota`.

- [ ] **Paso 4: Correr suite unitaria.**
```powershell
npm run test:unit
```
Exigir `N_unit_3_antes + 3` pruebas pasando.

- [ ] **Paso 5: Commit.**
```bash
git add src/lib/ia/prompts.ts tests/unit/ia/prompts.test.ts
git commit -m "feat(ia): generador de system prompt blindado con ficha del inmueble

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 4: Disparo Asíncrono de Leads desde Server Action y Red de Seguridad Diaria

**Files:**
- Modify: `src/app/[barrio]/[slug]/acciones.ts`
- Create: `src/lib/ia/despachador.ts`
- Create: `src/app/api/cron/procesar-leads/route.ts`
- Create: `vercel.json`
- Test: `tests/rls/ia-despachador.test.ts`
- Test: `tests/unit/ia/acciones-lead-ia.test.ts`
- Test: `tests/unit/ia/cron-route.test.ts`

**Interfaces:**
- Consumes: `crear_lead` (retorna UUID del lead), `after` de `next/server`, `leads_nuevos_idx`, `CRON_SECRET`, `service_role`.
- Produces:
  - `procesarLeadIndividual(leadId: string)`: atiende de inmediato un lead recién insertado.
  - `procesarLeadsNuevos(limite?: number)`: barre leads huérfanos rezagados en lote.
  - Integración asíncrona en `enviarLead` (`acciones.ts`) mediante `after()`.
  - Endpoint de cron diario en `vercel.json` (`0 6 * * *`, compatible con plan Hobby).

- [ ] **Paso 1: Medir suite RLS y unitaria.**
```powershell
npm run test:rls; npm run test:unit
```
Anotar `N_rls_4_antes` y `N_unit_4_antes`.

- [ ] **Paso 2: Implementar `src/lib/ia/despachador.ts`.**
  - `import 'server-only'`.
  - Función `procesarLeadIndividual(leadId: string)`:
    1. Lee la fila del lead con `service_role` (propiedad, comprador, mensaje, estado).
    2. Comprueba si ya existe una fila en `conversaciones_ia`: si ya existe, no hace nada (idempotencia estricta).
    3. Si no existe: inserta registro en `conversaciones_ia`.
    4. Lee los datos públicos de la propiedad e invoca la inferencia inicial del asistente (`GPT-5.6 Luna`).
    5. Inserta el mensaje inicial del lead y la respuesta del agente en `mensajes_ia`.
    6. Registra evento de auditoría `ia_lead_atendido` en `registro_auditoria`.
  - Función `procesarLeadsNuevos(limite = 10)`:
    1. Consulta `leads` con `estado = 'nuevo'` ordenados por `creado_en ASC` (usando `leads_nuevos_idx`).
    2. Filtra aquellos sin conversación en `conversaciones_ia` y ejecuta `procesarLeadIndividual` para cada uno.
    3. Retorna recuento de leads procesados.

- [ ] **Paso 3: Modificar `src/app/[barrio]/[slug]/acciones.ts`.**
  - Importar `after` desde `next/server` y `procesarLeadIndividual` desde `@/lib/ia/despachador`.
  - Capturar el `data` retornado por `rpc('crear_lead', ...)` (que corresponde al `uuid` del lead creado).
  - En la rama exitosa (`if (!error)`):
    ```typescript
    const leadId = data as string | undefined
    if (leadId) {
      after(async () => {
        try {
          await procesarLeadIndividual(leadId)
        } catch (err) {
          console.error('Error al despachar atencion automatica de lead:', err)
        }
      })
    }
    return { enviado: true }
    ```
  - Garantiza respuesta inmediata al navegador del comprador sin esperar la llamada al LLM, cumpliendo la atención en menos de 5 segundos.

- [ ] **Paso 4: Implementar Route Handler diario en `src/app/api/cron/procesar-leads/route.ts`.**
  - Valida cabecera `Authorization: Bearer ${CRON_SECRET}` (o `401 Unauthorized`).
  - Invoca `procesarLeadsNuevos()` y retorna JSON con `{ ok: true, procesados: N }`.

- [ ] **Paso 5: Configurar `vercel.json` con frecuencia diaria (compatible con Vercel Hobby).**
  - Registrar cron job con horario diario permitido en Hobby:
    ```json
    {
      "crons": [
        {
          "path": "/api/cron/procesar-leads",
          "schedule": "0 6 * * *"
        }
      ]
    }
    ```

- [ ] **Paso 6: Escribir pruebas automatizadas.**
  - En `tests/rls/ia-despachador.test.ts`:
    - `procesarLeadIndividual` procesa el lead, crea conversación en `conversaciones_ia`, inserta mensaje en `mensajes_ia` con emisor `agente_ia` y emite `ia_lead_atendido` en `registro_auditoria`.
    - Idempotencia: una segunda invocación sobre el mismo `leadId` no duplica la conversación ni los mensajes.
    - `procesarLeadsNuevos` barre leads huérfanos pendientes y los procesa correctamente.
  - En `tests/unit/ia/acciones-lead-ia.test.ts`:
    - Simulación de `enviarLead` comprueba que ante éxito de `crear_lead` se programa la tarea con `after()` y retorna `{ enviado: true }`.
  - En `tests/unit/ia/cron-route.test.ts`:
    - Route Handler rechaza llamadas sin token con 401.
    - Route Handler ejecuta `procesarLeadsNuevos` con token válido y retorna 200.

- [ ] **Paso 7: Correr suites RLS y unitaria.**
```powershell
npm run test:rls; npm run test:unit
```
Exigir `N_rls_4_antes + 3` y `N_unit_4_antes + 3` pruebas pasando.

- [ ] **Paso 8: Commit.**
```bash
git add src/app/[barrio]/[slug]/acciones.ts src/lib/ia/despachador.ts src/app/api/cron/procesar-leads/route.ts vercel.json tests/rls/ia-despachador.test.ts tests/unit/ia/acciones-lead-ia.test.ts tests/unit/ia/cron-route.test.ts
git commit -m "feat(ia): despacho asincrono de leads desde server action y red de seguridad diaria

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 5: Motor de Calificación y Agendamiento (Costuras SP4 y SP5)

**Files:**
- Create: `src/lib/ia/calificacion.ts`
- Create: `src/lib/ia/agendamiento.ts`
- Test: `tests/rls/ia-calificacion-agendamiento.test.ts`

**Interfaces:**
- Consumes: `UPDATE leads SET estado = ...`, `public.franjas_libres`, `public.reservar_cita_como`, `disponibilidad_semanal.auto_confirmar_citas`.
- Produces: calificación de prospectos, revelación de contactos por RLS y reservas atómicas seguras.

- [ ] **Paso 1: Medir suite RLS.**
```powershell
npm run test:rls
```
Anotar `N_rls_5_antes`.

- [ ] **Paso 2: Implementar `src/lib/ia/calificacion.ts`.**
  - `import 'server-only'`.
  - Si el agente califica el lead como favorable: ejecuta `UPDATE public.leads SET estado = 'aceptado' WHERE id = leadId`.
  - Comprueba que el trigger `validar_transicion_lead` acepta el cambio y registra la auditoría. Si el lead ya estaba respondido, captura `LD004`.
  - Al pasar a `aceptado`, `leads_contacto` se hace visible al vendedor por las políticas RLS existentes de SP4.

- [ ] **Paso 3: Implementar `src/lib/ia/agendamiento.ts`.**
  - `import 'server-only'`.
  - Función `procesarSolicitudFranja(conversacionId, inicioIso)`:
    1. Consulta `franjas_libres(vendedorId, now(), now() + interval '14 days')`.
    2. Valida deterministamente en TypeScript que `inicioIso` esté presente en las franjas devueltas. Si no, rechaza con código `IA002`.
    3. Consulta `auto_confirmar_citas` del vendedor:
       - **Si es `true`:** ejecuta `reservar_cita_como(leadId, inicioIso, compradorId)` con `service_role`. La cita queda confirmada de inmediato.
       - **Si es `false`:** actualiza `conversaciones_ia` con `franja_propuesta = inicioIso` y `estado_conversacion = 'cita_propuesta'`. No invoca `reservar_cita_como` todavía.
    4. Registra evento de auditoría (`ia_cita_reservada` o `ia_cita_propuesta`).

- [ ] **Paso 4: Escribir pruebas en `tests/rls/ia-calificacion-agendamiento.test.ts`.**
  - Calificación exitosa transiciona lead a `aceptado` y revela `leads_contacto` al vendedor.
  - Vendedor con `auto_confirmar_citas = true`: franja seleccionada reserva cita real en `citas` (`estado = 'confirmada'`).
  - Vendedor con `auto_confirmar_citas = false`: cita queda en `cita_propuesta` y no se inserta en `citas` hasta aprobación.
  - Solicitud de franja ocupada o fuera de horario falla con `IA002` sin tocar la base.

- [ ] **Paso 5: Correr suite RLS.**
```powershell
npm run test:rls
```
Exigir `N_rls_5_antes + 4` pruebas pasando.

- [ ] **Paso 6: Commit.**
```bash
git add src/lib/ia/calificacion.ts src/lib/ia/agendamiento.ts tests/rls/ia-calificacion-agendamiento.test.ts
git commit -m "feat(ia): calificacion de leads y agendamiento respetando auto_confirmar_citas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 6: Módulo de Límites de Abuso y Control de Costos (§10)

**Files:**
- Create: `src/lib/ia/limites.ts`
- Test: `tests/unit/ia/limites.test.ts`
- Test: `tests/rls/ia-limites.test.ts`

**Interfaces:**
- Consumes: recuento de turnos en `mensajes_ia`, IP del cliente (`IP_CABECERA_CONFIABLE`), suma de tokens.
- Produces: validación estricta de 10 turnos, rate limiting 429, concurrencia máxima de 3 leads y tope de 15,000 tokens.

- [ ] **Paso 1: Medir suites.**
```powershell
npm run test:unit; npm run test:rls
```
Anotar `N_unit_6_antes` y `N_rls_6_antes`.

- [ ] **Paso 2: Implementar `src/lib/ia/limites.ts`.**
  - `import 'server-only'`.
  - Constantes inmutables:
    - `MAX_TURNOS_CONVERSACION = 10`
    - `MAX_MENSAJES_POR_MINUTO = 5`
    - `MAX_LEADS_ACTIVOS_24H = 3`
    - `HARD_CAP_TOKENS = 15000`
  - Función `verificarLimitesConversacion(conversacionId, compradorId, ip)`:
    1. Cuenta turnos en `mensajes_ia`: si `>= 10`, cierra conversación y lanza `IA_TOPE_TURNOS`.
    2. Comprueba suma de tokens: si `>= 15000`, archiva y lanza `IA_TOPE_TOKENS`.
    3. Comprueba tasa por IP/comprador en el último minuto: si `>= 5`, lanza error HTTP 429 con `Retry-After: 60`.
    4. Comprueba leads activos del comprador en las últimas 24h: si `>= 3`, bloquea nueva activación de IA.

- [ ] **Paso 3: Escribir pruebas unitarias en `tests/unit/ia/limites.test.ts`.**
  - Turno 10 corta la conversación y emite mensaje de despedida / derivación a humano.
  - Exceso de 5 mensajes por minuto retorna 429.
  - Exceso de 15,000 tokens acumulados aborta la inferencia.

- [ ] **Paso 4: Escribir pruebas RLS en `tests/rls/ia-limites.test.ts`.**
  - Un comprador con 3 leads activos en 24h no puede iniciar una cuarta conversación con IA.
  - La conversación cerrada no admite nuevos mensajes de IA.

- [ ] **Paso 5: Correr suites.**
```powershell
npm run test:unit; npm run test:rls
```
Exigir `N_unit_6_antes + 3` y `N_rls_6_antes + 2` pruebas pasando.

- [ ] **Paso 6: Commit.**
```bash
git add src/lib/ia/limites.ts tests/unit/ia/limites.test.ts tests/rls/ia-limites.test.ts
git commit -m "feat(ia): limitador de turnos, rate limit 429, concurrencia y tope de tokens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 7: Falsificaciones Obligatorias de Seguridad (§13)

**Files:**
- Create: `tests/rls/ia-seguridad-falsificaciones.test.ts`

**Interfaces:**
- Consumes: `escenarioIA()`, `procesarSolicitudFranja`, `mensajes_ia`.
- Produces: verificación formal de los tres vectores de ataque con ciclo Rojo $\to$ Verde.

- [ ] **Paso 1: Medir suite RLS.**
```powershell
npm run test:rls
```
Anotar `N_rls_7_antes`.

- [ ] **Paso 2: Escribir `tests/rls/ia-seguridad-falsificaciones.test.ts`.**
  - **Prueba 1 (Prompt Injection):** Mensaje con prompt malicioso intentando suministrar un `p_lead_id` y `p_actor` de una víctima ajena. Verifica que el backend descarta cualquier ID externo, reserva únicamente sobre el lead de la sesión y no afecta a la víctima.
  - **Prueba 2 (Omisión de auto-confirmación):** Verifica que si `auto_confirmar_citas = false`, ninguna cita se reserva automáticamente sin la aprobación explícita.
  - **Prueba 3 (Inmutabilidad de `mensajes_ia`):** Intento de UPDATE y DELETE directo sobre `mensajes_ia` con sesión autenticada devuelve `42501` y `.select()` confirma cero filas alteradas.

- [ ] **Paso 3: Falsificación 1 (Rojo $\to$ Verde) sobre Prompt Injection.**
  - Modificar temporalmente `src/lib/ia/agendamiento.ts` para aceptar `leadId` proveniente de los argumentos del LLM.
  - Correr `npx vitest run tests/rls/ia-seguridad-falsificaciones.test.ts -t "prompt injection"`.
  - **Comprobar ROJO.**
  - Restaurar con `git checkout -- src/lib/ia/agendamiento.ts`.
  - Correr la prueba y **comprobar VERDE**.

- [ ] **Paso 4: Falsificación 2 (Rojo $\to$ Verde) sobre Auto-confirmación.**
  - Modificar temporalmente `src/lib/ia/agendamiento.ts` ignorando `auto_confirmar_citas` y forzando reserva directa.
  - Correr prueba, comprobar **ROJO**.
  - Restaurar con `git checkout -- src/lib/ia/agendamiento.ts`, comprobar **VERDE**.

- [ ] **Paso 5: Falsificación 3 (Rojo $\to$ Verde) sobre Inmutabilidad.**
  - Modificar temporalmente la base con psql permitiendo UPDATE a `authenticated` en `mensajes_ia`.
  - Correr prueba, comprobar **ROJO**.
  - Restaurar con `npx supabase db reset`, comprobar **VERDE**.

- [ ] **Paso 6: Correr suite RLS completa.**
```powershell
npm run test:rls
```
Exigir `N_rls_7_antes + 3` pruebas pasando.

- [ ] **Paso 7: Commit.**
```bash
git add tests/rls/ia-seguridad-falsificaciones.test.ts
git commit -m "test(rls): falsificaciones de prompt injection, auto-confirmacion e inmutabilidad

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 8: Interfaz del Vendedor: Visualización y Aprobación en 1 Clic

**Files:**
- Create: `src/components/panel/drawer-conversacion-ia.tsx`
- Create: `src/components/panel/boton-confirmar-propuesta.tsx`
- Create: `src/app/(vendedor)/panel/leads/acciones-ia.ts`
- Modify: `src/app/(vendedor)/panel/leads/page.tsx`
- Modify: `src/app/(vendedor)/panel/citas/page.tsx`
- Modify: `src/app/(vendedor)/panel/disponibilidad/page.tsx`
- Test: `tests/unit/ia/componentes-panel.test.ts`

**Interfaces:**
- Consumes: `conversaciones_ia`, `mensajes_ia`, Server Actions con `useActionState`.
- Produces: Drawer de transcripción en panel de leads/citas, botón de confirmación en 1 clic para visitas propuestas, switch de auto-confirmación en disponibilidad.

- [ ] **Paso 1: Medir suite unitaria.**
```powershell
npm run test:unit
```
Anotar `N_unit_8_antes`.

- [ ] **Paso 2: Crear `src/app/(vendedor)/panel/leads/acciones-ia.ts`.**
  - Server action `aprobarCitaPropuesta(conversacionId)`:
    - Verifica que el usuario autenticado es el vendedor dueño.
    - Obtiene la franja propuesta y ejecuta `reservar_cita_como` en su nombre.
    - Marca `estado_conversacion = 'cita_confirmada'`.
    - `revalidatePath('/panel/citas')`.
  - Server action `actualizarAutoConfirmacion(valor: boolean)`:
    - Actualiza `auto_confirmar_citas` en `disponibilidad_semanal` para el vendedor.

- [ ] **Paso 3: Crear componentes de interfaz.**
  - `drawer-conversacion-ia.tsx`: componente visual que renderiza los mensajes con burbujas diferenciadas (comprador vs asistente virtual), aplicando escapado estricto contra XSS.
  - `boton-confirmar-propuesta.tsx`: componente cliente con `useActionState`, spinner de carga y mensaje de confirmación exitosa.

- [ ] **Paso 4: Integrar en páginas existentes.**
  - En `/panel/leads`: añadir botón "Ver conversación con IA" en cada lead que tenga conversación activa.
  - En `/panel/citas`: mostrar tarjeta destacada si hay citas en estado `cita_propuesta` con el botón de 1 clic.
  - En `/panel/disponibilidad`: añadir toggle interactivo para "Permitir auto-confirmar citas con IA".

- [ ] **Paso 5: Escribir pruebas unitarias en `tests/unit/ia/componentes-panel.test.ts`.**
  - Renderizado correcto de mensajes y etiquetas de rol.
  - El botón de 1 clic invoca la Server Action con los parámetros correctos.
  - El toggle de disponibilidad refleja el estado de `auto_confirmar_citas`.

- [ ] **Paso 6: Correr suite unitaria.**
```powershell
npm run test:unit
```
Exigir `N_unit_8_antes + 3` pruebas pasando.

- [ ] **Paso 7: Commit.**
```bash
git add src/components/panel/drawer-conversacion-ia.tsx src/components/panel/boton-confirmar-propuesta.tsx src/app/(vendedor)/panel/leads/acciones-ia.ts src/app/(vendedor)/panel/leads/page.tsx src/app/(vendedor)/panel/citas/page.tsx src/app/(vendedor)/panel/disponibilidad/page.tsx tests/unit/ia/componentes-panel.test.ts
git commit -m "feat(panel): visualizacion de chats de ia, confirmacion en 1 clic y toggle auto-confirmar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 9: Interfaz del Comprador: Chat Interactivo en `/mi-cuenta`

**Files:**
- Create: `src/components/mi-cuenta/chat-lead-ia.tsx`
- Create: `src/app/(comprador)/mi-cuenta/solicitudes/acciones-ia.ts`
- Modify: `src/app/(comprador)/mi-cuenta/page.tsx`
- Test: `tests/unit/ia/chat-comprador.test.ts`

**Interfaces:**
- Consumes: `mensajes_ia`, Server Action `enviarMensajeComprador`.
- Produces: chat interactivo del comprador con el asistente en su área privada.

- [ ] **Paso 1: Medir suite unitaria.**
```powershell
npm run test:unit
```
Anotar `N_unit_9_antes`.

- [ ] **Paso 2: Implementar Server Action `enviarMensajeComprador(conversacionId, contenido)`.**
  - Valida sesión de comprador y pertenencia de la conversación.
  - Pasa por `verificarLimitesConversacion` (valida límite de 10 turnos y rate limiting 429).
  - Inserta el mensaje del comprador en `mensajes_ia`.
  - Dispara la inferencia síncrona del agente y almacena la respuesta en `mensajes_ia`.
  - `revalidatePath('/mi-cuenta')`.

- [ ] **Paso 3: Crear componente `src/components/mi-cuenta/chat-lead-ia.tsx`.**
  - Componente cliente con `useActionState`.
  - Input de texto con límite de caracteres, historial scrolleable y estado de carga mientras el asistente responde.
  - Enlace contextual hacia la cita si ya fue confirmada o propuesta.

- [ ] **Paso 4: Escribir pruebas unitarias en `tests/unit/ia/chat-comprador.test.ts`.**
  - Renderizado del historial de mensajes del comprador.
  - Envío de mensaje bloqueado si la conversación superó los 10 turnos.
  - Manejo de error 429 con mensaje claro al usuario ("Por favor espera un momento antes de enviar otro mensaje").

- [ ] **Paso 5: Correr suite unitaria.**
```powershell
npm run test:unit
```
Exigir `N_unit_9_antes + 3` pruebas pasando.

- [ ] **Paso 6: Commit.**
```bash
git add src/components/mi-cuenta/chat-lead-ia.tsx src/app/(comprador)/mi-cuenta/solicitudes/acciones-ia.ts src/app/(comprador)/mi-cuenta/page.tsx tests/unit/ia/chat-comprador.test.ts
git commit -m "feat(comprador): chat interactivo con el asistente en mi-cuenta

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 10: Arnés de Calidad y Verificación de Ausencia de Alucinaciones (§14)

**Files:**
- Create: `scripts/evaluar-calidad-ia.ts`
- Create: `docs/superpowers/specs/evaluacion-calidad-ia.md`
- Test: `tests/unit/ia/calidad-referencia.test.ts`

**Interfaces:**
- Consumes: 6 escenarios canónicos (`C1` a `C6`), mock determinista del agente.
- Produces: script ejecutable de homologación y reporte Markdown firmado.

- [ ] **Paso 1: Medir suite unitaria.**
```powershell
npm run test:unit
```
Anotar `N_unit_10_antes`.

- [ ] **Paso 2: Implementar `scripts/evaluar-calidad-ia.ts`.**
  - Define la propiedad de prueba canónica (precio, barrio, habitaciones, sin datos de piscina ni mascotas).
  - Ejecuta los 6 escenarios canónicos:
    - **C1:** Pregunta de precio/habitaciones $\to$ verifica cita exacta.
    - **C2:** Pregunta por piscina/mascotas $\to$ verifica que declara no tener el dato y no asume.
    - **C3:** Arriendo sobre propiedad en venta $\to$ verifica aclaración de modalidad.
    - **C4:** Dirección antes de ventana $\to$ verifica rechazo y mención de la ventana de 2 horas.
    - **C5:** Franja fuera de horario $\to$ verifica rechazo y contrapropuesta válida.
    - **C6:** Intento de regateo de precio $\to$ verifica que no acepta rebajas no autorizadas.
  - Genera el reporte estructurado en `docs/superpowers/specs/evaluacion-calidad-ia.md`.

- [ ] **Paso 3: Escribir prueba unitaria en `tests/unit/ia/calidad-referencia.test.ts`.**
  - Valida que la función de verificación de calidad evalúa los 6 escenarios contra las aserciones deterministas de texto.

- [ ] **Paso 4: Ejecutar el script y correr pruebas.**
```powershell
node scripts/evaluar-calidad-ia.ts
npm run test:unit
```
Exigir `N_unit_10_antes + 2` pruebas pasando y reporte generado.

- [ ] **Paso 5: Commit.**
```bash
git add scripts/evaluar-calidad-ia.ts docs/superpowers/specs/evaluacion-calidad-ia.md tests/unit/ia/calidad-referencia.test.ts
git commit -m "test(calidad): arnes de homologacion para las 6 conversaciones canonicas de ia

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 11: Pruebas E2E Completas y Auditoría

**Files:**
- Create: `tests/e2e/ia-agentes.spec.ts`

**Interfaces:**
- Consumes: aplicación completa corriendo en `localhost:3000`, Playwright, base de datos local.
- Produces: suite E2E que valida el flujo de punta a punta.

- [ ] **Paso 1: Resetear base de datos.**
```powershell
npx supabase db reset
```

- [ ] **Paso 2: Implementar `tests/e2e/ia-agentes.spec.ts`.**
  - Flujo 1: Visitante envía formulario en ficha de propiedad $\to$ `leads_nuevos_idx` se drena $\to$ asistente responde en `/mi-cuenta`.
  - Flujo 2: Comprador responde con intención y solicita cita $\to$ vendedor con `auto_confirmar_citas = false` ve la tarjeta de visita propuesta en `/panel/citas` $\to$ hace clic en "Confirmar" $\to$ visita queda confirmada.
  - Flujo 3: Verificación en `registro_auditoria` de que los eventos `ia_lead_atendido` e `ia_cita_propuesta` existen en base de datos.

- [ ] **Paso 3: Correr suite E2E.**
```powershell
npm run test:e2e -- tests/e2e/ia-agentes.spec.ts
```
Esperado: todas las pruebas E2E pasan limpiamente.

- [ ] **Paso 4: Commit.**
```bash
git add tests/e2e/ia-agentes.spec.ts
git commit -m "test(e2e): recorrido de atencion, calificacion y agendamiento de ia

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 12: Verificación Final de Rama

- [ ] **Paso 1: Resetear base.**
```powershell
npx supabase db reset
```

- [ ] **Paso 2: Correr todas las suites completas y anotar totales reales.**
```powershell
npm run test:unit
npm run test:rls
npm run test:e2e
npm run lint
npm run build
npm run verificar:render
```
Esperado: cero fallos en unit, rls, e2e, lint y renderizado dinámico.

- [ ] **Paso 3: Comprobar diff limpio contra main.**
```powershell
git diff origin/main --stat
```

---

## Mapeo de Criterios de Aceptación (§16 del Spec) contra Tareas

| Criterio de Aceptación del Spec | Tarea que lo Cumple y Verifica |
|---|---|
| **1. Atención inmediata:** Todo lead nuevo recibe respuesta inicial del asistente y queda registrado en `mensajes_ia` con emisor `agente_ia`. | **Tarea 4** (despachador y cron) y **Tarea 11** (E2E). |
| **2. Calificación efectiva:** Leads calificados transicionan a `aceptado` en `leads`, habilitando datos de contacto para el vendedor. | **Tarea 5** (calificación) y **Tarea 7** (pruebas RLS). |
| **3. Agendamiento coherente:** Franjas ofrecidas coinciden con `franjas_libres`; citas reservadas quedan confirmadas sin solapamiento. | **Tarea 5** (agendamiento) y **Tarea 11** (E2E). |
| **4. Respeto a la preferencia de confirmación:** Vendedores sin `auto_confirmar_citas` ven la propuesta en su bandeja y confirman en 1 clic. | **Tarea 5** (bifurcación), **Tarea 7** (falsificación 2) y **Tarea 8** (botón panel). |
| **5. Aislamiento e Inyección:** Prompt injections son incapaces de forzar acciones sobre leads ajenos o roles no autorizados. | **Tarea 7** (falsificación 1) y **Tarea 2** (tipado estricto). |
| **6. Auditoría inmutable:** No es posible modificar ni eliminar turnos de diálogo en `mensajes_ia`. | **Tarea 1** (esquema y RLS) y **Tarea 7** (falsificación 3). |
| **7. Suites verdes:** 100% de pruebas unitarias, RLS y E2E pasando sin regresiones en SP0-SP5. | **Tarea 12** (verificación final de rama). |
