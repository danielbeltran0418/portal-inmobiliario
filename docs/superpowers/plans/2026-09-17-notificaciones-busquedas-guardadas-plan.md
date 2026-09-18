# Motor de Alertas por Email para Búsquedas Guardadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un cron diario que revisa cada búsqueda guardada activa, detecta propiedades publicadas nuevas que coinciden con sus filtros, y envía un correo de digest por Resend con un enlace de baja de un clic.

**Architecture:** Módulo de matching (`src/lib/notificaciones/busquedas.ts`) que consulta `propiedades` con el cliente admin; módulo de envío (`src/lib/notificaciones/resend.ts`) que arma y despacha el HTML del correo; un orquestador (`src/lib/notificaciones/despachador.ts`) que conecta ambos y actualiza `ultima_notificacion_en` solo tras éxito; un endpoint de cron (`/api/cron/notificar-busquedas`) protegido por `CRON_SECRET`, mismo patrón que `/api/cron/procesar-leads` de SP6; y una ruta pública de baja (`/notificaciones/baja`) que no requiere sesión.

**Tech Stack:** Next.js 16 App Router (Route Handlers), Supabase (Postgres + cliente admin), SDK de Resend, Vitest.

## Global Constraints

- Rama de trabajo: `notificaciones-busquedas-guardadas`, creada desde `main`.
- Spec de referencia: `docs/superpowers/specs/2026-09-17-notificaciones-busquedas-guardadas-design.md`.
- Toda columna y nombre de tabla existente debe respetarse exactamente como está en el esquema actual: `busquedas_guardadas.usuario_id`, `busquedas_guardadas.filtros` (jsonb con forma `{ barrio, operacion?, tipo?, precio_min?, precio_max? }`), `busquedas_guardadas.notificaciones_activas`; `propiedades.barrio_id`, `propiedades.operacion`, `propiedades.tipo_inmueble`, `propiedades.precio`, `propiedades.estado`, `propiedades.creado_en`; `barrios.id`, `barrios.slug`; `imagenes_propiedad.id`, `imagenes_propiedad.propiedad_id`, `imagenes_propiedad.orden`.
- No se crea tabla de historial de envíos (decisión confirmada en el spec, sección 2). No se crean políticas RLS nuevas: el cron usa `crearClienteAdmin()` (bypassa RLS), igual que `procesarLeadsNuevos` de SP6.
- No usar `@react-email` ni ninguna librería de plantillas nueva — HTML armado a mano con escape manual de texto interpolado (spec, sección 5).
- Todo módulo de servidor que no debe ejecutarse en el navegador empieza con `import 'server-only'`, siguiendo el patrón de `src/lib/supabase/cliente-admin.ts` y `src/lib/ia/despachador.ts`.
- Verificación de cierre de rama: `npm run lint`, `npm run test:unit`, `npm run test:rls`, `npm run build`, `npm run verificar:render` en verde (spec, sección 8).

---

### Task 1: Migración — columnas de notificación en `busquedas_guardadas`

**Files:**
- Create: `supabase/migrations/20260919000100_notificaciones_busquedas.sql`
- Test: `tests/rls/notificaciones-busquedas.test.ts`

**Interfaces:**
- Consumes: tabla `public.busquedas_guardadas` (de `supabase/migrations/20260918000100_sp2_panel_comprador.sql`).
- Produces: columnas `busquedas_guardadas.ultima_notificacion_en` (timestamptz) y `busquedas_guardadas.token_baja` (uuid, único), consumidas por las Tasks 2 y 6.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260919000100_notificaciones_busquedas.sql
alter table public.busquedas_guardadas
  add column if not exists ultima_notificacion_en timestamptz not null default now(),
  add column if not exists token_baja uuid not null default gen_random_uuid();

create unique index if not exists idx_busquedas_token_baja on public.busquedas_guardadas(token_baja);
```

- [ ] **Step 2: Aplicar la migración en local**

Run: `npx supabase migration up`
Expected: `Applying migration 20260919000100_notificaciones_busquedas.sql...` seguido de éxito.

- [ ] **Step 3: Escribir la prueba RLS que falla (token de baja no debe requerir sesión ni existir en RLS normal)**

```typescript
// tests/rls/notificaciones-busquedas.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clienteAnonimo, clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes';

const COMPRADOR = { correo: `comp-notif-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' };

describe('RLS: token_baja de busquedas_guardadas', () => {
  let clienteComprador: SupabaseClient;
  let compradorId: string;
  let busquedaId: string;
  let tokenBaja: string;
  const anonimo = clienteAnonimo();

  beforeAll(async () => {
    compradorId = await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' });
    clienteComprador = await clienteComo(COMPRADOR.correo, COMPRADOR.password);

    const { data, error } = await clienteComprador
      .from('busquedas_guardadas')
      .insert({
        usuario_id: compradorId,
        nombre: 'Busqueda para prueba de baja',
        filtros: { barrio: 'riomar' },
        notificaciones_activas: true,
      })
      .select('id, token_baja')
      .single();

    if (error || !data) throw error ?? new Error('No se pudo crear busqueda de prueba');
    busquedaId = data.id;
    tokenBaja = data.token_baja;
  });

  it('el comprador dueño puede leer su propio token_baja (ya cubierto por RLS de SP2, control positivo)', async () => {
    const { data, error } = await clienteComprador
      .from('busquedas_guardadas')
      .select('token_baja')
      .eq('id', busquedaId)
      .single();

    expect(error).toBeNull();
    expect(data?.token_baja).toBe(tokenBaja);
  });

  it('un usuario anonimo no puede leer busquedas_guardadas por token_baja via la API REST directa', async () => {
    const { data, error } = await anonimo
      .from('busquedas_guardadas')
      .select('id')
      .eq('token_baja', tokenBaja);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('FALSIFICACIÓN: el cliente admin (usado por la ruta de baja) SÍ puede desactivar por token_baja sin sesión de usuario', async () => {
    const admin = clienteAdmin();
    const { data, error } = await admin
      .from('busquedas_guardadas')
      .update({ notificaciones_activas: false })
      .eq('token_baja', tokenBaja)
      .select('notificaciones_activas')
      .single();

    expect(error).toBeNull();
    expect(data?.notificaciones_activas).toBe(false);
  });

  it('un token_baja inexistente no afecta ninguna fila', async () => {
    const admin = clienteAdmin();
    const { data, error } = await admin
      .from('busquedas_guardadas')
      .update({ notificaciones_activas: false })
      .eq('token_baja', '00000000-0000-0000-0000-000000000000')
      .select('id');

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Ejecutar la prueba para confirmar que pasa contra el esquema ya migrado**

Run: `npm run test:rls -- notificaciones-busquedas`
Expected: 4 pruebas pasando (la migración del Step 1-2 ya debe estar aplicada antes de este paso).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260919000100_notificaciones_busquedas.sql tests/rls/notificaciones-busquedas.test.ts
git commit -m "feat(notificaciones): columnas de ultima_notificacion_en y token_baja en busquedas_guardadas"
```

---

### Task 2: Módulo de matching de coincidencias

**Files:**
- Create: `src/lib/notificaciones/busquedas.ts`
- Test: `tests/unit/notificaciones-busquedas-matching.test.ts`

**Interfaces:**
- Consumes: `crearClienteAdmin()` de `src/lib/supabase/cliente-admin.ts`.
- Produces: `PropiedadCoincidente`, `BusquedaConCoincidencias`, y `obtenerBusquedasParaNotificar(): Promise<BusquedaConCoincidencias[]>`, consumidos por la Task 4.

- [ ] **Step 1: Escribir la prueba unitaria que falla**

```typescript
// tests/unit/notificaciones-busquedas-matching.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({ from: fromMock }),
}));

function tablaBusquedas(filas: unknown[]) {
  return {
    select: () => ({
      eq: () => Promise.resolve({ data: filas, error: null }),
    }),
  };
}

function tablaBarrios(id: string | null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: id ? { id } : null, error: null }),
      }),
    }),
  };
}

function tablaPropiedadesConstructor(propiedades: unknown[]) {
  const query: Record<string, unknown> = {
    select: () => query,
    eq: () => query,
    gt: () => query,
    gte: () => query,
    lte: () => query,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: propiedades, error: null }),
  };
  return query;
}

import { obtenerBusquedasParaNotificar } from '@/lib/notificaciones/busquedas';

describe('obtenerBusquedasParaNotificar', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('devuelve una busqueda con sus propiedades coincidentes cuando hay resultados', async () => {
    const busquedaFila = {
      id: 'busq-1',
      usuario_id: 'user-1',
      nombre: 'Casas en Riomar',
      filtros: { barrio: 'riomar', operacion: 'venta' },
      ultima_notificacion_en: '2026-09-01T00:00:00Z',
      token_baja: 'token-1',
    };
    const propiedadFila = {
      id: 'prop-1',
      slug: 'casa-riomar',
      titulo: 'Casa en Riomar',
      precio: 500000000,
      moneda: 'COP',
      barrio: { slug: 'riomar' },
      imagenes_propiedad: [{ id: 'img-1', orden: 0 }],
    };

    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'busquedas_guardadas') return tablaBusquedas([busquedaFila]);
      if (tabla === 'barrios') return tablaBarrios('barrio-riomar-id');
      if (tabla === 'propiedades') return tablaPropiedadesConstructor([propiedadFila]);
      throw new Error(`tabla no mockeada: ${tabla}`);
    });

    const resultado = await obtenerBusquedasParaNotificar();

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      busquedaId: 'busq-1',
      usuarioId: 'user-1',
      nombre: 'Casas en Riomar',
      tokenBaja: 'token-1',
    });
    expect(resultado[0].propiedades).toEqual([
      {
        id: 'prop-1',
        slug: 'casa-riomar',
        titulo: 'Casa en Riomar',
        precio: 500000000,
        moneda: 'COP',
        barrioSlug: 'riomar',
        imagenId: 'img-1',
      },
    ]);
  });

  it('omite una busqueda sin coincidencias nuevas', async () => {
    const busquedaFila = {
      id: 'busq-2',
      usuario_id: 'user-2',
      nombre: 'Apartamentos en Riomar',
      filtros: { barrio: 'riomar' },
      ultima_notificacion_en: '2026-09-01T00:00:00Z',
      token_baja: 'token-2',
    };

    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'busquedas_guardadas') return tablaBusquedas([busquedaFila]);
      if (tabla === 'barrios') return tablaBarrios('barrio-riomar-id');
      if (tabla === 'propiedades') return tablaPropiedadesConstructor([]);
      throw new Error(`tabla no mockeada: ${tabla}`);
    });

    const resultado = await obtenerBusquedasParaNotificar();

    expect(resultado).toHaveLength(0);
  });

  it('omite una busqueda cuyo barrio en filtros ya no existe', async () => {
    const busquedaFila = {
      id: 'busq-3',
      usuario_id: 'user-3',
      nombre: 'Busqueda con barrio eliminado',
      filtros: { barrio: 'barrio-que-no-existe' },
      ultima_notificacion_en: '2026-09-01T00:00:00Z',
      token_baja: 'token-3',
    };

    fromMock.mockImplementation((tabla: string) => {
      if (tabla === 'busquedas_guardadas') return tablaBusquedas([busquedaFila]);
      if (tabla === 'barrios') return tablaBarrios(null);
      throw new Error(`no deberia consultar propiedades sin barrio resuelto`);
    });

    const resultado = await obtenerBusquedasParaNotificar();

    expect(resultado).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar que falla**

Run: `npx vitest run tests/unit/notificaciones-busquedas-matching.test.ts`
Expected: FAIL con "Cannot find module '@/lib/notificaciones/busquedas'".

- [ ] **Step 3: Implementar el módulo**

```typescript
// src/lib/notificaciones/busquedas.ts
import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';

export interface FiltrosBusquedaGuardada {
  barrio: string;
  operacion?: 'venta' | 'arriendo';
  tipo?: string;
  precio_min?: number;
  precio_max?: number;
}

export interface PropiedadCoincidente {
  id: string;
  slug: string;
  titulo: string;
  precio: number;
  moneda: string;
  barrioSlug: string;
  imagenId: string | null;
}

export interface BusquedaConCoincidencias {
  busquedaId: string;
  usuarioId: string;
  nombre: string;
  tokenBaja: string;
  propiedades: PropiedadCoincidente[];
}

interface FilaBusquedaGuardada {
  id: string;
  usuario_id: string;
  nombre: string;
  filtros: FiltrosBusquedaGuardada;
  ultima_notificacion_en: string;
  token_baja: string;
}

interface FilaPropiedadCoincidente {
  id: string;
  slug: string;
  titulo: string;
  precio: number;
  moneda: string;
  barrio: { slug: string } | null;
  imagenes_propiedad: { id: string; orden: number }[];
}

export async function obtenerBusquedasParaNotificar(): Promise<BusquedaConCoincidencias[]> {
  const admin = crearClienteAdmin();

  const { data: busquedas } = await admin
    .from('busquedas_guardadas')
    .select('id, usuario_id, nombre, filtros, ultima_notificacion_en, token_baja')
    .eq('notificaciones_activas', true);

  const resultado: BusquedaConCoincidencias[] = [];

  for (const fila of (busquedas ?? []) as FilaBusquedaGuardada[]) {
    const filtros = fila.filtros;
    if (!filtros?.barrio) continue;

    const { data: barrio } = await admin
      .from('barrios')
      .select('id')
      .eq('slug', filtros.barrio)
      .maybeSingle();

    if (!barrio) continue;

    let consulta = admin
      .from('propiedades')
      .select('id, slug, titulo, precio, moneda, barrio:barrios(slug), imagenes_propiedad(id, orden)')
      .eq('estado', 'publicada')
      .eq('barrio_id', barrio.id)
      .gt('creado_en', fila.ultima_notificacion_en);

    if (filtros.operacion) consulta = consulta.eq('operacion', filtros.operacion);
    if (filtros.tipo) consulta = consulta.eq('tipo_inmueble', filtros.tipo);
    if (filtros.precio_min !== undefined) consulta = consulta.gte('precio', filtros.precio_min);
    if (filtros.precio_max !== undefined) consulta = consulta.lte('precio', filtros.precio_max);

    const { data: propiedades } = await consulta;
    const filas = (propiedades ?? []) as unknown as FilaPropiedadCoincidente[];
    if (filas.length === 0) continue;

    resultado.push({
      busquedaId: fila.id,
      usuarioId: fila.usuario_id,
      nombre: fila.nombre,
      tokenBaja: fila.token_baja,
      propiedades: filas.map((p) => {
        const primeraFoto = [...p.imagenes_propiedad].sort((a, b) => a.orden - b.orden)[0];
        return {
          id: p.id,
          slug: p.slug,
          titulo: p.titulo,
          precio: p.precio,
          moneda: p.moneda,
          barrioSlug: p.barrio?.slug ?? filtros.barrio,
          imagenId: primeraFoto ? primeraFoto.id : null,
        };
      }),
    });
  }

  return resultado;
}
```

- [ ] **Step 4: Ejecutar la prueba para confirmar que pasa**

Run: `npx vitest run tests/unit/notificaciones-busquedas-matching.test.ts`
Expected: 3 pruebas pasando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificaciones/busquedas.ts tests/unit/notificaciones-busquedas-matching.test.ts
git commit -m "feat(notificaciones): modulo de matching de coincidencias por busqueda guardada"
```

---

### Task 3: Cliente de Resend y plantilla de correo

**Files:**
- Create: `src/lib/notificaciones/resend.ts`
- Test: `tests/unit/notificaciones-resend.test.ts`
- Modify: `package.json` (agregar dependencia `resend`)

**Interfaces:**
- Consumes: `PropiedadCoincidente` de `src/lib/notificaciones/busquedas.ts`; variable de entorno `RESEND_API_KEY`; `urlPublica()` de `src/lib/catalogo/seo.ts`.
- Produces: `DatosDigestBusqueda`, `enviarDigestBusqueda(datos: DatosDigestBusqueda): Promise<void>`, consumido por la Task 4.

- [ ] **Step 1: Instalar la dependencia**

Run: `npm install resend`
Expected: `resend` agregado a `dependencies` en `package.json` y `package-lock.json`.

- [ ] **Step 2: Escribir la prueba unitaria que falla**

```typescript
// tests/unit/notificaciones-resend.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }) }));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import { enviarDigestBusqueda } from '@/lib/notificaciones/resend';

describe('enviarDigestBusqueda', () => {
  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'clave-de-prueba';
    process.env.NEXT_PUBLIC_APP_URL = 'https://portal.test';
  });

  it('envia el correo con el destinatario y el asunto correctos', async () => {
    await enviarDigestBusqueda({
      destinatarioEmail: 'comprador@prueba.test',
      nombreBusqueda: 'Casas en Riomar',
      tokenBaja: 'token-abc',
      propiedades: [
        { id: 'p1', slug: 'casa-1', titulo: 'Casa 1', precio: 300000000, moneda: 'COP', barrioSlug: 'riomar', imagenId: null },
      ],
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const llamada = sendMock.mock.calls[0][0];
    expect(llamada.to).toEqual(['comprador@prueba.test']);
    expect(llamada.subject).toContain('Casas en Riomar');
  });

  it('escapa caracteres HTML en el titulo de la propiedad y el nombre de la busqueda', async () => {
    await enviarDigestBusqueda({
      destinatarioEmail: 'comprador@prueba.test',
      nombreBusqueda: '<script>alert(1)</script>',
      tokenBaja: 'token-abc',
      propiedades: [
        { id: 'p1', slug: 'casa-1', titulo: '<img src=x onerror=alert(2)>', precio: 300000000, moneda: 'COP', barrioSlug: 'riomar', imagenId: null },
      ],
    });

    const llamada = sendMock.mock.calls[0][0];
    expect(llamada.html).not.toContain('<script>');
    expect(llamada.html).not.toContain('<img src=x onerror=alert(2)>');
    expect(llamada.html).toContain('&lt;script&gt;');
  });

  it('incluye el enlace de baja con el token en el HTML', async () => {
    await enviarDigestBusqueda({
      destinatarioEmail: 'comprador@prueba.test',
      nombreBusqueda: 'Casas en Riomar',
      tokenBaja: 'token-abc',
      propiedades: [
        { id: 'p1', slug: 'casa-1', titulo: 'Casa 1', precio: 300000000, moneda: 'COP', barrioSlug: 'riomar', imagenId: null },
      ],
    });

    const llamada = sendMock.mock.calls[0][0];
    expect(llamada.html).toContain('https://portal.test/notificaciones/baja?token=token-abc');
  });

  it('lanza un error si RESEND_API_KEY no esta configurada', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      enviarDigestBusqueda({
        destinatarioEmail: 'comprador@prueba.test',
        nombreBusqueda: 'Casas en Riomar',
        tokenBaja: 'token-abc',
        propiedades: [],
      })
    ).rejects.toThrow('RESEND_API_KEY');
  });
});
```

- [ ] **Step 3: Ejecutar la prueba para confirmar que falla**

Run: `npx vitest run tests/unit/notificaciones-resend.test.ts`
Expected: FAIL con "Cannot find module '@/lib/notificaciones/resend'".

- [ ] **Step 4: Implementar el módulo**

```typescript
// src/lib/notificaciones/resend.ts
import 'server-only';
import { Resend } from 'resend';
import { urlPublica } from '@/lib/catalogo/seo';
import type { PropiedadCoincidente } from './busquedas';

export interface DatosDigestBusqueda {
  destinatarioEmail: string;
  nombreBusqueda: string;
  tokenBaja: string;
  propiedades: PropiedadCoincidente[];
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatearPrecio(precio: number, moneda: string): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(precio);
}

function urlFicha(p: PropiedadCoincidente): string {
  return urlPublica(`/${p.barrioSlug}/${p.slug}`);
}

function urlImagen(p: PropiedadCoincidente): string {
  return p.imagenId ? urlPublica(`/imagen/${p.imagenId}`) : urlPublica('/og-fallback.jpg');
}

function armarHtml(datos: DatosDigestBusqueda, urlBaja: string): string {
  const filasPropiedades = datos.propiedades
    .map(
      (p) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <a href="${urlFicha(p)}" style="text-decoration:none;color:#111827;">
              <img src="${urlImagen(p)}" alt="${escaparHtml(p.titulo)}" width="120" style="border-radius:8px;display:block;margin-bottom:8px;" />
              <strong>${escaparHtml(p.titulo)}</strong><br/>
              ${formatearPrecio(p.precio, p.moneda)} · ${escaparHtml(p.barrioSlug)}
            </a>
          </td>
        </tr>`
    )
    .join('');

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2>${escaparHtml(datos.nombreBusqueda)}</h2>
      <p>Encontramos ${datos.propiedades.length} propiedad(es) nueva(s) que coinciden con esta búsqueda:</p>
      <table style="width:100%;border-collapse:collapse;">${filasPropiedades}</table>
      <p style="margin-top:24px;font-size:12px;color:#6b7280;">
        ¿Ya no quieres recibir estas alertas?
        <a href="${urlBaja}">Dejar de recibir esta búsqueda</a>.
      </p>
    </div>`;
}

export async function enviarDigestBusqueda(datos: DatosDigestBusqueda): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY es obligatoria para enviar notificaciones');

  const urlBaja = urlPublica(`/notificaciones/baja?token=${datos.tokenBaja}`);
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: 'Portal Inmobiliario <alertas@portal-inmobiliario.test>',
    to: [datos.destinatarioEmail],
    subject: `Nuevas propiedades para "${datos.nombreBusqueda}"`,
    html: armarHtml(datos, urlBaja),
  });

  if (error) throw new Error(`Fallo el envio de Resend: ${error.message}`);
}
```

- [ ] **Step 5: Ejecutar la prueba para confirmar que pasa**

Run: `npx vitest run tests/unit/notificaciones-resend.test.ts`
Expected: 4 pruebas pasando.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/notificaciones/resend.ts tests/unit/notificaciones-resend.test.ts
git commit -m "feat(notificaciones): cliente de resend y plantilla del digest de busquedas"
```

---

### Task 4: Orquestador — conecta matching y envío

**Files:**
- Create: `src/lib/notificaciones/despachador.ts`
- Test: `tests/unit/notificaciones-despachador.test.ts`

**Interfaces:**
- Consumes: `obtenerBusquedasParaNotificar()` de `./busquedas`; `enviarDigestBusqueda()` de `./resend`; `crearClienteAdmin()` de `@/lib/supabase/cliente-admin`.
- Produces: `ResultadoNotificaciones`, `procesarNotificacionesBusquedas(): Promise<ResultadoNotificaciones>`, consumido por la Task 5.

- [ ] **Step 1: Escribir la prueba unitaria que falla**

```typescript
// tests/unit/notificaciones-despachador.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { obtenerBusquedasMock, enviarDigestMock, getUserByIdMock, updateMock, eqMock } = vi.hoisted(() => {
  const eqMock = vi.fn().mockResolvedValue({ error: null });
  return {
    obtenerBusquedasMock: vi.fn(),
    enviarDigestMock: vi.fn(),
    getUserByIdMock: vi.fn(),
    updateMock: vi.fn(() => ({ eq: eqMock })),
    eqMock,
  };
});

vi.mock('@/lib/notificaciones/busquedas', () => ({
  obtenerBusquedasParaNotificar: obtenerBusquedasMock,
}));

vi.mock('@/lib/notificaciones/resend', () => ({
  enviarDigestBusqueda: enviarDigestMock,
}));

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({
    auth: { admin: { getUserById: getUserByIdMock } },
    from: () => ({ update: updateMock }),
  }),
}));

import { procesarNotificacionesBusquedas } from '@/lib/notificaciones/despachador';

const BUSQUEDA_BASE = {
  busquedaId: 'busq-1',
  usuarioId: 'user-1',
  nombre: 'Casas en Riomar',
  tokenBaja: 'token-1',
  propiedades: [{ id: 'p1', slug: 'casa-1', titulo: 'Casa 1', precio: 1, moneda: 'COP', barrioSlug: 'riomar', imagenId: null }],
};

describe('procesarNotificacionesBusquedas', () => {
  beforeEach(() => {
    obtenerBusquedasMock.mockReset();
    enviarDigestMock.mockReset();
    getUserByIdMock.mockReset();
    updateMock.mockClear();
    eqMock.mockClear();
    getUserByIdMock.mockResolvedValue({ data: { user: { email: 'comprador@prueba.test' } }, error: null });
  });

  it('envia el digest y actualiza ultima_notificacion_en cuando el envio es exitoso', async () => {
    obtenerBusquedasMock.mockResolvedValue([BUSQUEDA_BASE]);
    enviarDigestMock.mockResolvedValue(undefined);

    const resultado = await procesarNotificacionesBusquedas();

    expect(enviarDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ destinatarioEmail: 'comprador@prueba.test', nombreBusqueda: 'Casas en Riomar' })
    );
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ ultima_notificacion_en: expect.any(String) }));
    expect(eqMock).toHaveBeenCalledWith('id', 'busq-1');
    expect(resultado).toEqual({ procesadas: 1, enviadas: 1, fallidas: 0 });
  });

  it('no actualiza ultima_notificacion_en si el envio falla, y continua con las demas', async () => {
    const segundaBusqueda = { ...BUSQUEDA_BASE, busquedaId: 'busq-2', usuarioId: 'user-2' };
    obtenerBusquedasMock.mockResolvedValue([BUSQUEDA_BASE, segundaBusqueda]);
    enviarDigestMock.mockRejectedValueOnce(new Error('Resend caido')).mockResolvedValueOnce(undefined);

    const resultado = await procesarNotificacionesBusquedas();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(eqMock).toHaveBeenCalledWith('id', 'busq-2');
    expect(resultado).toEqual({ procesadas: 2, enviadas: 1, fallidas: 1 });
  });

  it('omite una busqueda si no se puede resolver el email del usuario', async () => {
    obtenerBusquedasMock.mockResolvedValue([BUSQUEDA_BASE]);
    getUserByIdMock.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await procesarNotificacionesBusquedas();

    expect(enviarDigestMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({ procesadas: 1, enviadas: 0, fallidas: 1 });
  });
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar que falla**

Run: `npx vitest run tests/unit/notificaciones-despachador.test.ts`
Expected: FAIL con "Cannot find module '@/lib/notificaciones/despachador'".

- [ ] **Step 3: Implementar el orquestador**

```typescript
// src/lib/notificaciones/despachador.ts
import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';
import { obtenerBusquedasParaNotificar } from './busquedas';
import { enviarDigestBusqueda } from './resend';

export interface ResultadoNotificaciones {
  procesadas: number;
  enviadas: number;
  fallidas: number;
}

export async function procesarNotificacionesBusquedas(): Promise<ResultadoNotificaciones> {
  const admin = crearClienteAdmin();
  const busquedas = await obtenerBusquedasParaNotificar();

  let enviadas = 0;
  let fallidas = 0;

  for (const busqueda of busquedas) {
    try {
      const { data: usuario, error: errUsuario } = await admin.auth.admin.getUserById(busqueda.usuarioId);
      const email = usuario?.user?.email;
      if (errUsuario || !email) {
        throw new Error(`No se pudo resolver el email del usuario ${busqueda.usuarioId}`);
      }

      await enviarDigestBusqueda({
        destinatarioEmail: email,
        nombreBusqueda: busqueda.nombre,
        tokenBaja: busqueda.tokenBaja,
        propiedades: busqueda.propiedades,
      });

      await admin
        .from('busquedas_guardadas')
        .update({ ultima_notificacion_en: new Date().toISOString() })
        .eq('id', busqueda.busquedaId);

      enviadas += 1;
    } catch (error) {
      console.error('[Notificaciones] Fallo al procesar busqueda', busqueda.busquedaId, error);
      fallidas += 1;
    }
  }

  return { procesadas: busquedas.length, enviadas, fallidas };
}
```

- [ ] **Step 4: Ejecutar la prueba para confirmar que pasa**

Run: `npx vitest run tests/unit/notificaciones-despachador.test.ts`
Expected: 3 pruebas pasando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificaciones/despachador.ts tests/unit/notificaciones-despachador.test.ts
git commit -m "feat(notificaciones): orquestador que conecta matching y envio del digest"
```

---

### Task 5: Endpoint de cron y configuración de Vercel

**Files:**
- Create: `src/app/api/cron/notificar-busquedas/route.ts`
- Test: `tests/unit/notificaciones-cron-route.test.ts`
- Modify: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `procesarNotificacionesBusquedas()` de `@/lib/notificaciones/despachador`; variable de entorno `CRON_SECRET` (ya existente, usada por `/api/cron/procesar-leads`).
- Produces: `GET` handler en `/api/cron/notificar-busquedas`.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
// tests/unit/notificaciones-cron-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { procesarMock } = vi.hoisted(() => ({
  procesarMock: vi.fn().mockResolvedValue({ procesadas: 2, enviadas: 2, fallidas: 0 }),
}));

vi.mock('@/lib/notificaciones/despachador', () => ({
  procesarNotificacionesBusquedas: procesarMock,
}));

import { GET } from '@/app/api/cron/notificar-busquedas/route';
import { NextRequest } from 'next/server';

describe('Route Handler del cron diario de notificaciones de busquedas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'secreto-cron-test';
  });

  it('rechaza peticiones sin cabecera o con token incorrecto con 401', async () => {
    process.env.RESEND_API_KEY = 'clave-de-prueba';
    const reqSinToken = new NextRequest('http://localhost:3000/api/cron/notificar-busquedas');
    const resSin = await GET(reqSinToken);
    expect(resSin.status).toBe(401);

    const reqTokenInvalido = new NextRequest('http://localhost:3000/api/cron/notificar-busquedas', {
      headers: { authorization: 'Bearer token-falso' },
    });
    const resInv = await GET(reqTokenInvalido);
    expect(resInv.status).toBe(401);
  });

  it('ejecuta procesarNotificacionesBusquedas con token valido y retorna 200', async () => {
    process.env.RESEND_API_KEY = 'clave-de-prueba';
    const req = new NextRequest('http://localhost:3000/api/cron/notificar-busquedas', {
      headers: { authorization: 'Bearer secreto-cron-test' },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, procesadas: 2, enviadas: 2, fallidas: 0 });
    expect(procesarMock).toHaveBeenCalledTimes(1);
  });

  it('responde 500 sin procesar nada si RESEND_API_KEY no esta configurada', async () => {
    delete process.env.RESEND_API_KEY;
    const req = new NextRequest('http://localhost:3000/api/cron/notificar-busquedas', {
      headers: { authorization: 'Bearer secreto-cron-test' },
    });

    const res = await GET(req);
    expect(res.status).toBe(500);
    expect(procesarMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar que falla**

Run: `npx vitest run tests/unit/notificaciones-cron-route.test.ts`
Expected: FAIL con "Cannot find module '@/app/api/cron/notificar-busquedas/route'".

- [ ] **Step 3: Implementar el endpoint**

Falta de `RESEND_API_KEY` responde `500` inmediatamente, antes de tocar la base de datos (spec, sección 7) — el chequeo va en el endpoint, no dentro del despachador, para que un fallo de configuración no se cuente como "fallida" por búsqueda.

```typescript
// src/app/api/cron/notificar-busquedas/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { procesarNotificacionesBusquedas } from '@/lib/notificaciones/despachador';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return new NextResponse('RESEND_API_KEY no configurada', { status: 500 });
  }

  const resultado = await procesarNotificacionesBusquedas();
  return NextResponse.json({ ok: true, ...resultado });
}
```

- [ ] **Step 4: Ejecutar la prueba para confirmar que pasa**

Run: `npx vitest run tests/unit/notificaciones-cron-route.test.ts`
Expected: 3 pruebas pasando.

- [ ] **Step 5: Agregar el cron a `vercel.json`**

Modificar `vercel.json` para que el arreglo `crons` incluya la nueva entrada junto a la existente de `procesar-leads`:

```json
{
  "crons": [
    { "path": "/api/cron/procesar-leads", "schedule": "0 6 * * *" },
    { "path": "/api/cron/notificar-busquedas", "schedule": "0 8 * * *" }
  ]
}
```

- [ ] **Step 6: Documentar `RESEND_API_KEY` en `.env.example`**

Agregar al final de `.env.example`:

```
# Resend: envio de digests de busquedas guardadas (motor de alertas por email).
# Se saca en https://resend.com/api-keys. Sin ella, el cron de notificaciones
# responde 500 sin intentar procesar nada (ver src/lib/notificaciones/resend.ts).
RESEND_API_KEY=
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/notificar-busquedas/route.ts tests/unit/notificaciones-cron-route.test.ts vercel.json .env.example
git commit -m "feat(notificaciones): endpoint de cron diario y configuracion de vercel"
```

---

### Task 6: Ruta pública de baja de un clic

**Files:**
- Create: `src/app/notificaciones/baja/route.ts`
- Create: `src/app/notificaciones/baja/confirmado/page.tsx`
- Test: `tests/unit/notificaciones-baja-route.test.ts`

**Interfaces:**
- Consumes: `crearClienteAdmin()` de `@/lib/supabase/cliente-admin`.
- Produces: `GET` handler en `/notificaciones/baja` que redirige a `/notificaciones/baja/confirmado`.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
// tests/unit/notificaciones-baja-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { eqMock, updateMock } = vi.hoisted(() => {
  const eqMock = vi.fn().mockResolvedValue({ error: null, data: [{ id: 'busq-1' }] });
  return { eqMock, updateMock: vi.fn(() => ({ eq: eqMock })) };
});

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({ from: () => ({ update: updateMock }) }),
}));

import { GET } from '@/app/notificaciones/baja/route';
import { NextRequest } from 'next/server';

describe('Route Handler de baja de busquedas guardadas', () => {
  beforeEach(() => {
    updateMock.mockClear();
    eqMock.mockClear();
  });

  it('responde 400 si falta el parametro token', async () => {
    const req = new NextRequest('http://localhost:3000/notificaciones/baja');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('desactiva notificaciones_activas por token y redirige a la pagina de confirmacion', async () => {
    const req = new NextRequest('http://localhost:3000/notificaciones/baja?token=token-abc');
    const res = await GET(req);

    expect(updateMock).toHaveBeenCalledWith({ notificaciones_activas: false });
    expect(eqMock).toHaveBeenCalledWith('token_baja', 'token-abc');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/notificaciones/baja/confirmado');
  });
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar que falla**

Run: `npx vitest run tests/unit/notificaciones-baja-route.test.ts`
Expected: FAIL con "Cannot find module '@/app/notificaciones/baja/route'".

- [ ] **Step 3: Implementar la ruta de baja**

```typescript
// src/app/notificaciones/baja/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return new NextResponse('Falta el parametro token', { status: 400 });
  }

  const admin = crearClienteAdmin();
  await admin.from('busquedas_guardadas').update({ notificaciones_activas: false }).eq('token_baja', token);

  return NextResponse.redirect(new URL('/notificaciones/baja/confirmado', req.url));
}
```

- [ ] **Step 4: Ejecutar la prueba para confirmar que pasa**

Run: `npx vitest run tests/unit/notificaciones-baja-route.test.ts`
Expected: 2 pruebas pasando.

- [ ] **Step 5: Crear la página de confirmación**

```tsx
// src/app/notificaciones/baja/confirmado/page.tsx
export const metadata = { title: 'Alertas desactivadas' };

export default function PaginaConfirmacionBaja() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-tinta">Alertas desactivadas</h1>
      <p className="mt-2 text-tinta-suave">
        No volverás a recibir correos para esta búsqueda guardada. Puedes reactivarla en cualquier
        momento desde tu panel en <strong>Mi cuenta &gt; Búsquedas guardadas</strong>.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Verificar que el build sigue limpio con la ruta nueva**

Run: `npm run build`
Expected: compila sin errores; `/notificaciones/baja/confirmado` aparece en la lista de rutas dinámicas.

- [ ] **Step 7: Commit**

```bash
git add src/app/notificaciones/baja/route.ts src/app/notificaciones/baja/confirmado/page.tsx tests/unit/notificaciones-baja-route.test.ts
git commit -m "feat(notificaciones): ruta publica de baja de un clic y pagina de confirmacion"
```

---

### Task 7: Verificación final de rama

**Files:**
- No se crean ni modifican archivos nuevos en esta tarea; solo verificación.

**Interfaces:**
- Consumes: todas las tareas anteriores.
- Produces: rama lista para PR.

- [ ] **Step 1: Ejecutar el linter**

Run: `npm run lint`
Expected: `ESLint: No issues found`.

- [ ] **Step 2: Ejecutar las pruebas unitarias completas**

Run: `npm run test:unit`
Expected: todos los archivos pasan, incluidos los 5 archivos nuevos de esta feature.

- [ ] **Step 3: Ejecutar las pruebas RLS completas**

Requiere Docker/Supabase local levantado (`npx supabase db reset` si hace falta aplicar la migración de la Task 1).

Run: `npm run test:rls`
Expected: todos los archivos pasan, incluido `tests/rls/notificaciones-busquedas.test.ts`.

- [ ] **Step 4: Ejecutar el build de producción**

Run: `npm run build`
Expected: compila sin errores ni warnings de deprecación.

- [ ] **Step 5: Verificar el render dinámico**

Run: `npm run verificar:render`
Expected: `Render dinamico verificado: ninguna pagina prerenderizada fuera de la lista permitida`.

- [ ] **Step 6: Push y creación del PR**

```bash
git push -u origin notificaciones-busquedas-guardadas
gh pr create --base main --title "feat(notificaciones): motor de alertas por email para busquedas guardadas" --body "Implementa el spec docs/superpowers/specs/2026-09-17-notificaciones-busquedas-guardadas-design.md: cron diario, matching de coincidencias, envio via Resend y baja de un clic. Cierra el hueco donde notificaciones_activas existia en la UI desde SP2 sin ningun efecto real."
```

Expected: PR creado; CI (gitleaks, unit, rls, build, verificar:render) en verde antes de mergear.
