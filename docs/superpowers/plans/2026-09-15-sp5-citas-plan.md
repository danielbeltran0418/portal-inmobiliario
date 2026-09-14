# SP5 — Citas y agenda: plan de implementación

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** que un comprador con un lead aceptado reserve, mueva y cancele una visita en una franja libre del vendedor, sin doble reserva posible y con la dirección exacta visible solo desde 2 horas antes hasta el fin de la visita.

**Architecture:** las franjas no se guardan: se calculan en Postgres a partir del horario semanal y las fechas bloqueadas del vendedor, convirtiendo la hora de pared con `AT TIME ZONE 'America/Bogota'`. La doble reserva la impide una restricción de exclusión `gist` sobre `(vendedor_id, rango)`, y toda escritura sobre `citas` pasa por funciones `SECURITY DEFINER` en dos niveles (`_como` solo para `service_role`, la variante corta para `authenticated`). La dirección la revela una política RLS sobre `propiedades_ubicacion`, y la interfaz (Next 16, server actions con `useActionState`) solo pinta lo que la base devuelve.

**Tech Stack:** Supabase local (Postgres 17, PostgREST, GoTrue), extensión `btree_gist` 1.7, Next.js 16.3.3, React 19.2, zod 4, `@supabase/supabase-js` 2, Vitest 4 (unitarias y RLS), Playwright (E2E), `pg` para consultas directas en pruebas.

**Spec:** `docs/superpowers/specs/2026-09-14-portal-inmobiliario-sp5-design.md`

---

## Global Constraints

- Rama `sp5-citas` creada desde `main` DESPUÉS de mergear `fix/ubicacion-privada`; la migración `supabase/migrations/20260914000100_ubicacion_privada.sql` tiene que existir en `main`.
- Migraciones de SP5 numeradas desde `20260915000100`, de 100 en 100, sin huecos: `000100` a `000700`.
- Nunca se edita una migración ya commiteada salvo durante una falsificación, y se restaura con `git checkout -- <fichero>` antes de cualquier otro paso.
- Zona horaria de negocio: `'America/Bogota'`, nombrada siempre. Prohibido `-05`, `interval '5 hours'` o depender de la zona de la sesión.
- Franjas de `60 minutes`, en punto; horizonte `now() + interval '2 hours'` a `now() + interval '14 days'`, ambos inclusive.
- Ventana de la dirección: `now() >= lower(rango) - interval '2 hours' AND now() < upper(rango)`.
- Toda tabla nueva: `ENABLE ROW LEVEL SECURITY` y `REVOKE ALL ON <tabla> FROM anon, authenticated;` antes de cualquier `GRANT`.
- Toda función nueva: `SET search_path = ''` y `REVOKE EXECUTE ON FUNCTION <firma exacta> FROM PUBLIC, anon` como mínimo. En este Supabase `pg_default_acl` concede `EXECUTE` EXPLÍCITO a `anon`, `authenticated` y `service_role` sobre funciones de `public` (verificado: `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`), así que revocar solo de `PUBLIC` NO basta: se nombra a cada rol.
- Variantes `_como` y ayudantes internos: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`. Las `_como` además `GRANT EXECUTE ... TO service_role`. Los ayudantes internos también `FROM service_role`.
- Errores propios: SQLSTATE `VS001` a `VS008`, distinguidos siempre por `error.code`, nunca por `error.message`.
- Auditoría solo por `public.registrar_evento_auditoria(p_accion text, p_entidad text, p_entidad_id uuid, p_actor_id uuid, p_metadatos jsonb, p_ip inet)`, versión vigente de `20260831000700_escritores_auditoria.sql` (no hay otra posterior). Acciones: `cita_reservada`, `cita_movida`, `cita_cancelada`; entidad `'cita'`.
- Toda aserción de UPDATE/DELETE por PostgREST encadena `.select()` y cuenta filas; mirar solo `error` está prohibido.
- Toda consulta de la app sobre `leads`, `citas`, `disponibilidad_semanal` o `fechas_bloqueadas` lleva el filtro por usuario explícito (`.eq('comprador_id', ...)` o `.eq('vendedor_id', ...)`).
- Botones con resultado: componente `'use client'` con `useActionState`. Prohibido `<form action={fn}>` con una acción cuyo resultado se descarta.
- Un fichero `'use server'` solo exporta funciones async: las constantes de código de error no se exportan desde ahí.
- En JavaScript la única operación con fechas es mostrarlas, y solo por `src/lib/fechas/formato.ts`. Los límites de `franjas_libres` se pasan como `'-infinity'` y `'infinity'`: el horizonte lo decide la base.
- Páginas privadas nuevas: `robots: { index: false, follow: false }`, `title` y `description` propios y únicos.
- Ningún `<script>` propio (CSP con nonce y `strict-dynamic`).
- Cuentas de prueba efímeras con `randomUUID()` en el correo; nunca `comprador@portal.com`, `vendedor@portal.com` ni `admin@portal.com`.
- Única escritura directa sobre `citas`: `insertarCitaDirecta()` con `clienteAdmin()` (service_role), SOLO en pruebas y con comentario, en dos casos cerrados: (a) visitas cercanas o pasadas, que `reservar_cita` no permite crear (ventana de la dirección, `VS008`, E2E de la dirección); (b) las pruebas de las restricciones de la propia tabla en la Tarea 1, que existen antes que las funciones. Cualquier otra visita de prueba se crea con `reservar_cita`.
- No se fijan totales absolutos de pruebas: cada tarea mide `N_antes` en la salida real y exige `N_antes + nuevas`.
- Entorno Windows: vitest, playwright, supabase, tsc y lint se ejecutan con la herramienta PowerShell; nunca `rtk`; nunca `Set-Content` (usar las herramientas de edición o node); psql solo como `docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "..."`.
- Si Docker falla: PARAR y avisar. Nunca `Stop-Process -Force`. `supabase_vector` reiniciándose en bucle se ignora.
- Commits en español, terminados con una línea en blanco y `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. No se empuja ni se abre PR.

---

## Estructura de ficheros

### Migraciones

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260915000100_citas_esquema.sql` | `btree_gist` en `extensions`, enum `estado_cita`, tabla `citas` con exclusión e índices, RLS de lectura, privilegios |
| `supabase/migrations/20260915000200_disponibilidad.sql` | Tablas `disponibilidad_semanal` y `fechas_bloqueadas`, RLS del dueño y del super admin, privilegios |
| `supabase/migrations/20260915000300_franjas.sql` | `franjas_candidatas` (interna), `franja_valida` (interna), `franjas_libres` |
| `supabase/migrations/20260915000400_reservar_cita.sql` | `reservar_cita_como`, `reservar_cita` |
| `supabase/migrations/20260915000500_cancelar_cita.sql` | `cancelar_cita_como`, `cancelar_cita` |
| `supabase/migrations/20260915000600_mover_cita.sql` | `mover_cita_como`, `mover_cita` (va después de cancelar: su prueba de `VS007` cancela con `cancelar_cita`, no con una escritura directa) |
| `supabase/migrations/20260915000700_ubicacion_comprador_en_ventana.sql` | Política `ubicacion_lectura_comprador_en_ventana` sobre `propiedades_ubicacion` |

### Código de la aplicación

| Fichero | Responsabilidad |
|---|---|
| `src/lib/fechas/formato.ts` | Único formateador de fechas: `Intl.DateTimeFormat` con `timeZone: 'America/Bogota'` |
| `src/lib/errores/mapear.ts` (modificar) | Mensajes `VS001`–`VS008`, `mensajeDeErrorCita()`, `MENSAJE_HORARIO_NO_ENCONTRADO` |
| `src/lib/validacion/esquemas.ts` (modificar) | `esquemaReserva`, `esquemaMoverCita`, `esquemaCancelarCita`, `esquemaFranjaSemanal`, `esquemaBloqueo`, `esquemaIdentificador` |
| `src/lib/citas/rango.ts` | `leerRango()`: `tstzrange` de PostgREST a `{ inicio, fin }` ISO |
| `src/lib/citas/consultas.ts` | Lecturas con filtro explícito: solicitudes del comprador, citas del vendedor, franjas, disponibilidad, bloqueos |
| `src/lib/citas/agrupar.ts` | `agruparFranjasPorDia()`: agrupa y etiqueta franjas por día de Bogotá |
| `src/componentes/citas/acciones.ts` | Server actions `reservarCita`, `moverCita`, `cancelarCita` |
| `src/componentes/citas/selector-franjas.tsx` | Cliente: selector de franjas agrupadas, reservar o mover |
| `src/componentes/citas/acciones-cita.tsx` | Cliente: enlace Mover y botón Cancelar |
| `src/app/(vendedor)/panel/disponibilidad/acciones.ts` | Server actions del horario y los bloqueos |
| `src/app/(vendedor)/panel/disponibilidad/formularios.tsx` | Cliente: formularios de horario y bloqueo, botones de borrar |
| `src/app/(vendedor)/panel/disponibilidad/page.tsx` | Editor de disponibilidad |
| `src/app/(vendedor)/panel/citas/page.tsx` | Visitas del vendedor |
| `src/app/(vendedor)/panel/citas/[id]/mover/page.tsx` | Selector para mover, lado vendedor |
| `src/app/(vendedor)/panel/page.tsx` (modificar) | Enlaces a Disponibilidad y Visitas |
| `src/app/(comprador)/mi-cuenta/page.tsx` (modificar) | Solicitudes, visita, dirección en ventana |
| `src/app/(comprador)/mi-cuenta/reservar/[leadId]/page.tsx` | Selector para reservar |
| `src/app/(comprador)/mi-cuenta/visitas/[id]/mover/page.tsx` | Selector para mover, lado comprador |

### Pruebas

| Fichero | Responsabilidad |
|---|---|
| `tests/rls/ayudantes-citas.ts` | Fixturas de SP5: vendedores, leads, horario, citas directas, consultas `pg` |
| `tests/rls/citas-esquema.test.ts` | Exclusión, índice único, CHECK, escritura directa denegada, lectura por participante |
| `tests/rls/disponibilidad.test.ts` | Gestión del dueño, privacidad frente a compradores y vendedores ajenos |
| `tests/rls/franjas-libres.test.ts` | Zona horaria, horizonte, bloqueos, ocupadas, quién puede llamar |
| `tests/rls/reservar-cita.test.ts` | Reserva, `VS001`–`VS005`, `42501`, doble reserva simultánea, auditoría |
| `tests/rls/cancelar-cita.test.ts` | Cancelar, `VS002`, `VS006`–`VS008`, franja liberada, auditoría |
| `tests/rls/mover-cita.test.ts` | Mover atómico, `VS002`, `VS004`, `VS006`–`VS008`, auditoría |
| `tests/rls/citas-como.test.ts` | Privilegios de las `_como` y de los ayudantes internos |
| `tests/rls/ubicacion-ventana.test.ts` | Ventana de la dirección |
| `tests/rls/consultas-citas.test.ts` | Filtros explícitos de `src/lib/citas/consultas.ts` contra la base real |
| `tests/unit/formato-fechas.test.ts` | Hora y día de Bogotá en un proceso con zona ajena |
| `tests/unit/errores-citas.test.ts` | `VS00x` → mensaje, por código |
| `tests/unit/rango-cita.test.ts` | `leerRango()` |
| `tests/unit/acciones-citas.test.ts` | Server actions de citas contra una base falsa con comportamiento |
| `tests/unit/acciones-disponibilidad.test.ts` | Server actions de disponibilidad, cero filas no es éxito |
| `tests/unit/pagina-disponibilidad.test.ts` | Página de disponibilidad |
| `tests/unit/componentes-citas.test.ts` | Selector, acciones de cita y agrupado por día |
| `tests/unit/pagina-citas-vendedor.test.ts` | `/panel/citas` y su mover |
| `tests/unit/pagina-mi-cuenta.test.ts` | `/mi-cuenta` y sus subpáginas |
| `tests/unit/metadatos-paginas.test.ts` (modificar) | Las páginas nuevas son privadas |
| `tests/unit/panel-vendedor.test.ts` (modificar) | Enlaces nuevos en `/panel` |
| `tests/e2e/citas.spec.ts` | Recorrido completo y ocultamiento de la dirección en el HTML servido |

---

## Convenciones de los pasos

**Medir antes.** Cada tarea empieza leyendo el total real de la suite que toca:

```powershell
npm run test:rls   # o npm run test:unit
```

Se anota `N_antes` tal como aparece en la línea `Tests  N passed` de la salida. Al final de la tarea se exige `N_antes + (pruebas nuevas de la tarea)`, contadas en el fichero, no recordadas.

**Falsificar una migración.** El orden protege contra un agente que muera a mitad:

```powershell
git add supabase/migrations/<fichero>.sql      # el indice guarda la version buena
# editar el fichero con la falsificacion indicada
npx supabase db reset
npx vitest run tests/rls/<prueba>.test.ts -t "<nombre>"   # ROJO, pegar la salida
git checkout -- supabase/migrations/<fichero>.sql         # restaura desde el indice
git diff --exit-code -- supabase/migrations/<fichero>.sql # sin salida = intacto
npx supabase db reset
npx vitest run tests/rls/<prueba>.test.ts -t "<nombre>"   # VERDE
```

Si el fichero ya está commiteado, `git add` no hace falta y `git checkout --` restaura desde `HEAD`.

**Falsificar con psql.** Para políticas y privilegios se aplica el cambio directo en la base, se ve el rojo y se restaura con `npx supabase db reset`, que reconstruye desde las migraciones.

**Falsificar código de la aplicación.** Mismo orden que una migración: `git add <fichero>` antes de editar, correr la prueba y pegar el rojo, `git checkout -- <fichero>` para restaurar desde el índice y `git diff --exit-code -- <fichero>` para confirmar que quedó intacto. Las falsificaciones de las Tareas 9 a 17 se restauran así, nunca "deshaciendo a mano".

---

## Tarea 0: Preparación de la rama

**Files:** ninguno.

**Interfaces:**
- Consumes: `main` con `fix/ubicacion-privada` mergeado.
- Produces: rama `sp5-citas`, base local reseteada, totales `N_unit_0`, `N_rls_0`, `N_e2e_0` anotados.

- [ ] **Paso 1: comprobar que el arreglo está en main.**

```bash
G=$(which git.exe 2>/dev/null || echo /usr/bin/git)
$G fetch origin
$G ls-tree --name-only main supabase/migrations/ | grep 20260914000100_ubicacion_privada.sql
$G ls-tree --name-only main supabase/migrations/ | tail -1
```

Esperado: la primera orden imprime el fichero y la segunda imprime `supabase/migrations/20260914000100_ubicacion_privada.sql` como última migración. Si falta, PARAR: la Tarea 8 no se puede aplicar.

- [ ] **Paso 2: crear la rama.**

```bash
$G checkout main && $G pull --ff-only && $G checkout -b sp5-citas
```

- [ ] **Paso 3: resetear la base y comprobar la forma de `propiedades_ubicacion`.**

```powershell
npx supabase db reset
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "\d public.propiedades_ubicacion"
```

Esperado: columnas `propiedad_id uuid` (PK), `direccion text`, `latitud double precision`, `longitud double precision`.

- [ ] **Paso 4: medir las tres suites y anotar los totales leídos.**

```powershell
npm run test:unit
npm run test:rls
npm run test:e2e
```

Anotar `N_unit_0`, `N_rls_0` y `N_e2e_0`. Si alguna ya está en rojo, PARAR y reportarlo: SP5 no parte de una base roja.

---

## Tarea 1: Esquema de `citas`, exclusión y privilegios

**Files:**
- Create: `supabase/migrations/20260915000100_citas_esquema.sql`
- Create: `tests/rls/ayudantes-citas.ts`
- Test: `tests/rls/citas-esquema.test.ts`

**Interfaces:**
- Consumes: `public.leads(id)`, `public.propiedades(id)`, `public.perfiles(id)`, `public.es_super_admin()`; `clienteAdmin`, `clienteAnonimo`, `clienteComo`, `crearUsuarioDePrueba`, `sesionVendedor`, `URL_BASE_DE_DATOS` de `tests/rls/ayudantes.ts`.
- Produces:
  - `public.estado_cita AS ENUM ('confirmada','cancelada')`
  - `public.citas(id, lead_id, propiedad_id, comprador_id, vendedor_id, rango tstzrange, estado, cancelada_por, creado_en, actualizado_en)` con `citas_sin_solape_por_vendedor`, `citas_una_confirmada_por_lead`, `citas_confirmadas_recientes_idx`
  - `tests/rls/ayudantes-citas.ts`:
    - `PASSWORD: string`, `HORA_MS: number`
    - `crearVendedorConPropiedad(): Promise<{ id: string; correo: string; propiedadId: string }>`
    - `crearCompradorConLead(vendedor: { id: string; propiedadId: string }, estado?: 'nuevo' | 'aceptado' | 'descartado'): Promise<{ id: string; correo: string; leadId: string }>`
    - `comoUsuario(correo: string): Promise<SupabaseClient>`
    - `consultar<T>(sql: string, parametros?: unknown[]): Promise<T[]>`
    - `ahoraDeLaBase(): Promise<Date>`
    - `enPunto(fecha: Date): Date`
    - `rangoDesde(inicio: Date): string`
    - `insertarCitaDirecta(datos: { leadId: string; propiedadId: string; compradorId: string; vendedorId: string; inicio: Date; estado?: 'confirmada' | 'cancelada' }): Promise<string>`

- [ ] **Paso 1: medir `N_rls_antes`.**

```powershell
npm run test:rls
```

- [ ] **Paso 2: escribir los ayudantes de fixturas.** Crear `tests/rls/ayudantes-citas.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba, URL_BASE_DE_DATOS } from './ayudantes'

/**
 * Fixturas de SP5. Todas las cuentas son EFIMERAS (randomUUID en el correo):
 * seed.test.ts borra y recrea las cuentas fijas del seed en paralelo con el
 * resto de la suite. Ver el comentario de sesionVendedor() en ayudantes.ts.
 */
export const PASSWORD = 'CitasPrueba2026*'
export const HORA_MS = 60 * 60 * 1000

export async function crearVendedorConPropiedad() {
  const admin = clienteAdmin()
  const sufijo = randomUUID()
  const correo = `citas-vendedor-${sufijo}@prueba.test`
  const id = await crearUsuarioDePrueba({ correo, password: PASSWORD, rol: 'vendedor' })

  // El estado de la propiedad no importa en SP5: la cita nace de un lead, y
  // el lead se inserta directamente. Se deja en 'borrador', sin imagen.
  const { data, error } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: id,
      slug: `citas-${sufijo}`,
      titulo: 'Apartamento de prueba para citas',
      descripcion: 'Descripcion de prueba, suficiente para el CHECK de longitud.',
      operacion: 'venta',
      tipo_inmueble: 'apartamento',
      precio: 350000000,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id, correo, propiedadId: data.id as string }
}

export async function crearCompradorConLead(
  vendedor: { id: string; propiedadId: string },
  estado: 'nuevo' | 'aceptado' | 'descartado' = 'aceptado',
) {
  const admin = clienteAdmin()
  const correo = `citas-comprador-${randomUUID()}@prueba.test`
  const id = await crearUsuarioDePrueba({ correo, password: PASSWORD, rol: 'comprador' })

  // INSERT directo con service_role y el estado final: validar_transicion_lead
  // es BEFORE UPDATE, no actua sobre el INSERT, y lo que se prueba en SP5 no es
  // la transicion del lead sino lo que ocurre a partir de ella.
  const { data, error } = await admin
    .from('leads')
    .insert({
      propiedad_id: vendedor.propiedadId,
      comprador_id: id,
      vendedor_id: vendedor.id,
      nombre_mostrado: 'Comprador de prueba',
      mensaje: 'Mensaje de prueba para citas, suficientemente largo.',
      estado,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id, correo, leadId: data.id as string }
}

export function comoUsuario(correo: string): Promise<SupabaseClient> {
  return clienteComo(correo, PASSWORD)
}

/** Consulta directa a Postgres, para leer lo que PostgREST no expone comodo (lower(rango), privilegios). */
export async function consultar<T>(sql: string, parametros: unknown[] = []): Promise<T[]> {
  const base = new Client({ connectionString: URL_BASE_DE_DATOS })
  await base.connect()
  try {
    const { rows } = await base.query(sql, parametros)
    return rows as T[]
  } finally {
    await base.end()
  }
}

/**
 * La hora de la BASE, no la del proceso de pruebas. Docker Desktop en Windows
 * puede derivar varios segundos (o minutos, tras suspender el equipo) respecto
 * al reloj del host, y las ventanas de SP5 se juegan a un minuto.
 */
export async function ahoraDeLaBase(): Promise<Date> {
  const [fila] = await consultar<{ ahora: Date }>('SELECT now() AS ahora')
  return fila!.ahora
}

export function enPunto(fecha: Date): Date {
  const copia = new Date(fecha.getTime())
  copia.setUTCMinutes(0, 0, 0)
  return copia
}

export function rangoDesde(inicio: Date): string {
  const fin = new Date(inicio.getTime() + HORA_MS)
  return `[${inicio.toISOString()},${fin.toISOString()})`
}

/**
 * UNICA escritura directa sobre `citas` de todo SP5, y SOLO en pruebas.
 * Dos usos permitidos, y ninguno mas:
 *
 * (a) Visitas cercanas o pasadas. reservar_cita() no permite crearlas (el
 *     horizonte de 2 horas es parte de la regla), pero la ventana de la
 *     direccion y VS008 necesitan exactamente esas visitas.
 * (b) Las pruebas de las restricciones de la tabla (exclusion, indice unico,
 *     CHECK) en citas-esquema.test.ts, que prueban la tabla por debajo de las
 *     funciones.
 *
 * Toda otra visita de prueba se crea con reservar_cita(). Se insertan con
 * service_role, saltandose las funciones a proposito.
 */
export async function insertarCitaDirecta(datos: {
  leadId: string
  propiedadId: string
  compradorId: string
  vendedorId: string
  inicio: Date
  estado?: 'confirmada' | 'cancelada'
}): Promise<string> {
  const { data, error } = await clienteAdmin()
    .from('citas')
    .insert({
      lead_id: datos.leadId,
      propiedad_id: datos.propiedadId,
      comprador_id: datos.compradorId,
      vendedor_id: datos.vendedorId,
      rango: rangoDesde(datos.inicio),
      estado: datos.estado ?? 'confirmada',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
```

- [ ] **Paso 3: escribir la prueba que falla.** Crear `tests/rls/citas-esquema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo, sesionVendedor } from './ayudantes'
import {
  HORA_MS, ahoraDeLaBase, comoUsuario, crearCompradorConLead, crearVendedorConPropiedad,
  enPunto, insertarCitaDirecta, rangoDesde,
} from './ayudantes-citas'

async function inicioEnTresDias(): Promise<Date> {
  const ahora = await ahoraDeLaBase()
  return enPunto(new Date(ahora.getTime() + 72 * HORA_MS))
}

describe('citas: esquema', () => {
  it('rechaza dos visitas confirmadas solapadas del mismo vendedor con 23P01', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const uno = await crearCompradorConLead(vendedor)
    const dos = await crearCompradorConLead(vendedor)
    const inicio = await inicioEnTresDias()
    const base = { propiedadId: vendedor.propiedadId, vendedorId: vendedor.id, inicio }

    await insertarCitaDirecta({ ...base, leadId: uno.leadId, compradorId: uno.id })

    const choque = await clienteAdmin().from('citas').insert({
      lead_id: dos.leadId, propiedad_id: vendedor.propiedadId, comprador_id: dos.id,
      vendedor_id: vendedor.id, rango: rangoDesde(inicio),
    })
    expect(choque.error?.code).toBe('23P01')

    // Positivos: la misma franja cancelada no choca (WHERE estado =
    // 'confirmada'), y la franja contigua tampoco (rango '[)').
    await insertarCitaDirecta({ ...base, leadId: dos.leadId, compradorId: dos.id, estado: 'cancelada' })
    await insertarCitaDirecta({
      ...base, leadId: dos.leadId, compradorId: dos.id, inicio: new Date(inicio.getTime() + HORA_MS),
    })
  })

  it('admite una sola visita confirmada por lead (23505)', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor)
    const inicio = await inicioEnTresDias()
    const base = {
      leadId: comprador.leadId, propiedadId: vendedor.propiedadId,
      compradorId: comprador.id, vendedorId: vendedor.id,
    }

    const primera = await insertarCitaDirecta({ ...base, inicio })

    const segunda = await clienteAdmin().from('citas').insert({
      lead_id: comprador.leadId, propiedad_id: vendedor.propiedadId, comprador_id: comprador.id,
      vendedor_id: vendedor.id, rango: rangoDesde(new Date(inicio.getTime() + 5 * HORA_MS)),
    })
    expect(segunda.error?.code).toBe('23505')

    // Positivo: cancelada la primera, el mismo lead vuelve a tener hueco.
    const cancelar = await clienteAdmin().from('citas')
      .update({ estado: 'cancelada' }).eq('id', primera).select('id')
    expect(cancelar.data?.length).toBe(1)
    await insertarCitaDirecta({ ...base, inicio: new Date(inicio.getTime() + 5 * HORA_MS) })
  })

  it('exige rangos de 60 minutos cerrados por la izquierda (23514)', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor)
    const inicio = await inicioEnTresDias()
    const media = new Date(inicio.getTime() + 30 * 60 * 1000)

    const corta = await clienteAdmin().from('citas').insert({
      lead_id: comprador.leadId, propiedad_id: vendedor.propiedadId, comprador_id: comprador.id,
      vendedor_id: vendedor.id, rango: `[${inicio.toISOString()},${media.toISOString()})`,
    })
    expect(corta.error?.code).toBe('23514')
  })
})

describe('citas: nadie escribe directamente', () => {
  it('anon y authenticated no insertan, actualizan ni borran; se cuentan filas', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor)
    const inicio = await inicioEnTresDias()
    const citaId = await insertarCitaDirecta({
      leadId: comprador.leadId, propiedadId: vendedor.propiedadId,
      compradorId: comprador.id, vendedorId: vendedor.id, inicio,
    })
    const fila = {
      lead_id: comprador.leadId, propiedad_id: vendedor.propiedadId, comprador_id: comprador.id,
      vendedor_id: vendedor.id, rango: rangoDesde(new Date(inicio.getTime() + 24 * HORA_MS)),
    }

    for (const cliente of [clienteAnonimo(), await comoUsuario(comprador.correo), await comoUsuario(vendedor.correo)]) {
      const insertar = await cliente.from('citas').insert(fila).select('id')
      expect(insertar.error?.code).toBe('42501')
      expect(insertar.data).toBeNull()

      // Sin el REVOKE, authenticated tendria UPDATE y DELETE de fabrica y, sin
      // politica de escritura, PostgREST devolveria 0 filas y error null. El
      // 42501 solo aparece cuando falta el PRIVILEGIO: eso es lo que se afirma.
      const actualizar = await cliente.from('citas')
        .update({ estado: 'cancelada' }).eq('id', citaId).select('id')
      expect(actualizar.error?.code).toBe('42501')
      expect(actualizar.data).toBeNull()

      const borrar = await cliente.from('citas').delete().eq('id', citaId).select('id')
      expect(borrar.error?.code).toBe('42501')
      expect(borrar.data).toBeNull()
    }

    const { data } = await clienteAdmin().from('citas').select('id,estado').eq('lead_id', comprador.leadId)
    expect(data).toEqual([{ id: citaId, estado: 'confirmada' }])
  })
})

describe('citas: lectura', () => {
  it('comprador y vendedor leen su visita; un comprador o vendedor ajeno no', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor)
    const citaId = await insertarCitaDirecta({
      leadId: comprador.leadId, propiedadId: vendedor.propiedadId,
      compradorId: comprador.id, vendedorId: vendedor.id, inicio: await inicioEnTresDias(),
    })
    const otroVendedor = await crearVendedorConPropiedad()
    const ajeno = await crearCompradorConLead(otroVendedor)

    const leer = async (cliente: Awaited<ReturnType<typeof comoUsuario>>) =>
      (await cliente.from('citas').select('id').eq('id', citaId)).data ?? []

    expect(await leer(await comoUsuario(comprador.correo))).toEqual([{ id: citaId }])
    expect(await leer(await comoUsuario(vendedor.correo))).toEqual([{ id: citaId }])
    expect(await leer(await comoUsuario(ajeno.correo))).toEqual([])
    expect(await leer(await sesionVendedor())).toEqual([])
    expect(await leer(clienteAnonimo())).toEqual([])
  })
})
```

- [ ] **Paso 4: correrla y ver que falla.**

```powershell
npx vitest run tests/rls/citas-esquema.test.ts
```

Esperado: ROJO en todas, con `relation "public.citas" does not exist` o `Could not find the table 'public.citas'` (PGRST205).

- [ ] **Paso 5: escribir la migración.** Crear `supabase/migrations/20260915000100_citas_esquema.sql`:

```sql
-- ============================================================================
-- SP5: citas. La tabla que recoge una visita confirmada o cancelada.
--
-- La doble reserva no la impide el codigo: la impide la restriccion de
-- exclusion. Dos reservas simultaneas de la misma franja del mismo vendedor
-- no pueden quedar las dos 'confirmada', aunque lleguen a la vez: la segunda
-- espera a que la primera confirme y recibe 23P01.
--
-- btree_gist aporta la clase de operadores gist para uuid (gist_uuid_ops),
-- que la exclusion necesita para `vendedor_id WITH =`. Se instala en el
-- esquema `extensions`, como el resto de extensiones de Supabase. La busqueda
-- de la clase POR DEFECTO no depende del search_path (verificado antes de
-- escribir esto con search_path = '' dentro de una transaccion revertida),
-- pero el plan exige comprobarlo al aplicar: ver la Tarea 1, paso 7.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TYPE public.estado_cita AS ENUM ('confirmada', 'cancelada');

CREATE TABLE public.citas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Desnormalizados a proposito, derivados del lead dentro de las funciones.
  -- Nunca son parametros de ninguna funcion: no hay nada que falsificar.
  propiedad_id   uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  comprador_id   uuid NOT NULL REFERENCES public.perfiles(id)    ON DELETE CASCADE,
  vendedor_id    uuid NOT NULL REFERENCES public.perfiles(id)    ON DELETE CASCADE,
  rango          tstzrange NOT NULL,
  estado         public.estado_cita NOT NULL DEFAULT 'confirmada',
  cancelada_por  uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT citas_rango_cerrado_abierto CHECK (lower_inc(rango) AND NOT upper_inc(rango)),
  CONSTRAINT citas_rango_60_minutos CHECK (upper(rango) - lower(rango) = interval '60 minutes'),
  CONSTRAINT citas_sin_solape_por_vendedor
    EXCLUDE USING gist (vendedor_id WITH =, rango WITH &&)
    WHERE (estado = 'confirmada')
);

-- Una visita confirmada a la vez por lead. Parcial: las canceladas no cuentan.
CREATE UNIQUE INDEX citas_una_confirmada_por_lead
  ON public.citas (lead_id) WHERE estado = 'confirmada';

-- La costura hacia SP6: un consumidor observa las reservas nuevas por aqui,
-- igual que leads_nuevos_idx para lead_capturado.
CREATE INDEX citas_confirmadas_recientes_idx
  ON public.citas (creado_en) WHERE estado = 'confirmada';

CREATE INDEX citas_comprador_idx ON public.citas (comprador_id, estado);
CREATE INDEX citas_vendedor_idx  ON public.citas (vendedor_id, estado);

ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;

-- pg_default_acl de Supabase: "authenticated=arwdDxtm/postgres" en toda tabla
-- nueva de public (y anon=r). Sin este REVOKE, authenticated nace con UPDATE y
-- DELETE, y sin politica de escritura PostgREST los acepta con 0 filas y sin
-- error. Con el REVOKE, el 42501 llega antes de mirar RLS.
REVOKE ALL ON public.citas FROM anon, authenticated;
GRANT SELECT ON public.citas TO authenticated;

CREATE POLICY citas_lectura_comprador ON public.citas
  FOR SELECT TO authenticated
  USING (comprador_id = (SELECT auth.uid()));

CREATE POLICY citas_lectura_vendedor ON public.citas
  FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()));

CREATE POLICY citas_lectura_super_admin ON public.citas
  FOR SELECT TO authenticated
  USING (public.es_super_admin());
```

- [ ] **Paso 6: aplicarla.**

```powershell
npx supabase db reset
```

Si falla con `data type uuid has no default operator class for access method "gist"`, sustituir la línea de la exclusión por `EXCLUDE USING gist (vendedor_id extensions.gist_uuid_ops WITH =, rango WITH &&)`, volver a resetear y anotarlo en el reporte. Si falla por cualquier otra cosa, PARAR.

- [ ] **Paso 7: verificar la extensión, la clase de operadores y los privilegios contra la base.**

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT e.extname, n.nspname, e.extversion FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'btree_gist';"
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'citas_sin_solape_por_vendedor';"
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT o.opcname, n.nspname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_opclass o ON o.oid = i.indclass[0] JOIN pg_namespace n ON n.oid = o.opcnamespace WHERE c.relname = 'citas_sin_solape_por_vendedor';"
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT relacl FROM pg_class WHERE relname = 'citas';"
```

Esperado, en orden: `btree_gist | extensions | 1.7`; `EXCLUDE USING gist (vendedor_id WITH =, rango WITH &&) WHERE ((estado = 'confirmada'::estado_cita))`; `gist_uuid_ops | extensions`; un `relacl` sin entrada `anon=` y con `authenticated=r/postgres`. Pegar las cuatro salidas en el reporte.

- [ ] **Paso 8: correr la prueba y ver que pasa.**

```powershell
npx vitest run tests/rls/citas-esquema.test.ts
npm run test:rls
```

Esperado: 5 pruebas verdes en el fichero; la suite completa en `N_rls_antes + 5`. `tests/rls/privilegios-anon.test.ts` sigue verde: barre todas las tablas de `public` y ahora incluye `citas`.

- [ ] **Paso 9: falsificación del `REVOKE ALL`.** Siguiendo la convención de falsificar una migración, borrar de `20260915000100_citas_esquema.sql` la línea:

```sql
REVOKE ALL ON public.citas FROM anon, authenticated;
```

Correr `npx vitest run tests/rls/citas-esquema.test.ts -t "anon y authenticated no insertan"`. Esperado: ROJO en `expect(actualizar.error?.code).toBe('42501')`, recibiendo `undefined` (authenticated actualiza 0 filas sin error). Restaurar, resetear, VERDE.

- [ ] **Paso 10: falsificación de la exclusión.** En el mismo fichero, sustituir:

```sql
  CONSTRAINT citas_rango_60_minutos CHECK (upper(rango) - lower(rango) = interval '60 minutes'),
  CONSTRAINT citas_sin_solape_por_vendedor
    EXCLUDE USING gist (vendedor_id WITH =, rango WITH &&)
    WHERE (estado = 'confirmada')
);
```

por:

```sql
  CONSTRAINT citas_rango_60_minutos CHECK (upper(rango) - lower(rango) = interval '60 minutes')
);
```

Correr `-t "rechaza dos visitas confirmadas solapadas"`. Esperado: ROJO en `expect(choque.error?.code).toBe('23P01')`, recibiendo `undefined`. Restaurar, resetear, VERDE.

- [ ] **Paso 11: commit.**

```bash
$G add supabase/migrations/20260915000100_citas_esquema.sql tests/rls/ayudantes-citas.ts tests/rls/citas-esquema.test.ts
$G commit -m "feat(db): tabla citas con exclusion por vendedor y sin escritura directa

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 2: `disponibilidad_semanal` y `fechas_bloqueadas`

**Files:**
- Create: `supabase/migrations/20260915000200_disponibilidad.sql`
- Modify: `tests/rls/ayudantes-citas.ts`
- Test: `tests/rls/disponibilidad.test.ts`

**Interfaces:**
- Consumes: `public.perfiles(id, rol)`, `public.es_super_admin()`; `crearVendedorConPropiedad`, `crearCompradorConLead`, `comoUsuario` (Tarea 1).
- Produces:
  - `public.disponibilidad_semanal(id uuid, vendedor_id uuid, dia_semana smallint, hora_inicio time, hora_fin time)`
  - `public.fechas_bloqueadas(id uuid, vendedor_id uuid, desde date, hasta date)`
  - Políticas `disponibilidad_dueno`, `disponibilidad_lectura_super_admin`, `fechas_bloqueadas_dueno`, `fechas_bloqueadas_lectura_super_admin`
  - En `tests/rls/ayudantes-citas.ts`:
    - `definirHorario(vendedorId: string, filas: { dia_semana: number; hora_inicio: string; hora_fin: string }[]): Promise<void>`
    - `definirHorarioCompleto(vendedorId: string): Promise<void>`
    - `bloquearFecha(vendedorId: string, fecha: string): Promise<void>`
    - `fechaDeBogota(instante: Date): string`

- [ ] **Paso 1: medir `N_rls_antes`.**

```powershell
npm run test:rls
```

- [ ] **Paso 2: añadir los ayudantes.** Al final de `tests/rls/ayudantes-citas.ts`:

```ts
export async function definirHorario(
  vendedorId: string,
  filas: { dia_semana: number; hora_inicio: string; hora_fin: string }[],
): Promise<void> {
  const { error } = await clienteAdmin()
    .from('disponibilidad_semanal')
    .insert(filas.map((fila) => ({ vendedor_id: vendedorId, ...fila })))
  if (error) throw error
}

/** Los siete dias, de 00:00 a 24:00: siempre hay franjas, sea la hora que sea al correr la prueba. */
export async function definirHorarioCompleto(vendedorId: string): Promise<void> {
  await definirHorario(
    vendedorId,
    [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia_semana: dia, hora_inicio: '00:00', hora_fin: '24:00' })),
  )
}

export async function bloquearFecha(vendedorId: string, fecha: string): Promise<void> {
  const { error } = await clienteAdmin()
    .from('fechas_bloqueadas')
    .insert({ vendedor_id: vendedorId, desde: fecha, hasta: fecha })
  if (error) throw error
}

/** Fecha de calendario de Bogota (YYYY-MM-DD) de un instante. Solo para pruebas. */
export function fechaDeBogota(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instante)
}
```

- [ ] **Paso 3: escribir la prueba que falla.** Crear `tests/rls/disponibilidad.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clienteAdmin } from './ayudantes'
import { comoUsuario, crearCompradorConLead, crearVendedorConPropiedad } from './ayudantes-citas'

describe('disponibilidad_semanal y fechas_bloqueadas', () => {
  it('el vendedor crea, cambia y borra su horario y sus bloqueos', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const cliente = await comoUsuario(vendedor.correo)

    const franja = await cliente.from('disponibilidad_semanal')
      .insert({ vendedor_id: vendedor.id, dia_semana: 4, hora_inicio: '15:00', hora_fin: '16:00' })
      .select('id')
    expect(franja.error).toBeNull()
    expect(franja.data?.length).toBe(1)
    const franjaId = franja.data![0]!.id as string

    const cambio = await cliente.from('disponibilidad_semanal')
      .update({ hora_fin: '17:00' }).eq('id', franjaId).select('id')
    expect(cambio.data?.length).toBe(1)

    const borrado = await cliente.from('disponibilidad_semanal').delete().eq('id', franjaId).select('id')
    expect(borrado.data?.length).toBe(1)

    const bloqueo = await cliente.from('fechas_bloqueadas')
      .insert({ vendedor_id: vendedor.id, desde: '2026-12-24', hasta: '2026-12-26' })
      .select('id')
    expect(bloqueo.data?.length).toBe(1)

    const desbloqueo = await cliente.from('fechas_bloqueadas')
      .delete().eq('id', bloqueo.data![0]!.id as string).select('id')
    expect(desbloqueo.data?.length).toBe(1)
  })

  it('un vendedor no lee ni escribe el horario ni los bloqueos de otro', async () => {
    const dueno = await crearVendedorConPropiedad()
    const ajeno = await crearVendedorConPropiedad()
    const clienteDueno = await comoUsuario(dueno.correo)
    const clienteAjeno = await comoUsuario(ajeno.correo)

    const franjas = await clienteDueno.from('disponibilidad_semanal')
      .insert({ vendedor_id: dueno.id, dia_semana: 1, hora_inicio: '08:00', hora_fin: '12:00' })
      .select('id')
    const bloqueos = await clienteDueno.from('fechas_bloqueadas')
      .insert({ vendedor_id: dueno.id, desde: '2026-12-24', hasta: '2026-12-24' })
      .select('id')
    const franjaId = franjas.data![0]!.id as string
    const bloqueoId = bloqueos.data![0]!.id as string

    // Lectura. El filtro por vendedor_id va en la consulta, asi que un [] solo
    // puede venir de la politica.
    expect((await clienteAjeno.from('disponibilidad_semanal').select('id').eq('vendedor_id', dueno.id)).data)
      .toEqual([])
    expect((await clienteAjeno.from('fechas_bloqueadas').select('id').eq('vendedor_id', dueno.id)).data)
      .toEqual([])

    // Escritura: sin politica aplicable, 0 filas y error null. Se cuentan filas.
    const cambiar = await clienteAjeno.from('disponibilidad_semanal')
      .update({ hora_fin: '18:00' }).eq('id', franjaId).select('id')
    expect(cambiar.error).toBeNull()
    expect(cambiar.data).toEqual([])

    const borrar = await clienteAjeno.from('fechas_bloqueadas').delete().eq('id', bloqueoId).select('id')
    expect(borrar.error).toBeNull()
    expect(borrar.data).toEqual([])

    const suplantar = await clienteAjeno.from('disponibilidad_semanal')
      .insert({ vendedor_id: dueno.id, dia_semana: 2, hora_inicio: '08:00', hora_fin: '09:00' })
      .select('id')
    expect(suplantar.error?.code).toBe('42501')

    const admin = clienteAdmin()
    expect((await admin.from('disponibilidad_semanal').select('id,hora_fin').eq('vendedor_id', dueno.id)).data)
      .toEqual([{ id: franjaId, hora_fin: '12:00:00' }])
    expect((await admin.from('fechas_bloqueadas').select('id').eq('id', bloqueoId)).data)
      .toEqual([{ id: bloqueoId }])

    // Positivo: el dueno SI lee lo suyo con la misma consulta.
    expect((await clienteDueno.from('disponibilidad_semanal').select('id').eq('vendedor_id', dueno.id)).data)
      .toEqual([{ id: franjaId }])
  })

  it('un comprador, aunque tenga un lead aceptado, no lee la disponibilidad ni los bloqueos', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor, 'aceptado')
    const admin = clienteAdmin()
    expect((await admin.from('disponibilidad_semanal')
      .insert({ vendedor_id: vendedor.id, dia_semana: 3, hora_inicio: '09:00', hora_fin: '10:00' })).error)
      .toBeNull()
    expect((await admin.from('fechas_bloqueadas')
      .insert({ vendedor_id: vendedor.id, desde: '2026-12-31', hasta: '2026-12-31' })).error)
      .toBeNull()

    const cliente = await comoUsuario(comprador.correo)
    // Sin filtro a proposito: nada de ninguna de las dos tablas es visible.
    expect((await cliente.from('disponibilidad_semanal').select('id')).data).toEqual([])
    expect((await cliente.from('fechas_bloqueadas').select('id')).data).toEqual([])
  })

  it('un comprador no puede crearse un horario ni un bloqueo, ni siquiera con su propio id', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor)
    const cliente = await comoUsuario(comprador.correo)

    const horario = await cliente.from('disponibilidad_semanal')
      .insert({ vendedor_id: comprador.id, dia_semana: 5, hora_inicio: '10:00', hora_fin: '11:00' })
      .select('id')
    expect(horario.error?.code).toBe('42501')

    const bloqueo = await cliente.from('fechas_bloqueadas')
      .insert({ vendedor_id: comprador.id, desde: '2026-12-24', hasta: '2026-12-24' })
      .select('id')
    expect(bloqueo.error?.code).toBe('42501')

    // Positivo: la misma fila, con el id y el rol de un vendedor, entra.
    const propio = await (await comoUsuario(vendedor.correo)).from('disponibilidad_semanal')
      .insert({ vendedor_id: vendedor.id, dia_semana: 5, hora_inicio: '10:00', hora_fin: '11:00' })
      .select('id')
    expect(propio.data?.length).toBe(1)
  })

  it('las horas van en punto, el fin despues del inicio y el bloqueo en orden (23514)', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const cliente = await comoUsuario(vendedor.correo)

    for (const fila of [
      { dia_semana: 4, hora_inicio: '15:30', hora_fin: '16:00' },
      { dia_semana: 4, hora_inicio: '15:00', hora_fin: '16:30' },
      { dia_semana: 4, hora_inicio: '16:00', hora_fin: '15:00' },
      { dia_semana: 8, hora_inicio: '15:00', hora_fin: '16:00' },
    ]) {
      const intento = await cliente.from('disponibilidad_semanal')
        .insert({ vendedor_id: vendedor.id, ...fila }).select('id')
      expect(intento.error?.code).toBe('23514')
    }

    const alReves = await cliente.from('fechas_bloqueadas')
      .insert({ vendedor_id: vendedor.id, desde: '2026-12-26', hasta: '2026-12-24' }).select('id')
    expect(alReves.error?.code).toBe('23514')

    // Positivo: la ultima franja del dia termina a las 24:00.
    const ultima = await cliente.from('disponibilidad_semanal')
      .insert({ vendedor_id: vendedor.id, dia_semana: 4, hora_inicio: '23:00', hora_fin: '24:00' })
      .select('id')
    expect(ultima.data?.length).toBe(1)
  })
})
```

- [ ] **Paso 4: correrla y ver que falla.**

```powershell
npx vitest run tests/rls/disponibilidad.test.ts
```

Esperado: ROJO en las 5, por tabla inexistente.

- [ ] **Paso 5: escribir la migración.** Crear `supabase/migrations/20260915000200_disponibilidad.sql`:

```sql
-- ============================================================================
-- SP5: el horario semanal del vendedor y sus fechas bloqueadas.
--
-- Por vendedor, no por propiedad: un vendedor no puede estar en dos visitas a
-- la vez aunque sean casas distintas.
--
-- Los solapes dentro de disponibilidad_semanal son inofensivos (manana y tarde
-- que se pisan): franjas_candidatas() deduplica. No hace falta restriccion.
--
-- Los compradores NO leen estas tablas. Ven horas libres, un dato derivado,
-- a traves de franjas_libres() (20260915000300).
-- ============================================================================

CREATE TABLE public.disponibilidad_semanal (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  dia_semana  smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),  -- ISO: 1 = lunes
  hora_inicio time NOT NULL,
  hora_fin    time NOT NULL,
  CONSTRAINT disponibilidad_fin_despues_de_inicio CHECK (hora_fin > hora_inicio),
  -- Las franjas empiezan en punto. date_trunc('hour', time) funciona sobre
  -- time y admite '24:00' (verificado contra la base local).
  CONSTRAINT disponibilidad_inicio_en_punto CHECK (date_trunc('hour', hora_inicio) = hora_inicio),
  CONSTRAINT disponibilidad_fin_en_punto CHECK (date_trunc('hour', hora_fin) = hora_fin)
);

CREATE INDEX disponibilidad_vendedor_idx
  ON public.disponibilidad_semanal (vendedor_id, dia_semana);

CREATE TABLE public.fechas_bloqueadas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  desde       date NOT NULL,   -- fechas de calendario de Bogota
  hasta       date NOT NULL,
  CONSTRAINT fechas_bloqueadas_en_orden CHECK (hasta >= desde)
);

CREATE INDEX fechas_bloqueadas_vendedor_idx
  ON public.fechas_bloqueadas (vendedor_id, desde, hasta);

ALTER TABLE public.disponibilidad_semanal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechas_bloqueadas      ENABLE ROW LEVEL SECURITY;

-- Mismo motivo que en citas: pg_default_acl concede CRUD completo a
-- authenticated. Se revoca todo y se concede lo que el modelo necesita; RLS
-- decide sobre QUE filas.
REVOKE ALL ON public.disponibilidad_semanal, public.fechas_bloqueadas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.disponibilidad_semanal, public.fechas_bloqueadas TO authenticated;

-- El dueno gestiona sus filas. Dos condiciones, las dos explicitas:
--   * vendedor_id = auth.uid(): nadie toca las de otro.
--   * rol vendedor, leido de SU perfil con el filtro por id escrito (perfiles
--     tiene dos politicas de SELECT combinadas con OR, la propia y la de
--     super_admin): un comprador no se fabrica un horario con su propio id.
CREATE POLICY disponibilidad_dueno ON public.disponibilidad_semanal
  FOR ALL TO authenticated
  USING (
    vendedor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'
    )
  )
  WITH CHECK (
    vendedor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'
    )
  );

CREATE POLICY disponibilidad_lectura_super_admin ON public.disponibilidad_semanal
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

CREATE POLICY fechas_bloqueadas_dueno ON public.fechas_bloqueadas
  FOR ALL TO authenticated
  USING (
    vendedor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'
    )
  )
  WITH CHECK (
    vendedor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.perfiles pf
      WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'
    )
  );

CREATE POLICY fechas_bloqueadas_lectura_super_admin ON public.fechas_bloqueadas
  FOR SELECT TO authenticated
  USING (public.es_super_admin());
```

- [ ] **Paso 6: aplicar, verificar privilegios y correr la prueba.**

```powershell
npx supabase db reset
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT relname, relacl FROM pg_class WHERE relname IN ('disponibilidad_semanal','fechas_bloqueadas');"
npx vitest run tests/rls/disponibilidad.test.ts
npm run test:rls
```

Esperado: `relacl` sin `anon=` y con `authenticated=arwd/postgres`; 5 verdes; suite en `N_rls_antes + 5`.

- [ ] **Paso 7: falsificación del filtro por dueño en `disponibilidad_semanal`.** Con psql:

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "DROP POLICY disponibilidad_dueno ON public.disponibilidad_semanal; CREATE POLICY disponibilidad_dueno ON public.disponibilidad_semanal FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.perfiles pf WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor')) WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles pf WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'));"
npx vitest run tests/rls/disponibilidad.test.ts -t "un vendedor no lee ni escribe"
```

Esperado: ROJO en la primera aserción de lectura: el ajeno recibe la fila del dueño. Restaurar con `npx supabase db reset` y ver VERDE.

- [ ] **Paso 8: falsificación del filtro por dueño en `fechas_bloqueadas`.** Con psql:

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "DROP POLICY fechas_bloqueadas_dueno ON public.fechas_bloqueadas; CREATE POLICY fechas_bloqueadas_dueno ON public.fechas_bloqueadas FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.perfiles pf WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor')) WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles pf WHERE pf.id = (SELECT auth.uid()) AND pf.rol = 'vendedor'));"
npx vitest run tests/rls/disponibilidad.test.ts -t "un vendedor no lee ni escribe"
```

Esperado: ROJO en la segunda aserción de lectura (`fechas_bloqueadas`). Restaurar con reset, VERDE.

- [ ] **Paso 9: falsificación de la privacidad frente al comprador.** El error plausible es "que el comprador con lead aceptado vea el horario". Con psql:

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "CREATE POLICY sonda_lectura_comprador ON public.disponibilidad_semanal FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.vendedor_id = disponibilidad_semanal.vendedor_id AND l.comprador_id = (SELECT auth.uid()) AND l.estado = 'aceptado'));"
npx vitest run tests/rls/disponibilidad.test.ts -t "un comprador, aunque tenga un lead aceptado"
```

Esperado: ROJO, el comprador recibe la fila. Restaurar con reset, VERDE.

- [ ] **Paso 10: falsificación de la condición de rol.** Con psql:

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "DROP POLICY disponibilidad_dueno ON public.disponibilidad_semanal; CREATE POLICY disponibilidad_dueno ON public.disponibilidad_semanal FOR ALL TO authenticated USING (vendedor_id = (SELECT auth.uid())) WITH CHECK (vendedor_id = (SELECT auth.uid()));"
npx vitest run tests/rls/disponibilidad.test.ts -t "un comprador no puede crearse"
```

Esperado: ROJO en `expect(horario.error?.code).toBe('42501')`: el comprador inserta. Restaurar con reset, VERDE.

- [ ] **Paso 11: commit.**

```bash
$G add supabase/migrations/20260915000200_disponibilidad.sql tests/rls/ayudantes-citas.ts tests/rls/disponibilidad.test.ts
$G commit -m "feat(db): horario semanal y fechas bloqueadas del vendedor con RLS del dueno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 3: Franjas libres y validación de franja

**Files:**
- Create: `supabase/migrations/20260915000300_franjas.sql`
- Test: `tests/rls/franjas-libres.test.ts`

**Interfaces:**
- Consumes: tablas de las Tareas 1 y 2; `public.leads(comprador_id, vendedor_id, estado)`; `auth.uid()`, `auth.role()`; ayudantes de las Tareas 1 y 2.
- Produces:
  - `public.franjas_candidatas(p_vendedor_id uuid, p_desde timestamptz, p_hasta timestamptz) RETURNS TABLE (inicio timestamptz)` — interna, sin EXECUTE para ningún rol de aplicación.
  - `public.franja_valida(p_vendedor_id uuid, p_inicio timestamptz) RETURNS boolean` — interna, igual.
  - `public.franjas_libres(p_vendedor_id uuid, p_desde timestamptz, p_hasta timestamptz) RETURNS TABLE (inicio timestamptz, fin timestamptz)` — `SECURITY DEFINER`, EXECUTE para `authenticated` y `service_role`.

**Decisión que este plan añade al spec, documentada:** `franjas_libres` también responde a `service_role`. La §10 del spec dice que SP6 usará `franjas_libres` con `service_role` para agendar solo; con `auth.uid()` nulo, la regla literal de la §6 le devolvería siempre un conjunto vacío y SP6 tendría que modificar SP5. `service_role` ya salta RLS y lee `citas` entero, así que no gana nada que no tenga.

**Por qué hay un generador interno.** Validar una franja y listarlas son la misma regla. Si `franja_valida` reescribiera la condición a mano, las dos podrían divergir: una franja ofrecida podría no ser reservable, o al revés. Las dos leen de `franjas_candidatas`, y las falsificaciones de zona horaria, horizonte y bloqueo tocan ese único sitio.

- [ ] **Paso 1: medir `N_rls_antes`.**

```powershell
npm run test:rls
```

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/rls/franjas-libres.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteAnonimo } from './ayudantes'
import {
  HORA_MS, ahoraDeLaBase, bloquearFecha, comoUsuario, crearCompradorConLead,
  crearVendedorConPropiedad, definirHorario, definirHorarioCompleto, fechaDeBogota,
} from './ayudantes-citas'

type Franja = { inicio: string; fin: string }

// Los mismos limites que manda la aplicacion: el horizonte lo decide la base.
const LIMITES_ABIERTOS = { p_desde: '-infinity', p_hasta: 'infinity' }
const DIA_MS = 24 * HORA_MS

async function franjasComo(cliente: SupabaseClient, vendedorId: string): Promise<Franja[]> {
  const { data, error } = await cliente.rpc('franjas_libres', { p_vendedor_id: vendedorId, ...LIMITES_ABIERTOS })
  expect(error).toBeNull()
  return (data ?? []) as Franja[]
}

describe('franjas_libres', () => {
  it('jueves 15:00-16:00 de un vendedor de Barranquilla se ofrece a las 20:00 UTC', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor, 'aceptado')
    await definirHorario(vendedor.id, [{ dia_semana: 4, hora_inicio: '15:00', hora_fin: '16:00' }])

    const franjas = await franjasComo(await comoUsuario(comprador.correo), vendedor.id)

    // Una ventana de 14 dias contiene uno o dos jueves validos, nunca cero ni tres.
    expect(franjas.length).toBeGreaterThanOrEqual(1)
    expect(franjas.length).toBeLessThanOrEqual(2)
    for (const franja of franjas) {
      const inicio = new Date(franja.inicio)
      expect(inicio.getUTCDay()).toBe(4)
      expect(inicio.getUTCHours()).toBe(20)
      expect(inicio.getUTCMinutes()).toBe(0)
      expect(new Date(franja.fin).getTime() - inicio.getTime()).toBe(HORA_MS)
    }
  })

  it('no ofrece nada antes de now() + 2 h ni despues de now() + 14 dias', async () => {
    const vendedor = await crearVendedorConPropiedad()
    await definirHorarioCompleto(vendedor.id)

    // antes y despues acotan el now() que uso la funcion.
    const antes = (await ahoraDeLaBase()).getTime()
    const franjas = await franjasComo(await comoUsuario(vendedor.correo), vendedor.id)
    const despues = (await ahoraDeLaBase()).getTime()

    expect(franjas.length).toBeGreaterThan(300)
    const inicios = franjas.map((f) => new Date(f.inicio).getTime())
    const primera = Math.min(...inicios)
    const ultima = Math.max(...inicios)

    // Lo que se afirma: ni now() + 1 h ni now() + 14 d + 1 h estan en la lista.
    expect(primera).toBeGreaterThanOrEqual(antes + 2 * HORA_MS)
    expect(ultima).toBeLessThanOrEqual(despues + 14 * DIA_MS)

    // Positivo: el horizonte llega hasta sus dos bordes, no se recorto de mas.
    expect(primera).toBeLessThan(despues + 3 * HORA_MS)
    expect(ultima).toBeGreaterThan(antes + 14 * DIA_MS - HORA_MS)
  })

  it('una fecha bloqueada no ofrece ninguna franja ese dia', async () => {
    const vendedor = await crearVendedorConPropiedad()
    await definirHorarioCompleto(vendedor.id)
    const ahora = (await ahoraDeLaBase()).getTime()
    const bloqueada = fechaDeBogota(new Date(ahora + 5 * DIA_MS))
    await bloquearFecha(vendedor.id, bloqueada)

    const dias = (await franjasComo(await comoUsuario(vendedor.correo), vendedor.id))
      .map((f) => fechaDeBogota(new Date(f.inicio)))

    expect(dias).not.toContain(bloqueada)
    // Positivo: los dias vecinos si tienen franjas.
    expect(dias).toContain(fechaDeBogota(new Date(ahora + 4 * DIA_MS)))
    expect(dias).toContain(fechaDeBogota(new Date(ahora + 6 * DIA_MS)))
  })

  it('deduplica horarios solapados y devuelve las franjas ordenadas', async () => {
    const vendedor = await crearVendedorConPropiedad()
    await definirHorarioCompleto(vendedor.id)
    await definirHorario(
      vendedor.id,
      [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia_semana: dia, hora_inicio: '08:00', hora_fin: '18:00' })),
    )

    const inicios = (await franjasComo(await comoUsuario(vendedor.correo), vendedor.id))
      .map((f) => new Date(f.inicio).getTime())

    expect(new Set(inicios).size).toBe(inicios.length)
    expect(inicios).toEqual([...inicios].sort((a, b) => a - b))
  })

  it('solo la ven el propio vendedor, un comprador con lead aceptado de ese vendedor y service_role', async () => {
    const vendedor = await crearVendedorConPropiedad()
    await definirHorarioCompleto(vendedor.id)
    const aceptado = await crearCompradorConLead(vendedor, 'aceptado')
    const nuevo = await crearCompradorConLead(vendedor, 'nuevo')
    const descartado = await crearCompradorConLead(vendedor, 'descartado')
    const otroVendedor = await crearVendedorConPropiedad()
    const aceptadoDeOtro = await crearCompradorConLead(otroVendedor, 'aceptado')

    expect((await franjasComo(await comoUsuario(vendedor.correo), vendedor.id)).length).toBeGreaterThan(0)
    expect((await franjasComo(await comoUsuario(aceptado.correo), vendedor.id)).length).toBeGreaterThan(0)
    expect((await franjasComo(clienteAdmin(), vendedor.id)).length).toBeGreaterThan(0)

    expect(await franjasComo(await comoUsuario(nuevo.correo), vendedor.id)).toEqual([])
    expect(await franjasComo(await comoUsuario(descartado.correo), vendedor.id)).toEqual([])
    expect(await franjasComo(await comoUsuario(aceptadoDeOtro.correo), vendedor.id)).toEqual([])
    expect(await franjasComo(await comoUsuario(otroVendedor.correo), vendedor.id)).toEqual([])

    const anonimo = await clienteAnonimo().rpc('franjas_libres', { p_vendedor_id: vendedor.id, ...LIMITES_ABIERTOS })
    expect(anonimo.error?.code).toBe('42501')
  })
})
```

La exclusión de franjas ocupadas por visitas confirmadas se prueba en la Tarea 4, con visitas creadas por `reservar_cita`, y que una visita cancelada libera su franja, en la Tarea 5.

- [ ] **Paso 3: correrla y ver que falla.**

```powershell
npx vitest run tests/rls/franjas-libres.test.ts
```

Esperado: ROJO en las 5, `Could not find the function public.franjas_libres` (PGRST202).

- [ ] **Paso 4: escribir la migración.** Crear `supabase/migrations/20260915000300_franjas.sql`:

```sql
-- ============================================================================
-- SP5: franjas calculadas. No se guardan: se derivan del horario semanal, las
-- fechas bloqueadas y las citas confirmadas.
--
-- ZONA HORARIA. La base corre en UTC y asi se queda. La hora de pared del
-- vendedor se convierte a instante AQUI, con la zona nombrada:
--
--   (fecha + hora)::timestamp AT TIME ZONE 'America/Bogota'   -> timestamptz
--       interpreta la hora como hora de Bogota. ESTA genera franjas.
--   instante_tz AT TIME ZONE 'America/Bogota'                  -> timestamp
--       convierte un instante a hora de Bogota. Esta saca la fecha local.
--
-- Invertirlas da las 10:00 UTC donde deberian ser las 20:00 (verificado:
-- jueves 2026-09-17 15:00 -> 20:00 UTC con la correcta, 10:00 UTC invertida,
-- 15:00 UTC sin conversion). date + time da timestamp sin zona, asi que el
-- resultado no depende del TimeZone de la sesion.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Generador interno. Una unica fuente para listar y para validar.
--
-- Dos limites distintos, y no son redundantes:
--   * Los de las FECHAS (greatest/least con now() y now() + 15 days) solo
--     acotan generate_series: sin ellos, p_hasta = 'infinity' o el ano 3000
--     generaria series enormes. No son la regla de negocio.
--   * El HORIZONTE es el WHERE final: now() + 2 hours <= inicio <= now() +
--     14 days. Es lo que la prueba falsifica.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.franjas_candidatas(
  p_vendedor_id uuid, p_desde timestamptz, p_hasta timestamptz
) RETURNS TABLE (inicio timestamptz)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH limites AS (
    SELECT
      (greatest(p_desde, now()) AT TIME ZONE 'America/Bogota')::date                    AS primera,
      (least(p_hasta, now() + interval '15 days') AT TIME ZONE 'America/Bogota')::date AS ultima
  ),
  dias AS (
    -- ::timestamp explicito en los dos extremos: generate_series(date, date, ...)
    -- resolveria a la variante timestamptz y dependeria del TimeZone de la sesion.
    SELECT g::date AS fecha
    FROM limites,
         generate_series(limites.primera::timestamp, limites.ultima::timestamp, interval '1 day') AS g
  ),
  generadas AS (
    SELECT DISTINCT
      ((dias.fecha + d.hora_inicio) + make_interval(hours => h.desplazamiento))
        AT TIME ZONE 'America/Bogota' AS inicio
    FROM dias
    JOIN public.disponibilidad_semanal d
      ON d.vendedor_id = p_vendedor_id
     AND d.dia_semana = extract(isodow FROM dias.fecha)::int
    CROSS JOIN LATERAL generate_series(
      0,
      (extract(hour FROM d.hora_fin) - extract(hour FROM d.hora_inicio))::int - 1
    ) AS h(desplazamiento)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.fechas_bloqueadas b
      WHERE b.vendedor_id = p_vendedor_id
        AND dias.fecha BETWEEN b.desde AND b.hasta
    )
  )
  SELECT generadas.inicio
  FROM generadas
  WHERE generadas.inicio >= now() + interval '2 hours'
    AND generadas.inicio <= now() + interval '14 days'
  ORDER BY generadas.inicio;
$$;

-- ----------------------------------------------------------------------------
-- Validacion de UNA franja: existe entre las candidatas de su dia. Cubre a la
-- vez disponibilidad, bloqueo, horizonte y "empieza en punto" (una hora que no
-- esta en punto no coincide con ninguna candidata).
--
-- NO mira si esta ocupada: eso lo hace cumplir la restriccion de exclusion al
-- escribir, que es la unica comprobacion que aguanta peticiones simultaneas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.franja_valida(p_vendedor_id uuid, p_inicio timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p_inicio IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.franjas_candidatas(p_vendedor_id, p_inicio, p_inicio) AS f
    WHERE f.inicio = p_inicio
  );
$$;

-- ----------------------------------------------------------------------------
-- Lectura publica de franjas.
--
-- SECURITY DEFINER porque tiene que excluir las franjas ocupadas por citas de
-- OTROS compradores, que quien llama no puede leer. No contradice el rechazo
-- del RPC de lectura en SP4 (20260911000300): alli el RPC habria protegido un
-- dato, el contacto, que el vendedor seguia leyendo por la tabla. Aqui la
-- funcion devuelve un dato DERIVADO y no protegido -- horas libres -- y nunca
-- dice quien ocupa las demas.
--
-- Quien llama: el propio vendedor; un comprador con un lead ACEPTADO de ese
-- vendedor; o service_role (la costura con SP6, ver la cabecera de la Tarea 3
-- del plan). Cualquier otro recibe un conjunto vacio, no un error: no se le
-- confirma siquiera que el vendedor exista.
--
-- leads.vendedor_id esta desnormalizado y sincronizar_vendedor_lead() deja los
-- 'aceptado' con el vendedor que los acepto: la comprobacion usa ese valor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.franjas_libres(
  p_vendedor_id uuid, p_desde timestamptz, p_hasta timestamptz
) RETURNS TABLE (inicio timestamptz, fin timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR (v_actor IS NOT NULL AND v_actor = p_vendedor_id)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.comprador_id = v_actor
        AND l.vendedor_id = p_vendedor_id
        AND l.estado = 'aceptado'
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT f.inicio, f.inicio + interval '60 minutes'
  FROM public.franjas_candidatas(p_vendedor_id, p_desde, p_hasta) AS f
  WHERE NOT EXISTS (
    SELECT 1 FROM public.citas c
    WHERE c.vendedor_id = p_vendedor_id
      AND c.estado = 'confirmada'
      AND c.rango && tstzrange(f.inicio, f.inicio + interval '60 minutes', '[)')
  )
  ORDER BY f.inicio;
END $$;

-- ----------------------------------------------------------------------------
-- Permisos. pg_default_acl de este proyecto concede EXECUTE explicito a anon,
-- authenticated y service_role sobre toda funcion nueva de public: revocar de
-- PUBLIC no se lo quita. Se nombra a cada rol, con la firma exacta.
--
-- Las internas no las ejecuta nadie mas que su dueno: franjas_libres y las
-- funciones de escritura son SECURITY DEFINER del mismo dueno, y dentro de
-- ellas el chequeo de EXECUTE se hace contra ese dueno.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.franjas_candidatas(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.franja_valida(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.franjas_libres(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.franjas_libres(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;
```

- [ ] **Paso 5: aplicar y verificar los privilegios de ejecución.**

```powershell
npx supabase db reset
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS ejecuta FROM pg_proc p CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname) WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('franjas_candidatas','franja_valida','franjas_libres') ORDER BY 1, 2;"
```

Esperado: `franjas_candidatas` y `franja_valida` en `f` para los tres roles; `franjas_libres` en `f` para `anon` y `t` para `authenticated` y `service_role`.

- [ ] **Paso 6: correr la prueba y ver que pasa.**

```powershell
npx vitest run tests/rls/franjas-libres.test.ts
npm run test:rls
```

Esperado: 5 verdes; suite en `N_rls_antes + 5`.

- [ ] **Paso 7: falsificación, quitar el `AT TIME ZONE`.** Siguiendo la convención de falsificar una migración, en `20260915000300_franjas.sql` sustituir:

```sql
      ((dias.fecha + d.hora_inicio) + make_interval(hours => h.desplazamiento))
        AT TIME ZONE 'America/Bogota' AS inicio
```

por (el `::timestamptz` es para que la función compile y devuelva la hora sin convertir, no un error de tipos):

```sql
      ((dias.fecha + d.hora_inicio) + make_interval(hours => h.desplazamiento))::timestamptz AS inicio
```

Correr `-t "jueves 15:00-16:00"`. Esperado: ROJO en `expect(inicio.getUTCHours()).toBe(20)`, recibiendo `15`. Restaurar, resetear, VERDE.

- [ ] **Paso 8: falsificación, invertir la dirección.** Sustituir las mismas dos líneas por:

```sql
      (((dias.fecha + d.hora_inicio) + make_interval(hours => h.desplazamiento))::timestamptz
        AT TIME ZONE 'America/Bogota')::timestamptz AS inicio
```

Correr `-t "jueves 15:00-16:00"`. Esperado: ROJO recibiendo `10`. Restaurar, resetear, VERDE.

- [ ] **Paso 9: falsificación, quitar el límite inferior del horizonte.** Sustituir:

```sql
  WHERE generadas.inicio >= now() + interval '2 hours'
    AND generadas.inicio <= now() + interval '14 days'
```

por:

```sql
  WHERE generadas.inicio <= now() + interval '14 days'
```

Correr `-t "no ofrece nada antes"`. Esperado: ROJO en `expect(primera).toBeGreaterThanOrEqual(antes + 2 * HORA_MS)`: aparecen las horas de hoy anteriores a `now() + 2 h`. Restaurar, resetear, VERDE.

- [ ] **Paso 10: falsificación, quitar el límite superior.** Sustituir las mismas dos líneas por:

```sql
  WHERE generadas.inicio >= now() + interval '2 hours'
```

Correr `-t "no ofrece nada antes"`. Esperado: ROJO en `expect(ultima).toBeLessThanOrEqual(despues + 14 * DIA_MS)`: aparecen franjas del día 15. Restaurar, resetear, VERDE.

- [ ] **Paso 11: falsificación, quitar el filtro de fechas bloqueadas.** Sustituir:

```sql
    WHERE NOT EXISTS (
      SELECT 1 FROM public.fechas_bloqueadas b
      WHERE b.vendedor_id = p_vendedor_id
        AND dias.fecha BETWEEN b.desde AND b.hasta
    )
  )
```

por:

```sql
  )
```

Correr `-t "una fecha bloqueada"`. Esperado: ROJO en `expect(dias).not.toContain(bloqueada)`. Restaurar, resetear, VERDE.

- [ ] **Paso 12: falsificación, quitar la exigencia de lead aceptado.** Sustituir:

```sql
        AND l.vendedor_id = p_vendedor_id
        AND l.estado = 'aceptado'
```

por:

```sql
        AND l.vendedor_id = p_vendedor_id
```

Correr `-t "solo la ven"`. Esperado: ROJO en la aserción del comprador `nuevo`, que recibe franjas. Restaurar, resetear, VERDE.

- [ ] **Paso 13: falsificación, quitar el filtro por vendedor del lead.** Sustituir:

```sql
        AND l.vendedor_id = p_vendedor_id
        AND l.estado = 'aceptado'
```

por:

```sql
        AND l.estado = 'aceptado'
```

Correr `-t "solo la ven"`. Esperado: ROJO en la aserción de `aceptadoDeOtro`, con un lead aceptado de OTRO vendedor. Restaurar, resetear, VERDE.

- [ ] **Paso 14: commit.**

```bash
$G add supabase/migrations/20260915000300_franjas.sql tests/rls/franjas-libres.test.ts
$G commit -m "feat(db): franjas libres calculadas en hora de Bogota con horizonte de 2 h a 14 dias

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 4: Reservar una visita

**Files:**
- Create: `supabase/migrations/20260915000400_reservar_cita.sql`
- Modify: `tests/rls/ayudantes-citas.ts`
- Test: `tests/rls/reservar-cita.test.ts`

**Interfaces:**
- Consumes: `public.franja_valida(uuid, timestamptz)` (Tarea 3); `public.registrar_evento_auditoria(text, text, uuid, uuid, jsonb, inet)` en su versión vigente de `20260831000700` (única definición en main, comprobado con `git grep`); `public.leads`, `public.citas`.
- Produces:
  - `public.reservar_cita_como(p_lead_id uuid, p_inicio timestamptz, p_actor uuid) RETURNS uuid` — solo `service_role`
  - `public.reservar_cita(p_lead_id uuid, p_inicio timestamptz) RETURNS uuid` — `authenticated` y `service_role`
  - SQLSTATE `42501`, `VS001`, `VS002`, `VS003`, `VS004`, `VS005`; evento `cita_reservada`
  - En `tests/rls/ayudantes-citas.ts`:
    - `franjasDe(vendedorId: string): Promise<string[]>`
    - `escenarioReserva(): Promise<{ vendedor: { id: string; correo: string; propiedadId: string }; comprador: { id: string; correo: string; leadId: string }; franjas: string[] }>`
    - `reservarComo(correo: string, leadId: string, inicio: string): Promise<{ data: unknown; error: { code: string } | null }>`
    - `inicioDeCita(citaId: string): Promise<number>`

- [ ] **Paso 1: medir `N_rls_antes`.**

```powershell
npm run test:rls
```

- [ ] **Paso 2: añadir los ayudantes.** Al final de `tests/rls/ayudantes-citas.ts`:

```ts
/** Franjas libres vistas por service_role (autorizado en franjas_libres), como ISO. */
export async function franjasDe(vendedorId: string): Promise<string[]> {
  const { data, error } = await clienteAdmin().rpc('franjas_libres', {
    p_vendedor_id: vendedorId, p_desde: '-infinity', p_hasta: 'infinity',
  })
  if (error) throw error
  return ((data ?? []) as { inicio: string }[]).map((f) => f.inicio)
}

/** Vendedor con horario completo, un comprador con lead aceptado y las franjas libres de partida. */
export async function escenarioReserva() {
  const vendedor = await crearVendedorConPropiedad()
  await definirHorarioCompleto(vendedor.id)
  const comprador = await crearCompradorConLead(vendedor, 'aceptado')
  const franjas = await franjasDe(vendedor.id)
  if (franjas.length < 10) throw new Error('El escenario de reserva necesita al menos 10 franjas libres')
  return { vendedor, comprador, franjas }
}

export async function reservarComo(correo: string, leadId: string, inicio: string) {
  return (await comoUsuario(correo)).rpc('reservar_cita', { p_lead_id: leadId, p_inicio: inicio })
}

/** lower(rango) leido de la base, en milisegundos. */
export async function inicioDeCita(citaId: string): Promise<number> {
  const [fila] = await consultar<{ inicio: Date }>(
    'SELECT lower(rango) AS inicio FROM public.citas WHERE id = $1', [citaId],
  )
  if (!fila) throw new Error(`La cita ${citaId} no existe`)
  return fila.inicio.getTime()
}
```

- [ ] **Paso 3: escribir la prueba que falla.** Crear `tests/rls/reservar-cita.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo } from './ayudantes'
import {
  HORA_MS, bloquearFecha, comoUsuario, crearCompradorConLead, crearVendedorConPropiedad,
  definirHorario, escenarioReserva, fechaDeBogota, franjasDe, inicioDeCita, reservarComo,
} from './ayudantes-citas'

const ms = (iso: string) => new Date(iso).getTime()

describe('reservar_cita', () => {
  it('reserva una franja libre, deriva propiedad, comprador y vendedor del lead, y la franja deja de ofrecerse', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()

    const { data: citaId, error } = await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)
    expect(error).toBeNull()
    expect(citaId).toBeTruthy()

    const { data: cita } = await clienteAdmin().from('citas')
      .select('lead_id,propiedad_id,comprador_id,vendedor_id,estado,cancelada_por')
      .eq('id', citaId as string).single()
    expect(cita).toEqual({
      lead_id: comprador.leadId, propiedad_id: vendedor.propiedadId, comprador_id: comprador.id,
      vendedor_id: vendedor.id, estado: 'confirmada', cancelada_por: null,
    })
    expect(await inicioDeCita(citaId as string)).toBe(ms(franjas[0]!))

    const libres = (await franjasDe(vendedor.id)).map(ms)
    expect(libres).not.toContain(ms(franjas[0]!))
    expect(libres).toContain(ms(franjas[1]!))
  })

  it('sin sesion recibe 42501, y sin actor tambien', async () => {
    const { comprador, franjas } = await escenarioReserva()

    const anonimo = await clienteAnonimo().rpc('reservar_cita', { p_lead_id: comprador.leadId, p_inicio: franjas[0] })
    expect(anonimo.error?.code).toBe('42501')

    // service_role tiene EXECUTE sobre la variante corta, pero auth.uid() es
    // nulo: es exactamente el paso 1 de la funcion, "sin actor".
    const sinActor = await clienteAdmin().rpc('reservar_cita', { p_lead_id: comprador.leadId, p_inicio: franjas[0] })
    expect(sinActor.error?.code).toBe('42501')

    expect((await clienteAdmin().from('citas').select('id').eq('lead_id', comprador.leadId)).data).toEqual([])
  })

  it('VS001: el lead no existe', async () => {
    const { comprador, franjas } = await escenarioReserva()
    const intento = await reservarComo(comprador.correo, randomUUID(), franjas[0]!)
    expect(intento.error?.code).toBe('VS001')
  })

  it('VS002: ni un comprador ajeno ni el vendedor reservan sobre un lead que no es suyo', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const otroVendedor = await crearVendedorConPropiedad()
    const ajeno = await crearCompradorConLead(otroVendedor, 'aceptado')

    expect((await reservarComo(ajeno.correo, comprador.leadId, franjas[0]!)).error?.code).toBe('VS002')
    expect((await reservarComo(vendedor.correo, comprador.leadId, franjas[0]!)).error?.code).toBe('VS002')
    expect((await clienteAdmin().from('citas').select('id').eq('lead_id', comprador.leadId)).data).toEqual([])

    // Positivo: el comprador del lead si reserva esa misma franja.
    expect((await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)).error).toBeNull()
  })

  it('VS003: no se reserva sobre un lead nuevo ni descartado', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const nuevo = await crearCompradorConLead(vendedor, 'nuevo')
    const descartado = await crearCompradorConLead(vendedor, 'descartado')

    expect((await reservarComo(nuevo.correo, nuevo.leadId, franjas[0]!)).error?.code).toBe('VS003')
    expect((await reservarComo(descartado.correo, descartado.leadId, franjas[0]!)).error?.code).toBe('VS003')

    // Positivo: un lead aceptado del mismo vendedor, misma franja.
    expect((await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)).error).toBeNull()
  })

  it('VS004: franja fuera del horario, que no empieza en punto, fuera del horizonte o en fecha bloqueada', async () => {
    const vendedor = await crearVendedorConPropiedad()
    // Solo de 08:00 a 09:00 cada dia: todas las franjas validas son las 08:00 de Bogota.
    await definirHorario(
      vendedor.id,
      [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia_semana: dia, hora_inicio: '08:00', hora_fin: '09:00' })),
    )
    const comprador = await crearCompradorConLead(vendedor, 'aceptado')
    const franjas = await franjasDe(vendedor.id)
    const primera = ms(franjas[0]!)
    const ultima = ms(franjas[franjas.length - 1]!)

    await bloquearFecha(vendedor.id, fechaDeBogota(new Date(ms(franjas[3]!))))

    const invalidas = [
      new Date(primera + HORA_MS),             // 09:00: en punto y en horizonte, fuera del horario
      new Date(primera + 30 * 60 * 1000),      // 08:30: no empieza en punto
      new Date(primera - 24 * HORA_MS),        // 08:00 del dia anterior a la primera: antes de now() + 2 h
      new Date(ultima + 24 * HORA_MS),         // 08:00 del dia siguiente a la ultima: pasado now() + 14 dias
      new Date(ms(franjas[3]!)),               // en fecha bloqueada
    ]
    for (const inicio of invalidas) {
      const intento = await reservarComo(comprador.correo, comprador.leadId, inicio.toISOString())
      expect(intento.error?.code).toBe('VS004')
    }
    expect((await clienteAdmin().from('citas').select('id').eq('lead_id', comprador.leadId)).data).toEqual([])

    // Positivo: una franja ofrecida y no bloqueada entra.
    expect((await reservarComo(comprador.correo, comprador.leadId, franjas[1]!)).error).toBeNull()
  })

  it('VS005: un lead no tiene dos visitas confirmadas a la vez', async () => {
    const { comprador, franjas } = await escenarioReserva()

    const primera = await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)
    expect(primera.error).toBeNull()

    const segunda = await reservarComo(comprador.correo, comprador.leadId, franjas[5]!)
    expect(segunda.error?.code).toBe('VS005')

    const { data } = await clienteAdmin().from('citas').select('id').eq('lead_id', comprador.leadId)
    expect(data).toEqual([{ id: primera.data }])
  })

  it('doble reserva simultanea de la misma franja: gana exactamente una y la otra recibe VS004', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const rival = await crearCompradorConLead(vendedor, 'aceptado')
    // Las sesiones se abren ANTES, para que las dos llamadas salgan a la vez.
    const [clienteUno, clienteDos] = await Promise.all([comoUsuario(comprador.correo), comoUsuario(rival.correo)])
    const franja = franjas[0]!

    const resultados = await Promise.all([
      clienteUno.rpc('reservar_cita', { p_lead_id: comprador.leadId, p_inicio: franja }),
      clienteDos.rpc('reservar_cita', { p_lead_id: rival.leadId, p_inicio: franja }),
    ])

    const ganadoras = resultados.filter((r) => r.error === null)
    const perdedoras = resultados.filter((r) => r.error !== null)
    expect(ganadoras).toHaveLength(1)
    // VS004 y no 23P01: la funcion captura la exclusion y la traduce.
    expect(perdedoras.map((r) => r.error?.code)).toEqual(['VS004'])

    const { data } = await clienteAdmin().from('citas')
      .select('id').eq('vendedor_id', vendedor.id).eq('estado', 'confirmada')
    expect(data).toHaveLength(1)
  })

  it('registra cita_reservada en registro_auditoria', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const { data: citaId, error } = await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)
    expect(error).toBeNull()

    const { data: evento, error: errorEvento } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id,accion,metadatos')
      .eq('entidad', 'cita').eq('entidad_id', citaId as string).single()
    expect(errorEvento).toBeNull()
    expect(evento?.accion).toBe('cita_reservada')
    expect(evento?.actor_id).toBe(comprador.id)
    expect(evento?.metadatos?.lead_id).toBe(comprador.leadId)
    expect(evento?.metadatos?.vendedor_id).toBe(vendedor.id)
    expect(ms(evento?.metadatos?.inicio as string)).toBe(ms(franjas[0]!))
  })
})
```

- [ ] **Paso 4: correrla y ver que falla.**

```powershell
npx vitest run tests/rls/reservar-cita.test.ts
```

Esperado: ROJO en las 9 (PGRST202, la función no existe).

- [ ] **Paso 5: escribir la migración.** Crear `supabase/migrations/20260915000400_reservar_cita.sql`:

```sql
-- ============================================================================
-- SP5: reservar una visita. Mismo patron de escritura que crear_lead()
-- (20260911000400): nadie tiene INSERT sobre citas, y la fila la escribe una
-- funcion SECURITY DEFINER que deriva del lead todo lo que no debe venir del
-- cliente -- propiedad_id, comprador_id y vendedor_id NUNCA son parametros.
--
-- DOS NIVELES, y esa separacion es la costura con SP6:
--   reservar_cita_como(lead, inicio, actor)  solo service_role. Logica completa.
--   reservar_cita(lead, inicio)              authenticated. actor = auth.uid().
-- Un agente de SP6 reservara en nombre de un comprador con la _como, sin tocar
-- SP5. Y es el mayor riesgo de SP5: si authenticated pudiera ejecutar la _como,
-- cualquiera reservaria en nombre de cualquiera pasando otro p_actor. Su
-- privilegio tiene prueba y falsificacion propias (Tarea 7).
--
-- Codigos, clase VS (rango de la implementacion: clases que empiezan por I-Z;
-- Postgres no usa ninguna que empiece por V):
--   42501 sin actor
--   VS001 el lead no existe
--   VS002 el actor no es el comprador del lead
--   VS003 el lead no esta aceptado
--   VS004 franja no valida, o ganada por otra reserva simultanea (23P01)
--   VS005 ya hay una visita confirmada para ese lead (23505)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reservar_cita_como(
  p_lead_id uuid, p_inicio timestamptz, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_cita uuid;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesion para reservar una visita' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud no existe' USING ERRCODE = 'VS001';
  END IF;

  IF v_lead.comprador_id <> p_actor THEN
    RAISE EXCEPTION 'No participas en esta solicitud' USING ERRCODE = 'VS002';
  END IF;

  IF v_lead.estado <> 'aceptado' THEN
    RAISE EXCEPTION 'La solicitud no esta aceptada' USING ERRCODE = 'VS003';
  END IF;

  -- Disponibilidad, bloqueo, horizonte y "en punto", en un solo sitio
  -- (20260915000300). La ocupacion NO se mira aqui: la hace cumplir la
  -- exclusion al insertar, que es lo unico que aguanta dos reservas a la vez.
  IF NOT public.franja_valida(v_lead.vendedor_id, p_inicio) THEN
    RAISE EXCEPTION 'La franja no es valida' USING ERRCODE = 'VS004';
  END IF;

  BEGIN
    INSERT INTO public.citas (lead_id, propiedad_id, comprador_id, vendedor_id, rango)
    VALUES (
      v_lead.id, v_lead.propiedad_id, v_lead.comprador_id, v_lead.vendedor_id,
      tstzrange(p_inicio, p_inicio + interval '60 minutes', '[)')
    )
    RETURNING id INTO v_cita;
  EXCEPTION
    WHEN exclusion_violation THEN
      -- Otra reserva simultanea gano la franja. Para quien reserva es lo mismo
      -- que una lista vieja: VS004.
      RAISE EXCEPTION 'La franja ya esta ocupada' USING ERRCODE = 'VS004';
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Ya hay una visita confirmada para esta solicitud' USING ERRCODE = 'VS005';
  END;

  PERFORM public.registrar_evento_auditoria(
    'cita_reservada',
    'cita',
    v_cita,
    p_actor,
    jsonb_build_object(
      'lead_id', v_lead.id,
      'propiedad_id', v_lead.propiedad_id,
      'vendedor_id', v_lead.vendedor_id,
      'inicio', p_inicio
    )
  );

  RETURN v_cita;
END $$;

-- SECURITY DEFINER tambien: asi puede ejecutar la _como, que authenticated no
-- puede. auth.uid() sigue leyendo el JWT de la peticion dentro de una funcion
-- SECURITY DEFINER (crear_lead lo usa igual).
CREATE OR REPLACE FUNCTION public.reservar_cita(p_lead_id uuid, p_inicio timestamptz)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN public.reservar_cita_como(p_lead_id, p_inicio, auth.uid());
END $$;

-- pg_default_acl concede EXECUTE explicito a anon, authenticated y
-- service_role en toda funcion nueva de public: se nombra a cada uno.
REVOKE EXECUTE ON FUNCTION public.reservar_cita_como(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_cita_como(uuid, timestamptz, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reservar_cita(uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_cita(uuid, timestamptz)
  TO authenticated, service_role;
```

- [ ] **Paso 6: aplicar y correr la prueba.**

```powershell
npx supabase db reset
npx vitest run tests/rls/reservar-cita.test.ts
npm run test:rls
```

Esperado: 9 verdes; suite en `N_rls_antes + 9`.

- [ ] **Paso 7: falsificación, quitar la comprobación de actor.** En `20260915000400_reservar_cita.sql` (convención de falsificar una migración), borrar:

```sql
  IF v_lead.comprador_id <> p_actor THEN
    RAISE EXCEPTION 'No participas en esta solicitud' USING ERRCODE = 'VS002';
  END IF;
```

Correr `-t "VS002"`. Esperado: ROJO en la primera aserción: el comprador ajeno reserva sobre el lead de otro (error `null`). Restaurar, resetear, VERDE.

- [ ] **Paso 8: falsificación, quitar la validación de franja.** Borrar:

```sql
  IF NOT public.franja_valida(v_lead.vendedor_id, p_inicio) THEN
    RAISE EXCEPTION 'La franja no es valida' USING ERRCODE = 'VS004';
  END IF;
```

Correr `-t "VS004"`. Esperado: ROJO en la primera iteración: la franja de las 09:00 se inserta (error `null`). Restaurar, resetear, VERDE.

- [ ] **Paso 9: falsificación, quitar la exclusión.** `20260915000100_citas_esquema.sql` ya está commiteada: se edita y se restaura desde `HEAD`. Sustituir:

```sql
  CONSTRAINT citas_rango_60_minutos CHECK (upper(rango) - lower(rango) = interval '60 minutes'),
  CONSTRAINT citas_sin_solape_por_vendedor
    EXCLUDE USING gist (vendedor_id WITH =, rango WITH &&)
    WHERE (estado = 'confirmada')
);
```

por:

```sql
  CONSTRAINT citas_rango_60_minutos CHECK (upper(rango) - lower(rango) = interval '60 minutes')
);
```

Resetear y correr `-t "doble reserva simultanea"`. Esperado: ROJO en `expect(ganadoras).toHaveLength(1)`, con 2: pasan las dos. `git checkout -- supabase/migrations/20260915000100_citas_esquema.sql`, `git diff --exit-code`, resetear, VERDE.

- [ ] **Paso 10: falsificación, quitar la traducción de `23P01`.** En `20260915000400_reservar_cita.sql`, borrar:

```sql
    WHEN exclusion_violation THEN
      -- Otra reserva simultanea gano la franja. Para quien reserva es lo mismo
      -- que una lista vieja: VS004.
      RAISE EXCEPTION 'La franja ya esta ocupada' USING ERRCODE = 'VS004';
```

Correr `-t "doble reserva simultanea"`. Esperado: ROJO en `toEqual(['VS004'])`, recibiendo `['23P01']`. Restaurar, resetear, VERDE.

- [ ] **Paso 11: falsificación, quitar la traducción de `23505`.** Borrar:

```sql
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Ya hay una visita confirmada para esta solicitud' USING ERRCODE = 'VS005';
```

Correr `-t "VS005"`. Esperado: ROJO recibiendo `23505`. Restaurar, resetear, VERDE.

- [ ] **Paso 12: commit.**

```bash
$G add supabase/migrations/20260915000400_reservar_cita.sql tests/rls/ayudantes-citas.ts tests/rls/reservar-cita.test.ts
$G commit -m "feat(db): reservar_cita y reservar_cita_como con codigos VS y exclusion traducida

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 5: Cancelar una visita

**Files:**
- Create: `supabase/migrations/20260915000500_cancelar_cita.sql`
- Modify: `tests/rls/ayudantes-citas.ts`
- Test: `tests/rls/cancelar-cita.test.ts`

**Interfaces:**
- Consumes: `public.citas`; `public.registrar_evento_auditoria(text, text, uuid, uuid, jsonb, inet)`; `escenarioReserva`, `reservarComo`, `franjasDe`, `insertarCitaDirecta`, `ahoraDeLaBase` (Tareas 1 a 4).
- Produces:
  - `public.cancelar_cita_como(p_cita_id uuid, p_actor uuid) RETURNS void` — solo `service_role`
  - `public.cancelar_cita(p_cita_id uuid) RETURNS void` — `authenticated` y `service_role`
  - SQLSTATE `42501`, `VS002`, `VS006`, `VS007`, `VS008`; evento `cita_cancelada`
  - En `tests/rls/ayudantes-citas.ts`:
    - `escenarioConCita(): Promise<{ vendedor: { id: string; correo: string; propiedadId: string }; comprador: { id: string; correo: string; leadId: string }; franjas: string[]; citaId: string }>`
    - `cancelarComo(correo: string, citaId: string): Promise<{ data: unknown; error: { code: string } | null }>`

- [ ] **Paso 1: medir `N_rls_antes`.**

```powershell
npm run test:rls
```

- [ ] **Paso 2: añadir los ayudantes.** Al final de `tests/rls/ayudantes-citas.ts`:

```ts
/** escenarioReserva() mas una visita reservada POR LA FUNCION en la primera franja. */
export async function escenarioConCita() {
  const escenario = await escenarioReserva()
  const { data, error } = await reservarComo(
    escenario.comprador.correo, escenario.comprador.leadId, escenario.franjas[0]!,
  )
  if (error) throw error
  return { ...escenario, citaId: data as string }
}

export async function cancelarComo(correo: string, citaId: string) {
  return (await comoUsuario(correo)).rpc('cancelar_cita', { p_cita_id: citaId })
}
```

- [ ] **Paso 3: escribir la prueba que falla.** Crear `tests/rls/cancelar-cita.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin } from './ayudantes'
import {
  ahoraDeLaBase, cancelarComo, crearCompradorConLead, crearVendedorConPropiedad,
  escenarioConCita, escenarioReserva, franjasDe, insertarCitaDirecta, reservarComo,
} from './ayudantes-citas'

const ms = (iso: string) => new Date(iso).getTime()

async function estadoDe(citaId: string) {
  const { data } = await clienteAdmin().from('citas').select('estado,cancelada_por').eq('id', citaId).single()
  return data
}

describe('cancelar_cita', () => {
  it('el comprador cancela: queda cancelada por el, la franja se libera y el lead puede reservar otra vez', async () => {
    const { vendedor, comprador, franjas, citaId } = await escenarioConCita()

    const cancelar = await cancelarComo(comprador.correo, citaId)
    expect(cancelar.error).toBeNull()
    expect(await estadoDe(citaId)).toEqual({ estado: 'cancelada', cancelada_por: comprador.id })

    expect((await franjasDe(vendedor.id)).map(ms)).toContain(ms(franjas[0]!))
    expect((await reservarComo(comprador.correo, comprador.leadId, franjas[0]!)).error).toBeNull()
  })

  it('el vendedor tambien cancela', async () => {
    const { vendedor, citaId } = await escenarioConCita()
    expect((await cancelarComo(vendedor.correo, citaId)).error).toBeNull()
    expect(await estadoDe(citaId)).toEqual({ estado: 'cancelada', cancelada_por: vendedor.id })
  })

  it('VS006: la visita no existe', async () => {
    const { comprador } = await escenarioConCita()
    expect((await cancelarComo(comprador.correo, randomUUID())).error?.code).toBe('VS006')
  })

  it('VS002: ni un comprador ajeno ni un vendedor ajeno cancelan una visita que no es suya', async () => {
    const { comprador, citaId } = await escenarioConCita()
    const otroVendedor = await crearVendedorConPropiedad()
    const compradorAjeno = await crearCompradorConLead(otroVendedor, 'aceptado')

    expect((await cancelarComo(compradorAjeno.correo, citaId)).error?.code).toBe('VS002')
    expect((await cancelarComo(otroVendedor.correo, citaId)).error?.code).toBe('VS002')
    expect(await estadoDe(citaId)).toEqual({ estado: 'confirmada', cancelada_por: null })

    // Positivo: el comprador de la visita si la cancela.
    expect((await cancelarComo(comprador.correo, citaId)).error).toBeNull()
  })

  it('VS007: una visita ya cancelada no se vuelve a cancelar', async () => {
    const { comprador, vendedor, citaId } = await escenarioConCita()
    expect((await cancelarComo(comprador.correo, citaId)).error).toBeNull()
    expect((await cancelarComo(vendedor.correo, citaId)).error?.code).toBe('VS007')
    expect(await estadoDe(citaId)).toEqual({ estado: 'cancelada', cancelada_por: comprador.id })
  })

  it('VS008: una visita que ya empezo no se cancela', async () => {
    const { vendedor, comprador } = await escenarioReserva()
    const ahora = await ahoraDeLaBase()
    // Uso (a) de insertarCitaDirecta: reservar_cita no crea visitas empezadas.
    const citaId = await insertarCitaDirecta({
      leadId: comprador.leadId, propiedadId: vendedor.propiedadId, compradorId: comprador.id,
      vendedorId: vendedor.id, inicio: new Date(ahora.getTime() - 30 * 60 * 1000),
    })

    expect((await cancelarComo(comprador.correo, citaId)).error?.code).toBe('VS008')
    expect((await cancelarComo(vendedor.correo, citaId)).error?.code).toBe('VS008')
    expect(await estadoDe(citaId)).toEqual({ estado: 'confirmada', cancelada_por: null })
  })

  it('registra cita_cancelada en registro_auditoria', async () => {
    const { vendedor, comprador, franjas, citaId } = await escenarioConCita()
    expect((await cancelarComo(vendedor.correo, citaId)).error).toBeNull()

    const { data: evento, error } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id,metadatos')
      .eq('entidad', 'cita').eq('entidad_id', citaId).eq('accion', 'cita_cancelada').single()
    expect(error).toBeNull()
    expect(evento?.actor_id).toBe(vendedor.id)
    expect(evento?.metadatos?.lead_id).toBe(comprador.leadId)
    expect(ms(evento?.metadatos?.inicio as string)).toBe(ms(franjas[0]!))
  })
})
```

- [ ] **Paso 4: correrla y ver que falla.**

```powershell
npx vitest run tests/rls/cancelar-cita.test.ts
```

Esperado: ROJO en las 7 (PGRST202).

- [ ] **Paso 5: escribir la migración.** Crear `supabase/migrations/20260915000500_cancelar_cita.sql`:

```sql
-- ============================================================================
-- SP5: cancelar una visita. Comprador y vendedor, simetrico.
--
--   42501 sin actor
--   VS006 la visita no existe
--   VS002 el actor no es ni el comprador ni el vendedor de la visita
--   VS007 ya estaba cancelada
--   VS008 ya empezo
--
-- FOR UPDATE: bloquea la fila frente a un mover o un cancelar simultaneos.
-- Sin el, dos cancelaciones podrian leer 'confirmada' a la vez y auditar dos
-- veces.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancelar_cita_como(p_cita_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cita public.citas%ROWTYPE;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesion para cancelar una visita' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cita FROM public.citas WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La visita no existe' USING ERRCODE = 'VS006';
  END IF;

  IF p_actor <> v_cita.comprador_id AND p_actor <> v_cita.vendedor_id THEN
    RAISE EXCEPTION 'No participas en esta visita' USING ERRCODE = 'VS002';
  END IF;

  IF v_cita.estado = 'cancelada' THEN
    RAISE EXCEPTION 'La visita ya estaba cancelada' USING ERRCODE = 'VS007';
  END IF;

  IF now() >= lower(v_cita.rango) THEN
    RAISE EXCEPTION 'La visita ya empezo' USING ERRCODE = 'VS008';
  END IF;

  UPDATE public.citas
     SET estado = 'cancelada', cancelada_por = p_actor, actualizado_en = now()
   WHERE id = p_cita_id;

  PERFORM public.registrar_evento_auditoria(
    'cita_cancelada',
    'cita',
    p_cita_id,
    p_actor,
    jsonb_build_object(
      'lead_id', v_cita.lead_id,
      'inicio', lower(v_cita.rango),
      'fin', upper(v_cita.rango)
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.cancelar_cita(p_cita_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.cancelar_cita_como(p_cita_id, auth.uid());
END $$;

REVOKE EXECUTE ON FUNCTION public.cancelar_cita_como(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_cita_como(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cancelar_cita(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_cita(uuid)
  TO authenticated, service_role;
```

- [ ] **Paso 6: aplicar y correr la prueba.**

```powershell
npx supabase db reset
npx vitest run tests/rls/cancelar-cita.test.ts
npm run test:rls
```

Esperado: 7 verdes; suite en `N_rls_antes + 7`.

- [ ] **Paso 7: falsificación, quitar la comprobación de actor.** Borrar de `20260915000500_cancelar_cita.sql`:

```sql
  IF p_actor <> v_cita.comprador_id AND p_actor <> v_cita.vendedor_id THEN
    RAISE EXCEPTION 'No participas en esta visita' USING ERRCODE = 'VS002';
  END IF;
```

Correr `-t "VS002"`. Esperado: ROJO en la primera aserción: el comprador ajeno cancela (error `null`). Restaurar, resetear, VERDE.

- [ ] **Paso 8: falsificación, quitar la comprobación de visita empezada.** Borrar:

```sql
  IF now() >= lower(v_cita.rango) THEN
    RAISE EXCEPTION 'La visita ya empezo' USING ERRCODE = 'VS008';
  END IF;
```

Correr `-t "VS008"`. Esperado: ROJO: la cancelación de la visita empezada devuelve error `null`. Restaurar, resetear, VERDE.

- [ ] **Paso 9: commit.**

```bash
$G add supabase/migrations/20260915000500_cancelar_cita.sql tests/rls/ayudantes-citas.ts tests/rls/cancelar-cita.test.ts
$G commit -m "feat(db): cancelar_cita y cancelar_cita_como para comprador y vendedor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 6: Mover una visita

**Files:**
- Create: `supabase/migrations/20260915000600_mover_cita.sql`
- Modify: `tests/rls/ayudantes-citas.ts`
- Test: `tests/rls/mover-cita.test.ts`

**Interfaces:**
- Consumes: `public.franja_valida(uuid, timestamptz)`; `public.registrar_evento_auditoria(text, text, uuid, uuid, jsonb, inet)`; `escenarioConCita`, `escenarioReserva`, `reservarComo`, `cancelarComo`, `franjasDe`, `inicioDeCita`, `insertarCitaDirecta`, `ahoraDeLaBase` (Tareas 1 a 5).
- Produces:
  - `public.mover_cita_como(p_cita_id uuid, p_nuevo_inicio timestamptz, p_actor uuid) RETURNS void` — solo `service_role`
  - `public.mover_cita(p_cita_id uuid, p_nuevo_inicio timestamptz) RETURNS void` — `authenticated` y `service_role`
  - SQLSTATE `42501`, `VS002`, `VS004`, `VS006`, `VS007`, `VS008`; evento `cita_movida` con `metadatos.rango_anterior` y `metadatos.rango_nuevo`, cada uno `{ inicio, fin }`
  - En `tests/rls/ayudantes-citas.ts`: `moverComo(correo: string, citaId: string, inicio: string): Promise<{ data: unknown; error: { code: string } | null }>`

- [ ] **Paso 1: medir `N_rls_antes`.**

```powershell
npm run test:rls
```

- [ ] **Paso 2: añadir el ayudante.** Al final de `tests/rls/ayudantes-citas.ts`:

```ts
export async function moverComo(correo: string, citaId: string, inicio: string) {
  return (await comoUsuario(correo)).rpc('mover_cita', { p_cita_id: citaId, p_nuevo_inicio: inicio })
}
```

- [ ] **Paso 3: escribir la prueba que falla.** Crear `tests/rls/mover-cita.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin } from './ayudantes'
import {
  ahoraDeLaBase, cancelarComo, crearCompradorConLead, crearVendedorConPropiedad, escenarioConCita,
  escenarioReserva, franjasDe, inicioDeCita, insertarCitaDirecta, moverComo, reservarComo,
} from './ayudantes-citas'

const ms = (iso: string) => new Date(iso).getTime()

describe('mover_cita', () => {
  it('el comprador mueve su visita: la franja nueva se ocupa y la vieja se libera', async () => {
    const { vendedor, comprador, franjas, citaId } = await escenarioConCita()

    const mover = await moverComo(comprador.correo, citaId, franjas[2]!)
    expect(mover.error).toBeNull()
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[2]!))

    const libres = (await franjasDe(vendedor.id)).map(ms)
    expect(libres).toContain(ms(franjas[0]!))
    expect(libres).not.toContain(ms(franjas[2]!))
  })

  it('el vendedor tambien la mueve', async () => {
    const { vendedor, franjas, citaId } = await escenarioConCita()
    expect((await moverComo(vendedor.correo, citaId, franjas[3]!)).error).toBeNull()
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[3]!))
  })

  it('mover es atomico: a una franja ocupada falla con VS004 y la original sigue ocupada', async () => {
    const { vendedor, comprador, franjas, citaId } = await escenarioConCita()
    const rival = await crearCompradorConLead(vendedor, 'aceptado')
    expect((await reservarComo(rival.correo, rival.leadId, franjas[2]!)).error).toBeNull()

    const mover = await moverComo(comprador.correo, citaId, franjas[2]!)
    expect(mover.error?.code).toBe('VS004')

    // La original no se solto: sigue en su franja, confirmada, y no se ofrece.
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))
    const { data } = await clienteAdmin().from('citas').select('estado').eq('id', citaId).single()
    expect(data?.estado).toBe('confirmada')
    const libres = (await franjasDe(vendedor.id)).map(ms)
    expect(libres).not.toContain(ms(franjas[0]!))
    expect(libres).not.toContain(ms(franjas[2]!))
  })

  it('VS006: la visita no existe', async () => {
    const { comprador, franjas } = await escenarioConCita()
    expect((await moverComo(comprador.correo, randomUUID(), franjas[2]!)).error?.code).toBe('VS006')
  })

  it('VS002: ni un comprador ajeno ni un vendedor ajeno mueven una visita que no es suya', async () => {
    const { comprador, franjas, citaId } = await escenarioConCita()
    const otroVendedor = await crearVendedorConPropiedad()
    const compradorAjeno = await crearCompradorConLead(otroVendedor, 'aceptado')

    expect((await moverComo(compradorAjeno.correo, citaId, franjas[2]!)).error?.code).toBe('VS002')
    expect((await moverComo(otroVendedor.correo, citaId, franjas[2]!)).error?.code).toBe('VS002')
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))

    // Positivo: el comprador de la visita si la mueve a esa franja.
    expect((await moverComo(comprador.correo, citaId, franjas[2]!)).error).toBeNull()
  })

  it('VS007: una visita cancelada no se mueve', async () => {
    const { comprador, franjas, citaId } = await escenarioConCita()
    expect((await cancelarComo(comprador.correo, citaId)).error).toBeNull()
    expect((await moverComo(comprador.correo, citaId, franjas[2]!)).error?.code).toBe('VS007')
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))
  })

  it('VS008: una visita que ya empezo no se mueve', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const ahora = await ahoraDeLaBase()
    const inicioEmpezada = new Date(ahora.getTime() - 30 * 60 * 1000)
    // Uso (a) de insertarCitaDirecta: reservar_cita no crea visitas empezadas.
    const citaId = await insertarCitaDirecta({
      leadId: comprador.leadId, propiedadId: vendedor.propiedadId, compradorId: comprador.id,
      vendedorId: vendedor.id, inicio: inicioEmpezada,
    })

    expect((await moverComo(comprador.correo, citaId, franjas[1]!)).error?.code).toBe('VS008')
    expect((await moverComo(vendedor.correo, citaId, franjas[1]!)).error?.code).toBe('VS008')
    expect(await inicioDeCita(citaId)).toBe(inicioEmpezada.getTime())
  })

  it('VS004: la nueva franja no es valida', async () => {
    const { comprador, franjas, citaId } = await escenarioConCita()
    const mediaHora = new Date(ms(franjas[1]!) + 30 * 60 * 1000).toISOString()
    expect((await moverComo(comprador.correo, citaId, mediaHora)).error?.code).toBe('VS004')
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))
  })

  it('registra cita_movida con el rango viejo y el nuevo', async () => {
    const { comprador, franjas, citaId } = await escenarioConCita()
    expect((await moverComo(comprador.correo, citaId, franjas[2]!)).error).toBeNull()

    const { data: evento, error } = await clienteAdmin().from('registro_auditoria')
      .select('actor_id,metadatos')
      .eq('entidad', 'cita').eq('entidad_id', citaId).eq('accion', 'cita_movida').single()
    expect(error).toBeNull()
    expect(evento?.actor_id).toBe(comprador.id)
    const metadatos = evento?.metadatos as {
      rango_anterior: { inicio: string; fin: string }
      rango_nuevo: { inicio: string; fin: string }
    }
    expect(ms(metadatos.rango_anterior.inicio)).toBe(ms(franjas[0]!))
    expect(ms(metadatos.rango_nuevo.inicio)).toBe(ms(franjas[2]!))
    expect(ms(metadatos.rango_nuevo.fin) - ms(metadatos.rango_nuevo.inicio)).toBe(60 * 60 * 1000)
  })
})
```

- [ ] **Paso 4: correrla y ver que falla.**

```powershell
npx vitest run tests/rls/mover-cita.test.ts
```

Esperado: ROJO en las 9 (PGRST202).

- [ ] **Paso 5: escribir la migración.** Crear `supabase/migrations/20260915000600_mover_cita.sql`:

```sql
-- ============================================================================
-- SP5: mover una visita. Comprador y vendedor, simetrico.
--
--   42501 sin actor
--   VS006 la visita no existe
--   VS002 el actor no es ni el comprador ni el vendedor de la visita
--   VS007 la visita no esta confirmada
--   VS008 ya empezo
--   VS004 la nueva franja no es valida, o esta ocupada (23P01)
--
-- UN SOLO UPDATE del rango. Nunca hay un instante con las dos franjas ocupadas
-- ni con ninguna: si la nueva choca, el UPDATE entero falla y la fila conserva
-- su rango original. Una fila no entra en conflicto consigo misma en la
-- restriccion de exclusion, asi que mover a una franja contigua no se bloquea.
--
-- La franja nueva se valida contra el vendedor DE LA VISITA, no contra el
-- dueno actual de la propiedad (ver la seccion 13 del spec: reasignar una
-- propiedad con visitas futuras queda para SP7).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mover_cita_como(
  p_cita_id uuid, p_nuevo_inicio timestamptz, p_actor uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cita        public.citas%ROWTYPE;
  v_rango_nuevo tstzrange;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesion para mover una visita' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cita FROM public.citas WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La visita no existe' USING ERRCODE = 'VS006';
  END IF;

  IF p_actor <> v_cita.comprador_id AND p_actor <> v_cita.vendedor_id THEN
    RAISE EXCEPTION 'No participas en esta visita' USING ERRCODE = 'VS002';
  END IF;

  IF v_cita.estado <> 'confirmada' THEN
    RAISE EXCEPTION 'La visita no esta confirmada' USING ERRCODE = 'VS007';
  END IF;

  IF now() >= lower(v_cita.rango) THEN
    RAISE EXCEPTION 'La visita ya empezo' USING ERRCODE = 'VS008';
  END IF;

  IF NOT public.franja_valida(v_cita.vendedor_id, p_nuevo_inicio) THEN
    RAISE EXCEPTION 'La franja no es valida' USING ERRCODE = 'VS004';
  END IF;

  v_rango_nuevo := tstzrange(p_nuevo_inicio, p_nuevo_inicio + interval '60 minutes', '[)');

  BEGIN
    UPDATE public.citas
       SET rango = v_rango_nuevo, actualizado_en = now()
     WHERE id = p_cita_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'La franja ya esta ocupada' USING ERRCODE = 'VS004';
  END;

  PERFORM public.registrar_evento_auditoria(
    'cita_movida',
    'cita',
    p_cita_id,
    p_actor,
    jsonb_build_object(
      'lead_id', v_cita.lead_id,
      'rango_anterior', jsonb_build_object('inicio', lower(v_cita.rango), 'fin', upper(v_cita.rango)),
      'rango_nuevo',    jsonb_build_object('inicio', lower(v_rango_nuevo), 'fin', upper(v_rango_nuevo))
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.mover_cita(p_cita_id uuid, p_nuevo_inicio timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.mover_cita_como(p_cita_id, p_nuevo_inicio, auth.uid());
END $$;

REVOKE EXECUTE ON FUNCTION public.mover_cita_como(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mover_cita_como(uuid, timestamptz, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.mover_cita(uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_cita(uuid, timestamptz)
  TO authenticated, service_role;
```

- [ ] **Paso 6: aplicar y correr la prueba.**

```powershell
npx supabase db reset
npx vitest run tests/rls/mover-cita.test.ts
npm run test:rls
```

Esperado: 9 verdes; suite en `N_rls_antes + 9`.

- [ ] **Paso 7: falsificación, quitar la comprobación de actor.** Borrar de `20260915000600_mover_cita.sql`:

```sql
  IF p_actor <> v_cita.comprador_id AND p_actor <> v_cita.vendedor_id THEN
    RAISE EXCEPTION 'No participas en esta visita' USING ERRCODE = 'VS002';
  END IF;
```

Correr `-t "VS002"`. Esperado: ROJO en la primera aserción: el comprador ajeno mueve la visita. Restaurar, resetear, VERDE.

- [ ] **Paso 8: falsificación, quitar la comprobación de visita empezada.** Borrar:

```sql
  IF now() >= lower(v_cita.rango) THEN
    RAISE EXCEPTION 'La visita ya empezo' USING ERRCODE = 'VS008';
  END IF;
```

Correr `-t "VS008"`. Esperado: ROJO: el movimiento de la visita empezada devuelve error `null`. Restaurar, resetear, VERDE.

- [ ] **Paso 9: falsificación, quitar la traducción de `23P01`.** Borrar:

```sql
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'La franja ya esta ocupada' USING ERRCODE = 'VS004';
```

y dejar el bloque como `BEGIN UPDATE ... ; END;` sin `EXCEPTION` (borrar también la línea `  EXCEPTION`). Correr `-t "mover es atomico"`. Esperado: ROJO recibiendo `23P01`, y las aserciones siguientes no llegan a correr. Restaurar, resetear, VERDE.

- [ ] **Paso 10: commit.**

```bash
$G add supabase/migrations/20260915000600_mover_cita.sql tests/rls/ayudantes-citas.ts tests/rls/mover-cita.test.ts
$G commit -m "feat(db): mover_cita y mover_cita_como con un solo UPDATE atomico del rango

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 7: Privilegios de las variantes `_como` y de los ayudantes internos

**Files:**
- Test: `tests/rls/citas-como.test.ts`

No hay código nuevo: las migraciones de las Tareas 3 a 6 ya llevan los `REVOKE`. Esta tarea es la prueba y la falsificación del mayor riesgo de seguridad de SP5 (§7 del spec): si `authenticated` pudiera ejecutar una `_como`, cualquiera reservaría, movería o cancelaría en nombre de cualquiera.

**Interfaces:**
- Consumes: las siete funciones públicas y las dos internas de las Tareas 3 a 6; `consultar`, `escenarioReserva`, `escenarioConCita`, `crearCompradorConLead`, `crearVendedorConPropiedad`, `comoUsuario`, `inicioDeCita` de `tests/rls/ayudantes-citas.ts`.
- Produces: nada consumido por otras tareas.

- [ ] **Paso 1: medir `N_rls_antes`.**

```powershell
npm run test:rls
```

- [ ] **Paso 2: escribir la prueba.** Crear `tests/rls/citas-como.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo } from './ayudantes'
import {
  comoUsuario, consultar, crearCompradorConLead, crearVendedorConPropiedad,
  escenarioConCita, escenarioReserva, inicioDeCita,
} from './ayudantes-citas'

const ms = (iso: string) => new Date(iso).getTime()

const COMO = [
  'public.reservar_cita_como(uuid, timestamptz, uuid)',
  'public.mover_cita_como(uuid, timestamptz, uuid)',
  'public.cancelar_cita_como(uuid, uuid)',
] as const

const INTERNAS = [
  'public.franja_valida(uuid, timestamptz)',
  'public.franjas_candidatas(uuid, timestamptz, timestamptz)',
] as const

const DE_AUTHENTICATED = [
  'public.reservar_cita(uuid, timestamptz)',
  'public.mover_cita(uuid, timestamptz)',
  'public.cancelar_cita(uuid)',
  'public.franjas_libres(uuid, timestamptz, timestamptz)',
] as const

/** has_function_privilege sobre la firma exacta. El ::regprocedure revienta si la firma no existe. */
async function ejecuta(rol: string, firma: string): Promise<boolean> {
  const [fila] = await consultar<{ ejecuta: boolean }>(
    `SELECT has_function_privilege($1, $2::regprocedure, 'EXECUTE') AS ejecuta`, [rol, firma],
  )
  return fila!.ejecuta
}

describe('privilegios de ejecucion de SP5', () => {
  it('anon y authenticated no ejecutan las _como ni las internas; service_role solo las _como; authenticated si las cortas', async () => {
    const sobrantes: string[] = []
    const faltantes: string[] = []

    for (const firma of [...COMO, ...INTERNAS]) {
      if (await ejecuta('anon', firma)) sobrantes.push(`anon ${firma}`)
      if (await ejecuta('authenticated', firma)) sobrantes.push(`authenticated ${firma}`)
    }
    for (const firma of INTERNAS) {
      if (await ejecuta('service_role', firma)) sobrantes.push(`service_role ${firma}`)
    }
    for (const firma of COMO) {
      if (!(await ejecuta('service_role', firma))) faltantes.push(`service_role ${firma}`)
    }
    for (const firma of DE_AUTHENTICATED) {
      if (await ejecuta('anon', firma)) sobrantes.push(`anon ${firma}`)
      if (!(await ejecuta('authenticated', firma))) faltantes.push(`authenticated ${firma}`)
    }

    expect(sobrantes).toEqual([])
    expect(faltantes).toEqual([])
  })

  it('un authenticated no reserva en nombre de otro comprador con reservar_cita_como; service_role si', async () => {
    const { vendedor, comprador: victima, franjas } = await escenarioReserva()
    // El atacante es verosimil: otro comprador con su propio lead aceptado del mismo vendedor.
    const atacante = await crearCompradorConLead(vendedor, 'aceptado')
    const argumentos = { p_lead_id: victima.leadId, p_inicio: franjas[0], p_actor: victima.id }

    const comoAtacante = await (await comoUsuario(atacante.correo)).rpc('reservar_cita_como', argumentos)
    expect(comoAtacante.error?.code).toBe('42501')
    const comoAnonimo = await clienteAnonimo().rpc('reservar_cita_como', argumentos)
    expect(comoAnonimo.error?.code).toBe('42501')
    expect((await clienteAdmin().from('citas').select('id').eq('lead_id', victima.leadId)).data).toEqual([])

    // Positivo: la costura de SP6. service_role reserva en nombre del comprador.
    const comoServicio = await clienteAdmin().rpc('reservar_cita_como', argumentos)
    expect(comoServicio.error).toBeNull()
    const { data: cita } = await clienteAdmin().from('citas')
      .select('comprador_id').eq('id', comoServicio.data as string).single()
    expect(cita?.comprador_id).toBe(victima.id)
  })

  it('un authenticated no mueve una visita ajena con mover_cita_como; service_role si', async () => {
    const { comprador: victima, franjas, citaId } = await escenarioConCita()
    const atacante = await crearVendedorConPropiedad()
    const argumentos = { p_cita_id: citaId, p_nuevo_inicio: franjas[2], p_actor: victima.id }

    expect((await (await comoUsuario(atacante.correo)).rpc('mover_cita_como', argumentos)).error?.code).toBe('42501')
    expect((await clienteAnonimo().rpc('mover_cita_como', argumentos)).error?.code).toBe('42501')
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[0]!))

    expect((await clienteAdmin().rpc('mover_cita_como', argumentos)).error).toBeNull()
    expect(await inicioDeCita(citaId)).toBe(ms(franjas[2]!))
  })

  it('un authenticated no cancela una visita ajena con cancelar_cita_como; service_role si', async () => {
    const { comprador: victima, citaId } = await escenarioConCita()
    const atacante = await crearVendedorConPropiedad()
    const argumentos = { p_cita_id: citaId, p_actor: victima.id }

    expect((await (await comoUsuario(atacante.correo)).rpc('cancelar_cita_como', argumentos)).error?.code).toBe('42501')
    expect((await clienteAnonimo().rpc('cancelar_cita_como', argumentos)).error?.code).toBe('42501')
    const antes = await clienteAdmin().from('citas').select('estado').eq('id', citaId).single()
    expect(antes.data?.estado).toBe('confirmada')

    expect((await clienteAdmin().rpc('cancelar_cita_como', argumentos)).error).toBeNull()
    const despues = await clienteAdmin().from('citas').select('estado,cancelada_por').eq('id', citaId).single()
    expect(despues.data).toEqual({ estado: 'cancelada', cancelada_por: victima.id })
  })
})
```

- [ ] **Paso 3: correrla.**

```powershell
npx vitest run tests/rls/citas-como.test.ts
```

Esperado: 4 verdes. Esta tarea no tiene rojo previo a una implementación, porque los `REVOKE` ya existen desde las Tareas 3 a 6: su rojo son las falsificaciones de los pasos 4 a 7, obligatorias.

- [ ] **Paso 4: falsificación, `GRANT` de `reservar_cita_como` a `authenticated`.**

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "GRANT EXECUTE ON FUNCTION public.reservar_cita_como(uuid, timestamptz, uuid) TO authenticated;"
npx vitest run tests/rls/citas-como.test.ts
```

Esperado: ROJO en la primera prueba (`sobrantes` contiene `authenticated public.reservar_cita_como(...)`) y en la segunda (`comoAtacante.error` es `null`: el atacante reservó en nombre de la víctima). Restaurar:

```powershell
npx supabase db reset
npx vitest run tests/rls/citas-como.test.ts
```

VERDE.

- [ ] **Paso 5: falsificación, `GRANT` de `mover_cita_como` a `authenticated`.**

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "GRANT EXECUTE ON FUNCTION public.mover_cita_como(uuid, timestamptz, uuid) TO authenticated;"
npx vitest run tests/rls/citas-como.test.ts -t "mueve una visita ajena"
```

Esperado: ROJO, el atacante mueve la visita. Restaurar con reset, VERDE.

- [ ] **Paso 6: falsificación, `GRANT` de `cancelar_cita_como` a `authenticated`.**

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "GRANT EXECUTE ON FUNCTION public.cancelar_cita_como(uuid, uuid) TO authenticated;"
npx vitest run tests/rls/citas-como.test.ts -t "cancela una visita ajena"
```

Esperado: ROJO, el atacante cancela. Restaurar con reset, VERDE.

- [ ] **Paso 7: falsificación en la migración, revocar solo de `PUBLIC` y `anon`.** Demuestra que nombrar a `authenticated` en el `REVOKE` es necesario en este proyecto, porque `pg_default_acl` le concede `EXECUTE` explícito. En `20260915000400_reservar_cita.sql` (ya commiteada) sustituir:

```sql
REVOKE EXECUTE ON FUNCTION public.reservar_cita_como(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
```

por:

```sql
REVOKE EXECUTE ON FUNCTION public.reservar_cita_como(uuid, timestamptz, uuid)
  FROM PUBLIC, anon;
```

Resetear y correr `npx vitest run tests/rls/citas-como.test.ts -t "reserva en nombre de otro"`. Esperado: ROJO. `git checkout -- supabase/migrations/20260915000400_reservar_cita.sql`, `git diff --exit-code`, resetear, VERDE.

- [ ] **Paso 8: suite completa.**

```powershell
npm run test:rls
```

Esperado: `N_rls_antes + 4`.

- [ ] **Paso 9: commit.**

```bash
$G add tests/rls/citas-como.test.ts
$G commit -m "test(rls): authenticated no ejecuta las variantes _como ni los ayudantes internos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 8: La dirección exacta, solo dentro de la ventana

**Files:**
- Create: `supabase/migrations/20260915000700_ubicacion_comprador_en_ventana.sql`
- Test: `tests/rls/ubicacion-ventana.test.ts`

**Interfaces:**
- Consumes: `public.propiedades_ubicacion(propiedad_id uuid PK, direccion text, latitud double precision, longitud double precision)` y sus políticas de dueño y super admin, creadas por `20260914000100_ubicacion_privada.sql` del arreglo `fix/ubicacion-privada` (NO es parte de SP5 y tiene que estar mergeado); `public.citas`; `insertarCitaDirecta`, `ahoraDeLaBase`, `crearVendedorConPropiedad`, `crearCompradorConLead`, `comoUsuario`.
- Produces: política `ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion FOR SELECT TO authenticated`.

- [ ] **Paso 1: medir `N_rls_antes` y confirmar la dependencia.**

```powershell
npm run test:rls
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT polname FROM pg_policy WHERE polrelid = 'public.propiedades_ubicacion'::regclass ORDER BY 1;"
```

Esperado: la tabla existe y tiene las políticas del arreglo. Si `propiedades_ubicacion` no existe, PARAR.

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/rls/ubicacion-ventana.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin } from './ayudantes'
import {
  HORA_MS, ahoraDeLaBase, comoUsuario, crearCompradorConLead, crearVendedorConPropiedad, insertarCitaDirecta,
} from './ayudantes-citas'

const MINUTO_MS = 60 * 1000

/**
 * Propiedad con direccion, comprador con lead aceptado y una visita cuyo
 * inicio es `now() de la base + desplazamientoMs`.
 *
 * Uso (a) de insertarCitaDirecta: estas visitas estan a menos de 2 horas o ya
 * pasaron, y reservar_cita no permite crearlas por el horizonte. Se insertan
 * con clienteAdmin() (service_role), saltandose las funciones a proposito.
 *
 * El now() se lee JUSTO antes de insertar, despues de crear las cuentas: las
 * ventanas se juegan a un minuto y crear usuarios tarda segundos.
 */
async function escenarioVentana(desplazamientoMs: number, estado: 'confirmada' | 'cancelada' = 'confirmada') {
  const vendedor = await crearVendedorConPropiedad()
  const comprador = await crearCompradorConLead(vendedor, 'aceptado')
  const direccion = `Calle secreta ${randomUUID()}`

  // upsert y no insert: el arreglo pudo dejar ya una fila para la propiedad.
  const { error } = await clienteAdmin().from('propiedades_ubicacion')
    .upsert({ propiedad_id: vendedor.propiedadId, direccion }, { onConflict: 'propiedad_id' })
  if (error) throw error

  const ahora = await ahoraDeLaBase()
  const citaId = await insertarCitaDirecta({
    leadId: comprador.leadId, propiedadId: vendedor.propiedadId, compradorId: comprador.id,
    vendedorId: vendedor.id, inicio: new Date(ahora.getTime() + desplazamientoMs), estado,
  })
  return { vendedor, comprador, direccion, citaId }
}

async function direccionesVistas(cliente: SupabaseClient, propiedadId: string): Promise<string[]> {
  const { data, error } = await cliente.from('propiedades_ubicacion')
    .select('direccion').eq('propiedad_id', propiedadId)
  expect(error).toBeNull()
  return (data ?? []).map((fila) => fila.direccion as string)
}

describe('propiedades_ubicacion: el comprador ve la direccion solo en la ventana de su visita', () => {
  it('con la visita a inicio - 1:59 el comprador ve la direccion', async () => {
    const { vendedor, comprador, direccion } = await escenarioVentana(HORA_MS + 59 * MINUTO_MS)
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  it('con la visita a inicio - 2:01 el comprador no la ve', async () => {
    const { vendedor, comprador, direccion } = await escenarioVentana(2 * HORA_MS + MINUTO_MS)
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([])
    // Positivo: la fila existe y su dueno la lee.
    expect(await direccionesVistas(await comoUsuario(vendedor.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  it('terminada la visita no la ve', async () => {
    // Empezo hace 61 minutos: termino hace 1.
    const { vendedor, comprador, direccion } = await escenarioVentana(-(HORA_MS + MINUTO_MS))
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([])
    expect(await direccionesVistas(await comoUsuario(vendedor.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  it('una visita cancelada no la revela aunque este dentro de la ventana', async () => {
    const { vendedor, comprador, direccion } = await escenarioVentana(HORA_MS, 'cancelada')
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([])
    expect(await direccionesVistas(await comoUsuario(vendedor.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  it('otro comprador de la misma propiedad, sin visita, no la ve', async () => {
    const { vendedor, comprador, direccion } = await escenarioVentana(HORA_MS)
    const otro = await crearCompradorConLead(vendedor, 'aceptado')
    expect(await direccionesVistas(await comoUsuario(otro.correo), vendedor.propiedadId)).toEqual([])
    // Positivo: el comprador de la visita, en la misma ventana, si.
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  /**
   * La prueba del filtro `c.comprador_id = auth.uid()` explicito.
   *
   * El caso "otro comprador" de arriba NO lo detecta: dentro de la politica,
   * el EXISTS sobre citas pasa por la RLS de citas, y un comprador ajeno no ve
   * la visita de otro. Pero citas tambien tiene la politica del VENDEDOR,
   * combinada con OR. Quien la atraviesa sin ser el dueno de la propiedad es
   * el vendedor original de una visita cuya propiedad se reasigno (seccion 13
   * del spec). Sin el filtro explicito, ese ex vendedor leeria la direccion.
   */
  it('quien fue el vendedor de la visita no la ve si la propiedad cambio de dueno', async () => {
    const { vendedor: exVendedor, comprador, direccion } = await escenarioVentana(HORA_MS)
    const nuevoDueno = await crearVendedorConPropiedad()
    const reasignar = await clienteAdmin().from('propiedades')
      .update({ vendedor_id: nuevoDueno.id }).eq('id', exVendedor.propiedadId).select('id')
    expect(reasignar.data?.length).toBe(1)

    expect(await direccionesVistas(await comoUsuario(exVendedor.correo), exVendedor.propiedadId)).toEqual([])
    // Positivos: el comprador de la visita y el nuevo dueno si la ven.
    expect(await direccionesVistas(await comoUsuario(comprador.correo), exVendedor.propiedadId)).toEqual([direccion])
    expect(await direccionesVistas(await comoUsuario(nuevoDueno.correo), exVendedor.propiedadId)).toEqual([direccion])
  })
})
```

- [ ] **Paso 3: correrla y ver que falla.**

```powershell
npx vitest run tests/rls/ubicacion-ventana.test.ts
```

Esperado: ROJO en "inicio - 1:59" (el comprador recibe `[]`: aún no hay política que se lo permita), en "otro comprador" (su positivo) y en "cambio de dueno" (su positivo del comprador). Las otras tres pueden salir verdes antes de implementar, porque afirman ausencia: por eso cada una lleva su falsificación.

- [ ] **Paso 4: escribir la migración.** Crear `supabase/migrations/20260915000700_ubicacion_comprador_en_ventana.sql`:

```sql
-- ============================================================================
-- SP5: el comprador lee la direccion exacta desde 2 horas antes de su visita
-- confirmada hasta que termina.
--
-- Depende del arreglo fix/ubicacion-privada (20260914000100), que saco
-- direccion, latitud y longitud de `propiedades` a `propiedades_ubicacion`
-- con RLS por fila y dejo leer solo al dueno y al super admin. Esta migracion
-- solo AÑADE la politica del comprador: no toca privilegios (authenticated ya
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
```

- [ ] **Paso 5: aplicar y verificar.**

```powershell
npx supabase db reset
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid = 'public.propiedades_ubicacion'::regclass ORDER BY 1;"
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT relacl FROM pg_class WHERE relname = 'propiedades_ubicacion';"
```

Esperado: aparece `ubicacion_lectura_comprador_en_ventana` junto a las del arreglo; `relacl` igual que antes de esta tarea (sin `anon=`).

- [ ] **Paso 6: correr la prueba y ver que pasa.**

```powershell
npx vitest run tests/rls/ubicacion-ventana.test.ts
npm run test:rls
```

Esperado: 6 verdes; suite en `N_rls_antes + 6`.

- [ ] **Paso 7: falsificación, quitar la condición de tiempo.**

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "DROP POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion; CREATE POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.citas c WHERE c.propiedad_id = propiedades_ubicacion.propiedad_id AND c.comprador_id = (SELECT auth.uid()) AND c.estado = 'confirmada'));"
npx vitest run tests/rls/ubicacion-ventana.test.ts
```

Esperado: ROJO en "inicio - 2:01" y en "terminada la visita": el comprador recibe la dirección. Restaurar con `npx supabase db reset`, VERDE.

- [ ] **Paso 8: falsificación, quitar el filtro `comprador_id = auth.uid()`.**

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "DROP POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion; CREATE POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.citas c WHERE c.propiedad_id = propiedades_ubicacion.propiedad_id AND c.estado = 'confirmada' AND now() >= lower(c.rango) - interval '2 hours' AND now() < upper(c.rango)));"
npx vitest run tests/rls/ubicacion-ventana.test.ts
```

Esperado: ROJO en "quien fue el vendedor de la visita": el ex vendedor recibe la dirección. "otro comprador" sigue VERDE, por el motivo que explica el comentario de la prueba. Restaurar con reset, VERDE.

- [ ] **Paso 9: falsificación, quitar la condición de estado.**

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "DROP POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion; CREATE POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.citas c WHERE c.propiedad_id = propiedades_ubicacion.propiedad_id AND c.comprador_id = (SELECT auth.uid()) AND now() >= lower(c.rango) - interval '2 hours' AND now() < upper(c.rango)));"
npx vitest run tests/rls/ubicacion-ventana.test.ts -t "cancelada"
```

Esperado: ROJO. Restaurar con reset, VERDE.

- [ ] **Paso 10: commit.**

```bash
$G add supabase/migrations/20260915000700_ubicacion_comprador_en_ventana.sql tests/rls/ubicacion-ventana.test.ts
$G commit -m "feat(db): el comprador lee la direccion desde 2 h antes de su visita hasta el fin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 9: El único formateador de fechas

**Files:**
- Create: `src/lib/fechas/formato.ts`
- Test: `tests/unit/formato-fechas.test.ts`

**Interfaces:**
- Consumes: `Intl.DateTimeFormat` nativo. Ninguna librería.
- Produces:
  - `ZONA_HORARIA: 'America/Bogota'`
  - `formatearHora(instante: string | Date): string` — `'3:00 p. m.'`
  - `formatearDia(instante: string | Date): string` — `'jueves, 17 de septiembre'`
  - `formatearFechaHora(instante: string | Date): string` — `'jueves, 17 de septiembre, 3:00 p. m.'`
  - `claveDia(instante: string | Date): string` — `'2026-09-17'`, fecha de calendario de Bogotá

**El mecanismo para que la prueba falle al quitar `timeZone` en cualquier máquina.** En una máquina en Colombia, quitar `timeZone` no cambia la salida, porque la zona del sistema ya es Bogotá (comprobado en la máquina de desarrollo: `Intl.DateTimeFormat().resolvedOptions().timeZone` es `America/Bogota`). La prueba fija la zona del PROCESO a una zona ajena antes de formatear: `process.env.TZ = 'Asia/Tokyo'`. Node vuelve a leer la zona de ICU al asignar `process.env.TZ` en tiempo de ejecución (comprobado en esta máquina con Node 24: tras la asignación, `new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })` sin `timeZone` da `5:00 a. m.` para `2026-09-17T20:00:00Z`, y con `timeZone` sigue dando `3:00 p. m.`). Tokio está a UTC+9 sin horario de verano: 14 horas de Bogotá y 9 de UTC, así que ni una máquina en Colombia ni un CI en UTC coinciden con ella. La prueba incluye una autocomprobación: si en algún entorno la asignación no surtiera efecto (un pool de hilos que aísle `process.env`, por ejemplo), la autocomprobación sale ROJA en vez de dejar pasar la prueba por no estar mirando nada.

- [ ] **Paso 1: medir `N_unit_antes`.**

```powershell
npm run test:unit
```

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/unit/formato-fechas.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { claveDia, formatearDia, formatearFechaHora, formatearHora } from '@/lib/fechas/formato'

/**
 * La zona del PROCESO se fija a una ajena antes de formatear. Sin esto, en una
 * maquina de Colombia quitar `timeZone` del formateador no cambia nada y la
 * falsificacion quedaria en verde en local. Tokio (UTC+9, sin horario de
 * verano) no coincide ni con Bogota ni con el UTC de CI.
 */
const ZONA_AJENA = 'Asia/Tokyo'
let zonaOriginal: string | undefined

// ICU puede separar con espacios especiales (U+00A0, U+202F) segun la version.
const normalizar = (texto: string) => texto.replace(/\s/g, ' ')

beforeAll(() => {
  zonaOriginal = process.env.TZ
  process.env.TZ = ZONA_AJENA
})

afterAll(() => {
  if (zonaOriginal === undefined) delete process.env.TZ
  else process.env.TZ = zonaOriginal
})

describe('formato de fechas en hora de Bogota', () => {
  it('autocomprobacion: el proceso corre de verdad en la zona ajena', () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(ZONA_AJENA)
    const sinZona = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })
      .format(new Date('2026-09-17T20:00:00Z'))
    expect(normalizar(sinZona)).not.toBe('3:00 p. m.')
  })

  it('un instante a las 20:00 UTC se muestra como 3:00 p. m.', () => {
    expect(normalizar(formatearHora('2026-09-17T20:00:00Z'))).toBe('3:00 p. m.')
    expect(normalizar(formatearHora(new Date('2026-09-17T20:00:00Z')))).toBe('3:00 p. m.')
  })

  it('el dia es el de Bogota, no el de UTC ni el del proceso', () => {
    // 02:00 UTC del viernes 18 son las 9:00 p. m. del jueves 17 en Bogota
    // (y las 11:00 a. m. del viernes 18 en Tokio).
    expect(normalizar(formatearDia('2026-09-18T02:00:00Z'))).toBe('jueves, 17 de septiembre')
    expect(claveDia('2026-09-18T02:00:00Z')).toBe('2026-09-17')
  })

  it('fecha y hora juntas', () => {
    expect(normalizar(formatearFechaHora('2026-09-17T20:00:00+00:00')))
      .toBe('jueves, 17 de septiembre, 3:00 p. m.')
  })
})
```

- [ ] **Paso 3: correrla y ver que falla.**

```powershell
npx vitest run tests/unit/formato-fechas.test.ts
```

Esperado: ROJO al importar, `Failed to resolve import "@/lib/fechas/formato"`.

- [ ] **Paso 4: implementación mínima.** Crear `src/lib/fechas/formato.ts`:

```ts
/**
 * El UNICO sitio donde el codigo JavaScript toca fechas, y solo para
 * mostrarlas. Toda conversion de hora de pared a instante ocurre en Postgres
 * (supabase/migrations/20260915000300_franjas.sql).
 *
 * `timeZone` es OBLIGATORIO: Vercel corre en UTC y sin el las horas saldrian
 * desplazadas cinco horas. Va en un unico formateador para que ningun llamador
 * pueda olvidarlo. tests/unit/formato-fechas.test.ts corre en una zona ajena a
 * proposito para que quitarlo se note en cualquier maquina.
 */
export const ZONA_HORARIA = 'America/Bogota'

function formateador(opciones: Intl.DateTimeFormatOptions, locale = 'es-CO'): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { ...opciones, timeZone: ZONA_HORARIA })
}

export function formatearHora(instante: string | Date): string {
  return formateador({ hour: 'numeric', minute: '2-digit' }).format(new Date(instante))
}

export function formatearDia(instante: string | Date): string {
  return formateador({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(instante))
}

export function formatearFechaHora(instante: string | Date): string {
  return `${formatearDia(instante)}, ${formatearHora(instante)}`
}

/** Fecha de calendario de Bogota, YYYY-MM-DD (en-CA da ese orden). Para agrupar, no para mostrar. */
export function claveDia(instante: string | Date): string {
  return formateador({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA').format(new Date(instante))
}
```

- [ ] **Paso 5: correrla y ver que pasa.**

```powershell
npx vitest run tests/unit/formato-fechas.test.ts
npm run test:unit
```

Esperado: 4 verdes; suite en `N_unit_antes + 4`.

- [ ] **Paso 6: falsificación, quitar `timeZone`.** En `src/lib/fechas/formato.ts` sustituir `{ ...opciones, timeZone: ZONA_HORARIA }` por `{ ...opciones }`. Correr la prueba. Esperado en ESTA máquina, que está en Bogotá: ROJO en "3:00 p. m." (recibe `5:00 a. m.`), en "el dia es el de Bogota" y en "fecha y hora juntas"; la autocomprobación sigue VERDE. Pegar la salida. Restaurar con `git checkout -- src/lib/fechas/formato.ts` si ya está añadido al índice, o deshaciendo la edición; VERDE.

- [ ] **Paso 7: commit.**

```bash
$G add src/lib/fechas/formato.ts tests/unit/formato-fechas.test.ts
$G commit -m "feat: formateador unico de fechas en hora de Bogota

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 10: Mensajes de los errores `VS`

**Files:**
- Modify: `src/lib/errores/mapear.ts`
- Test: `tests/unit/errores-citas.test.ts`

**Interfaces:**
- Consumes: `MENSAJE_GENERICO` (ya existe en `mapear.ts`).
- Produces (en `src/lib/errores/mapear.ts`):
  - `MENSAJE_VISITA_SOLICITUD_INEXISTENTE`, `MENSAJE_VISITA_NO_PARTICIPA`, `MENSAJE_VISITA_LEAD_NO_ACEPTADO`, `MENSAJE_VISITA_FRANJA_NO_DISPONIBLE`, `MENSAJE_VISITA_YA_RESERVADA`, `MENSAJE_VISITA_INEXISTENTE`, `MENSAJE_VISITA_YA_CANCELADA`, `MENSAJE_VISITA_YA_EMPEZO`: `string`
  - `MENSAJE_HORARIO_NO_ENCONTRADO: string`, `MENSAJE_BLOQUEO_NO_ENCONTRADO: string`
  - `mensajeDeErrorCita(error: unknown): string`

- [ ] **Paso 1: medir `N_unit_antes`.**

```powershell
npm run test:unit
```

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/unit/errores-citas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  MENSAJE_GENERICO,
  MENSAJE_VISITA_FRANJA_NO_DISPONIBLE, MENSAJE_VISITA_INEXISTENTE, MENSAJE_VISITA_LEAD_NO_ACEPTADO,
  MENSAJE_VISITA_NO_PARTICIPA, MENSAJE_VISITA_SOLICITUD_INEXISTENTE, MENSAJE_VISITA_YA_CANCELADA,
  MENSAJE_VISITA_YA_EMPEZO, MENSAJE_VISITA_YA_RESERVADA,
  mensajeDeErrorCita,
} from '@/lib/errores/mapear'

// Codigos y textos de la seccion 11 del spec de SP5.
const CASOS = [
  ['VS001', MENSAJE_VISITA_SOLICITUD_INEXISTENTE, 'No encontramos esa solicitud.'],
  ['VS002', MENSAJE_VISITA_NO_PARTICIPA, 'No puedes gestionar esta visita.'],
  ['VS003', MENSAJE_VISITA_LEAD_NO_ACEPTADO, 'Solo puedes reservar cuando el vendedor haya aceptado tu solicitud.'],
  ['VS004', MENSAJE_VISITA_FRANJA_NO_DISPONIBLE, 'Esa franja ya no está disponible. Elige otra.'],
  ['VS005', MENSAJE_VISITA_YA_RESERVADA, 'Ya tienes una visita reservada para esta propiedad.'],
  ['VS006', MENSAJE_VISITA_INEXISTENTE, 'No encontramos esa visita.'],
  ['VS007', MENSAJE_VISITA_YA_CANCELADA, 'Esta visita ya estaba cancelada.'],
  ['VS008', MENSAJE_VISITA_YA_EMPEZO, 'No se puede cambiar una visita que ya empezó.'],
] as const

describe('mensajeDeErrorCita', () => {
  it.each(CASOS)('%s se traduce a su mensaje', (codigo, constante, texto) => {
    expect(constante).toBe(texto)
    expect(mensajeDeErrorCita({ code: codigo, message: 'detalle interno de postgres' })).toBe(texto)
  })

  it('decide por el codigo, nunca por el texto del mensaje', () => {
    // El message dice una cosa y el code otra: manda el code.
    expect(mensajeDeErrorCita({ code: 'VS002', message: 'Esa franja ya no está disponible. Elige otra.' }))
      .toBe(MENSAJE_VISITA_NO_PARTICIPA)
    // Un texto que contiene el codigo, sin code, no se traduce.
    expect(mensajeDeErrorCita({ message: 'VS004 La franja ya esta ocupada' })).toBe(MENSAJE_GENERICO)
  })

  it('cualquier otro error cae en el mensaje generico, sin filtrar el original', () => {
    const otros: unknown[] = [
      { code: '23P01', message: 'conflicting key value violates exclusion constraint "citas_sin_solape_por_vendedor"' },
      { code: '42501', message: 'permission denied for function reservar_cita_como' },
      { code: 'constructor' },
      { code: 'toString' },
      'VS004',
      null,
      undefined,
    ]
    for (const error of otros) {
      expect(mensajeDeErrorCita(error)).toBe(MENSAJE_GENERICO)
    }
  })
})
```

- [ ] **Paso 3: correrla y ver que falla.**

```powershell
npx vitest run tests/unit/errores-citas.test.ts
```

Esperado: ROJO, `mensajeDeErrorCita is not a function` y constantes `undefined`.

- [ ] **Paso 4: implementación mínima.** En `src/lib/errores/mapear.ts`, justo después de `export const MENSAJE_LEAD_YA_RESPONDIDO = 'Este lead ya fue respondido.'`, añadir:

```ts
// SP5, visitas. Un mensaje por SQLSTATE propio de las funciones de citas
// (supabase/migrations/20260915000400 a 000600). Se traducen por error.code,
// nunca por error.message: el mensaje de Postgres es texto interno y cambia.
export const MENSAJE_VISITA_SOLICITUD_INEXISTENTE = 'No encontramos esa solicitud.'
export const MENSAJE_VISITA_NO_PARTICIPA = 'No puedes gestionar esta visita.'
export const MENSAJE_VISITA_LEAD_NO_ACEPTADO =
  'Solo puedes reservar cuando el vendedor haya aceptado tu solicitud.'
// VS004 agrupa varias causas a proposito (franja fuera de horario, bloqueada,
// fuera de horizonte, ocupada): a quien tantea como saltarse las reglas no le
// conviene saber cual.
export const MENSAJE_VISITA_FRANJA_NO_DISPONIBLE = 'Esa franja ya no está disponible. Elige otra.'
export const MENSAJE_VISITA_YA_RESERVADA = 'Ya tienes una visita reservada para esta propiedad.'
export const MENSAJE_VISITA_INEXISTENTE = 'No encontramos esa visita.'
export const MENSAJE_VISITA_YA_CANCELADA = 'Esta visita ya estaba cancelada.'
export const MENSAJE_VISITA_YA_EMPEZO = 'No se puede cambiar una visita que ya empezó.'

// Borrar una fila de disponibilidad que devuelve CERO filas: no existe o no es
// del vendedor. PostgREST no da error en ese caso; la accion lo detecta
// contando filas y no lo reporta como exito.
export const MENSAJE_HORARIO_NO_ENCONTRADO = 'Esa franja del horario ya no existe.'
export const MENSAJE_BLOQUEO_NO_ENCONTRADO = 'Esa fecha bloqueada ya no existe.'

// Map y no un objeto literal: con un objeto, un code 'constructor' o
// 'toString' encontraria una propiedad heredada del prototipo.
const MENSAJES_DE_CITA: ReadonlyMap<string, string> = new Map([
  ['VS001', MENSAJE_VISITA_SOLICITUD_INEXISTENTE],
  ['VS002', MENSAJE_VISITA_NO_PARTICIPA],
  ['VS003', MENSAJE_VISITA_LEAD_NO_ACEPTADO],
  ['VS004', MENSAJE_VISITA_FRANJA_NO_DISPONIBLE],
  ['VS005', MENSAJE_VISITA_YA_RESERVADA],
  ['VS006', MENSAJE_VISITA_INEXISTENTE],
  ['VS007', MENSAJE_VISITA_YA_CANCELADA],
  ['VS008', MENSAJE_VISITA_YA_EMPEZO],
])

/**
 * Traduce el error de un RPC de citas a un mensaje para el usuario. Mira SOLO
 * `code`; cualquier otro error, incluido un 42501 o un 23P01 sin traducir, cae
 * en el generico sin dejar ver el detalle.
 */
export function mensajeDeErrorCita(error: unknown): string {
  const codigo =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  return MENSAJES_DE_CITA.get(codigo) ?? MENSAJE_GENERICO
}
```

`mapear.ts` usa `MENSAJE_GENERICO` antes de esta línea y ya lo declara arriba del fichero, así que no hay que moverlo.

- [ ] **Paso 5: correrla y ver que pasa.**

```powershell
npx vitest run tests/unit/errores-citas.test.ts
npx vitest run tests/unit/errores.test.ts
npm run test:unit
```

Esperado: 10 verdes en el fichero nuevo (8 casos de `it.each` + 2); `errores.test.ts` sigue verde; suite en `N_unit_antes + 10`.

- [ ] **Paso 6: commit.** No hay control de seguridad que falsificar: la distinción por código la afirma la segunda prueba, que sale roja con cualquier implementación que lea `message`.

```bash
$G add src/lib/errores/mapear.ts tests/unit/errores-citas.test.ts
$G commit -m "feat: mensajes de los errores VS de las visitas, traducidos por codigo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 11: Lectura de rangos y consultas con filtro explícito

**Files:**
- Create: `src/lib/citas/rango.ts`
- Create: `src/lib/citas/consultas.ts`
- Test: `tests/unit/rango-cita.test.ts`
- Test: `tests/rls/consultas-citas.test.ts`

**Interfaces:**
- Consumes: tablas y funciones de las Tareas 1 a 8; ayudantes de `tests/rls/ayudantes-citas.ts`.
- Produces:
  - `src/lib/citas/rango.ts`:
    - `interface RangoCita { inicio: string; fin: string }` (ISO `...Z`)
    - `leerRango(rango: string): RangoCita`
  - `src/lib/citas/consultas.ts`:
    - `type EstadoLead = 'nuevo' | 'aceptado' | 'descartado'`, `type EstadoCita = 'confirmada' | 'cancelada'`
    - `interface Franja { inicio: string; fin: string }`
    - `interface VisitaResumen extends RangoCita { id: string }`
    - `interface SolicitudDelComprador { id: string; estado: EstadoLead; propiedadId: string; tituloPropiedad: string | null; visita: VisitaResumen | null; direccion: string | null }`
    - `interface CitaDelVendedor extends RangoCita { id: string; estado: EstadoCita; tituloPropiedad: string | null; nombreComprador: string | null }`
    - `interface LeadParaReservar { id: string; estado: EstadoLead; vendedorId: string; tituloPropiedad: string | null }`
    - `interface CitaDeParticipante extends RangoCita { id: string; estado: EstadoCita; vendedorId: string }`
    - `interface FilaDisponibilidad { id: string; dia_semana: number; hora_inicio: string; hora_fin: string }`
    - `interface FechaBloqueada { id: string; desde: string; hasta: string }`
    - `listarSolicitudesDelComprador(cliente: SupabaseClient, compradorId: string): Promise<SolicitudDelComprador[]>`
    - `listarCitasDelVendedor(cliente: SupabaseClient, vendedorId: string): Promise<CitaDelVendedor[]>`
    - `obtenerFranjasLibres(cliente: SupabaseClient, vendedorId: string): Promise<Franja[]>`
    - `obtenerLeadParaReservar(cliente: SupabaseClient, leadId: string, compradorId: string): Promise<LeadParaReservar | null>`
    - `obtenerCitaDeParticipante(cliente: SupabaseClient, citaId: string, usuarioId: string, papel: 'comprador' | 'vendedor'): Promise<CitaDeParticipante | null>`
    - `leerDisponibilidad(cliente: SupabaseClient, vendedorId: string): Promise<FilaDisponibilidad[]>`
    - `leerFechasBloqueadas(cliente: SupabaseClient, vendedorId: string): Promise<FechaBloqueada[]>`

**Formato real que se lee** (verificado contra la base local con `to_json`, que es lo que emite PostgREST): un `tstzrange` llega como la cadena `["2026-09-17 20:00:00+00","2026-09-17 21:00:00+00")`, con milisegundos si los tiene (`20:00:00.123+00`). Un `timestamptz` suelto, como los de `franjas_libres`, llega como `2026-09-17T20:00:00+00:00`.

**Por qué los embebidos nombran la clave foránea.** `citas` apunta a `leads` y a `propiedades` a la vez. Un embebido sin pista (`propiedades(titulo)` desde `leads`) queda expuesto a que PostgREST encuentre más de una relación y responda `PGRST201`. Todos los embebidos nuevos llevan `!<constraint>`. Los nombres son los que Postgres pone por defecto a un `REFERENCES` en línea: `leads_propiedad_id_fkey`, `citas_lead_id_fkey`, `citas_propiedad_id_fkey`. El paso 7 corre además las suites de SP4 para confirmar que la consulta existente `propiedades(titulo,slug)` de `src/lib/leads/consultas.ts` no se rompió.

- [ ] **Paso 1: medir `N_unit_antes` y `N_rls_antes`, y confirmar los nombres de las claves.**

```powershell
npm run test:unit
npm run test:rls
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT conname FROM pg_constraint WHERE conname IN ('leads_propiedad_id_fkey','citas_lead_id_fkey','citas_propiedad_id_fkey') ORDER BY 1;"
```

Esperado: las tres filas. Si alguna falta, usar el nombre real en el código de este paso y anotarlo.

- [ ] **Paso 2: escribir la prueba unitaria que falla.** Crear `tests/unit/rango-cita.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { leerRango } from '@/lib/citas/rango'

describe('leerRango', () => {
  it('lee el tstzrange tal como lo serializa PostgREST', () => {
    expect(leerRango('["2026-09-17 20:00:00+00","2026-09-17 21:00:00+00")')).toEqual({
      inicio: '2026-09-17T20:00:00.000Z',
      fin: '2026-09-17T21:00:00.000Z',
    })
  })

  it('conserva los milisegundos', () => {
    expect(leerRango('["2026-09-17 20:00:00.123+00","2026-09-17 21:00:00.123+00")')).toEqual({
      inicio: '2026-09-17T20:00:00.123Z',
      fin: '2026-09-17T21:00:00.123Z',
    })
  })

  it('respeta el desfase que traiga el texto', () => {
    expect(leerRango('["2026-09-17 15:00:00-05","2026-09-17 16:00:00-05")').inicio)
      .toBe('2026-09-17T20:00:00.000Z')
  })

  it('rechaza lo que no es un rango de cita en vez de inventar una fecha', () => {
    expect(() => leerRango('basura')).toThrow('Rango de cita ilegible')
    expect(() => leerRango('empty')).toThrow('Rango de cita ilegible')
    expect(() => leerRango('["no es fecha","tampoco")')).toThrow('Instante de cita ilegible')
  })
})
```

- [ ] **Paso 3: correrla y ver que falla.**

```powershell
npx vitest run tests/unit/rango-cita.test.ts
```

Esperado: ROJO, no se resuelve `@/lib/citas/rango`.

- [ ] **Paso 4: implementar `leerRango`.** Crear `src/lib/citas/rango.ts`:

```ts
export interface RangoCita {
  /** ISO 8601 en UTC (`...Z`). */
  inicio: string
  fin: string
}

// ["2026-09-17 20:00:00+00","2026-09-17 21:00:00+00")  -- las citas siempre son '[)'.
const FORMA_RANGO = /^\[\s*"?([^",]+?)"?\s*,\s*"?([^",]+?)"?\s*\)$/

function aIso(valor: string): string {
  // "2026-09-17 20:00:00.123+00" -> "2026-09-17T20:00:00.123+00:00", que Date lee en cualquier motor.
  const normalizado = valor.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  const instante = new Date(normalizado)
  if (Number.isNaN(instante.getTime())) {
    throw new Error(`Instante de cita ilegible: ${valor}`)
  }
  return instante.toISOString()
}

/** Convierte el tstzrange que devuelve PostgREST en dos instantes ISO. No calcula nada. */
export function leerRango(rango: string): RangoCita {
  const partes = FORMA_RANGO.exec(rango)
  if (!partes) throw new Error(`Rango de cita ilegible: ${rango}`)
  return { inicio: aIso(partes[1]!), fin: aIso(partes[2]!) }
}
```

- [ ] **Paso 5: correrla y ver que pasa.**

```powershell
npx vitest run tests/unit/rango-cita.test.ts
```

Esperado: 4 verdes.

- [ ] **Paso 6: escribir la prueba RLS de las consultas.** Crear `tests/rls/consultas-citas.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin } from './ayudantes'
import {
  HORA_MS, ahoraDeLaBase, comoUsuario, crearCompradorConLead, crearVendedorConPropiedad,
  definirHorarioCompleto, escenarioConCita, escenarioReserva, franjasDe, insertarCitaDirecta, reservarComo,
} from './ayudantes-citas'
import {
  listarCitasDelVendedor, listarSolicitudesDelComprador, obtenerCitaDeParticipante,
  obtenerFranjasLibres, obtenerLeadParaReservar,
} from '@/lib/citas/consultas'

const ms = (iso: string) => new Date(iso).getTime()

/**
 * Un usuario con rol vendedor que ADEMAS es comprador de otra propiedad. Es el
 * caso en que las politicas permisivas combinadas con OR (leads y citas tienen
 * la del comprador y la del vendedor) devuelven filas de los dos papeles: solo
 * el filtro explicito de la consulta separa uno del otro.
 */
async function vendedorQueTambienCompra() {
  const usuario = await crearVendedorConPropiedad()
  await definirHorarioCompleto(usuario.id)
  const otroVendedor = await crearVendedorConPropiedad()
  await definirHorarioCompleto(otroVendedor.id)

  // Como vendedor: un comprador con lead aceptado sobre SU propiedad.
  const suComprador = await crearCompradorConLead(usuario, 'aceptado')

  // Como comprador: un lead aceptado sobre la propiedad de otro vendedor.
  const { data: leadPropio, error } = await clienteAdmin().from('leads').insert({
    propiedad_id: otroVendedor.propiedadId, comprador_id: usuario.id, vendedor_id: otroVendedor.id,
    nombre_mostrado: 'Vendedor que compra', mensaje: 'Mensaje de prueba para citas, largo.', estado: 'aceptado',
  }).select('id').single()
  if (error) throw error

  return { usuario, otroVendedor, suComprador, leadPropioId: leadPropio.id as string }
}

describe('consultas de citas con filtro explicito', () => {
  it('listarSolicitudesDelComprador trae solo las solicitudes donde el usuario es el comprador', async () => {
    const { usuario, leadPropioId } = await vendedorQueTambienCompra()
    const cliente = await comoUsuario(usuario.correo)

    const solicitudes = await listarSolicitudesDelComprador(cliente, usuario.id)

    expect(solicitudes.map((s) => s.id)).toEqual([leadPropioId])
    expect(solicitudes[0]!.estado).toBe('aceptado')
    expect(solicitudes[0]!.visita).toBeNull()
  })

  it('listarCitasDelVendedor trae solo las visitas donde el usuario es el vendedor', async () => {
    const { usuario, otroVendedor, suComprador, leadPropioId } = await vendedorQueTambienCompra()

    const franjasSuyas = await franjasDe(usuario.id)
    const comoVendedor = await reservarComo(suComprador.correo, suComprador.leadId, franjasSuyas[0]!)
    expect(comoVendedor.error).toBeNull()

    const franjasDelOtro = await franjasDe(otroVendedor.id)
    const comoComprador = await reservarComo(usuario.correo, leadPropioId, franjasDelOtro[0]!)
    expect(comoComprador.error).toBeNull()

    const citas = await listarCitasDelVendedor(await comoUsuario(usuario.correo), usuario.id)

    expect(citas.map((c) => c.id)).toEqual([comoVendedor.data])
    expect(citas[0]!.estado).toBe('confirmada')
    expect(citas[0]!.nombreComprador).toBe('Comprador de prueba')
    expect(ms(citas[0]!.inicio)).toBe(ms(franjasSuyas[0]!))
    expect(ms(citas[0]!.fin) - ms(citas[0]!.inicio)).toBe(HORA_MS)
  })

  it('la solicitud trae su visita con inicio y fin, y la direccion solo dentro de la ventana', async () => {
    // Fuera de la ventana: visita reservada por la funcion, a mas de 2 horas.
    const lejos = await escenarioConCita()
    const direccionLejos = `Calle lejana ${randomUUID()}`
    await clienteAdmin().from('propiedades_ubicacion')
      .upsert({ propiedad_id: lejos.vendedor.propiedadId, direccion: direccionLejos }, { onConflict: 'propiedad_id' })

    const [solicitudLejos] = await listarSolicitudesDelComprador(
      await comoUsuario(lejos.comprador.correo), lejos.comprador.id,
    )
    expect(solicitudLejos!.visita?.id).toBe(lejos.citaId)
    expect(ms(solicitudLejos!.visita!.inicio)).toBe(ms(lejos.franjas[0]!))
    expect(solicitudLejos!.direccion).toBeNull()

    // Dentro de la ventana. Uso (a) de insertarCitaDirecta: visita a 1 hora.
    const vendedor = await crearVendedorConPropiedad()
    const comprador = await crearCompradorConLead(vendedor, 'aceptado')
    const direccionCerca = `Calle cercana ${randomUUID()}`
    await clienteAdmin().from('propiedades_ubicacion')
      .upsert({ propiedad_id: vendedor.propiedadId, direccion: direccionCerca }, { onConflict: 'propiedad_id' })
    const ahora = await ahoraDeLaBase()
    await insertarCitaDirecta({
      leadId: comprador.leadId, propiedadId: vendedor.propiedadId, compradorId: comprador.id,
      vendedorId: vendedor.id, inicio: new Date(ahora.getTime() + HORA_MS),
    })

    const [solicitudCerca] = await listarSolicitudesDelComprador(await comoUsuario(comprador.correo), comprador.id)
    expect(solicitudCerca!.direccion).toBe(direccionCerca)
  })

  it('obtenerFranjasLibres manda limites abiertos y devuelve el horizonte que decide la base', async () => {
    const { vendedor, comprador, franjas } = await escenarioReserva()
    const vistas = await obtenerFranjasLibres(await comoUsuario(comprador.correo), vendedor.id)
    expect(vistas.map((f) => ms(f.inicio))).toEqual(franjas.map(ms))
  })

  it('obtenerLeadParaReservar y obtenerCitaDeParticipante filtran por el papel pedido, no solo por RLS', async () => {
    const { vendedor, comprador, citaId } = await escenarioConCita()
    const clienteComprador = await comoUsuario(comprador.correo)
    const clienteVendedor = await comoUsuario(vendedor.correo)

    expect((await obtenerLeadParaReservar(clienteComprador, comprador.leadId, comprador.id))?.vendedorId)
      .toBe(vendedor.id)
    // El vendedor VE el lead por RLS, pero no es su comprador.
    expect(await obtenerLeadParaReservar(clienteVendedor, comprador.leadId, vendedor.id)).toBeNull()

    expect((await obtenerCitaDeParticipante(clienteComprador, citaId, comprador.id, 'comprador'))?.id).toBe(citaId)
    expect((await obtenerCitaDeParticipante(clienteVendedor, citaId, vendedor.id, 'vendedor'))?.id).toBe(citaId)
    // El comprador VE la cita por RLS, pero no es su vendedor.
    expect(await obtenerCitaDeParticipante(clienteComprador, citaId, comprador.id, 'vendedor')).toBeNull()
  })
})
```

Correrla: `npx vitest run tests/rls/consultas-citas.test.ts`. Esperado: ROJO al importar `@/lib/citas/consultas`.

- [ ] **Paso 7: implementar las consultas.** Crear `src/lib/citas/consultas.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerRango, type RangoCita } from './rango'

/**
 * Lecturas de SP5. Todas llevan el filtro por usuario EXPLICITO: leads y citas
 * tienen politicas permisivas de comprador y de vendedor combinadas con OR, y
 * un usuario puede estar en los dos papeles (tests/rls/consultas-citas.test.ts).
 *
 * Los embebidos nombran la clave foranea: citas apunta a leads y a propiedades,
 * y sin la pista PostgREST podria ver mas de una relacion (PGRST201).
 */

export type EstadoLead = 'nuevo' | 'aceptado' | 'descartado'
export type EstadoCita = 'confirmada' | 'cancelada'

export interface Franja {
  inicio: string
  fin: string
}

export interface VisitaResumen extends RangoCita {
  id: string
}

export interface SolicitudDelComprador {
  id: string
  estado: EstadoLead
  propiedadId: string
  tituloPropiedad: string | null
  visita: VisitaResumen | null
  direccion: string | null
}

export interface CitaDelVendedor extends RangoCita {
  id: string
  estado: EstadoCita
  tituloPropiedad: string | null
  nombreComprador: string | null
}

export interface LeadParaReservar {
  id: string
  estado: EstadoLead
  vendedorId: string
  tituloPropiedad: string | null
}

export interface CitaDeParticipante extends RangoCita {
  id: string
  estado: EstadoCita
  vendedorId: string
}

export interface FilaDisponibilidad {
  id: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
}

export interface FechaBloqueada {
  id: string
  desde: string
  hasta: string
}

interface FilaSolicitud {
  id: string
  estado: EstadoLead
  propiedad_id: string
  propiedades: { titulo: string } | null
  citas: { id: string; rango: string; estado: EstadoCita }[] | null
}

export async function listarSolicitudesDelComprador(
  cliente: SupabaseClient, compradorId: string,
): Promise<SolicitudDelComprador[]> {
  const { data, error } = await cliente
    .from('leads')
    .select('id,estado,propiedad_id,propiedades!leads_propiedad_id_fkey(titulo),citas!citas_lead_id_fkey(id,rango,estado)')
    .eq('comprador_id', compradorId)
    .order('creado_en', { ascending: false })
  if (error) throw new Error('No se pudieron cargar tus solicitudes')

  const solicitudes: SolicitudDelComprador[] = ((data ?? []) as unknown as FilaSolicitud[]).map((fila) => {
    const confirmada = (fila.citas ?? []).find((cita) => cita.estado === 'confirmada')
    return {
      id: fila.id,
      estado: fila.estado,
      propiedadId: fila.propiedad_id,
      tituloPropiedad: fila.propiedades?.titulo ?? null,
      visita: confirmada ? { id: confirmada.id, ...leerRango(confirmada.rango) } : null,
      direccion: null,
    }
  })

  const conVisita = solicitudes.filter((s) => s.visita !== null).map((s) => s.propiedadId)
  if (conVisita.length === 0) return solicitudes

  // La direccion se pide SIEMPRE para toda visita confirmada, sin mirar la hora
  // en JavaScript: la politica ubicacion_lectura_comprador_en_ventana decide si
  // la fila vuelve. Poner aqui un "si faltan menos de 2 horas" duplicaria la
  // regla, y si divergen manda la base.
  const { data: ubicaciones } = await cliente
    .from('propiedades_ubicacion')
    .select('propiedad_id,direccion')
    .in('propiedad_id', conVisita)
  const porPropiedad = new Map(
    ((ubicaciones ?? []) as { propiedad_id: string; direccion: string | null }[])
      .map((u) => [u.propiedad_id, u.direccion]),
  )

  return solicitudes.map((s) => (s.visita ? { ...s, direccion: porPropiedad.get(s.propiedadId) ?? null } : s))
}

interface FilaCitaVendedor {
  id: string
  rango: string
  estado: EstadoCita
  propiedades: { titulo: string } | null
  leads: { nombre_mostrado: string } | null
}

export async function listarCitasDelVendedor(
  cliente: SupabaseClient, vendedorId: string,
): Promise<CitaDelVendedor[]> {
  const { data, error } = await cliente
    .from('citas')
    .select('id,rango,estado,propiedades!citas_propiedad_id_fkey(titulo),leads!citas_lead_id_fkey(nombre_mostrado)')
    .eq('vendedor_id', vendedorId)
    // El orden de un rango es el de su limite inferior.
    .order('rango', { ascending: true })
  if (error) throw new Error('No se pudieron cargar tus visitas')

  return ((data ?? []) as unknown as FilaCitaVendedor[]).map((fila) => ({
    id: fila.id,
    estado: fila.estado,
    ...leerRango(fila.rango),
    tituloPropiedad: fila.propiedades?.titulo ?? null,
    nombreComprador: fila.leads?.nombre_mostrado ?? null,
  }))
}

/**
 * Limites abiertos a proposito: el horizonte (now() + 2 h a now() + 14 dias)
 * lo aplica franjas_libres en la base. La aplicacion no calcula fechas.
 */
export async function obtenerFranjasLibres(cliente: SupabaseClient, vendedorId: string): Promise<Franja[]> {
  const { data, error } = await cliente.rpc('franjas_libres', {
    p_vendedor_id: vendedorId, p_desde: '-infinity', p_hasta: 'infinity',
  })
  if (error) throw new Error('No se pudieron cargar las franjas libres')
  return (data ?? []) as Franja[]
}

export async function obtenerLeadParaReservar(
  cliente: SupabaseClient, leadId: string, compradorId: string,
): Promise<LeadParaReservar | null> {
  const { data, error } = await cliente
    .from('leads')
    .select('id,estado,vendedor_id,propiedades!leads_propiedad_id_fkey(titulo)')
    .eq('id', leadId)
    .eq('comprador_id', compradorId)
    .maybeSingle()
  if (error) throw new Error('No se pudo cargar la solicitud')
  if (!data) return null
  const fila = data as unknown as {
    id: string; estado: EstadoLead; vendedor_id: string; propiedades: { titulo: string } | null
  }
  return {
    id: fila.id, estado: fila.estado, vendedorId: fila.vendedor_id,
    tituloPropiedad: fila.propiedades?.titulo ?? null,
  }
}

export async function obtenerCitaDeParticipante(
  cliente: SupabaseClient, citaId: string, usuarioId: string, papel: 'comprador' | 'vendedor',
): Promise<CitaDeParticipante | null> {
  const { data, error } = await cliente
    .from('citas')
    .select('id,estado,vendedor_id,rango')
    .eq('id', citaId)
    .eq(papel === 'comprador' ? 'comprador_id' : 'vendedor_id', usuarioId)
    .maybeSingle()
  if (error) throw new Error('No se pudo cargar la visita')
  if (!data) return null
  const fila = data as { id: string; estado: EstadoCita; vendedor_id: string; rango: string }
  return { id: fila.id, estado: fila.estado, vendedorId: fila.vendedor_id, ...leerRango(fila.rango) }
}

export async function leerDisponibilidad(
  cliente: SupabaseClient, vendedorId: string,
): Promise<FilaDisponibilidad[]> {
  const { data, error } = await cliente
    .from('disponibilidad_semanal')
    .select('id,dia_semana,hora_inicio,hora_fin')
    .eq('vendedor_id', vendedorId)
    .order('dia_semana', { ascending: true })
    .order('hora_inicio', { ascending: true })
  if (error) throw new Error('No se pudo cargar tu horario')
  return (data ?? []) as FilaDisponibilidad[]
}

export async function leerFechasBloqueadas(
  cliente: SupabaseClient, vendedorId: string,
): Promise<FechaBloqueada[]> {
  const { data, error } = await cliente
    .from('fechas_bloqueadas')
    .select('id,desde,hasta')
    .eq('vendedor_id', vendedorId)
    .order('desde', { ascending: true })
  if (error) throw new Error('No se pudieron cargar tus fechas bloqueadas')
  return (data ?? []) as FechaBloqueada[]
}
```

- [ ] **Paso 8: correr y ver que pasa, incluidas las suites de SP4.**

```powershell
npx vitest run tests/rls/consultas-citas.test.ts
npx vitest run tests/unit/consultas-leads.test.ts tests/rls/leads.test.ts tests/rls/transicion-lead.test.ts
npm run test:unit
npm run test:rls
```

Esperado: 5 verdes en `consultas-citas`; SP4 sigue verde; unitarias en `N_unit_antes + 4`; RLS en `N_rls_antes + 5`. Si `listarLeadsDelVendedor` de SP4 empezara a fallar con `PGRST201`, PARAR y reportarlo: significaría que PostgREST ve una relación nueva entre `leads` y `propiedades` a través de `citas`.

- [ ] **Paso 9: falsificación, quitar el filtro por comprador.** En `listarSolicitudesDelComprador` borrar `.eq('comprador_id', compradorId)`. Correr `npx vitest run tests/rls/consultas-citas.test.ts -t "donde el usuario es el comprador"`. Esperado: ROJO, la lista trae también el lead que el usuario recibió como vendedor. Restaurar, VERDE.

- [ ] **Paso 10: falsificación, quitar el filtro por vendedor.** En `listarCitasDelVendedor` borrar `.eq('vendedor_id', vendedorId)`. Correr `-t "donde el usuario es el vendedor"`. Esperado: ROJO, aparece la visita que el usuario reservó como comprador. Restaurar, VERDE.

- [ ] **Paso 11: commit.**

```bash
$G add src/lib/citas/rango.ts src/lib/citas/consultas.ts tests/unit/rango-cita.test.ts tests/rls/consultas-citas.test.ts
$G commit -m "feat: consultas de citas y disponibilidad con filtro explicito por usuario

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 12: Server actions de reservar, mover y cancelar

**Files:**
- Modify: `src/lib/validacion/esquemas.ts`
- Create: `src/componentes/citas/acciones.ts`
- Test: `tests/unit/acciones-citas.test.ts`

**Interfaces:**
- Consumes: RPC `reservar_cita(p_lead_id, p_inicio)`, `mover_cita(p_cita_id, p_nuevo_inicio)`, `cancelar_cita(p_cita_id)`; `mensajeDeErrorCita`, `MENSAJE_GENERICO` (Tarea 10); `crearClienteServidor` de `src/lib/supabase/cliente-servidor.ts`.
- Produces:
  - En `src/lib/validacion/esquemas.ts`: `esquemaReserva` (`{ lead_id, inicio }`), `esquemaMoverCita` (`{ cita_id, inicio }`), `esquemaCancelarCita` (`{ cita_id }`), `esquemaIdentificador` (`{ id }`)
  - En `src/componentes/citas/acciones.ts` (`'use server'`, solo funciones async exportadas):
    - `interface ResultadoAccionCita { error?: string; hecho?: boolean }` (los tipos sí se pueden exportar: se borran al compilar)
    - `reservarCita(_previo: ResultadoAccionCita, formData: FormData): Promise<ResultadoAccionCita>` — lee `lead_id`, `inicio`
    - `moverCita(_previo: ResultadoAccionCita, formData: FormData): Promise<ResultadoAccionCita>` — lee `cita_id`, `inicio`
    - `cancelarCita(_previo: ResultadoAccionCita, formData: FormData): Promise<ResultadoAccionCita>` — lee `cita_id`

Van en `src/componentes/citas/` y no bajo una ruta porque las usan `/mi-cuenta` y `/panel/citas`; mismo precedente que `src/componentes/acciones-sesion.ts`.

- [ ] **Paso 1: medir `N_unit_antes`.**

```powershell
npm run test:unit
```

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/unit/acciones-citas.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ rpc: baseFalsaRpc }),
}))

const LEAD = '3f1c1b5e-8f5a-4d2b-9c1e-2a7b6d4e5f60'
const CITA = '9a2d7c41-3b6e-4f18-8d5a-1c2b3e4f5a6b'
const FRANJA = '2026-09-17T20:00:00+00:00'
const OTRA_FRANJA = '2026-09-17T21:00:00+00:00'

let codigoForzado: string | null = null
let escrituras: string[] = []

const falla = (code: string) => ({ data: null, error: { code, message: 'detalle interno de postgres' } })

/**
 * Base falsa CON comportamiento, no un espia de llamadas. Acepta solo la
 * combinacion exacta de valores validos y responde como las funciones reales a
 * todo lo demas. Las pruebas miran el RESULTADO de la accion y las escrituras
 * que la base dejo: una accion que mandara la cadena cruda del formulario (con
 * espacios) recibiria el mismo VS001/VS004 que le daria la base de verdad.
 */
async function baseFalsaRpc(nombre: string, argumentos: Record<string, unknown>) {
  if (codigoForzado) return falla(codigoForzado)
  if (nombre === 'reservar_cita') {
    if (argumentos.p_lead_id !== LEAD) return falla('VS001')
    if (argumentos.p_inicio !== FRANJA) return falla('VS004')
    escrituras.push(`reservada ${FRANJA}`)
    return { data: CITA, error: null }
  }
  if (nombre === 'mover_cita') {
    if (argumentos.p_cita_id !== CITA) return falla('VS006')
    if (argumentos.p_nuevo_inicio !== OTRA_FRANJA) return falla('VS004')
    escrituras.push(`movida ${OTRA_FRANJA}`)
    return { data: null, error: null }
  }
  if (nombre === 'cancelar_cita') {
    if (argumentos.p_cita_id !== CITA) return falla('VS006')
    escrituras.push('cancelada')
    return { data: null, error: null }
  }
  return falla('PGRST202')
}

const { reservarCita, moverCita, cancelarCita } = await import('@/componentes/citas/acciones')
const mapear = await import('@/lib/errores/mapear')

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries(campos)) datos.append(clave, valor)
  return datos
}

beforeEach(() => {
  codigoForzado = null
  escrituras = []
  revalidatePath.mockReset()
})

describe('reservarCita', () => {
  it('con un lead y una franja validos queda hecha y revalida las dos vistas', async () => {
    expect(await reservarCita({}, formulario({ lead_id: LEAD, inicio: FRANJA }))).toEqual({ hecho: true })
    expect(escrituras).toEqual([`reservada ${FRANJA}`])
    expect(revalidatePath).toHaveBeenCalledWith('/mi-cuenta')
    expect(revalidatePath).toHaveBeenCalledWith('/panel/citas')
  })

  it('manda a la base los valores ya validados, no la cadena cruda del formulario', async () => {
    const r = await reservarCita({}, formulario({ lead_id: ` ${LEAD} `, inicio: `  ${FRANJA}\n` }))
    expect(r).toEqual({ hecho: true })
    expect(escrituras).toEqual([`reservada ${FRANJA}`])
  })

  it('un inicio que no es un instante con zona no llega a la base', async () => {
    for (const inicio of ['mañana', '2026-09-17T20:00:00', '']) {
      expect(await reservarCita({}, formulario({ lead_id: LEAD, inicio }))).toEqual({ error: mapear.MENSAJE_GENERICO })
    }
    expect(escrituras).toEqual([])
  })

  it('sin lead_id no llega a la base', async () => {
    expect(await reservarCita({}, formulario({ inicio: FRANJA }))).toEqual({ error: mapear.MENSAJE_GENERICO })
    expect(escrituras).toEqual([])
  })

  it.each([
    ['VS001', mapear.MENSAJE_VISITA_SOLICITUD_INEXISTENTE],
    ['VS002', mapear.MENSAJE_VISITA_NO_PARTICIPA],
    ['VS003', mapear.MENSAJE_VISITA_LEAD_NO_ACEPTADO],
    ['VS004', mapear.MENSAJE_VISITA_FRANJA_NO_DISPONIBLE],
    ['VS005', mapear.MENSAJE_VISITA_YA_RESERVADA],
    ['VS006', mapear.MENSAJE_VISITA_INEXISTENTE],
    ['VS007', mapear.MENSAJE_VISITA_YA_CANCELADA],
    ['VS008', mapear.MENSAJE_VISITA_YA_EMPEZO],
  ])('el codigo %s de la base llega como su mensaje, sin revalidar', async (codigo, mensaje) => {
    codigoForzado = codigo
    expect(await reservarCita({}, formulario({ lead_id: LEAD, inicio: FRANJA }))).toEqual({ error: mensaje })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un error que no es VS cae en el mensaje generico', async () => {
    codigoForzado = '42501'
    expect(await reservarCita({}, formulario({ lead_id: LEAD, inicio: FRANJA }))).toEqual({ error: mapear.MENSAJE_GENERICO })
  })
})

describe('moverCita', () => {
  it('con una cita y una franja validas queda hecha y revalida', async () => {
    expect(await moverCita({}, formulario({ cita_id: CITA, inicio: OTRA_FRANJA }))).toEqual({ hecho: true })
    expect(escrituras).toEqual([`movida ${OTRA_FRANJA}`])
    expect(revalidatePath).toHaveBeenCalledWith('/mi-cuenta')
    expect(revalidatePath).toHaveBeenCalledWith('/panel/citas')
  })

  it('manda a la base los valores ya validados', async () => {
    expect(await moverCita({}, formulario({ cita_id: `${CITA} `, inicio: ` ${OTRA_FRANJA}` }))).toEqual({ hecho: true })
  })

  it('una visita que ya empezo llega como su mensaje, sin revalidar', async () => {
    codigoForzado = 'VS008'
    expect(await moverCita({}, formulario({ cita_id: CITA, inicio: OTRA_FRANJA })))
      .toEqual({ error: mapear.MENSAJE_VISITA_YA_EMPEZO })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un cita_id que no es un uuid no llega a la base', async () => {
    expect(await moverCita({}, formulario({ cita_id: 'cita-1', inicio: OTRA_FRANJA })))
      .toEqual({ error: mapear.MENSAJE_GENERICO })
    expect(escrituras).toEqual([])
  })
})

describe('cancelarCita', () => {
  it('con una cita valida queda hecha y revalida', async () => {
    expect(await cancelarCita({}, formulario({ cita_id: CITA }))).toEqual({ hecho: true })
    expect(escrituras).toEqual(['cancelada'])
    expect(revalidatePath).toHaveBeenCalledWith('/mi-cuenta')
  })

  it('una visita ya cancelada llega como su mensaje', async () => {
    codigoForzado = 'VS007'
    expect(await cancelarCita({}, formulario({ cita_id: CITA }))).toEqual({ error: mapear.MENSAJE_VISITA_YA_CANCELADA })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('sin cita_id no llega a la base', async () => {
    expect(await cancelarCita({}, formulario({}))).toEqual({ error: mapear.MENSAJE_GENERICO })
    expect(escrituras).toEqual([])
  })
})
```

- [ ] **Paso 3: correrla y ver que falla.**

```powershell
npx vitest run tests/unit/acciones-citas.test.ts
```

Esperado: ROJO, no se resuelve `@/componentes/citas/acciones`.

- [ ] **Paso 4: añadir los esquemas.** Al final de `src/lib/validacion/esquemas.ts`:

```ts
// ---------------------------------------------------------------------------
// SP5: visitas.
//
// El instante llega del value de un boton que pinto la propia pagina con lo
// que devolvio franjas_libres ("2026-09-17T20:00:00+00:00"). Se exige zona
// explicita: un instante sin zona lo interpretaria la base con su TimeZone, y
// eso es justo lo que SP5 prohibe. La validez de la franja la decide la base.
const instanteConZona = z.string().trim().pipe(z.iso.datetime({ offset: true }))
const identificador = z.string().trim().uuid()

export const esquemaReserva = z.object({ lead_id: identificador, inicio: instanteConZona })
export const esquemaMoverCita = z.object({ cita_id: identificador, inicio: instanteConZona })
export const esquemaCancelarCita = z.object({ cita_id: identificador })
export const esquemaIdentificador = z.object({ id: identificador })
```

- [ ] **Paso 5: implementar las acciones.** Crear `src/componentes/citas/acciones.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { MENSAJE_GENERICO, mensajeDeErrorCita } from '@/lib/errores/mapear'
import { esquemaCancelarCita, esquemaMoverCita, esquemaReserva } from '@/lib/validacion/esquemas'

export interface ResultadoAccionCita {
  error?: string
  hecho?: boolean
}

function revalidarVistasDeCitas() {
  revalidatePath('/mi-cuenta')
  revalidatePath('/panel/citas')
}

/**
 * Las tres acciones siguen el mismo orden: validar, llamar al RPC CON LOS
 * VALORES VALIDADOS (analisis.data, nunca formData otra vez), traducir el
 * error por codigo. Los RPC devuelven error ante cualquier regla rota, asi que
 * no hay un "0 filas sin error" que vigilar aqui: eso aplica a los UPDATE y
 * DELETE directos de disponibilidad (src/app/(vendedor)/panel/disponibilidad).
 */
export async function reservarCita(
  _previo: ResultadoAccionCita, formData: FormData,
): Promise<ResultadoAccionCita> {
  const analisis = esquemaReserva.safeParse({
    lead_id: formData.get('lead_id'),
    inicio: formData.get('inicio'),
  })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const { error } = await (await crearClienteServidor()).rpc('reservar_cita', {
    p_lead_id: analisis.data.lead_id,
    p_inicio: analisis.data.inicio,
  })
  if (error) return { error: mensajeDeErrorCita(error) }

  revalidarVistasDeCitas()
  return { hecho: true }
}

export async function moverCita(
  _previo: ResultadoAccionCita, formData: FormData,
): Promise<ResultadoAccionCita> {
  const analisis = esquemaMoverCita.safeParse({
    cita_id: formData.get('cita_id'),
    inicio: formData.get('inicio'),
  })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const { error } = await (await crearClienteServidor()).rpc('mover_cita', {
    p_cita_id: analisis.data.cita_id,
    p_nuevo_inicio: analisis.data.inicio,
  })
  if (error) return { error: mensajeDeErrorCita(error) }

  revalidarVistasDeCitas()
  return { hecho: true }
}

export async function cancelarCita(
  _previo: ResultadoAccionCita, formData: FormData,
): Promise<ResultadoAccionCita> {
  const analisis = esquemaCancelarCita.safeParse({ cita_id: formData.get('cita_id') })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const { error } = await (await crearClienteServidor()).rpc('cancelar_cita', {
    p_cita_id: analisis.data.cita_id,
  })
  if (error) return { error: mensajeDeErrorCita(error) }

  revalidarVistasDeCitas()
  return { hecho: true }
}
```

- [ ] **Paso 6: correrla y ver que pasa.**

```powershell
npx vitest run tests/unit/acciones-citas.test.ts
npx vitest run tests/unit/validacion.test.ts
npm run test:unit
```

Esperado: 20 verdes (13 de `reservarCita`, de ellas 8 por `it.each`; 4 de `moverCita`; 3 de `cancelarCita`); `validacion.test.ts` sigue verde; suite en `N_unit_antes + 20`.

- [ ] **Paso 7: falsificación, validar una cadena y usar otra.** En `reservarCita` sustituir `p_inicio: analisis.data.inicio,` por `p_inicio: formData.get('inicio'),`. Correr `-t "valores ya validados"`. Esperado: ROJO en `reservarCita` (la base falsa recibe la cadena con espacios y responde `VS004`). Restaurar, VERDE.

- [ ] **Paso 8: commit.**

```bash
$G add src/lib/validacion/esquemas.ts src/componentes/citas/acciones.ts tests/unit/acciones-citas.test.ts
$G commit -m "feat: server actions de reservar, mover y cancelar visitas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 13: Server actions del horario y las fechas bloqueadas

**Files:**
- Modify: `src/lib/validacion/esquemas.ts`
- Create: `src/app/(vendedor)/panel/disponibilidad/acciones.ts`
- Test: `tests/unit/acciones-disponibilidad.test.ts`

**Interfaces:**
- Consumes: tablas `disponibilidad_semanal` y `fechas_bloqueadas` (Tarea 2); `MENSAJE_GENERICO`, `MENSAJE_HORARIO_NO_ENCONTRADO`, `MENSAJE_BLOQUEO_NO_ENCONTRADO` (Tarea 10); `esquemaIdentificador` (Tarea 12).
- Produces:
  - En `src/lib/validacion/esquemas.ts`: `esquemaFranjaSemanal` (`{ dia_semana: number; hora_inicio: string; hora_fin: string }`), `esquemaBloqueo` (`{ desde: string; hasta: string }`)
  - En `src/app/(vendedor)/panel/disponibilidad/acciones.ts` (`'use server'`):
    - `interface ResultadoDisponibilidad { error?: string; hecho?: boolean }`
    - `agregarFranjaSemanal(_previo: ResultadoDisponibilidad, formData: FormData): Promise<ResultadoDisponibilidad>` — lee `dia_semana`, `hora_inicio`, `hora_fin`
    - `eliminarFranjaSemanal(_previo: ResultadoDisponibilidad, formData: FormData): Promise<ResultadoDisponibilidad>` — lee `id`
    - `bloquearFechas(_previo: ResultadoDisponibilidad, formData: FormData): Promise<ResultadoDisponibilidad>` — lee `desde`, `hasta`
    - `desbloquearFechas(_previo: ResultadoDisponibilidad, formData: FormData): Promise<ResultadoDisponibilidad>` — lee `id`

Mensajes de validación comprobados contra el zod 4.4.3 instalado: `z.iso.date({ message })` y `.refine(..., { message, path })` devuelven el texto propio. Un campo ausente llega como `null` y zod respondería en inglés, por eso los campos de texto pasan por un `preprocess` que convierte lo que no es cadena en `''`.

- [ ] **Paso 1: medir `N_unit_antes`.**

```powershell
npm run test:unit
```

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/unit/acciones-disponibilidad.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => clienteDeLaBaseFalsa() }))

const VENDEDOR = '5b0c2f1e-7d3a-4e6b-9f8c-1a2b3c4d5e6f'
const OTRO_VENDEDOR = '6c1d3e2f-8e4b-4f7c-8a9d-2b3c4d5e6f70'

type Fila = { tabla: string; id: string; vendedor_id: string } & Record<string, unknown>
let usuarioId: string | null = VENDEDOR
let filas: Fila[] = []

/**
 * Base falsa que se comporta como PostgREST con la RLS del dueno de la Tarea 2:
 *   - INSERT con un vendedor_id que no es el de la sesion: 42501.
 *   - DELETE sobre filas ajenas o inexistentes: CERO filas y error null. Es la
 *     trampa que la accion tiene que detectar contando filas.
 */
function clienteDeLaBaseFalsa() {
  return {
    auth: { getUser: async () => ({ data: { user: usuarioId ? { id: usuarioId } : null } }) },
    from: (tabla: string) => ({
      insert: (valores: Record<string, unknown>) => ({
        select: async () => {
          if (valores.vendedor_id !== usuarioId) {
            return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }
          }
          const fila: Fila = { tabla, id: randomUUID(), vendedor_id: String(valores.vendedor_id), ...valores }
          filas.push(fila)
          return { data: [{ id: fila.id }], error: null }
        },
      }),
      delete: () => {
        const filtros: Record<string, unknown> = {}
        const consulta = {
          eq(columna: string, valor: unknown) {
            filtros[columna] = valor
            return consulta
          },
          async select() {
            const alcanzadas = filas.filter((f) =>
              f.tabla === tabla && f.vendedor_id === usuarioId
              && Object.entries(filtros).every(([columna, valor]) => f[columna] === valor))
            filas = filas.filter((f) => !alcanzadas.includes(f))
            return { data: alcanzadas.map((f) => ({ id: f.id })), error: null }
          },
        }
        return consulta
      },
    }),
  }
}

const { agregarFranjaSemanal, eliminarFranjaSemanal, bloquearFechas, desbloquearFechas } = await import(
  '@/app/(vendedor)/panel/disponibilidad/acciones'
)
const { MENSAJE_BLOQUEO_NO_ENCONTRADO, MENSAJE_GENERICO, MENSAJE_HORARIO_NO_ENCONTRADO } = await import(
  '@/lib/errores/mapear'
)

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries(campos)) datos.append(clave, valor)
  return datos
}

beforeEach(() => {
  usuarioId = VENDEDOR
  filas = []
  revalidatePath.mockReset()
})

describe('agregarFranjaSemanal', () => {
  it('guarda una franja valida del vendedor de la sesion, con los valores ya validados', async () => {
    const r = await agregarFranjaSemanal({}, formulario({ dia_semana: ' 4 ', hora_inicio: '15:00 ', hora_fin: ' 16:00' }))
    expect(r).toEqual({ hecho: true })
    expect(filas).toEqual([{
      tabla: 'disponibilidad_semanal', id: expect.any(String), vendedor_id: VENDEDOR,
      dia_semana: 4, hora_inicio: '15:00', hora_fin: '16:00',
    }])
    expect(revalidatePath).toHaveBeenCalledWith('/panel/disponibilidad')
  })

  it('horas que no estan en punto, al reves o ausentes no llegan a la base', async () => {
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '4', hora_inicio: '15:30', hora_fin: '16:00' })))
      .toEqual({ error: 'Elige una hora en punto' })
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '4', hora_inicio: '16:00', hora_fin: '15:00' })))
      .toEqual({ error: 'La hora de fin tiene que ser posterior a la de inicio' })
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '4', hora_inicio: '15:00' })))
      .toEqual({ error: 'Elige una hora en punto' })
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '9', hora_inicio: '15:00', hora_fin: '16:00' })))
      .toEqual({ error: 'Elige un dia' })
    expect(filas).toEqual([])
  })

  it('sin sesion no llega a la base', async () => {
    usuarioId = null
    expect(await agregarFranjaSemanal({}, formulario({ dia_semana: '4', hora_inicio: '15:00', hora_fin: '16:00' })))
      .toEqual({ error: MENSAJE_GENERICO })
    expect(filas).toEqual([])
  })
})

describe('eliminarFranjaSemanal', () => {
  it('borra una franja propia', async () => {
    const id = randomUUID()
    filas = [{ tabla: 'disponibilidad_semanal', id, vendedor_id: VENDEDOR }]
    expect(await eliminarFranjaSemanal({}, formulario({ id }))).toEqual({ hecho: true })
    expect(filas).toEqual([])
    expect(revalidatePath).toHaveBeenCalledWith('/panel/disponibilidad')
  })

  it('una franja ajena afecta cero filas y NO se reporta como exito', async () => {
    const id = randomUUID()
    filas = [{ tabla: 'disponibilidad_semanal', id, vendedor_id: OTRO_VENDEDOR }]
    expect(await eliminarFranjaSemanal({}, formulario({ id }))).toEqual({ error: MENSAJE_HORARIO_NO_ENCONTRADO })
    expect(filas).toHaveLength(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un id que no es uuid no llega a la base', async () => {
    expect(await eliminarFranjaSemanal({}, formulario({ id: 'fila-1' }))).toEqual({ error: MENSAJE_GENERICO })
  })
})

describe('bloquearFechas', () => {
  it('guarda un rango valido del vendedor de la sesion', async () => {
    expect(await bloquearFechas({}, formulario({ desde: '2026-12-24', hasta: ' 2026-12-26 ' }))).toEqual({ hecho: true })
    expect(filas).toEqual([{
      tabla: 'fechas_bloqueadas', id: expect.any(String), vendedor_id: VENDEDOR,
      desde: '2026-12-24', hasta: '2026-12-26',
    }])
  })

  it('una fecha final anterior, ilegible o ausente no llega a la base', async () => {
    expect(await bloquearFechas({}, formulario({ desde: '2026-12-26', hasta: '2026-12-24' })))
      .toEqual({ error: 'La fecha final no puede ser anterior a la inicial' })
    expect(await bloquearFechas({}, formulario({ desde: 'ayer', hasta: '2026-12-24' })))
      .toEqual({ error: 'Elige una fecha' })
    expect(await bloquearFechas({}, formulario({ hasta: '2026-12-24' })))
      .toEqual({ error: 'Elige una fecha' })
    expect(filas).toEqual([])
  })
})

describe('desbloquearFechas', () => {
  it('borra un bloqueo propio', async () => {
    const id = randomUUID()
    filas = [{ tabla: 'fechas_bloqueadas', id, vendedor_id: VENDEDOR }]
    expect(await desbloquearFechas({}, formulario({ id }))).toEqual({ hecho: true })
    expect(filas).toEqual([])
  })

  it('un bloqueo ajeno afecta cero filas y NO se reporta como exito', async () => {
    const id = randomUUID()
    filas = [{ tabla: 'fechas_bloqueadas', id, vendedor_id: OTRO_VENDEDOR }]
    expect(await desbloquearFechas({}, formulario({ id }))).toEqual({ error: MENSAJE_BLOQUEO_NO_ENCONTRADO })
    expect(filas).toHaveLength(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
```

- [ ] **Paso 3: correrla y ver que falla.**

```powershell
npx vitest run tests/unit/acciones-disponibilidad.test.ts
```

Esperado: ROJO, no se resuelve `@/app/(vendedor)/panel/disponibilidad/acciones`.

- [ ] **Paso 4: añadir los esquemas.** Al final de `src/lib/validacion/esquemas.ts`, después de lo añadido en la Tarea 12:

```ts
// SP5: disponibilidad del vendedor.
//
// Un campo ausente llega como null, y uno manipulado como File: los dos se
// tratan como texto vacio para que el mensaje sea el del formulario y no el
// generico de zod en ingles. Las comparaciones de abajo son de TEXTO
// ("09:00" < "10:00", "2026-12-24" <= "2026-12-26"), validas porque el formato
// esta fijado con cero a la izquierda. La regla que manda es el CHECK de la
// tabla (20260915000200); esto solo adelanta el mensaje.
const comoTexto = (valor: unknown) => (typeof valor === 'string' ? valor : '')
const HORA_EN_PUNTO = /^([01]\d|2[0-4]):00$/
const horaEnPunto = z.preprocess(comoTexto, z.string().trim().regex(HORA_EN_PUNTO, 'Elige una hora en punto'))
const fechaDeCalendario = z.preprocess(
  comoTexto, z.string().trim().pipe(z.iso.date({ message: 'Elige una fecha' })),
)

export const esquemaFranjaSemanal = z.object({
  dia_semana: z.coerce.number().int().min(1, 'Elige un dia').max(7, 'Elige un dia'),
  hora_inicio: horaEnPunto,
  hora_fin: horaEnPunto,
}).refine((franja) => franja.hora_fin > franja.hora_inicio, {
  message: 'La hora de fin tiene que ser posterior a la de inicio',
  path: ['hora_fin'],
})

export const esquemaBloqueo = z.object({
  desde: fechaDeCalendario,
  hasta: fechaDeCalendario,
}).refine((bloqueo) => bloqueo.hasta >= bloqueo.desde, {
  message: 'La fecha final no puede ser anterior a la inicial',
  path: ['hasta'],
})
```

- [ ] **Paso 5: implementar las acciones.** Crear `src/app/(vendedor)/panel/disponibilidad/acciones.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import {
  MENSAJE_BLOQUEO_NO_ENCONTRADO, MENSAJE_GENERICO, MENSAJE_HORARIO_NO_ENCONTRADO,
} from '@/lib/errores/mapear'
import { esquemaBloqueo, esquemaFranjaSemanal, esquemaIdentificador } from '@/lib/validacion/esquemas'

export interface ResultadoDisponibilidad {
  error?: string
  hecho?: boolean
}

const RUTA = '/panel/disponibilidad'

async function clienteConUsuario() {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getUser()
  return { supabase, usuarioId: data.user?.id ?? null }
}

export async function agregarFranjaSemanal(
  _previo: ResultadoDisponibilidad, formData: FormData,
): Promise<ResultadoDisponibilidad> {
  const analisis = esquemaFranjaSemanal.safeParse({
    dia_semana: formData.get('dia_semana'),
    hora_inicio: formData.get('hora_inicio'),
    hora_fin: formData.get('hora_fin'),
  })
  if (!analisis.success) return { error: analisis.error.issues[0]?.message ?? MENSAJE_GENERICO }

  const { supabase, usuarioId } = await clienteConUsuario()
  if (!usuarioId) return { error: MENSAJE_GENERICO }

  const { data, error } = await supabase
    .from('disponibilidad_semanal')
    .insert({
      vendedor_id: usuarioId,
      dia_semana: analisis.data.dia_semana,
      hora_inicio: analisis.data.hora_inicio,
      hora_fin: analisis.data.hora_fin,
    })
    .select('id')
  if (error || !data || data.length === 0) return { error: MENSAJE_GENERICO }

  revalidatePath(RUTA)
  return { hecho: true }
}

export async function eliminarFranjaSemanal(
  _previo: ResultadoDisponibilidad, formData: FormData,
): Promise<ResultadoDisponibilidad> {
  const analisis = esquemaIdentificador.safeParse({ id: formData.get('id') })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const { supabase, usuarioId } = await clienteConUsuario()
  if (!usuarioId) return { error: MENSAJE_GENERICO }

  // El .eq('vendedor_id') es explicito aunque la politica ya lo exija: una
  // politica de lectura FOR ALL anadida mas adelante no debe convertir este
  // DELETE en un borrado de filas ajenas.
  const { data, error } = await supabase
    .from('disponibilidad_semanal')
    .delete()
    .eq('id', analisis.data.id)
    .eq('vendedor_id', usuarioId)
    .select('id')
  if (error) return { error: MENSAJE_GENERICO }
  // .select() encadenado: un DELETE que no alcanza ninguna fila (ajena o ya
  // borrada) devuelve error null. Sin contar filas, pasaria por exito.
  if (!data || data.length === 0) return { error: MENSAJE_HORARIO_NO_ENCONTRADO }

  revalidatePath(RUTA)
  return { hecho: true }
}

export async function bloquearFechas(
  _previo: ResultadoDisponibilidad, formData: FormData,
): Promise<ResultadoDisponibilidad> {
  const analisis = esquemaBloqueo.safeParse({
    desde: formData.get('desde'),
    hasta: formData.get('hasta'),
  })
  if (!analisis.success) return { error: analisis.error.issues[0]?.message ?? MENSAJE_GENERICO }

  const { supabase, usuarioId } = await clienteConUsuario()
  if (!usuarioId) return { error: MENSAJE_GENERICO }

  const { data, error } = await supabase
    .from('fechas_bloqueadas')
    .insert({ vendedor_id: usuarioId, desde: analisis.data.desde, hasta: analisis.data.hasta })
    .select('id')
  if (error || !data || data.length === 0) return { error: MENSAJE_GENERICO }

  revalidatePath(RUTA)
  return { hecho: true }
}

export async function desbloquearFechas(
  _previo: ResultadoDisponibilidad, formData: FormData,
): Promise<ResultadoDisponibilidad> {
  const analisis = esquemaIdentificador.safeParse({ id: formData.get('id') })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const { supabase, usuarioId } = await clienteConUsuario()
  if (!usuarioId) return { error: MENSAJE_GENERICO }

  const { data, error } = await supabase
    .from('fechas_bloqueadas')
    .delete()
    .eq('id', analisis.data.id)
    .eq('vendedor_id', usuarioId)
    .select('id')
  if (error) return { error: MENSAJE_GENERICO }
  if (!data || data.length === 0) return { error: MENSAJE_BLOQUEO_NO_ENCONTRADO }

  revalidatePath(RUTA)
  return { hecho: true }
}
```

- [ ] **Paso 6: correrla y ver que pasa.**

```powershell
npx vitest run tests/unit/acciones-disponibilidad.test.ts
npm run test:unit
```

Esperado: 10 verdes; suite en `N_unit_antes + 10`.

- [ ] **Paso 7: falsificación, dar por bueno un borrado de cero filas.** En `eliminarFranjaSemanal` borrar la línea `if (!data || data.length === 0) return { error: MENSAJE_HORARIO_NO_ENCONTRADO }`. Correr `-t "una franja ajena afecta cero filas"`. Esperado: ROJO, la acción devuelve `{ hecho: true }`. Restaurar, VERDE. El filtro `.eq('vendedor_id')` no se falsifica aquí: la base falsa aplica la RLS del dueño igual que la real, y la RLS ya tiene su prueba y su falsificación en la Tarea 2.

- [ ] **Paso 8: commit.**

```bash
$G add src/lib/validacion/esquemas.ts "src/app/(vendedor)/panel/disponibilidad/acciones.ts" tests/unit/acciones-disponibilidad.test.ts
$G commit -m "feat: acciones del horario semanal y las fechas bloqueadas, sin exito con cero filas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 14: Página `/panel/disponibilidad`

**Files:**
- Create: `src/app/(vendedor)/panel/disponibilidad/opciones.ts`
- Create: `src/app/(vendedor)/panel/disponibilidad/formularios.tsx`
- Create: `src/app/(vendedor)/panel/disponibilidad/page.tsx`
- Modify: `tests/unit/metadatos-paginas.test.ts`
- Test: `tests/unit/pagina-disponibilidad.test.ts`

**Interfaces:**
- Consumes: `sesionActual(): Promise<Sesion>` con `idUsuario` (`src/lib/auth/sesion.ts`); `crearClienteServidor`; `leerDisponibilidad`, `leerFechasBloqueadas` (Tarea 11); las cuatro acciones y `ResultadoDisponibilidad` (Tarea 13).
- Produces:
  - `opciones.ts` (módulo normal, NO `'use client'`: un Server Component que importa un valor de un módulo de cliente recibe una referencia de cliente, no el valor): `DIAS_SEMANA`, `HORAS_INICIO`, `HORAS_FIN`, `nombreDia(dia: number): string`, `horaCorta(hora: string): string`
  - `formularios.tsx` (`'use client'`): `FormularioFranja()`, `EliminarFranja({ id }: { id: string })`, `FormularioBloqueo()`, `Desbloquear({ id }: { id: string })`
  - `page.tsx`: `metadata`, `default async function PaginaDisponibilidad()`

La ruta ya está protegida: `/panel` en `RUTAS_PROTEGIDAS` de `src/lib/auth/roles.ts` cubre `/panel/disponibilidad` (el prefijo se compara con `ruta.startsWith(prefijo + '/')`). La página repite la comprobación de sesión por el mismo motivo que `panel/leads/page.tsx`.

- [ ] **Paso 1: medir `N_unit_antes`.**

```powershell
npm run test:unit
```

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/unit/pagina-disponibilidad.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const sesionActual = vi.fn()
const redirect = vi.fn()

vi.mock('@/lib/auth/sesion', () => ({ sesionActual }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('next/navigation', () => ({ redirect, notFound: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Consultas falsas CON comportamiento: devuelven las filas del vendedor que se
// les pida. Si la pagina pidiera las de otro id, pintaria las del otro.
vi.mock('@/lib/citas/consultas', () => ({
  leerDisponibilidad: async (_cliente: unknown, vendedorId: string) => horarios[vendedorId] ?? [],
  leerFechasBloqueadas: async (_cliente: unknown, vendedorId: string) => bloqueos[vendedorId] ?? [],
}))

const VENDEDOR = 'vendedor-de-la-sesion'
const OTRO = 'otro-vendedor'
let horarios: Record<string, { id: string; dia_semana: number; hora_inicio: string; hora_fin: string }[]> = {}
let bloqueos: Record<string, { id: string; desde: string; hasta: string }[]> = {}

const { default: PaginaDisponibilidad, metadata } = await import('@/app/(vendedor)/panel/disponibilidad/page')
const { FormularioFranja, FormularioBloqueo, EliminarFranja, Desbloquear } = await import(
  '@/app/(vendedor)/panel/disponibilidad/formularios'
)

function textoPlano(nodo: unknown): string {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return ''
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo)
  if (Array.isArray(nodo)) return nodo.map(textoPlano).join('')
  if (typeof nodo === 'object' && 'props' in (nodo as Record<string, unknown>)) {
    return textoPlano((nodo as { props?: { children?: unknown } }).props?.children)
  }
  return ''
}

type Nodo = { type?: unknown; props?: Record<string, unknown> }
function buscarTodos(nodo: unknown, predicado: (n: Nodo) => boolean, hallados: Nodo[] = []): Nodo[] {
  if (nodo === null || nodo === undefined || typeof nodo !== 'object') return hallados
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) buscarTodos(hijo, predicado, hallados)
    return hallados
  }
  const elemento = nodo as Nodo
  if (predicado(elemento)) hallados.push(elemento)
  if (elemento.props) buscarTodos(elemento.props.children, predicado, hallados)
  return hallados
}

beforeEach(() => {
  sesionActual.mockReset().mockResolvedValue({ hayUsuario: true, accessToken: 't', idUsuario: VENDEDOR })
  redirect.mockReset().mockImplementation((ruta: string) => { throw new Error(`NEXT_REDIRECT:${ruta}`) })
  horarios = {
    [VENDEDOR]: [{ id: 'f1', dia_semana: 4, hora_inicio: '15:00:00', hora_fin: '16:00:00' }],
    [OTRO]: [{ id: 'f9', dia_semana: 1, hora_inicio: '08:00:00', hora_fin: '09:00:00' }],
  }
  bloqueos = {
    [VENDEDOR]: [{ id: 'b1', desde: '2026-12-24', hasta: '2026-12-26' }],
    [OTRO]: [{ id: 'b9', desde: '2026-01-01', hasta: '2026-01-01' }],
  }
})

describe('/panel/disponibilidad', () => {
  it('es privada', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('sin sesion redirige a /login', async () => {
    sesionActual.mockResolvedValue({ hayUsuario: false, accessToken: null, idUsuario: null })
    await expect(PaginaDisponibilidad()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('muestra el horario y los bloqueos del vendedor de la sesion, cada uno con su boton', async () => {
    const elemento = await PaginaDisponibilidad()
    const texto = textoPlano(elemento)

    expect(texto).toContain('jueves · 15:00 – 16:00')
    expect(texto).toContain('2026-12-24 a 2026-12-26')
    expect(texto).not.toContain('lunes · 08:00 – 09:00')
    expect(texto).not.toContain('2026-01-01')

    expect(buscarTodos(elemento, (n) => n.type === EliminarFranja).map((n) => n.props?.id)).toEqual(['f1'])
    expect(buscarTodos(elemento, (n) => n.type === Desbloquear).map((n) => n.props?.id)).toEqual(['b1'])
    expect(buscarTodos(elemento, (n) => n.type === FormularioFranja)).toHaveLength(1)
    expect(buscarTodos(elemento, (n) => n.type === FormularioBloqueo)).toHaveLength(1)
  })

  it('sin horario avisa de que nadie puede reservar', async () => {
    horarios = {}
    const texto = textoPlano(await PaginaDisponibilidad())
    expect(texto).toContain('Todavía no has definido tu horario: nadie puede reservarte visitas.')
  })

  it('FormularioFranja ofrece los siete dias y horas en punto hasta las 24:00', () => {
    const html = renderToStaticMarkup(createElement(FormularioFranja))
    expect(html).toContain('name="dia_semana"')
    expect(html).toContain('value="7"')
    expect(html).toContain('>domingo<')
    expect(html).toContain('name="hora_inicio"')
    expect(html).toContain('value="00:00"')
    expect(html).toContain('name="hora_fin"')
    expect(html).toContain('value="24:00"')
    expect(html).not.toContain('value="00:30"')
    expect(html).toContain('Agregar franja')
  })

  it('FormularioBloqueo pide dos fechas', () => {
    const html = renderToStaticMarkup(createElement(FormularioBloqueo))
    expect(html).toContain('name="desde"')
    expect(html).toContain('name="hasta"')
    expect(html).toContain('type="date"')
    expect(html).toContain('Bloquear fechas')
  })
})
```

- [ ] **Paso 3: añadir la página a la prueba de metadatos.** En `tests/unit/metadatos-paginas.test.ts`, dentro de `PAGINAS`, justo después de la línea de `/panel`:

```ts
  {
    ruta: '/panel/disponibilidad',
    modulo: '../../src/app/(vendedor)/panel/disponibilidad/page',
    privada: true,
  },
```

- [ ] **Paso 4: correr las dos y ver que fallan.**

```powershell
npx vitest run tests/unit/pagina-disponibilidad.test.ts tests/unit/metadatos-paginas.test.ts
```

Esperado: ROJO, no se resuelve `@/app/(vendedor)/panel/disponibilidad/page`.

- [ ] **Paso 5: crear las opciones.** Crear `src/app/(vendedor)/panel/disponibilidad/opciones.ts`:

```ts
/** ISO: el indice 0 es el lunes (dia_semana = 1). */
export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

/** 00:00 a 23:00: una franja empieza como muy tarde a las 23:00. */
export const HORAS_INICIO: readonly string[] = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)

/** 01:00 a 24:00: la ultima franja del dia termina a las 24:00. */
export const HORAS_FIN: readonly string[] = Array.from({ length: 24 }, (_, h) => `${String(h + 1).padStart(2, '0')}:00`)

export function nombreDia(dia: number): string {
  return DIAS_SEMANA[dia - 1] ?? ''
}

/** '15:00:00' (time de Postgres) -> '15:00'. */
export function horaCorta(hora: string): string {
  return hora.slice(0, 5)
}
```

- [ ] **Paso 6: crear los formularios.** Crear `src/app/(vendedor)/panel/disponibilidad/formularios.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import {
  agregarFranjaSemanal, bloquearFechas, desbloquearFechas, eliminarFranjaSemanal,
  type ResultadoDisponibilidad,
} from './acciones'
import { DIAS_SEMANA, HORAS_FIN, HORAS_INICIO } from './opciones'

const CAMPO = 'mt-1 block rounded-sm border border-linea bg-superficie px-3 py-2 text-tinta'
const BOTON =
  'cursor-pointer rounded-sm bg-marca px-4 py-2 text-sm font-medium text-marca-contraste hover:bg-marca-fuerte disabled:opacity-60'
const BOTON_QUITAR =
  'cursor-pointer rounded-sm border border-linea px-3 py-1 text-sm text-tinta-suave hover:border-peligro hover:text-peligro disabled:opacity-60'

// Todos con useActionState: cada accion devuelve un error (validacion, o cero
// filas al borrar) que un <form action={fn}> a secas tiraria.

export function FormularioFranja() {
  const [estado, accion, ocupado] = useActionState<ResultadoDisponibilidad, FormData>(agregarFranjaSemanal, {})
  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-tinta-suave">
        Día
        <select name="dia_semana" defaultValue="1" className={CAMPO}>
          {DIAS_SEMANA.map((dia, indice) => <option key={dia} value={indice + 1}>{dia}</option>)}
        </select>
      </label>
      <label className="text-sm text-tinta-suave">
        Desde
        <select name="hora_inicio" defaultValue="08:00" className={CAMPO}>
          {HORAS_INICIO.map((hora) => <option key={hora} value={hora}>{hora}</option>)}
        </select>
      </label>
      <label className="text-sm text-tinta-suave">
        Hasta
        <select name="hora_fin" defaultValue="12:00" className={CAMPO}>
          {HORAS_FIN.map((hora) => <option key={hora} value={hora}>{hora}</option>)}
        </select>
      </label>
      <button type="submit" disabled={ocupado} className={BOTON}>Agregar franja</button>
      {estado.error && <p role="alert" className="w-full text-sm text-peligro">{estado.error}</p>}
    </form>
  )
}

export function EliminarFranja({ id }: { id: string }) {
  const [estado, accion, ocupado] = useActionState<ResultadoDisponibilidad, FormData>(eliminarFranjaSemanal, {})
  return (
    <form action={accion} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={ocupado} className={BOTON_QUITAR}>Quitar</button>
      {estado.error && <span role="alert" className="text-sm text-peligro">{estado.error}</span>}
    </form>
  )
}

export function FormularioBloqueo() {
  const [estado, accion, ocupado] = useActionState<ResultadoDisponibilidad, FormData>(bloquearFechas, {})
  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-tinta-suave">
        Desde
        <input type="date" name="desde" required className={CAMPO} />
      </label>
      <label className="text-sm text-tinta-suave">
        Hasta
        <input type="date" name="hasta" required className={CAMPO} />
      </label>
      <button type="submit" disabled={ocupado} className={BOTON}>Bloquear fechas</button>
      {estado.error && <p role="alert" className="w-full text-sm text-peligro">{estado.error}</p>}
    </form>
  )
}

export function Desbloquear({ id }: { id: string }) {
  const [estado, accion, ocupado] = useActionState<ResultadoDisponibilidad, FormData>(desbloquearFechas, {})
  return (
    <form action={accion} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={ocupado} className={BOTON_QUITAR}>Desbloquear</button>
      {estado.error && <span role="alert" className="text-sm text-peligro">{estado.error}</span>}
    </form>
  )
}
```

- [ ] **Paso 7: crear la página.** Crear `src/app/(vendedor)/panel/disponibilidad/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { leerDisponibilidad, leerFechasBloqueadas } from '@/lib/citas/consultas'
import { Desbloquear, EliminarFranja, FormularioBloqueo, FormularioFranja } from './formularios'
import { horaCorta, nombreDia } from './opciones'

export const metadata: Metadata = {
  title: 'Disponibilidad | Portal Inmobiliario',
  description: 'Define tu horario semanal de visitas y bloquea las fechas en que no puedes atender.',
  robots: { index: false, follow: false },
}

export default async function PaginaDisponibilidad() {
  // El middleware ya protege /panel/*; se repite por la misma razon que
  // panel/leads/page.tsx. El id sale de sesionActual(), la unica lectura.
  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  const [franjas, bloqueos] = await Promise.all([
    leerDisponibilidad(supabase, sesion.idUsuario),
    leerFechasBloqueadas(supabase, sesion.idUsuario),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/panel" className="text-sm text-marca hover:underline">Volver al panel</Link>
      <h1 className="mt-2 text-3xl font-semibold text-tinta">Disponibilidad</h1>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-tinta">Horario semanal</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Las visitas duran una hora y empiezan en punto. Las horas son de Colombia.
        </p>
        <div className="mt-4"><FormularioFranja /></div>
        {franjas.length === 0 ? (
          <p className="mt-4 text-tinta-suave">Todavía no has definido tu horario: nadie puede reservarte visitas.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {franjas.map((franja) => (
              <li key={franja.id}
                className="flex items-center justify-between rounded-md border border-linea bg-superficie px-4 py-2">
                <span className="text-tinta">
                  {nombreDia(franja.dia_semana)} · {horaCorta(franja.hora_inicio)} – {horaCorta(franja.hora_fin)}
                </span>
                <EliminarFranja id={franja.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-tinta">Fechas bloqueadas</h2>
        <p className="mt-1 text-sm text-tinta-suave">Esos días no se ofrece ninguna franja.</p>
        <div className="mt-4"><FormularioBloqueo /></div>
        {bloqueos.length > 0 && (
          <ul className="mt-4 space-y-2">
            {bloqueos.map((bloqueo) => (
              <li key={bloqueo.id}
                className="flex items-center justify-between rounded-md border border-linea bg-superficie px-4 py-2">
                <span className="cifra text-tinta">
                  {bloqueo.desde === bloqueo.hasta ? bloqueo.desde : `${bloqueo.desde} a ${bloqueo.hasta}`}
                </span>
                <Desbloquear id={bloqueo.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Paso 8: correr y ver que pasa.**

```powershell
npx vitest run tests/unit/pagina-disponibilidad.test.ts tests/unit/metadatos-paginas.test.ts
npm run test:unit
```

Esperado: 6 verdes en `pagina-disponibilidad`; `metadatos-paginas` con 2 casos más (title/description y robots de la ruta nueva); suite en `N_unit_antes + 8`.

- [ ] **Paso 9: falsificación, pedir las filas de otro id.** En `page.tsx` sustituir `leerDisponibilidad(supabase, sesion.idUsuario)` por `leerDisponibilidad(supabase, 'otro-vendedor')`. Correr `-t "del vendedor de la sesion"`. Esperado: ROJO, aparece `lunes · 08:00 – 09:00`. Restaurar, VERDE.

- [ ] **Paso 10: commit.**

```bash
$G add "src/app/(vendedor)/panel/disponibilidad" tests/unit/pagina-disponibilidad.test.ts tests/unit/metadatos-paginas.test.ts
$G commit -m "feat: pagina de disponibilidad del vendedor con horario y fechas bloqueadas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 15: Selector de franjas, acciones de una visita y agrupado por día

**Files:**
- Create: `src/lib/citas/agrupar.ts`
- Create: `src/componentes/citas/selector-franjas.tsx`
- Create: `src/componentes/citas/acciones-cita.tsx`
- Test: `tests/unit/componentes-citas.test.ts`

**Interfaces:**
- Consumes: `claveDia`, `formatearDia`, `formatearHora` (Tarea 9); `type Franja` (Tarea 11); `reservarCita`, `moverCita`, `cancelarCita`, `type ResultadoAccionCita` (Tarea 12).
- Produces:
  - `src/lib/citas/agrupar.ts`: `interface GrupoFranjas { clave: string; dia: string; franjas: { inicio: string; hora: string }[] }`; `agruparFranjasPorDia(franjas: readonly Franja[]): GrupoFranjas[]`
  - `src/componentes/citas/selector-franjas.tsx`: `SelectorFranjas(props: { modo: 'reservar' | 'mover'; objetivoId: string; grupos: readonly GrupoFranjas[]; volverA: string })`
  - `src/componentes/citas/acciones-cita.tsx`: `AccionesCita(props: { citaId: string; rutaMover: string })`

**Por qué el agrupado y el formato van en el servidor.** Las páginas formatean con `src/lib/fechas/formato.ts` y pasan cadenas ya hechas al componente de cliente. Así el navegador no vuelve a formatear: la zona está fijada, pero la versión de ICU del navegador puede separar con otros espacios y provocar un aviso de hidratación.

- [ ] **Paso 1: medir `N_unit_antes`.**

```powershell
npm run test:unit
```

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/unit/componentes-citas.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Los componentes importan las server actions, que importan el cliente de
// Supabase (next/headers) y next/cache: se sustituyen, no se ejercitan aqui.
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { agruparFranjasPorDia } = await import('@/lib/citas/agrupar')
const { SelectorFranjas } = await import('@/componentes/citas/selector-franjas')
const { AccionesCita } = await import('@/componentes/citas/acciones-cita')

const normalizar = (texto: string) => texto.replace(/\s/g, ' ')

describe('agruparFranjasPorDia', () => {
  it('agrupa por dia de Bogota, en el orden recibido, con la hora ya formateada', () => {
    const grupos = agruparFranjasPorDia([
      { inicio: '2026-09-17T20:00:00+00:00', fin: '2026-09-17T21:00:00+00:00' },
      // 01:00 UTC del 18 es el jueves 17 a las 8:00 p. m. en Bogota.
      { inicio: '2026-09-18T01:00:00+00:00', fin: '2026-09-18T02:00:00+00:00' },
      { inicio: '2026-09-18T13:00:00+00:00', fin: '2026-09-18T14:00:00+00:00' },
    ])

    expect(grupos.map((g) => g.clave)).toEqual(['2026-09-17', '2026-09-18'])
    expect(normalizar(grupos[0]!.dia)).toBe('jueves, 17 de septiembre')
    expect(grupos[0]!.franjas.map((f) => normalizar(f.hora))).toEqual(['3:00 p. m.', '8:00 p. m.'])
    expect(grupos[0]!.franjas[1]!.inicio).toBe('2026-09-18T01:00:00+00:00')
    expect(normalizar(grupos[1]!.dia)).toBe('viernes, 18 de septiembre')
    expect(grupos[1]!.franjas.map((f) => normalizar(f.hora))).toEqual(['8:00 a. m.'])
  })

  it('sin franjas devuelve una lista vacia', () => {
    expect(agruparFranjasPorDia([])).toEqual([])
  })
})

const GRUPOS = [
  { clave: '2026-09-17', dia: 'jueves, 17 de septiembre', franjas: [
    { inicio: '2026-09-17T20:00:00+00:00', hora: '3:00 p. m.' },
    { inicio: '2026-09-17T21:00:00+00:00', hora: '4:00 p. m.' },
  ] },
]

describe('SelectorFranjas', () => {
  it('en modo reservar lleva el lead en un campo oculto y una franja por boton, con su instante como valor', () => {
    const html = renderToStaticMarkup(createElement(SelectorFranjas, {
      modo: 'reservar', objetivoId: 'lead-1', grupos: GRUPOS, volverA: '/mi-cuenta',
    }))
    expect(html).toContain('name="lead_id"')
    expect(html).toContain('value="lead-1"')
    expect(html).not.toContain('name="cita_id"')
    expect(html).toContain('jueves, 17 de septiembre')
    expect(html).toContain('name="inicio"')
    expect(html).toContain('value="2026-09-17T20:00:00+00:00"')
    expect(html).toContain('3:00 p. m.')
    expect(html).toContain('value="2026-09-17T21:00:00+00:00"')
  })

  it('en modo mover lleva la cita, no el lead', () => {
    const html = renderToStaticMarkup(createElement(SelectorFranjas, {
      modo: 'mover', objetivoId: 'cita-1', grupos: GRUPOS, volverA: '/panel/citas',
    }))
    expect(html).toContain('name="cita_id"')
    expect(html).toContain('value="cita-1"')
    expect(html).not.toContain('name="lead_id"')
  })

  it('sin franjas lo dice en vez de pintar un formulario vacio', () => {
    const html = renderToStaticMarkup(createElement(SelectorFranjas, {
      modo: 'reservar', objetivoId: 'lead-1', grupos: [], volverA: '/mi-cuenta',
    }))
    expect(html).toContain('No hay franjas libres en los próximos 14 días.')
    expect(html).not.toContain('<form')
  })
})

describe('AccionesCita', () => {
  it('enlaza a mover y cancela con la cita en un campo oculto', () => {
    const html = renderToStaticMarkup(createElement(AccionesCita, {
      citaId: 'cita-1', rutaMover: '/mi-cuenta/visitas/cita-1/mover',
    }))
    expect(html).toContain('href="/mi-cuenta/visitas/cita-1/mover"')
    expect(html).toContain('>Mover<')
    expect(html).toContain('name="cita_id"')
    expect(html).toContain('value="cita-1"')
    expect(html).toContain('>Cancelar<')
  })
})
```

- [ ] **Paso 3: correrla y ver que falla.**

```powershell
npx vitest run tests/unit/componentes-citas.test.ts
```

Esperado: ROJO, no se resuelve `@/lib/citas/agrupar`.

- [ ] **Paso 4: implementar el agrupado.** Crear `src/lib/citas/agrupar.ts`:

```ts
import { claveDia, formatearDia, formatearHora } from '@/lib/fechas/formato'
import type { Franja } from './consultas'

export interface GrupoFranjas {
  /** YYYY-MM-DD de Bogota. */
  clave: string
  /** 'jueves, 17 de septiembre'. */
  dia: string
  franjas: { inicio: string; hora: string }[]
}

/**
 * Agrupa por dia de calendario de Bogota, conservando el orden en que llegan
 * (franjas_libres ya las devuelve ordenadas). No calcula ni filtra fechas.
 */
export function agruparFranjasPorDia(franjas: readonly Franja[]): GrupoFranjas[] {
  const grupos = new Map<string, GrupoFranjas>()
  for (const franja of franjas) {
    const clave = claveDia(franja.inicio)
    let grupo = grupos.get(clave)
    if (!grupo) {
      grupo = { clave, dia: formatearDia(franja.inicio), franjas: [] }
      grupos.set(clave, grupo)
    }
    grupo.franjas.push({ inicio: franja.inicio, hora: formatearHora(franja.inicio) })
  }
  return [...grupos.values()]
}
```

- [ ] **Paso 5: implementar el selector.** Crear `src/componentes/citas/selector-franjas.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { moverCita, reservarCita, type ResultadoAccionCita } from './acciones'
import type { GrupoFranjas } from '@/lib/citas/agrupar'

const BOTON_FRANJA =
  'cursor-pointer rounded-sm border border-linea bg-superficie px-3 py-1.5 text-sm text-tinta ' +
  'hover:border-marca hover:text-marca disabled:opacity-60'

/**
 * useActionState y no <form action={fn}> a secas: la accion devuelve el
 * error traducido (VS004 si otro reservo antes) y sin el hook ese valor se
 * descartaria y el usuario no veria nada.
 *
 * Cada franja es un boton submit con name="inicio" y su instante como value:
 * React incluye el boton pulsado en el FormData de la accion.
 */
export function SelectorFranjas({
  modo, objetivoId, grupos, volverA,
}: {
  modo: 'reservar' | 'mover'
  objetivoId: string
  grupos: readonly GrupoFranjas[]
  volverA: string
}) {
  const [estado, accion, ocupado] = useActionState<ResultadoAccionCita, FormData>(
    modo === 'reservar' ? reservarCita : moverCita,
    {},
  )

  if (estado.hecho) {
    return (
      <div className="rounded-md border border-exito bg-exito-suave p-4 text-exito">
        <p>{modo === 'reservar' ? 'Tu visita quedó confirmada.' : 'La visita se movió a la nueva franja.'}</p>
        <Link href={volverA} className="mt-2 inline-block underline">Volver</Link>
      </div>
    )
  }

  if (grupos.length === 0) {
    return (
      <p className="rounded-md border border-linea bg-superficie p-6 text-tinta-suave">
        No hay franjas libres en los próximos 14 días.
      </p>
    )
  }

  return (
    <form action={accion} className="space-y-6">
      <input type="hidden" name={modo === 'reservar' ? 'lead_id' : 'cita_id'} value={objetivoId} />
      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}
      {grupos.map((grupo) => (
        <fieldset key={grupo.clave}>
          <legend className="font-medium text-tinta">{grupo.dia}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {grupo.franjas.map((franja) => (
              <button key={franja.inicio} type="submit" name="inicio" value={franja.inicio}
                disabled={ocupado} className={BOTON_FRANJA}>
                {franja.hora}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </form>
  )
}
```

- [ ] **Paso 6: implementar las acciones de una visita.** Crear `src/componentes/citas/acciones-cita.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { cancelarCita, type ResultadoAccionCita } from './acciones'

export function AccionesCita({ citaId, rutaMover }: { citaId: string; rutaMover: string }) {
  const [estado, accion, ocupado] = useActionState<ResultadoAccionCita, FormData>(cancelarCita, {})

  if (estado.hecho) {
    return <p className="mt-3 text-sm text-tinta-suave">Visita cancelada.</p>
  }

  return (
    <form action={accion} className="mt-3 flex flex-wrap items-center gap-3">
      <input type="hidden" name="cita_id" value={citaId} />
      <Link href={rutaMover}
        className="rounded-sm border border-linea px-4 py-1.5 text-sm text-tinta hover:border-marca hover:text-marca">
        Mover
      </Link>
      <button type="submit" disabled={ocupado}
        className="cursor-pointer rounded-sm border border-linea px-4 py-1.5 text-sm text-tinta-suave hover:border-peligro hover:text-peligro disabled:opacity-60">
        Cancelar
      </button>
      {estado.error && <span role="alert" className="text-sm text-peligro">{estado.error}</span>}
    </form>
  )
}
```

- [ ] **Paso 7: correrla y ver que pasa.**

```powershell
npx vitest run tests/unit/componentes-citas.test.ts
npm run test:unit
```

Esperado: 6 verdes; suite en `N_unit_antes + 6`.

- [ ] **Paso 8: comprobar que no queda ningún `<form action={...}>` sin hook en SP5.**

```powershell
npx eslint src/componentes/citas src/lib/citas
```

Y revisar a mano que en `src/componentes/citas/*.tsx` todo `action=` recibe el `accion` devuelto por `useActionState`. No hay control de seguridad que falsificar en esta tarea.

- [ ] **Paso 9: commit.**

```bash
$G add src/lib/citas/agrupar.ts src/componentes/citas/selector-franjas.tsx src/componentes/citas/acciones-cita.tsx tests/unit/componentes-citas.test.ts
$G commit -m "feat: selector de franjas por dia y acciones de mover y cancelar una visita

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 16: Visitas del vendedor, `/panel/citas` y su mover

**Files:**
- Create: `src/app/(vendedor)/panel/citas/page.tsx`
- Create: `src/app/(vendedor)/panel/citas/[id]/mover/page.tsx`
- Modify: `src/app/(vendedor)/panel/page.tsx`
- Modify: `tests/unit/panel-vendedor.test.ts`
- Modify: `tests/unit/metadatos-paginas.test.ts`
- Test: `tests/unit/pagina-citas-vendedor.test.ts`

**Interfaces:**
- Consumes: `sesionActual` (`idUsuario`); `crearClienteServidor`; `listarCitasDelVendedor`, `obtenerCitaDeParticipante`, `obtenerFranjasLibres` (Tarea 11); `agruparFranjasPorDia` (Tarea 15); `SelectorFranjas`, `AccionesCita` (Tarea 15); `formatearFechaHora` (Tarea 9); `esquemaIdentificador` (Tarea 12).
- Produces:
  - `src/app/(vendedor)/panel/citas/page.tsx`: `metadata`, `default async function PaginaCitasVendedor()`
  - `src/app/(vendedor)/panel/citas/[id]/mover/page.tsx`: `metadata`, `default async function PaginaMoverCitaVendedor({ params }: { params: Promise<{ id: string }> })`
  - `/panel` enlaza a `/panel/citas` («Visitas») y a `/panel/disponibilidad` («Disponibilidad»)

**Visitas pasadas.** Una visita pasada sigue `confirmada` (§13 del spec) y aparece en la lista de confirmadas, ordenada por inicio. La página no la separa comparando con la hora actual en JavaScript, porque la única operación con fechas en JS es mostrarlas. Si el vendedor pulsa Mover o Cancelar sobre una visita ya empezada, la base responde `VS008` y el mensaje aparece junto al botón.

- [ ] **Paso 1: medir `N_unit_antes`.**

```powershell
npm run test:unit
```

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/unit/pagina-citas-vendedor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sesionActual = vi.fn()
const redirect = vi.fn()
const notFound = vi.fn()

vi.mock('@/lib/auth/sesion', () => ({ sesionActual }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('next/navigation', () => ({ redirect, notFound }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Consultas falsas CON comportamiento: responden segun el id y el papel que
// se les pida, como lo haria la base con el filtro explicito.
vi.mock('@/lib/citas/consultas', () => ({
  listarCitasDelVendedor: async (_c: unknown, vendedorId: string) => citasPorVendedor[vendedorId] ?? [],
  obtenerCitaDeParticipante: async (_c: unknown, citaId: string, usuarioId: string, papel: string) =>
    participaciones.find((p) => p.cita.id === citaId && p.usuarioId === usuarioId && p.papel === papel)?.cita ?? null,
  obtenerFranjasLibres: async (_c: unknown, vendedorId: string) => franjasPorVendedor[vendedorId] ?? [],
}))

const VENDEDOR = 'vendedor-de-la-sesion'
const ID_CONFIRMADA = '1b6f0c7e-2d4a-4c3b-9e8f-0a1b2c3d4e5f'
const ID_CANCELADA = '2c7a1d8f-3e5b-4d4c-8f9a-1b2c3d4e5f60'
const RANGO = { inicio: '2026-09-17T20:00:00.000Z', fin: '2026-09-17T21:00:00.000Z' }
const FRANJA = { inicio: '2026-09-18T15:00:00+00:00', fin: '2026-09-18T16:00:00+00:00' }

let citasPorVendedor: Record<string, unknown[]> = {}
let participaciones: { usuarioId: string; papel: string; cita: Record<string, unknown> }[] = []
let franjasPorVendedor: Record<string, unknown[]> = {}

const { default: PaginaCitasVendedor, metadata: metadataCitas } = await import('@/app/(vendedor)/panel/citas/page')
const { default: PaginaMoverCitaVendedor, metadata: metadataMover } = await import(
  '@/app/(vendedor)/panel/citas/[id]/mover/page'
)
const { AccionesCita } = await import('@/componentes/citas/acciones-cita')
const { SelectorFranjas } = await import('@/componentes/citas/selector-franjas')

const normalizar = (texto: string) => texto.replace(/\s/g, ' ')

function textoPlano(nodo: unknown): string {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return ''
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo)
  if (Array.isArray(nodo)) return nodo.map(textoPlano).join('')
  if (typeof nodo === 'object' && 'props' in (nodo as Record<string, unknown>)) {
    return textoPlano((nodo as { props?: { children?: unknown } }).props?.children)
  }
  return ''
}

type Nodo = { type?: unknown; props?: Record<string, unknown> }
function buscarTodos(nodo: unknown, predicado: (n: Nodo) => boolean, hallados: Nodo[] = []): Nodo[] {
  if (nodo === null || nodo === undefined || typeof nodo !== 'object') return hallados
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) buscarTodos(hijo, predicado, hallados)
    return hallados
  }
  const elemento = nodo as Nodo
  if (predicado(elemento)) hallados.push(elemento)
  if (elemento.props) buscarTodos(elemento.props.children, predicado, hallados)
  return hallados
}

beforeEach(() => {
  sesionActual.mockReset().mockResolvedValue({ hayUsuario: true, accessToken: 't', idUsuario: VENDEDOR })
  redirect.mockReset().mockImplementation((ruta: string) => { throw new Error(`NEXT_REDIRECT:${ruta}`) })
  notFound.mockReset().mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  citasPorVendedor = {
    [VENDEDOR]: [
      { id: ID_CONFIRMADA, estado: 'confirmada', ...RANGO, tituloPropiedad: 'Casa en Riomar', nombreComprador: 'Ana Compradora' },
      { id: ID_CANCELADA, estado: 'cancelada', ...RANGO, tituloPropiedad: 'Apartamento en El Prado', nombreComprador: 'Luis' },
    ],
    'otro-vendedor': [
      { id: 'ajena', estado: 'confirmada', ...RANGO, tituloPropiedad: 'Lote ajeno', nombreComprador: 'Nadie' },
    ],
  }
  participaciones = [
    { usuarioId: VENDEDOR, papel: 'vendedor', cita: { id: ID_CONFIRMADA, estado: 'confirmada', vendedorId: VENDEDOR, ...RANGO } },
  ]
  franjasPorVendedor = { [VENDEDOR]: [FRANJA] }
})

describe('/panel/citas', () => {
  it('las dos paginas son privadas', () => {
    expect(metadataCitas.robots).toEqual({ index: false, follow: false })
    expect(metadataMover.robots).toEqual({ index: false, follow: false })
  })

  it('sin sesion redirige a /login', async () => {
    sesionActual.mockResolvedValue({ hayUsuario: false, accessToken: null, idUsuario: null })
    await expect(PaginaCitasVendedor()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('lista las visitas del vendedor de la sesion en hora de Bogota, con acciones solo en las confirmadas', async () => {
    const elemento = await PaginaCitasVendedor()
    const texto = normalizar(textoPlano(elemento))

    expect(texto).toContain('Casa en Riomar')
    expect(texto).toContain('Ana Compradora')
    expect(texto).toContain('jueves, 17 de septiembre, 3:00 p. m.')
    expect(texto).toContain('Apartamento en El Prado')
    expect(texto).not.toContain('Lote ajeno')

    const acciones = buscarTodos(elemento, (n) => n.type === AccionesCita)
    expect(acciones.map((n) => n.props)).toEqual([
      { citaId: ID_CONFIRMADA, rutaMover: `/panel/citas/${ID_CONFIRMADA}/mover` },
    ])
  })
})

describe('/panel/citas/[id]/mover', () => {
  it('una visita en la que el vendedor no participa da notFound', async () => {
    participaciones = []
    await expect(PaginaMoverCitaVendedor({ params: Promise.resolve({ id: ID_CONFIRMADA }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('un id que no es un uuid da notFound', async () => {
    await expect(PaginaMoverCitaVendedor({ params: Promise.resolve({ id: 'no-es-un-uuid' }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('ofrece las franjas libres del vendedor de la visita en modo mover', async () => {
    const elemento = await PaginaMoverCitaVendedor({ params: Promise.resolve({ id: ID_CONFIRMADA }) })
    const [selector] = buscarTodos(elemento, (n) => n.type === SelectorFranjas)

    expect(selector?.props?.modo).toBe('mover')
    expect(selector?.props?.objetivoId).toBe(ID_CONFIRMADA)
    expect(selector?.props?.volverA).toBe('/panel/citas')
    const grupos = selector?.props?.grupos as { franjas: { inicio: string }[] }[]
    expect(grupos.flatMap((g) => g.franjas.map((f) => f.inicio))).toEqual([FRANJA.inicio])
  })
})
```

- [ ] **Paso 3: añadir el caso de los enlaces a `tests/unit/panel-vendedor.test.ts`.** Dentro de `describe('PaginaPanelVendedor', ...)`, al final:

```ts
  it('enlaza a las visitas y a la disponibilidad del vendedor', async () => {
    crearClienteServidor.mockResolvedValue(clienteFalso([]))

    const elemento = await PaginaPanelVendedor()

    function tieneEnlaceA(nodo: unknown, destino: string): boolean {
      if (nodo === null || nodo === undefined || typeof nodo !== 'object') return false
      if (Array.isArray(nodo)) return nodo.some((n) => tieneEnlaceA(n, destino))
      const props = (nodo as { props?: Record<string, unknown> }).props
      if (!props) return false
      if (props.href === destino) return true
      return tieneEnlaceA(props.children, destino)
    }

    expect(tieneEnlaceA(elemento, '/panel/citas')).toBe(true)
    expect(tieneEnlaceA(elemento, '/panel/disponibilidad')).toBe(true)
  })
```

- [ ] **Paso 4: añadir las dos rutas a `tests/unit/metadatos-paginas.test.ts`.** Dentro de `PAGINAS`, después de la entrada de `/panel/disponibilidad`:

```ts
  { ruta: '/panel/citas', modulo: '../../src/app/(vendedor)/panel/citas/page', privada: true },
  {
    ruta: '/panel/citas/[id]/mover',
    modulo: '../../src/app/(vendedor)/panel/citas/[id]/mover/page',
    privada: true,
  },
```

- [ ] **Paso 5: correr y ver que fallan.**

```powershell
npx vitest run tests/unit/pagina-citas-vendedor.test.ts tests/unit/panel-vendedor.test.ts tests/unit/metadatos-paginas.test.ts
```

Esperado: ROJO en `pagina-citas-vendedor` y `metadatos-paginas` (módulos inexistentes) y en el caso nuevo de `panel-vendedor` (sin enlaces).

- [ ] **Paso 6: crear `/panel/citas`.** Crear `src/app/(vendedor)/panel/citas/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarCitasDelVendedor } from '@/lib/citas/consultas'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { AccionesCita } from '@/componentes/citas/acciones-cita'

export const metadata: Metadata = {
  title: 'Visitas | Portal Inmobiliario',
  description: 'Las visitas que los compradores reservaron en tus propiedades.',
  robots: { index: false, follow: false },
}

export default async function PaginaCitasVendedor() {
  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const citas = await listarCitasDelVendedor(await crearClienteServidor(), sesion.idUsuario)
  const confirmadas = citas.filter((cita) => cita.estado === 'confirmada')
  const canceladas = citas.filter((cita) => cita.estado === 'cancelada')

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/panel" className="text-sm text-marca hover:underline">Volver al panel</Link>
      <h1 className="mt-2 text-3xl font-semibold text-tinta">Visitas</h1>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-tinta">Confirmadas</h2>
        {confirmadas.length === 0 ? (
          <p className="mt-4 text-tinta-suave">No tienes visitas confirmadas.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {confirmadas.map((cita) => (
              <li key={cita.id} className="rounded-md border border-linea bg-superficie p-5">
                <p className="text-sm text-tinta-tenue">{cita.tituloPropiedad ?? 'Propiedad'}</p>
                <p className="mt-1 font-medium text-tinta">{cita.nombreComprador ?? 'Comprador'}</p>
                <p className="cifra mt-1 text-tinta">{formatearFechaHora(cita.inicio)}</p>
                <AccionesCita citaId={cita.id} rutaMover={`/panel/citas/${cita.id}/mover`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {canceladas.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-tinta">Canceladas</h2>
          <ul className="mt-4 space-y-3">
            {canceladas.map((cita) => (
              <li key={cita.id} className="rounded-md border border-linea p-4 text-tinta-suave">
                <p>{cita.tituloPropiedad ?? 'Propiedad'} · {cita.nombreComprador ?? 'Comprador'}</p>
                <p className="cifra text-sm">{formatearFechaHora(cita.inicio)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
```

- [ ] **Paso 7: crear el mover del vendedor.** Crear `src/app/(vendedor)/panel/citas/[id]/mover/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { obtenerCitaDeParticipante, obtenerFranjasLibres } from '@/lib/citas/consultas'
import { agruparFranjasPorDia } from '@/lib/citas/agrupar'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { esquemaIdentificador } from '@/lib/validacion/esquemas'
import { SelectorFranjas } from '@/componentes/citas/selector-franjas'

export const metadata: Metadata = {
  title: 'Mover visita | Portal Inmobiliario',
  description: 'Elige una nueva franja para la visita.',
  robots: { index: false, follow: false },
}

export default async function PaginaMoverCitaVendedor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Un id que no es uuid haria fallar la consulta con 22P02 y la pagina con un 500.
  if (!esquemaIdentificador.safeParse({ id }).success) notFound()

  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  const cita = await obtenerCitaDeParticipante(supabase, id, sesion.idUsuario, 'vendedor')
  if (!cita || cita.estado !== 'confirmada') notFound()

  const grupos = agruparFranjasPorDia(await obtenerFranjasLibres(supabase, cita.vendedorId))

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/panel/citas" className="text-sm text-marca hover:underline">Volver a visitas</Link>
      <h1 className="mt-2 text-3xl font-semibold text-tinta">Mover visita</h1>
      <p className="cifra mt-2 text-tinta-suave">Ahora: {formatearFechaHora(cita.inicio)}</p>
      <div className="mt-6">
        <SelectorFranjas modo="mover" objetivoId={cita.id} grupos={grupos} volverA="/panel/citas" />
      </div>
    </main>
  )
}
```

- [ ] **Paso 8: enlazar desde `/panel`.** En `src/app/(vendedor)/panel/page.tsx`, sustituir:

```tsx
          <Link href="/panel/leads" className="text-marca hover:underline">
            Mensajes recibidos{nuevos > 0 ? ` (${nuevos})` : ''}
          </Link>
```

por:

```tsx
          <Link href="/panel/leads" className="text-marca hover:underline">
            Mensajes recibidos{nuevos > 0 ? ` (${nuevos})` : ''}
          </Link>
          <Link href="/panel/citas" className="text-marca hover:underline">
            Visitas
          </Link>
          <Link href="/panel/disponibilidad" className="text-marca hover:underline">
            Disponibilidad
          </Link>
```

- [ ] **Paso 9: correr y ver que pasa.**

```powershell
npx vitest run tests/unit/pagina-citas-vendedor.test.ts tests/unit/panel-vendedor.test.ts tests/unit/metadatos-paginas.test.ts
npm run test:unit
```

Esperado: 6 verdes en `pagina-citas-vendedor`, 1 más en `panel-vendedor`, 4 más en `metadatos-paginas`; suite en `N_unit_antes + 11`.

- [ ] **Paso 10: falsificación, mover con el papel equivocado.** En el mover sustituir `'vendedor'` por `'comprador'` en la llamada a `obtenerCitaDeParticipante`. Correr `-t "ofrece las franjas libres"`. Esperado: ROJO con `NEXT_NOT_FOUND`: la visita solo se encuentra con el papel en que el usuario participa. Restaurar, VERDE.

- [ ] **Paso 11: commit.**

```bash
$G add "src/app/(vendedor)/panel/citas" "src/app/(vendedor)/panel/page.tsx" tests/unit/pagina-citas-vendedor.test.ts tests/unit/panel-vendedor.test.ts tests/unit/metadatos-paginas.test.ts
$G commit -m "feat: visitas del vendedor con mover y cancelar, y enlaces desde el panel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 17: El comprador, `/mi-cuenta`, reservar y mover

**Files:**
- Modify: `src/app/(comprador)/mi-cuenta/page.tsx`
- Create: `src/app/(comprador)/mi-cuenta/reservar/[leadId]/page.tsx`
- Create: `src/app/(comprador)/mi-cuenta/visitas/[id]/mover/page.tsx`
- Modify: `tests/unit/metadatos-paginas.test.ts`
- Test: `tests/unit/pagina-mi-cuenta.test.ts`

**Interfaces:**
- Consumes: `sesionActual` (`idUsuario`); `crearClienteServidor`; `listarSolicitudesDelComprador`, `obtenerLeadParaReservar`, `obtenerCitaDeParticipante`, `obtenerFranjasLibres` (Tarea 11); `agruparFranjasPorDia`, `SelectorFranjas`, `AccionesCita` (Tarea 15); `formatearFechaHora` (Tarea 9); `esquemaIdentificador` (Tarea 12); `MENSAJE_VISITA_LEAD_NO_ACEPTADO` (Tarea 10).
- Produces:
  - `src/app/(comprador)/mi-cuenta/page.tsx`: `metadata` (mismo `title` que hoy), `default async function PaginaMiCuenta()`
  - `src/app/(comprador)/mi-cuenta/reservar/[leadId]/page.tsx`: `metadata`, `default async function PaginaReservarVisita({ params }: { params: Promise<{ leadId: string }> })`
  - `src/app/(comprador)/mi-cuenta/visitas/[id]/mover/page.tsx`: `metadata`, `default async function PaginaMoverMiVisita({ params }: { params: Promise<{ id: string }> })`

**Restricciones heredadas de las E2E existentes.** `tests/e2e/cabecera-y-sesion.spec.ts` busca `getByRole('heading', { name: /Mi cuenta/i })` con la cuenta del seed: el `h1` sigue siendo exactamente «Mi cuenta» y ningún otro encabezado de la página contiene esas palabras. `/mi-cuenta/*` ya está protegido por `RUTAS_PROTEGIDAS` (prefijo `/mi-cuenta`).

**La dirección.** La página no decide si mostrarla: pinta `direccion` si la consulta la devolvió, y el aviso si no. Quien decide es la política `ubicacion_lectura_comprador_en_ventana` (Tarea 8), igual que `leads_contacto` en la bandeja de SP4.

- [ ] **Paso 1: medir `N_unit_antes`.**

```powershell
npm run test:unit
```

- [ ] **Paso 2: escribir la prueba que falla.** Crear `tests/unit/pagina-mi-cuenta.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sesionActual = vi.fn()
const redirect = vi.fn()
const notFound = vi.fn()

vi.mock('@/lib/auth/sesion', () => ({ sesionActual }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('next/navigation', () => ({ redirect, notFound }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Consultas falsas CON comportamiento: responden segun el id y el papel pedidos.
vi.mock('@/lib/citas/consultas', () => ({
  listarSolicitudesDelComprador: async (_c: unknown, compradorId: string) => solicitudesPorComprador[compradorId] ?? [],
  obtenerLeadParaReservar: async (_c: unknown, leadId: string, compradorId: string) =>
    leadsReservables.find((l) => l.lead.id === leadId && l.compradorId === compradorId)?.lead ?? null,
  obtenerCitaDeParticipante: async (_c: unknown, citaId: string, usuarioId: string, papel: string) =>
    participaciones.find((p) => p.cita.id === citaId && p.usuarioId === usuarioId && p.papel === papel)?.cita ?? null,
  obtenerFranjasLibres: async (_c: unknown, vendedorId: string) => franjasPorVendedor[vendedorId] ?? [],
}))

const COMPRADOR = 'comprador-de-la-sesion'
const VENDEDOR = 'vendedor-del-lead'
const LEAD_ACEPTADO = '4d8e2f9a-1b3c-4d5e-8f6a-7b8c9d0e1f2a'
const LEAD_NUEVO = '5e9f3a0b-2c4d-4e6f-9a7b-8c9d0e1f2a3b'
const LEAD_CON_VISITA = '6fa04b1c-3d5e-4f7a-8b8c-9d0e1f2a3b4c'
const CITA = '7ab15c2d-4e6f-4a8b-9c9d-0e1f2a3b4c5d'
const RANGO = { inicio: '2026-09-17T20:00:00.000Z', fin: '2026-09-17T21:00:00.000Z' }
const FRANJA = { inicio: '2026-09-18T15:00:00+00:00', fin: '2026-09-18T16:00:00+00:00' }
const AVISO = 'La dirección aparecerá 2 horas antes de la visita'

let solicitudesPorComprador: Record<string, unknown[]> = {}
let leadsReservables: { compradorId: string; lead: Record<string, unknown> }[] = []
let participaciones: { usuarioId: string; papel: string; cita: Record<string, unknown> }[] = []
let franjasPorVendedor: Record<string, unknown[]> = {}

const { default: PaginaMiCuenta } = await import('@/app/(comprador)/mi-cuenta/page')
const { default: PaginaReservarVisita } = await import('@/app/(comprador)/mi-cuenta/reservar/[leadId]/page')
const { default: PaginaMoverMiVisita } = await import('@/app/(comprador)/mi-cuenta/visitas/[id]/mover/page')
const { AccionesCita } = await import('@/componentes/citas/acciones-cita')
const { SelectorFranjas } = await import('@/componentes/citas/selector-franjas')
const { MENSAJE_VISITA_LEAD_NO_ACEPTADO } = await import('@/lib/errores/mapear')

const normalizar = (texto: string) => texto.replace(/\s/g, ' ')

function textoPlano(nodo: unknown): string {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return ''
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo)
  if (Array.isArray(nodo)) return nodo.map(textoPlano).join('')
  if (typeof nodo === 'object' && 'props' in (nodo as Record<string, unknown>)) {
    return textoPlano((nodo as { props?: { children?: unknown } }).props?.children)
  }
  return ''
}

type Nodo = { type?: unknown; props?: Record<string, unknown> }
function buscarTodos(nodo: unknown, predicado: (n: Nodo) => boolean, hallados: Nodo[] = []): Nodo[] {
  if (nodo === null || nodo === undefined || typeof nodo !== 'object') return hallados
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) buscarTodos(hijo, predicado, hallados)
    return hallados
  }
  const elemento = nodo as Nodo
  if (predicado(elemento)) hallados.push(elemento)
  if (elemento.props) buscarTodos(elemento.props.children, predicado, hallados)
  return hallados
}

const enlaces = (elemento: unknown) =>
  buscarTodos(elemento, (n) => typeof n.props?.href === 'string').map((n) => n.props!.href as string)

function solicitud(campos: Record<string, unknown>) {
  return { estado: 'aceptado', propiedadId: 'prop-1', tituloPropiedad: 'Casa en Riomar', visita: null, direccion: null, ...campos }
}

beforeEach(() => {
  sesionActual.mockReset().mockResolvedValue({ hayUsuario: true, accessToken: 't', idUsuario: COMPRADOR })
  redirect.mockReset().mockImplementation((ruta: string) => { throw new Error(`NEXT_REDIRECT:${ruta}`) })
  notFound.mockReset().mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  solicitudesPorComprador = {
    [COMPRADOR]: [
      solicitud({ id: LEAD_ACEPTADO }),
      solicitud({ id: LEAD_NUEVO, estado: 'nuevo', tituloPropiedad: 'Apartamento en El Prado' }),
    ],
    'otro-comprador': [solicitud({ id: 'ajeno', tituloPropiedad: 'Lote ajeno' })],
  }
  leadsReservables = [
    { compradorId: COMPRADOR, lead: { id: LEAD_ACEPTADO, estado: 'aceptado', vendedorId: VENDEDOR, tituloPropiedad: 'Casa en Riomar' } },
    { compradorId: COMPRADOR, lead: { id: LEAD_NUEVO, estado: 'nuevo', vendedorId: VENDEDOR, tituloPropiedad: 'Apartamento en El Prado' } },
  ]
  participaciones = [
    { usuarioId: COMPRADOR, papel: 'comprador', cita: { id: CITA, estado: 'confirmada', vendedorId: VENDEDOR, ...RANGO } },
  ]
  franjasPorVendedor = { [VENDEDOR]: [FRANJA] }
})

describe('/mi-cuenta', () => {
  it('sin sesion redirige a /login', async () => {
    sesionActual.mockResolvedValue({ hayUsuario: false, accessToken: null, idUsuario: null })
    await expect(PaginaMiCuenta()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('muestra solo las solicitudes del comprador de la sesion', async () => {
    const texto = textoPlano(await PaginaMiCuenta())
    expect(texto).toContain('Mi cuenta')
    expect(texto).toContain('Casa en Riomar')
    expect(texto).toContain('Apartamento en El Prado')
    expect(texto).not.toContain('Lote ajeno')
  })

  it('un lead aceptado sin visita ofrece Reservar visita; uno nuevo no', async () => {
    const destinos = enlaces(await PaginaMiCuenta())
    expect(destinos).toContain(`/mi-cuenta/reservar/${LEAD_ACEPTADO}`)
    expect(destinos).not.toContain(`/mi-cuenta/reservar/${LEAD_NUEVO}`)
  })

  it('fuera de la ventana muestra la hora de Bogota y el aviso, nunca una direccion', async () => {
    solicitudesPorComprador[COMPRADOR] = [
      solicitud({ id: LEAD_CON_VISITA, visita: { id: CITA, ...RANGO }, direccion: null }),
    ]
    const elemento = await PaginaMiCuenta()
    const texto = normalizar(textoPlano(elemento))

    expect(texto).toContain('jueves, 17 de septiembre, 3:00 p. m.')
    expect(texto).toContain(AVISO)
    expect(texto).not.toContain('Dirección:')
    expect(enlaces(elemento)).not.toContain(`/mi-cuenta/reservar/${LEAD_CON_VISITA}`)
    expect(buscarTodos(elemento, (n) => n.type === AccionesCita).map((n) => n.props)).toEqual([
      { citaId: CITA, rutaMover: `/mi-cuenta/visitas/${CITA}/mover` },
    ])
  })

  it('dentro de la ventana muestra la direccion que devolvio la base', async () => {
    solicitudesPorComprador[COMPRADOR] = [
      solicitud({ id: LEAD_CON_VISITA, visita: { id: CITA, ...RANGO }, direccion: 'Carrera 50 # 80-12' }),
    ]
    const texto = textoPlano(await PaginaMiCuenta())
    expect(texto).toContain('Dirección: Carrera 50 # 80-12')
    expect(texto).not.toContain(AVISO)
  })

  it('sin solicitudes lo dice', async () => {
    solicitudesPorComprador = {}
    expect(textoPlano(await PaginaMiCuenta())).toContain('Todavía no has contactado a ningún vendedor.')
  })
})

describe('/mi-cuenta/reservar/[leadId]', () => {
  it('un lead que no es del comprador de la sesion da notFound', async () => {
    sesionActual.mockResolvedValue({ hayUsuario: true, accessToken: 't', idUsuario: 'otro-comprador' })
    await expect(PaginaReservarVisita({ params: Promise.resolve({ leadId: LEAD_ACEPTADO }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('un lead no aceptado no ofrece franjas', async () => {
    const elemento = await PaginaReservarVisita({ params: Promise.resolve({ leadId: LEAD_NUEVO }) })
    expect(textoPlano(elemento)).toContain(MENSAJE_VISITA_LEAD_NO_ACEPTADO)
    expect(buscarTodos(elemento, (n) => n.type === SelectorFranjas)).toEqual([])
  })

  it('ofrece las franjas del vendedor del lead en modo reservar', async () => {
    const elemento = await PaginaReservarVisita({ params: Promise.resolve({ leadId: LEAD_ACEPTADO }) })
    const [selector] = buscarTodos(elemento, (n) => n.type === SelectorFranjas)
    expect(selector?.props?.modo).toBe('reservar')
    expect(selector?.props?.objetivoId).toBe(LEAD_ACEPTADO)
    expect(selector?.props?.volverA).toBe('/mi-cuenta')
    const grupos = selector?.props?.grupos as { franjas: { inicio: string }[] }[]
    expect(grupos.flatMap((g) => g.franjas.map((f) => f.inicio))).toEqual([FRANJA.inicio])
  })
})

describe('/mi-cuenta/visitas/[id]/mover', () => {
  it('una visita en la que el comprador no participa da notFound', async () => {
    participaciones = []
    await expect(PaginaMoverMiVisita({ params: Promise.resolve({ id: CITA }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('ofrece las franjas del vendedor de la visita en modo mover y vuelve a /mi-cuenta', async () => {
    const elemento = await PaginaMoverMiVisita({ params: Promise.resolve({ id: CITA }) })
    const [selector] = buscarTodos(elemento, (n) => n.type === SelectorFranjas)
    expect(selector?.props?.modo).toBe('mover')
    expect(selector?.props?.objetivoId).toBe(CITA)
    expect(selector?.props?.volverA).toBe('/mi-cuenta')
  })
})
```

- [ ] **Paso 3: añadir las dos rutas nuevas a `tests/unit/metadatos-paginas.test.ts`.** Dentro de `PAGINAS`, después de la entrada de `/mi-cuenta`:

```ts
  {
    ruta: '/mi-cuenta/reservar/[leadId]',
    modulo: '../../src/app/(comprador)/mi-cuenta/reservar/[leadId]/page',
    privada: true,
  },
  {
    ruta: '/mi-cuenta/visitas/[id]/mover',
    modulo: '../../src/app/(comprador)/mi-cuenta/visitas/[id]/mover/page',
    privada: true,
  },
```

- [ ] **Paso 4: correr y ver que fallan.**

```powershell
npx vitest run tests/unit/pagina-mi-cuenta.test.ts tests/unit/metadatos-paginas.test.ts
```

Esperado: ROJO, no se resuelven las dos páginas nuevas.

- [ ] **Paso 5: reescribir `/mi-cuenta`.** Sustituir el contenido de `src/app/(comprador)/mi-cuenta/page.tsx` por:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarSolicitudesDelComprador } from '@/lib/citas/consultas'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { AccionesCita } from '@/componentes/citas/acciones-cita'

export const metadata: Metadata = {
  title: 'Mi cuenta | Portal Inmobiliario',
  description: 'Tu cuenta de comprador en el Portal Inmobiliario de Barranquilla.',
  // Privada: no se indexa, y ademas no se sigue ningun enlace desde ella.
  robots: { index: false, follow: false },
}

const ETIQUETA_ESTADO = {
  nuevo: 'Pendiente de respuesta',
  aceptado: 'Aceptada',
  descartado: 'Descartada',
} as const

export default async function PaginaMiCuenta() {
  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const solicitudes = await listarSolicitudesDelComprador(await crearClienteServidor(), sesion.idUsuario)

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      {/* El h1 es exactamente "Mi cuenta": tests/e2e/cabecera-y-sesion.spec.ts lo busca por nombre. */}
      <h1 className="text-3xl font-semibold text-tinta">Mi cuenta</h1>
      <h2 className="mt-8 text-xl font-semibold text-tinta">Tus solicitudes</h2>

      {solicitudes.length === 0 ? (
        <p className="mt-4 rounded-md border border-linea bg-superficie p-8 text-center text-tinta-suave">
          Todavía no has contactado a ningún vendedor.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {solicitudes.map((s) => (
            <li key={s.id} className="rounded-md border border-linea bg-superficie p-5">
              <p className="font-medium text-tinta">{s.tituloPropiedad ?? 'Propiedad'}</p>
              <p className="mt-1 text-sm text-tinta-suave">{ETIQUETA_ESTADO[s.estado]}</p>

              {s.visita ? (
                <div className="mt-3">
                  <p className="text-tinta">
                    Visita confirmada: <span className="cifra">{formatearFechaHora(s.visita.inicio)}</span>
                  </p>
                  {/* Se pinta si la consulta la devolvio. Quien decide es la politica
                      ubicacion_lectura_comprador_en_ventana, no un if de hora aqui. */}
                  {s.direccion
                    ? <p className="mt-1 text-tinta">Dirección: {s.direccion}</p>
                    : <p className="mt-1 text-sm text-tinta-suave">La dirección aparecerá 2 horas antes de la visita</p>}
                  <AccionesCita citaId={s.visita.id} rutaMover={`/mi-cuenta/visitas/${s.visita.id}/mover`} />
                </div>
              ) : s.estado === 'aceptado' ? (
                <Link href={`/mi-cuenta/reservar/${s.id}`}
                  className="mt-3 inline-block rounded-sm bg-marca px-4 py-1.5 text-sm font-medium text-marca-contraste hover:bg-marca-fuerte">
                  Reservar visita
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Paso 6: crear la página de reservar.** Crear `src/app/(comprador)/mi-cuenta/reservar/[leadId]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { obtenerFranjasLibres, obtenerLeadParaReservar } from '@/lib/citas/consultas'
import { agruparFranjasPorDia } from '@/lib/citas/agrupar'
import { esquemaIdentificador } from '@/lib/validacion/esquemas'
import { MENSAJE_VISITA_LEAD_NO_ACEPTADO } from '@/lib/errores/mapear'
import { SelectorFranjas } from '@/componentes/citas/selector-franjas'

export const metadata: Metadata = {
  title: 'Reservar visita | Portal Inmobiliario',
  description: 'Elige una franja libre para visitar la propiedad.',
  robots: { index: false, follow: false },
}

export default async function PaginaReservarVisita({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  if (!esquemaIdentificador.safeParse({ id: leadId }).success) notFound()

  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  const lead = await obtenerLeadParaReservar(supabase, leadId, sesion.idUsuario)
  if (!lead) notFound()

  // Las franjas solo se piden para un lead aceptado. franjas_libres devolveria
  // de todos modos un conjunto vacio para uno que no lo esta.
  const grupos = lead.estado === 'aceptado'
    ? agruparFranjasPorDia(await obtenerFranjasLibres(supabase, lead.vendedorId))
    : []

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/mi-cuenta" className="text-sm text-marca hover:underline">Volver a mi cuenta</Link>
      <h1 className="mt-2 text-3xl font-semibold text-tinta">Reservar visita</h1>
      <p className="mt-2 text-tinta-suave">{lead.tituloPropiedad ?? 'Propiedad'}</p>
      <div className="mt-6">
        {lead.estado === 'aceptado'
          ? <SelectorFranjas modo="reservar" objetivoId={lead.id} grupos={grupos} volverA="/mi-cuenta" />
          : <p className="rounded-md border border-linea bg-superficie p-6 text-tinta-suave">{MENSAJE_VISITA_LEAD_NO_ACEPTADO}</p>}
      </div>
    </main>
  )
}
```

- [ ] **Paso 7: crear el mover del comprador.** Crear `src/app/(comprador)/mi-cuenta/visitas/[id]/mover/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { obtenerCitaDeParticipante, obtenerFranjasLibres } from '@/lib/citas/consultas'
import { agruparFranjasPorDia } from '@/lib/citas/agrupar'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { esquemaIdentificador } from '@/lib/validacion/esquemas'
import { SelectorFranjas } from '@/componentes/citas/selector-franjas'

export const metadata: Metadata = {
  title: 'Mover mi visita | Portal Inmobiliario',
  description: 'Elige otra franja libre para tu visita.',
  robots: { index: false, follow: false },
}

export default async function PaginaMoverMiVisita({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esquemaIdentificador.safeParse({ id }).success) notFound()

  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')

  const supabase = await crearClienteServidor()
  const cita = await obtenerCitaDeParticipante(supabase, id, sesion.idUsuario, 'comprador')
  if (!cita || cita.estado !== 'confirmada') notFound()

  const grupos = agruparFranjasPorDia(await obtenerFranjasLibres(supabase, cita.vendedorId))

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/mi-cuenta" className="text-sm text-marca hover:underline">Volver a mi cuenta</Link>
      <h1 className="mt-2 text-3xl font-semibold text-tinta">Mover mi visita</h1>
      <p className="cifra mt-2 text-tinta-suave">Ahora: {formatearFechaHora(cita.inicio)}</p>
      <div className="mt-6">
        <SelectorFranjas modo="mover" objetivoId={cita.id} grupos={grupos} volverA="/mi-cuenta" />
      </div>
    </main>
  )
}
```

- [ ] **Paso 8: correr y ver que pasa.**

```powershell
npx vitest run tests/unit/pagina-mi-cuenta.test.ts tests/unit/metadatos-paginas.test.ts
npm run test:unit
```

Esperado: 11 verdes en `pagina-mi-cuenta`, 4 más en `metadatos-paginas`; suite en `N_unit_antes + 15`.

- [ ] **Paso 9: falsificación, listar las solicitudes de otro usuario.** En `/mi-cuenta` sustituir `listarSolicitudesDelComprador(await crearClienteServidor(), sesion.idUsuario)` por `listarSolicitudesDelComprador(await crearClienteServidor(), 'otro-comprador')`. Correr `-t "muestra solo las solicitudes"`. Esperado: ROJO, aparece «Lote ajeno». Restaurar, VERDE.

- [ ] **Paso 10: falsificación, decidir la dirección en la página.** En `src/app/(comprador)/mi-cuenta/page.tsx` sustituir:

```tsx
                  {s.direccion
                    ? <p className="mt-1 text-tinta">Dirección: {s.direccion}</p>
```

por (la línea de dirección se pinta siempre que hay visita, sin esperar a lo que devuelva la base):

```tsx
                  {s.visita
                    ? <p className="mt-1 text-tinta">Dirección: {s.direccion}</p>
```

Correr `npx vitest run tests/unit/pagina-mi-cuenta.test.ts -t "fuera de la ventana"`. Esperado: ROJO, el texto contiene `Dirección:` y no el aviso. Restaurar, VERDE.

- [ ] **Paso 11: comprobar las E2E que usan `/mi-cuenta`.**

```powershell
npx playwright test tests/e2e/cabecera-y-sesion.spec.ts tests/e2e/leads.spec.ts
```

Esperado: verdes. El comprador del seed no tiene solicitudes y ve «Todavía no has contactado a ningún vendedor.».

- [ ] **Paso 12: commit.**

```bash
$G add "src/app/(comprador)/mi-cuenta" tests/unit/pagina-mi-cuenta.test.ts tests/unit/metadatos-paginas.test.ts
$G commit -m "feat: mi cuenta lista solicitudes y visitas, con reservar, mover y la direccion en ventana

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 18: E2E, recorrido completo y dirección contra el HTML servido

**Files:**
- Test: `tests/e2e/citas.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior; `clienteAdmin`, `crearUsuarioDePrueba` de `tests/rls/ayudantes.ts`; `HORA_MS`, `ahoraDeLaBase`, `consultar`, `insertarCitaDirecta` de `tests/rls/ayudantes-citas.ts`.
- Produces: nada consumido por otras tareas.

- [ ] **Paso 1: medir `N_e2e_antes`.**

```powershell
npm run test:e2e
```

- [ ] **Paso 2: escribir la prueba.** Crear `tests/e2e/citas.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { clienteAdmin, crearUsuarioDePrueba } from '../rls/ayudantes'
import { HORA_MS, ahoraDeLaBase, consultar, insertarCitaDirecta } from '../rls/ayudantes-citas'

/**
 * SP5 de punta a punta. Cuentas EFIMERAS con randomUUID() en el correo, nunca
 * las del seed (ver el comentario de tests/e2e/leads.spec.ts).
 */

const admin = clienteAdmin()
const PASSWORD = 'CitasE2ePrueba2026*'

interface Montaje {
  vendedorId: string
  compradorId: string
  propiedadId: string
  leadId: string
  correoVendedor: string
  correoComprador: string
  direccion: string
}

const montajes: Montaje[] = []

/** Vendedor con propiedad y direccion, y un comprador con lead ACEPTADO. */
async function montar(etiqueta: string): Promise<Montaje> {
  const sufijo = randomUUID()
  const correoVendedor = `citas-e2e-${etiqueta}-vendedor-${sufijo}@prueba.test`
  const correoComprador = `citas-e2e-${etiqueta}-comprador-${sufijo}@prueba.test`
  const vendedorId = await crearUsuarioDePrueba({ correo: correoVendedor, password: PASSWORD, rol: 'vendedor' })
  const compradorId = await crearUsuarioDePrueba({ correo: correoComprador, password: PASSWORD, rol: 'comprador' })

  const { data: propiedad, error: errorPropiedad } = await admin.from('propiedades').insert({
    vendedor_id: vendedorId,
    slug: `citas-e2e-${etiqueta}-${sufijo}`,
    titulo: `Casa E2E para visitas ${etiqueta}`,
    descripcion: 'Descripcion de prueba, suficiente para el CHECK de longitud del campo.',
    operacion: 'venta',
    tipo_inmueble: 'casa',
    precio: 480000000,
  }).select('id').single()
  if (errorPropiedad) throw errorPropiedad
  const propiedadId = propiedad.id as string

  const direccion = `Carrera secreta E2E ${sufijo}`
  const { error: errorUbicacion } = await admin.from('propiedades_ubicacion')
    .upsert({ propiedad_id: propiedadId, direccion }, { onConflict: 'propiedad_id' })
  if (errorUbicacion) throw errorUbicacion

  const { data: lead, error: errorLead } = await admin.from('leads').insert({
    propiedad_id: propiedadId, comprador_id: compradorId, vendedor_id: vendedorId,
    nombre_mostrado: 'Comprador E2E', mensaje: 'Quisiera visitar la propiedad esta semana.', estado: 'aceptado',
  }).select('id').single()
  if (errorLead) throw errorLead

  const montaje = {
    vendedorId, compradorId, propiedadId, leadId: lead.id as string, correoVendedor, correoComprador, direccion,
  }
  montajes.push(montaje)
  return montaje
}

test.afterAll(async () => {
  for (const m of montajes) {
    await admin.from('propiedades').delete().eq('id', m.propiedadId)
    await admin.from('rutas_publicas_propiedad').delete().eq('propiedad_id', m.propiedadId)
    await admin.auth.admin.deleteUser(m.vendedorId)
    await admin.auth.admin.deleteUser(m.compradorId)
  }
})

/** Mismo patron que tests/e2e/leads.spec.ts: esperar a salir de /login antes de navegar. */
async function entrarComo(page: Page, correo: string) {
  await page.goto('/login')
  await page.fill('input[name="correo"]', correo)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 })
}

/** Espera la respuesta del POST del server action, no solo el click. */
async function pulsarYEsperar(page: Page, accion: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    accion(),
  ])
}

test('recorrido completo: horario, reserva, visita en los dos paneles, mover y cancelar', async ({ browser }) => {
  const m = await montar('recorrido')

  const contextoVendedor = await browser.newContext()
  const contextoComprador = await browser.newContext()
  const vendedor = await contextoVendedor.newPage()
  const comprador = await contextoComprador.newPage()

  try {
    // --- El vendedor define su horario: los siete dias, de 00:00 a 24:00 ---
    await entrarComo(vendedor, m.correoVendedor)
    await vendedor.goto('/panel')
    await vendedor.getByRole('link', { name: 'Disponibilidad' }).click()
    await expect(vendedor).toHaveURL(/\/panel\/disponibilidad$/)

    for (const dia of ['1', '2', '3', '4', '5', '6', '7']) {
      await vendedor.selectOption('select[name="dia_semana"]', dia)
      await vendedor.selectOption('select[name="hora_inicio"]', '00:00')
      await vendedor.selectOption('select[name="hora_fin"]', '24:00')
      await pulsarYEsperar(vendedor, () => vendedor.getByRole('button', { name: 'Agregar franja' }).click())
    }
    await expect(vendedor.getByRole('button', { name: 'Quitar' })).toHaveCount(7)

    // --- El comprador reserva desde /mi-cuenta ---------------------------
    await entrarComo(comprador, m.correoComprador)
    await comprador.goto('/mi-cuenta')
    await comprador.getByRole('link', { name: 'Reservar visita' }).click()
    await expect(comprador).toHaveURL(new RegExp(`/mi-cuenta/reservar/${m.leadId}$`))

    const franjas = comprador.locator('button[name="inicio"]')
    await expect(franjas.nth(6)).toBeVisible()
    // No la primera franja: esa puede empezar a pocos segundos de now() + 2 h,
    // y la ventana de la direccion se abriria durante la prueba.
    const franjaReservada = await franjas.nth(3).getAttribute('value')
    const franjaNueva = await franjas.nth(6).getAttribute('value')
    expect(franjaReservada).toBeTruthy()
    expect(franjaNueva).toBeTruthy()

    await pulsarYEsperar(comprador, () => franjas.nth(3).click())
    await expect(comprador.getByText('Tu visita quedó confirmada.')).toBeVisible()

    const [cita] = await consultar<{ id: string; inicio: Date }>(
      `SELECT id, lower(rango) AS inicio FROM public.citas WHERE lead_id = $1 AND estado = 'confirmada'`, [m.leadId],
    )
    expect(cita?.inicio.getTime()).toBe(new Date(franjaReservada!).getTime())

    // --- La ve confirmada en /mi-cuenta, sin direccion en el HTML ----------
    await comprador.goto('/mi-cuenta')
    await expect(comprador.getByText('Visita confirmada')).toBeVisible()
    await expect(comprador.getByText('La dirección aparecerá 2 horas antes de la visita')).toBeVisible()
    expect(await comprador.content()).not.toContain(m.direccion)

    // --- El vendedor la ve en /panel/citas --------------------------------
    await vendedor.goto('/panel')
    await vendedor.getByRole('link', { name: 'Visitas' }).click()
    await expect(vendedor).toHaveURL(/\/panel\/citas$/)
    await expect(vendedor.getByText('Comprador E2E')).toBeVisible()

    // --- El comprador la mueve --------------------------------------------
    await comprador.getByRole('link', { name: 'Mover' }).click()
    await expect(comprador).toHaveURL(new RegExp(`/mi-cuenta/visitas/${cita!.id}/mover$`))
    await pulsarYEsperar(comprador, () =>
      comprador.locator(`button[name="inicio"][value="${franjaNueva}"]`).click())
    await expect(comprador.getByText('La visita se movió a la nueva franja.')).toBeVisible()

    const [movida] = await consultar<{ inicio: Date }>(
      'SELECT lower(rango) AS inicio FROM public.citas WHERE id = $1', [cita!.id],
    )
    expect(movida?.inicio.getTime()).toBe(new Date(franjaNueva!).getTime())

    // --- Y la cancela ------------------------------------------------------
    await comprador.goto('/mi-cuenta')
    await pulsarYEsperar(comprador, () => comprador.getByRole('button', { name: 'Cancelar' }).click())
    // No se espera el texto "Visita cancelada." de AccionesCita: revalidatePath
    // refresca /mi-cuenta en la misma respuesta, la solicitud ya no tiene visita
    // y el componente se desmonta. Lo observable es que vuelve a ofrecerse reservar.
    await expect(comprador.getByRole('link', { name: 'Reservar visita' })).toBeVisible()
    await expect(comprador.getByText('Visita confirmada')).toHaveCount(0)

    const { data: final } = await admin.from('citas').select('estado,cancelada_por').eq('id', cita!.id).single()
    expect(final).toEqual({ estado: 'cancelada', cancelada_por: m.compradorId })

    const { data: eventos } = await admin.from('registro_auditoria')
      .select('accion').eq('entidad', 'cita').eq('entidad_id', cita!.id)
    expect((eventos ?? []).map((e) => e.accion).sort()).toEqual(['cita_cancelada', 'cita_movida', 'cita_reservada'])
  } finally {
    await contextoVendedor.close()
    await contextoComprador.close()
  }
})

test('la direccion no esta en el HTML servido hasta 2 horas antes de la visita', async ({ browser }) => {
  // Uso (a) de insertarCitaDirecta, en los dos montajes: una visita a now() + 1 h
  // no se puede crear con reservar_cita por el horizonte de 2 horas, y la de
  // now() + 3 h se inserta igual para que las dos pruebas partan del mismo sitio.
  const lejos = await montar('lejos')
  const cerca = await montar('cerca')
  const ahora = await ahoraDeLaBase()

  await insertarCitaDirecta({
    leadId: lejos.leadId, propiedadId: lejos.propiedadId, compradorId: lejos.compradorId,
    vendedorId: lejos.vendedorId, inicio: new Date(ahora.getTime() + 3 * HORA_MS),
  })
  await insertarCitaDirecta({
    leadId: cerca.leadId, propiedadId: cerca.propiedadId, compradorId: cerca.compradorId,
    vendedorId: cerca.vendedorId, inicio: new Date(ahora.getTime() + HORA_MS),
  })

  const contextoLejos = await browser.newContext()
  const contextoCerca = await browser.newContext()
  try {
    const paginaLejos = await contextoLejos.newPage()
    await entrarComo(paginaLejos, lejos.correoComprador)
    await paginaLejos.goto('/mi-cuenta')
    await expect(paginaLejos.getByText('Visita confirmada')).toBeVisible()
    // Contra el HTML, no contra la pantalla: un dato en el payload RSC que el
    // CSS no muestre tambien es una fuga.
    const htmlLejos = await paginaLejos.content()
    expect(htmlLejos).not.toContain(lejos.direccion)
    expect(htmlLejos).toContain('La dirección aparecerá 2 horas antes de la visita')

    const paginaCerca = await contextoCerca.newPage()
    await entrarComo(paginaCerca, cerca.correoComprador)
    await paginaCerca.goto('/mi-cuenta')
    await expect(paginaCerca.getByText('Visita confirmada')).toBeVisible()
    expect(await paginaCerca.content()).toContain(cerca.direccion)
  } finally {
    await contextoLejos.close()
    await contextoCerca.close()
  }
})
```

- [ ] **Paso 3: correrla.**

```powershell
npx supabase db reset
npx playwright test tests/e2e/citas.spec.ts
```

Esperado: 2 verdes. Si «recorrido completo» falla en `franjas.nth(6)`, comprobar con psql que el vendedor tiene 7 filas en `disponibilidad_semanal` antes de tocar la prueba.

- [ ] **Paso 4: falsificación de la dirección en el HTML.** Con psql, abrir la política a cualquier comprador con visita confirmada, sin ventana:

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "DROP POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion; CREATE POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.citas c WHERE c.propiedad_id = propiedades_ubicacion.propiedad_id AND c.comprador_id = (SELECT auth.uid()) AND c.estado = 'confirmada'));"
npx playwright test tests/e2e/citas.spec.ts -g "la direccion no esta en el HTML"
```

Esperado: ROJO en `expect(htmlLejos).not.toContain(lejos.direccion)`. Restaurar con `npx supabase db reset` y ver VERDE.

- [ ] **Paso 5: suite E2E completa.**

```powershell
npm run test:e2e
```

Esperado: `N_e2e_antes + 2`.

- [ ] **Paso 6: commit.**

```bash
$G add tests/e2e/citas.spec.ts
$G commit -m "test(e2e): recorrido de visitas y direccion ausente del HTML hasta la ventana

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarea 19: Verificación final

**Files:** ninguno nuevo.

**Interfaces:**
- Consumes: la rama completa.
- Produces: el reporte de totales leídos.

- [ ] **Paso 1: base limpia y suites.**

```powershell
npx supabase db reset
npm run test:unit
npm run test:rls
npm run test:e2e
```

Pegar las tres líneas de totales tal como salen. Cada total tiene que ser igual a `N_x_0` de la Tarea 0 más la suma de las pruebas nuevas que cada tarea anotó en su propio reporte al medir. Referencia, contada en los ficheros de este plan: unitarias T9 4, T10 10, T11 4, T12 20, T13 10, T14 8, T15 6, T16 11, T17 15; RLS T1 5, T2 5, T3 5, T4 9, T5 7, T6 9, T7 4, T8 6, T11 5; E2E T18 2. Si un total no cuadra, se reconcilia fichero por fichero con la salida de vitest; no se ajusta el número esperado.

- [ ] **Paso 2: tipos, lint, build y render dinámico.**

```powershell
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
npm run verificar:render
```

Esperado: `tsc` sin errores, lint sin problemas, build correcto y `Render dinamico verificado`. Las rutas con `[id]` y `[leadId]` no pueden aparecer en `prerender-manifest.json`: ninguna declara `generateStaticParams`.

- [ ] **Paso 3: barrido de privilegios de todo SP5 contra la base.**

```powershell
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT c.relname, c.relacl FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('citas','disponibilidad_semanal','fechas_bloqueadas','propiedades_ubicacion') ORDER BY 1;"
docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "SELECT p.oid::regprocedure AS firma, p.prosecdef AS definer, p.proconfig, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated, has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('franjas_candidatas','franja_valida','franjas_libres','reservar_cita_como','reservar_cita','mover_cita_como','mover_cita','cancelar_cita_como','cancelar_cita') ORDER BY 1;"
```

Esperado: ninguna tabla con `anon=`; `proconfig` = `{search_path=""}` en las nueve funciones; `anon` en `f` en todas; `authenticated` en `t` solo en `franjas_libres`, `reservar_cita`, `mover_cita` y `cancelar_cita`; `service_role` en `f` solo en `franjas_candidatas` y `franja_valida`. Pegar la salida.

- [ ] **Paso 4: marcadores y restos de falsificaciones.**

```bash
$G status --short
$G diff main --stat
$G grep -n -E "sonda_|USING \(true\)" -- supabase/migrations/202609150*
```

Esperado: árbol limpio; la tercera orden sin salida.

- [ ] **Paso 5: reporte.** Hashes de los commits, totales leídos, salida roja y verde de cada falsificación, la salida del paso 7 de la Tarea 1 (extensión, clase de operadores, `relacl`), y si hubo que calificar `extensions.gist_uuid_ops`.

---

## Criterios de aceptación del spec y tarea que los cumple

| # | Criterio (§15 del spec) | Tarea |
|---|---|---|
| 1 | Un vendedor define su horario semanal y bloquea fechas desde `/panel/disponibilidad` | T2 (tablas y RLS), T13 (acciones), T14 (página), T18 (E2E) |
| 2 | Un comprador con lead aceptado ve las franjas libres de 14 días, en hora de Bogotá, desde 2 horas vista | T3 (cálculo, horizonte, zona, quién llama), T9 (formato), T11 (límites abiertos), T15 (selector por día), T17 (página de reservar) |
| 3 | Reserva una franja y queda confirmada al instante | T4, T12, T17, T18 |
| 4 | Dos reservas simultáneas de la misma franja: gana exactamente una | T1 (exclusión), T4 (prueba con `Promise.all` y sus falsificaciones) |
| 5 | No se puede reservar sobre un lead `nuevo`, `descartado` o ajeno | T4 (`VS002`, `VS003`) |
| 6 | Comprador y vendedor mueven una visita de forma atómica y la cancelan | T5 (cancelar), T6 (mover atómico), T12 (acciones), T15, T16, T17, T18 |
| 7 | No se puede mover ni cancelar una visita que ya empezó | T5 y T6 (`VS008` con falsificación) |
| 8 | La dirección solo es legible por el comprador entre `inicio − 2 h` y el fin, contra la base y contra el HTML servido | T8 (política y falsificaciones), T11 (consulta sin lógica de hora), T17 (página), T18 (`page.content()`) |
| 9 | `anon` y `authenticated` no ejecutan las `_como`; `service_role` sí | T7 (barrido y falsificaciones), REVOKE en T4, T5, T6 |
| 10 | Nadie escribe `citas` directamente | T1 (REVOKE ALL, se cuentan filas, falsificación) |
| 11 | «Jueves 15:00» es `20:00 UTC` y se muestra como `3:00 p. m.` | T3 (20:00 UTC, falsificaciones de dirección), T9 (`3:00 p. m.` en zona ajena) |
| 12 | Todos los errores se distinguen por SQLSTATE `VS00x` | T4, T5, T6 (códigos), T10 (mapeo por código), T12 (acciones) |
| 13 | Cada reserva, movimiento y cancelación queda en `registro_auditoria` | T4, T5, T6 (pruebas de auditoría), T18 (los tres eventos de una visita) |
| 14 | Suites en verde, `tsc` limpio, lint sin problemas, render dinámico verificado | T19 |

## Secciones del spec y tarea que las cubre

| Sección | Tarea |
|---|---|
| §4 Zona horaria | T3 (conversión en Postgres), T9 (formato en JS) |
| §5 Modelo de datos y riesgo de `btree_gist` | T1 (paso 7 verifica extensión y clase), T2 |
| §6 Franjas libres | T3 |
| §7 Escritura: funciones y variantes `_como` | T4, T5, T6, T7 |
| §8 Lectura y RLS, política nueva de `propiedades_ubicacion` | T1, T2, T8 |
| §9 Interfaz | T12 a T17 |
| §10 Costura con SP6 | T1 (`citas_confirmadas_recientes_idx`), T3 (`franjas_libres` para `service_role`), T7 (`_como` para `service_role`) |
| §11 Errores | T10 |
| §12 Pruebas | Todas; cada falsificación pedida está en su tarea |
| §13 Fuera de alcance | Sin tarea. T8 prueba el caso de reasignación solo para demostrar el filtro explícito, no lo resuelve |
| §14 Orden y dependencias | T0 |

## Riesgos abiertos

- `franjas_libres` responde también a `service_role`, más allá de la regla literal de la §6. Es lo que permite la costura de la §10 sin tocar SP5 (Tarea 3).
- Las visitas pasadas siguen en la lista de confirmadas del vendedor y del comprador, con Mover y Cancelar visibles; la base responde `VS008`. Filtrarlas por hora exigiría fechas en JS o un cambio de consulta que el spec no pide.
- Si el arreglo `fix/ubicacion-privada` crea `propiedades_ubicacion` con otra forma o sin `SELECT` para `authenticated`, la Tarea 8 falla en su paso 1: parar allí.
- Si `btree_gist` no resolviera la clase por defecto al aplicar (en local se comprobó que sí), la Tarea 1 califica `extensions.gist_uuid_ops`.
- PostgREST podría encontrar más de una relación entre `leads` y `propiedades` por la nueva tabla `citas`; los embebidos nuevos nombran la clave foránea y la Tarea 11 corre las suites de SP4 para detectarlo en la consulta existente.
