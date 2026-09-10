# Portal Inmobiliario — SP0 Fundación: Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la fundación del portal inmobiliario — esquema de datos con RLS activo, autenticación con verificación por correo, guardas de rol y endurecimiento de seguridad — sobre la que se apoyarán los sub-proyectos 1 a 7.

**Architecture:** Next.js App Router con *route groups* para separar los tres front-ends sin ensuciar las URLs. Supabase (Postgres) como base de datos y proveedor de identidad. La seguridad vive en la base de datos: RLS es la defensa real, el middleware es conveniencia. Toda tabla nace con RLS activo en la misma migración que la crea.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind v4, Supabase CLI + Postgres, `@supabase/ssr`, Zod, Vitest, Playwright, gitleaks, GitHub Actions.

**Spec de referencia:** `docs/superpowers/specs/2026-08-27-portal-inmobiliario-sp0-design.md`

## Global Constraints

- **Idioma del código:** identificadores, tablas y columnas en español, sin tildes ni ñ (`banos`, no `baños`). Los mensajes al usuario sí llevan tildes.
  - **Excepción, deliberada y acotada:** los puntos de integración con Supabase conservan el nombre canónico de su documentación oficial — `handle_new_user`, `on_auth_user_created`, `custom_access_token_hook`. Traducirlos rompería la trazabilidad con los docs de la plataforma sin ganancia funcional, y `custom_access_token_hook` además lo referencia `config.toml`.
  - **La excepción cubre también el vocabulario de la plataforma**, no solo los nombres de función: `claims` y `v_claims` (término estándar de JWT, sin equivalente español que no confunda), `event` (parámetro que Supabase pasa al hook), `access_token` / `accessToken` (campo de la API de Supabase) y `auth_admin` dentro de un nombre de política, porque nombra al rol de Postgres `supabase_auth_admin` al que apunta. Extendida tras la revisión de la Task 8.
  - La regla del español gobierna el **modelo de dominio** — `perfiles`, `propiedades`, `barrios`, `banos`, `vendedor_id` —, no la frontera con la plataforma. Un identificador en inglés que no sea vocabulario de Supabase ni de JWT sí es un defecto.
- **RLS obligatorio:** ninguna migración crea una tabla sin `ENABLE ROW LEVEL SECURITY` en el mismo archivo.
- **`super_admin` nunca se asigna desde la aplicación.** Solo por SQL directo.
- **Toda función `SECURITY DEFINER` lleva `SET search_path = ''`** y referencia esquemas de forma calificada (`public.perfiles`).
- **`SUPABASE_SERVICE_ROLE_KEY` jamás en una variable `NEXT_PUBLIC_`** ni importable desde un componente cliente.
- **Contraseñas: mínimo 12 caracteres.** El hasheo lo hace Supabase Auth (bcrypt); no se implementa a mano.
- **`alt_text` es `NOT NULL`** en `imagenes_propiedad`.
- **`seed.sql` nunca corre en producción.**
- **TypeScript en modo `strict`.** Sin `any` implícito.
- **Un commit por tarea**, con el prefijo indicado en cada paso final.
- **Todo módulo que importe `src/middleware.ts` debe ser compatible con el runtime Edge.** Regla añadida durante la ejecución, tras detectar que `generarNonce()` y `rolDesdeToken()` usaban `Buffer`. El middleware de Next corre en Edge, donde **no existen** `Buffer`, `process`, `fs` ni el resto de APIs de Node. Y las pruebas unitarias corren en Node bajo Vitest, **donde `Buffer` sí existe**: habrían pasado en verde con la aplicación caída en cada petición. Usar `crypto.getRandomValues`, `btoa`/`atob`, `TextDecoder` y `TextEncoder`, que están en ambos runtimes. Afecta a `lib/seguridad/cabeceras.ts` y `lib/auth/roles.ts`, y a cualquier módulo que estos importen.
- **Toda prueba que afirme una denegación debe demostrar POR QUÉ se deniega.** Regla añadida durante la ejecución, tras encontrar tres veces el mismo defecto en las pruebas de este plan:
  - `expect(error).not.toBeNull()` **no basta**: se cumple con cualquier error, incluido "la tabla no existe". Comprobado en la Task 4, donde esa prueba pasaba contra una tabla inexistente. Hay que asertar el código: `expect(error?.code).toBe('42501')` para violación de política RLS, o el `code` que corresponda.
  - **Cero filas no basta**: una consulta devuelve cero filas tanto si la política deniega como si el dato nunca se creó. Hay que fijar además el caso positivo — que el dueño legítimo SÍ ve la fila — en el mismo `describe`.
  - Un `UPDATE` de PostgREST que no afecta filas **devuelve `error` nulo**. Para probar que una escritura fue denegada hay que encadenar `.select()` y asertar la longitud del arreglo, no el error.
  - Una prueba que valida una restricción de la base (`CHECK`, `UNIQUE`) debe **intentar insertar el dato inválido** y comprobar el rechazo. Leer filas ya sembradas y pasarles una expresión regular en JavaScript describe los datos que hay, no demuestra que la base rechace los que faltan.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/*.sql` | Esquema, RLS, funciones y triggers. Una migración por unidad lógica |
| `supabase/seed.sql` | Los tres usuarios de prueba. Solo local/staging |
| `supabase/config.toml` | Confirmación de correo activa, hook de access token |
| `src/lib/supabase/cliente-navegador.ts` | Cliente para componentes cliente |
| `src/lib/supabase/cliente-servidor.ts` | Cliente para Server Components y Server Actions |
| `src/lib/supabase/cliente-admin.ts` | Cliente `service_role`. Marcado `server-only` |
| `src/lib/validacion/esquemas.ts` | Esquemas Zod compartidos cliente/servidor |
| `src/lib/errores/mapear.ts` | Traduce errores internos a mensajes genéricos |
| `src/lib/auth/roles.ts` | Lee el rol del JWT y decide acceso por grupo de rutas |
| `src/lib/auth/limite-intentos.ts` | Envoltura de las RPC de límite de login |
| `src/lib/seguridad/cabeceras.ts` | Construye las cabeceras de seguridad y la CSP con nonce |
| `src/middleware.ts` | Refresco de sesión, guardas de rol, cabeceras |
| `src/app/(auth)/**` | Registro, login, verificación |
| `src/app/(comprador|vendedor|admin)/**` | Páginas mínimas que prueban las guardas |
| `tests/unit/**` | Lógica pura (Vitest) |
| `tests/rls/**` | Matriz de RLS contra Postgres local (Vitest) |
| `tests/e2e/**` | Flujo completo (Playwright) |

---

## Task 1: Andamiaje del proyecto, CI y detección de secretos

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `.gitleaks.toml`, `.github/workflows/ci.yml`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `tests/unit/andamiaje.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: proyecto Next.js que compila; `npm run test:unit` ejecuta Vitest; CI verde

- [ ] **Step 1: Crear el proyecto Next.js**

```bash
npx create-next-app@latest portal-inmobiliario --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
cd portal-inmobiliario
git init
```

- [ ] **Step 2: Instalar dependencias del proyecto**

```bash
npm install @supabase/supabase-js @supabase/ssr zod server-only
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths @playwright/test dotenv
```

- [ ] **Step 3: Escribir `.gitignore` antes de cualquier commit**

```gitignore
node_modules/
.next/
out/
build/
coverage/
test-results/
playwright-report/

.env
.env.local
.env*.local

supabase/.temp/
supabase/.branches/

.DS_Store
*.pem
```

- [ ] **Step 4: Escribir `.env.example` (sin valores reales)**

```bash
# Supabase — publicas por diseño, seguras solo porque RLS esta activo
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Solo servidor. SALTA RLS POR COMPLETO. Nunca con prefijo NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=

# Marcador de entorno. 'production' bloquea la ejecucion del seed
APP_ENTORNO=local
```

- [ ] **Step 5: Configurar Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/rls/**/*.test.ts'],
    testTimeout: 20000,
  },
})
```

Añadir a `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test:unit": "vitest run tests/unit",
  "test:rls": "vitest run tests/rls",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 6: Escribir la prueba de andamiaje (falla)**

`tests/unit/andamiaje.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

describe('andamiaje del proyecto', () => {
  it('.gitignore excluye los archivos de entorno', () => {
    const contenido = readFileSync('.gitignore', 'utf8')
    expect(contenido).toContain('.env.local')
    expect(contenido).toContain('.env*.local')
  })

  it('.env.example no contiene valores de llaves', () => {
    const contenido = readFileSync('.env.example', 'utf8')
    expect(contenido).toMatch(/SUPABASE_SERVICE_ROLE_KEY=\s*$/m)
  })

  it('ninguna variable publica expone la llave de servicio', () => {
    const contenido = readFileSync('.env.example', 'utf8')
    expect(contenido).not.toMatch(/NEXT_PUBLIC_.*SERVICE_ROLE/)
  })

  it('existe el flujo de CI', () => {
    expect(existsSync('.github/workflows/ci.yml')).toBe(true)
  })
})
```

- [ ] **Step 7: Ejecutar la prueba y confirmar que falla**

Run: `npm run test:unit`
Expected: FAIL — `.github/workflows/ci.yml` no existe todavía.

- [ ] **Step 8: Escribir la configuración de gitleaks**

`.gitleaks.toml`:

```toml
title = "portal-inmobiliario"

[extend]
useDefault = true

[[rules]]
id = "supabase-service-role"
description = "Llave service_role de Supabase"
regex = '''eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'''

[allowlist]
paths = ['''\.env\.example$''', '''supabase/seed\.sql$''']
```

- [ ] **Step 9: Escribir el flujo de CI**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main, dev]

jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Buscar secretos filtrados
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Levantar Supabase local
        uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start

      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test:unit
      - run: npm run test:rls
      - run: npm run build
```

- [ ] **Step 10: Ejecutar la prueba y confirmar que pasa**

Run: `npm run test:unit`
Expected: PASS — 4 pruebas.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "chore: andamiaje del proyecto con CI y deteccion de secretos"
```

---

## Task 2: Supabase local, enums y tabla `perfiles` con el rol blindado

Esta es la tarea de seguridad más importante del plan. RLS filtra **filas, no columnas**: sin las tres capas de defensa, un comprador puede escribir `rol = 'super_admin'` en su propia fila, que legítimamente le pertenece.

**Files:**
- Create: `supabase/config.toml` (generado), `supabase/migrations/20260827000100_enums.sql`, `supabase/migrations/20260827000200_perfiles.sql`
- Create: `tests/rls/ayudantes.ts`, `tests/rls/perfiles.test.ts`

**Interfaces:**
- Consumes: proyecto de la Task 1
- Produces: tipos `public.rol_usuario`, tabla `public.perfiles(id, rol, nombre, telefono, creado_en, actualizado_en)`, función `public.es_super_admin()` que usarán las políticas de las Tasks 5 y 7; ayudantes de prueba `clienteAnonimo()`, `clienteAdmin()`, `crearUsuarioDePrueba()`, `clienteComo()`

- [ ] **Step 1: Inicializar y levantar Supabase local**

```bash
supabase init
supabase start
```

Copiar la `anon key` y la `service_role key` que imprime el comando a `.env.local`.

- [ ] **Step 2: Activar la confirmación de correo en `supabase/config.toml`**

```toml
[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["http://127.0.0.1:3000/confirmar"]

[auth.email]
enable_signup = true
enable_confirmations = true
```

- [ ] **Step 3: Escribir los ayudantes de prueba de RLS**

`tests/rls/ayudantes.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function clienteAnonimo(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false } })
}

export function clienteAdmin(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false } })
}

export async function crearUsuarioDePrueba(opciones: {
  correo: string
  password: string
  rol: 'comprador' | 'vendedor' | 'super_admin'
  nombre?: string
}): Promise<string> {
  const admin = clienteAdmin()
  await admin.auth.admin.listUsers().then(({ data }) => {
    const existente = data?.users.find((u) => u.email === opciones.correo)
    return existente ? admin.auth.admin.deleteUser(existente.id) : null
  })

  const { data, error } = await admin.auth.admin.createUser({
    email: opciones.correo,
    password: opciones.password,
    email_confirm: true,
    user_metadata: { nombre: opciones.nombre ?? 'Usuario Prueba', telefono: '3001234567' },
  })
  if (error) throw error

  // El rol se fija por SQL directo: la aplicacion nunca lo asigna.
  const { error: errorRol } = await admin
    .from('perfiles')
    .update({ rol: opciones.rol })
    .eq('id', data.user.id)
  if (errorRol) throw errorRol

  return data.user.id
}

export async function clienteComo(correo: string, password: string): Promise<SupabaseClient> {
  const cliente = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await cliente.auth.signInWithPassword({ email: correo, password })
  if (error) throw error
  return cliente
}
```

- [ ] **Step 4: Escribir las pruebas de RLS de `perfiles` (fallan)**

`tests/rls/perfiles.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const COMPRADOR = { correo: 'rls-comprador@prueba.test', password: 'ClaveDePrueba123!' }
const OTRO = { correo: 'rls-otro@prueba.test', password: 'ClaveDePrueba123!' }
const ADMIN = { correo: 'rls-super@prueba.test', password: 'ClaveDePrueba123!' }

let idComprador = ''

describe('RLS de perfiles', () => {
  beforeAll(async () => {
    idComprador = await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador', nombre: 'Ana Comprador' })
    await crearUsuarioDePrueba({ ...OTRO, rol: 'comprador', nombre: 'Otro Usuario' })
    await crearUsuarioDePrueba({ ...ADMIN, rol: 'super_admin', nombre: 'Super Admin' })
  })

  it('el usuario lee su propio perfil', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { data } = await cliente.from('perfiles').select('nombre, rol')
    expect(data).toHaveLength(1)
    expect(data![0].nombre).toBe('Ana Comprador')
  })

  it('el usuario NO lee el perfil de otro', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { data } = await cliente.from('perfiles').select('nombre')
    expect(data!.some((f) => f.nombre === 'Otro Usuario')).toBe(false)
  })

  it('el usuario actualiza su propio nombre', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { error } = await cliente.from('perfiles')
      .update({ nombre: 'Ana Actualizada' }).eq('id', idComprador)
    expect(error).toBeNull()
  })

  it('el usuario NO puede escalar su propio rol', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { error } = await cliente.from('perfiles')
      .update({ rol: 'super_admin' }).eq('id', idComprador)
    expect(error).not.toBeNull()
  })

  it('el rol en base de datos sigue siendo comprador tras el intento', async () => {
    const { data } = await clienteAdmin()
      .from('perfiles').select('rol').eq('id', idComprador).single()
    expect(data!.rol).toBe('comprador')
  })

  it('el super admin SI lee los perfiles de todos', async () => {
    const cliente = await clienteComo(ADMIN.correo, ADMIN.password)
    const { data } = await cliente.from('perfiles').select('id')
    expect(data!.length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 5: Ejecutar las pruebas y confirmar que fallan**

Run: `npm run test:rls`
Expected: FAIL — la relación `perfiles` no existe.

- [ ] **Step 6: Escribir la migración de enums**

`supabase/migrations/20260827000100_enums.sql`:

```sql
CREATE TYPE public.rol_usuario      AS ENUM ('comprador','vendedor','super_admin');
CREATE TYPE public.tipo_operacion   AS ENUM ('venta','arriendo');
CREATE TYPE public.tipo_inmueble    AS ENUM ('apartamento','casa','local','lote','oficina');
CREATE TYPE public.estado_propiedad AS ENUM
  ('borrador','en_revision','publicada','pausada','vendida','rechazada');
```

- [ ] **Step 7: Escribir la migración de `perfiles` con las tres capas de defensa**

`supabase/migrations/20260827000200_perfiles.sql`:

```sql
CREATE TABLE public.perfiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol           public.rol_usuario NOT NULL DEFAULT 'comprador',
  nombre        text NOT NULL,
  telefono      text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- Capa 1: privilegio a nivel de columna. 'rol' simplemente no es actualizable.
REVOKE UPDATE ON public.perfiles FROM authenticated;
GRANT  UPDATE (nombre, telefono) ON public.perfiles TO authenticated;
GRANT  SELECT ON public.perfiles TO authenticated;

-- Capa 2: RLS a nivel de fila.
CREATE POLICY perfil_lectura_propia ON public.perfiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY perfil_actualizacion_propia ON public.perfiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Capa 3: trigger como red de seguridad.
--
-- auth.role() devuelve el rol del JWT: 'authenticated', 'anon' o 'service_role'.
-- En SQL directo (migraciones y seed) no hay JWT y devuelve NULL, por eso el
-- COALESCE lo trata como service_role: el rol SI se puede fijar por SQL.
CREATE OR REPLACE FUNCTION public.bloquear_cambio_rol() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.rol IS DISTINCT FROM OLD.rol
     AND COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'El rol no se modifica desde la aplicacion';
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

CREATE TRIGGER perfiles_bloquear_rol
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambio_rol();

-- Ayudante de rol, usado por las politicas de super_admin de esta y otras tablas.
-- Es SECURITY DEFINER a proposito: debe leer perfiles saltando la RLS de
-- perfiles, o la politica se llamaria a si misma en un ciclo infinito.
CREATE OR REPLACE FUNCTION public.es_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = auth.uid() AND rol = 'super_admin'
  );
$$;

CREATE POLICY perfil_lectura_super_admin ON public.perfiles
  FOR SELECT TO authenticated
  USING (public.es_super_admin());
```

- [ ] **Step 8: Aplicar las migraciones**

```bash
supabase db reset
```

- [ ] **Step 9: Ejecutar las pruebas y confirmar que pasan**

Run: `npm run test:rls`
Expected: PASS — 6 pruebas. Si la prueba de escalada de rol pasa cuando no debería, revisar que `REVOKE UPDATE` esté antes del `GRANT UPDATE (columnas)`.

- [ ] **Step 10: Commit**

```bash
git add supabase tests
git commit -m "feat(db): perfiles con RLS y rol blindado en tres capas"
```

---

## Task 3: Trigger `handle_new_user` con lista blanca de rol

**Files:**
- Create: `supabase/migrations/20260827000300_handle_new_user.sql`
- Create: `tests/rls/registro-rol.test.ts`

**Interfaces:**
- Consumes: `public.perfiles`, `public.rol_usuario` (Task 2)
- Produces: trigger `on_auth_user_created` que crea el perfil al registrarse; el registro público ya funciona vía `signUp`

- [ ] **Step 1: Escribir la prueba de inyección de rol (falla)**

`tests/rls/registro-rol.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clienteAnonimo, clienteAdmin } from './ayudantes'

async function borrarSiExiste(correo: string) {
  const admin = clienteAdmin()
  const { data } = await admin.auth.admin.listUsers()
  const u = data?.users.find((x) => x.email === correo)
  if (u) await admin.auth.admin.deleteUser(u.id)
}

describe('creacion de perfil al registrarse', () => {
  it('un registro normal como comprador crea el perfil con rol comprador', async () => {
    const correo = 'nuevo-comprador@prueba.test'
    await borrarSiExiste(correo)

    const { data, error } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: 'ClaveDePrueba123!',
      options: { data: { nombre: 'Nuevo Comprador', telefono: '3001112233', rol_solicitado: 'comprador' } },
    })
    expect(error).toBeNull()

    const { data: perfil } = await clienteAdmin()
      .from('perfiles').select('rol, nombre').eq('id', data.user!.id).single()
    expect(perfil!.rol).toBe('comprador')
    expect(perfil!.nombre).toBe('Nuevo Comprador')
  })

  it('un registro como vendedor crea el perfil con rol vendedor', async () => {
    const correo = 'nuevo-vendedor@prueba.test'
    await borrarSiExiste(correo)

    const { data } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: 'ClaveDePrueba123!',
      options: { data: { nombre: 'Nuevo Vendedor', telefono: '3001112244', rol_solicitado: 'vendedor' } },
    })

    const { data: perfil } = await clienteAdmin()
      .from('perfiles').select('rol').eq('id', data.user!.id).single()
    expect(perfil!.rol).toBe('vendedor')
  })

  it('inyectar rol_solicitado super_admin produce un comprador', async () => {
    const correo = 'atacante@prueba.test'
    await borrarSiExiste(correo)

    const { data } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: 'ClaveDePrueba123!',
      options: { data: { nombre: 'Atacante', telefono: '3009998877', rol_solicitado: 'super_admin' } },
    })

    const { data: perfil } = await clienteAdmin()
      .from('perfiles').select('rol').eq('id', data.user!.id).single()
    expect(perfil!.rol).toBe('comprador')
  })

  it('un rol_solicitado basura produce un comprador', async () => {
    const correo = 'basura@prueba.test'
    await borrarSiExiste(correo)

    const { data } = await clienteAnonimo().auth.signUp({
      email: correo,
      password: 'ClaveDePrueba123!',
      options: { data: { nombre: 'Basura', telefono: '3009998866', rol_solicitado: '; DROP TABLE perfiles;--' } },
    })

    const { data: perfil } = await clienteAdmin()
      .from('perfiles').select('rol').eq('id', data.user!.id).single()
    expect(perfil!.rol).toBe('comprador')
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:rls -- registro-rol`
Expected: FAIL — no se crea ninguna fila en `perfiles`, el `.single()` devuelve error.

- [ ] **Step 3: Escribir la migración del trigger**

`supabase/migrations/20260827000300_handle_new_user.sql`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rol public.rol_usuario;
BEGIN
  -- Lista blanca. 'super_admin' no esta aqui: cualquier otro valor cae en comprador.
  v_rol := CASE NEW.raw_user_meta_data->>'rol_solicitado'
             WHEN 'vendedor' THEN 'vendedor'::public.rol_usuario
             ELSE 'comprador'::public.rol_usuario
           END;

  INSERT INTO public.perfiles (id, rol, nombre, telefono)
  VALUES (
    NEW.id,
    v_rol,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre'), ''), 'Usuario'),
    NEW.raw_user_meta_data->>'telefono'
  );
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

- [ ] **Step 4: Aplicar y ejecutar las pruebas**

```bash
supabase db reset
npm run test:rls
```

Expected: PASS — las 4 pruebas nuevas más las 5 de la Task 2.

- [ ] **Step 5: Commit**

```bash
git add supabase tests
git commit -m "feat(db): trigger de creacion de perfil con lista blanca de rol"
```

---

## Task 4: Tabla `barrios` y datos de referencia de Barranquilla

Los barrios son **datos de referencia**, no datos de prueba: van en una migración porque producción también los necesita.

**Files:**
- Create: `supabase/migrations/20260827000400_barrios.sql`, `supabase/migrations/20260827000500_datos_barrios.sql`
- Create: `tests/rls/barrios.test.ts`

**Interfaces:**
- Consumes: `public.rol_usuario` (Task 2)
- Produces: `public.barrios(id, nombre, slug, ciudad, activo, creado_en)` — el SP1 construirá sus clusters SEO sobre `slug`

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/rls/barrios.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAnonimo, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const VENDEDOR = { correo: 'rls-vendedor-barrios@prueba.test', password: 'ClaveDePrueba123!' }

describe('RLS de barrios', () => {
  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...VENDEDOR, rol: 'vendedor' })
  })

  it('cualquiera lee los barrios sin autenticarse', async () => {
    const { data, error } = await clienteAnonimo().from('barrios').select('slug')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
  })

  it('incluye Villa Carolina y El Paraiso', async () => {
    const { data } = await clienteAnonimo().from('barrios').select('slug')
    const slugs = data!.map((b) => b.slug)
    expect(slugs).toContain('villa-carolina')
    expect(slugs).toContain('el-paraiso')
  })

  it('los slugs son limpios: minusculas, sin numeros ni guiones bajos', async () => {
    const { data } = await clienteAnonimo().from('barrios').select('slug')
    for (const b of data!) expect(b.slug).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })

  it('un vendedor NO puede crear barrios', async () => {
    const cliente = await clienteComo(VENDEDOR.correo, VENDEDOR.password)
    const { error } = await cliente.from('barrios')
      .insert({ nombre: 'Inventado', slug: 'inventado', ciudad: 'Barranquilla' })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:rls -- barrios`
Expected: FAIL — la relación `barrios` no existe.

- [ ] **Step 3: Escribir la migración de la tabla**

`supabase/migrations/20260827000400_barrios.sql`:

```sql
CREATE TABLE public.barrios (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    text NOT NULL,
  slug      text NOT NULL UNIQUE CHECK (slug ~ '^[a-z]+(-[a-z]+)*$'),
  ciudad    text NOT NULL DEFAULT 'Barranquilla',
  activo    boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.barrios ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.barrios TO anon, authenticated;

CREATE POLICY barrios_lectura_publica ON public.barrios
  FOR SELECT TO anon, authenticated
  USING (activo = true);
```

El `CHECK` sobre el slug hace cumplir en la base el requisito de URLs limpias del SP1:
sin números ni conectores raros.

- [ ] **Step 4: Escribir la migración de datos**

`supabase/migrations/20260827000500_datos_barrios.sql`:

```sql
INSERT INTO public.barrios (nombre, slug, ciudad) VALUES
  ('Villa Carolina',   'villa-carolina',   'Barranquilla'),
  ('El Paraiso',       'el-paraiso',       'Barranquilla'),
  ('Alto Prado',       'alto-prado',       'Barranquilla'),
  ('Riomar',           'riomar',           'Barranquilla'),
  ('El Prado',         'el-prado',         'Barranquilla'),
  ('Villa Santos',     'villa-santos',     'Barranquilla'),
  ('Ciudad Jardin',    'ciudad-jardin',    'Barranquilla'),
  ('Boston',           'boston',           'Barranquilla'),
  ('La Concepcion',    'la-concepcion',    'Barranquilla'),
  ('Miramar',          'miramar',          'Barranquilla')
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 5: Aplicar y ejecutar**

```bash
supabase db reset
npm run test:rls -- barrios
```

Expected: PASS — 4 pruebas.

- [ ] **Step 6: Commit**

```bash
git add supabase tests
git commit -m "feat(db): barrios con lectura publica y datos de Barranquilla"
```

---

## Task 5: Tabla `propiedades` con RLS por dueño y estado

**Files:**
- Create: `supabase/migrations/20260827000600_propiedades.sql`
- Create: `tests/rls/propiedades.test.ts`

**Interfaces:**
- Consumes: `public.perfiles`, `public.barrios`, los enums (Tasks 2 y 4)
- Produces: `public.propiedades` con columnas `id, vendedor_id, slug, titulo, descripcion, operacion, tipo_inmueble, precio, moneda, habitaciones, banos, area_m2, barrio_id, direccion, latitud, longitud, estado, destacada, destacada_hasta, creado_en, actualizado_en`

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/rls/propiedades.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAnonimo, clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const A = { correo: 'vendedor-a@prueba.test', password: 'ClaveDePrueba123!' }
const B = { correo: 'vendedor-b@prueba.test', password: 'ClaveDePrueba123!' }

let idA = ''
let idPublicada = ''
let idBorrador = ''

describe('RLS de propiedades', () => {
  beforeAll(async () => {
    idA = await crearUsuarioDePrueba({ ...A, rol: 'vendedor' })
    await crearUsuarioDePrueba({ ...B, rol: 'vendedor' })

    const admin = clienteAdmin()
    const { data: barrio } = await admin.from('barrios').select('id').eq('slug', 'villa-carolina').single()

    const base = {
      vendedor_id: idA, barrio_id: barrio!.id, operacion: 'venta',
      tipo_inmueble: 'apartamento', precio: 350000000, habitaciones: 3, banos: 2,
      area_m2: 78, direccion: 'Calle 1 #2-3', descripcion: 'Descripcion de prueba',
    }
    const { data: pub } = await admin.from('propiedades')
      .insert({ ...base, slug: 'apartamento-villa-carolina-prueba', titulo: 'Apartamento publicado', estado: 'publicada' })
      .select('id').single()
    idPublicada = pub!.id

    const { data: bor } = await admin.from('propiedades')
      .insert({ ...base, slug: 'apartamento-borrador-prueba', titulo: 'Apartamento borrador', estado: 'borrador' })
      .select('id').single()
    idBorrador = bor!.id
  })

  it('el anonimo ve la propiedad publicada', async () => {
    const { data } = await clienteAnonimo().from('propiedades').select('id').eq('id', idPublicada)
    expect(data).toHaveLength(1)
  })

  it('el anonimo NO ve la propiedad en borrador', async () => {
    const { data } = await clienteAnonimo().from('propiedades').select('id').eq('id', idBorrador)
    expect(data).toHaveLength(0)
  })

  it('el vendedor dueno ve su propio borrador', async () => {
    const cliente = await clienteComo(A.correo, A.password)
    const { data } = await cliente.from('propiedades').select('id').eq('id', idBorrador)
    expect(data).toHaveLength(1)
  })

  it('el vendedor B NO ve el borrador del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { data } = await cliente.from('propiedades').select('id').eq('id', idBorrador)
    expect(data).toHaveLength(0)
  })

  it('el vendedor B NO puede editar la propiedad del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { data } = await cliente.from('propiedades')
      .update({ titulo: 'Secuestrada' }).eq('id', idPublicada).select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('el vendedor B no puede publicar a nombre del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { error } = await cliente.from('propiedades').insert({
      vendedor_id: idA, slug: 'suplantada', titulo: 'Suplantada', descripcion: 'x',
      operacion: 'venta', tipo_inmueble: 'casa', precio: 1, estado: 'borrador',
    })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:rls -- propiedades`
Expected: FAIL — la relación `propiedades` no existe.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/20260827000600_propiedades.sql`:

```sql
CREATE TABLE public.propiedades (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id    uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z]+(-[a-z]+)*$'),
  titulo         text NOT NULL CHECK (length(titulo) BETWEEN 10 AND 120),
  descripcion    text NOT NULL,
  operacion      public.tipo_operacion NOT NULL,
  tipo_inmueble  public.tipo_inmueble NOT NULL,
  precio         numeric(14,2) NOT NULL CHECK (precio > 0),
  moneda         text NOT NULL DEFAULT 'COP',
  habitaciones   smallint CHECK (habitaciones >= 0),
  banos          smallint CHECK (banos >= 0),
  area_m2        numeric(8,2) CHECK (area_m2 > 0),
  barrio_id      uuid REFERENCES public.barrios(id),
  direccion      text,
  latitud        double precision,
  longitud       double precision,
  estado         public.estado_propiedad NOT NULL DEFAULT 'borrador',
  destacada      boolean NOT NULL DEFAULT false,
  destacada_hasta timestamptz,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX propiedades_publicadas_idx
  ON public.propiedades (barrio_id, operacion, precio)
  WHERE estado = 'publicada';

ALTER TABLE public.propiedades ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.propiedades TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.propiedades TO authenticated;

-- El publico solo ve lo publicado.
CREATE POLICY propiedades_lectura_publica ON public.propiedades
  FOR SELECT TO anon, authenticated
  USING (estado = 'publicada');

-- El vendedor ve todo lo suyo, en cualquier estado.
CREATE POLICY propiedades_lectura_dueno ON public.propiedades
  FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()));

CREATE POLICY propiedades_insercion_dueno ON public.propiedades
  FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = (SELECT auth.uid()));

CREATE POLICY propiedades_actualizacion_dueno ON public.propiedades
  FOR UPDATE TO authenticated
  USING (vendedor_id = (SELECT auth.uid()))
  WITH CHECK (vendedor_id = (SELECT auth.uid()));

CREATE POLICY propiedades_borrado_dueno ON public.propiedades
  FOR DELETE TO authenticated
  USING (vendedor_id = (SELECT auth.uid()));

-- El super admin modera: ve y ajusta cualquier propiedad en cualquier estado.
CREATE POLICY propiedades_lectura_super_admin ON public.propiedades
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

CREATE POLICY propiedades_actualizacion_super_admin ON public.propiedades
  FOR UPDATE TO authenticated
  USING (public.es_super_admin())
  WITH CHECK (public.es_super_admin());

CREATE TRIGGER propiedades_actualizar_marca
  BEFORE UPDATE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.marcar_actualizacion();
```

- [ ] **Step 4: Añadir la función compartida de marca de tiempo**

Al inicio de la misma migración, antes del `CREATE TABLE`:

```sql
CREATE OR REPLACE FUNCTION public.marcar_actualizacion() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;
```

- [ ] **Step 5: Aplicar y ejecutar**

```bash
supabase db reset
npm run test:rls -- propiedades
```

Expected: PASS — 6 pruebas.

- [ ] **Step 6: Commit**

```bash
git add supabase tests
git commit -m "feat(db): propiedades con RLS por dueno y estado publicado"
```

---

## Task 6: `imagenes_propiedad`, bucket de Storage y `alt_text` obligatorio

**Files:**
- Create: `supabase/migrations/20260827000700_imagenes_propiedad.sql`
- Create: `tests/rls/imagenes.test.ts`

**Interfaces:**
- Consumes: `public.propiedades` (Task 5)
- Produces: `public.imagenes_propiedad(id, propiedad_id, ruta_storage, alt_text, orden, creado_en)` y el bucket `propiedades` con sus políticas. La interfaz de carga es del SP3.

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/rls/imagenes.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAnonimo, clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const A = { correo: 'img-vendedor-a@prueba.test', password: 'ClaveDePrueba123!' }
const B = { correo: 'img-vendedor-b@prueba.test', password: 'ClaveDePrueba123!' }
let idPublicada = ''
let idBorrador = ''

describe('imagenes de propiedad', () => {
  beforeAll(async () => {
    const idA = await crearUsuarioDePrueba({ ...A, rol: 'vendedor' })
    await crearUsuarioDePrueba({ ...B, rol: 'vendedor' })
    const admin = clienteAdmin()
    const { data: barrio } = await admin.from('barrios').select('id').eq('slug', 'riomar').single()
    const base = {
      vendedor_id: idA, barrio_id: barrio!.id, operacion: 'arriendo',
      tipo_inmueble: 'casa', precio: 2500000, descripcion: 'x',
    }
    const { data: p } = await admin.from('propiedades')
      .insert({ ...base, slug: 'casa-riomar-imagenes', titulo: 'Casa con imagenes', estado: 'publicada' })
      .select('id').single()
    idPublicada = p!.id
    const { data: b } = await admin.from('propiedades')
      .insert({ ...base, slug: 'casa-riomar-borrador', titulo: 'Casa en borrador', estado: 'borrador' })
      .select('id').single()
    idBorrador = b!.id
  })

  it('rechaza una imagen sin alt_text', async () => {
    const { error } = await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/1.webp', orden: 1 })
    expect(error).not.toBeNull()
  })

  it('acepta una imagen con alt_text', async () => {
    const { error } = await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/2.webp', alt_text: 'Fachada de la casa en Riomar', orden: 1 })
    expect(error).toBeNull()
  })

  it('el anonimo ve las imagenes de una propiedad publicada', async () => {
    const { data } = await clienteAnonimo().from('imagenes_propiedad').select('id').eq('propiedad_id', idPublicada)
    expect(data!.length).toBeGreaterThan(0)
  })

  it('el anonimo NO ve las imagenes de un borrador', async () => {
    await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idBorrador, ruta_storage: 'x/3.webp', alt_text: 'Interior', orden: 1 })
    const { data } = await clienteAnonimo().from('imagenes_propiedad').select('id').eq('propiedad_id', idBorrador)
    expect(data).toHaveLength(0)
  })

  it('el vendedor B no puede anadir imagenes a la propiedad del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { error } = await cliente.from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/4.webp', alt_text: 'Intruso', orden: 9 })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:rls -- imagenes`
Expected: FAIL — la relación `imagenes_propiedad` no existe.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/20260827000700_imagenes_propiedad.sql`:

```sql
CREATE TABLE public.imagenes_propiedad (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  ruta_storage text NOT NULL,
  -- NOT NULL a proposito: el requisito de SEO "alt en todas las imagenes"
  -- deja de depender de que alguien se acuerde.
  alt_text     text NOT NULL CHECK (length(TRIM(alt_text)) >= 5),
  orden        smallint NOT NULL DEFAULT 0,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX imagenes_por_propiedad_idx ON public.imagenes_propiedad (propiedad_id, orden);

ALTER TABLE public.imagenes_propiedad ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.imagenes_propiedad TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.imagenes_propiedad TO authenticated;

-- Hereda la visibilidad de su propiedad.
CREATE POLICY imagenes_lectura_publica ON public.imagenes_propiedad
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.estado = 'publicada'
  ));

CREATE POLICY imagenes_lectura_dueno ON public.imagenes_propiedad
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ));

CREATE POLICY imagenes_escritura_dueno ON public.imagenes_propiedad
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ));

CREATE POLICY imagenes_actualizacion_dueno ON public.imagenes_propiedad
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ));

CREATE POLICY imagenes_borrado_dueno ON public.imagenes_propiedad
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propiedades p
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid())
  ));

-- Bucket de Storage. La interfaz de carga la construye el SP3;
-- aqui quedan el bucket y sus politicas.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('propiedades', 'propiedades', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY storage_propiedades_lectura ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'propiedades');

-- Cada vendedor escribe solo dentro de su propia carpeta: <uid>/<archivo>
CREATE POLICY storage_propiedades_escritura ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'propiedades'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY storage_propiedades_borrado ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'propiedades'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
```

El límite de 5 MB y la lista de MIME son la primera barrera. El SP3 debe además validar
**magic bytes** y reprocesar con `sharp`: el `Content-Type` lo controla el cliente.

- [ ] **Step 4: Aplicar y ejecutar**

```bash
supabase db reset
npm run test:rls -- imagenes
```

Expected: PASS — 5 pruebas.

- [ ] **Step 5: Commit**

```bash
git add supabase tests
git commit -m "feat(db): imagenes de propiedad con alt obligatorio y bucket por vendedor"
```

---

## Task 7: `registro_auditoria` restringido al super admin

**Files:**
- Create: `supabase/migrations/20260827000800_registro_auditoria.sql`
- Create: `tests/rls/auditoria.test.ts`

**Interfaces:**
- Consumes: `public.perfiles` y `public.es_super_admin()` (Task 2)
- Produces: `public.registro_auditoria(id, actor_id, accion, entidad, entidad_id, metadatos, ip, creado_en)`

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/rls/auditoria.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const COMPRADOR = { correo: 'aud-comprador@prueba.test', password: 'ClaveDePrueba123!' }
const ADMIN = { correo: 'aud-admin@prueba.test', password: 'ClaveDePrueba123!' }

describe('RLS de registro_auditoria', () => {
  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' })
    await crearUsuarioDePrueba({ ...ADMIN, rol: 'super_admin' })
    await clienteAdmin().from('registro_auditoria').insert({
      accion: 'prueba', entidad: 'sistema', metadatos: { detalle: 'evento de prueba' },
    })
  })

  it('el comprador NO lee el registro de auditoria', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { data } = await cliente.from('registro_auditoria').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('el comprador NO puede escribir en el registro', async () => {
    const cliente = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    const { error } = await cliente.from('registro_auditoria')
      .insert({ accion: 'falsificada', entidad: 'sistema' })
    expect(error).not.toBeNull()
  })

  it('el super admin SI lee el registro', async () => {
    const cliente = await clienteComo(ADMIN.correo, ADMIN.password)
    const { data } = await cliente.from('registro_auditoria').select('id')
    expect(data!.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:rls -- auditoria`
Expected: FAIL — la relación `registro_auditoria` no existe.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/20260827000800_registro_auditoria.sql`:

`public.es_super_admin()` ya existe desde la Task 2; aquí solo se consume.

```sql
CREATE TABLE public.registro_auditoria (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  accion     text NOT NULL,
  entidad    text NOT NULL,
  entidad_id uuid,
  metadatos  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         inet,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_reciente_idx ON public.registro_auditoria (creado_en DESC);

ALTER TABLE public.registro_auditoria ENABLE ROW LEVEL SECURITY;

-- Sin GRANT de INSERT: solo el servidor escribe, con service_role.
GRANT SELECT ON public.registro_auditoria TO authenticated;

CREATE POLICY auditoria_lectura_super_admin ON public.registro_auditoria
  FOR SELECT TO authenticated
  USING (public.es_super_admin());
```

- [ ] **Step 4: Aplicar y ejecutar**

```bash
supabase db reset
npm run test:rls -- auditoria
```

Expected: PASS — 3 pruebas.

- [ ] **Step 5: Commit**

```bash
git add supabase tests
git commit -m "feat(db): registro de auditoria restringido al super admin"
```

---

## Task 8: Rol dentro del JWT (custom access token hook)

Sin este hook, cada petición del middleware tendría que consultar `perfiles`. El costo
aceptado, ya documentado en el spec: el claim queda congelado hasta el refresco del token.

**Files:**
- Create: `supabase/migrations/20260827000900_access_token_hook.sql`
- Modify: `supabase/config.toml`
- Create: `tests/rls/claim-rol.test.ts`

**Interfaces:**
- Consumes: `public.perfiles` (Task 2)
- Produces: claim `app_metadata.rol` dentro del access token de todo usuario autenticado

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/rls/claim-rol.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { clienteComo, crearUsuarioDePrueba } from './ayudantes'

const VENDEDOR = { correo: 'claim-vendedor@prueba.test', password: 'ClaveDePrueba123!' }

function leerClaims(accessToken: string): Record<string, unknown> {
  const cuerpo = accessToken.split('.')[1]
  return JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
}

describe('rol dentro del access token', () => {
  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...VENDEDOR, rol: 'vendedor' })
  })

  it('el token incluye app_metadata.rol con el rol real', async () => {
    const cliente = await clienteComo(VENDEDOR.correo, VENDEDOR.password)
    const { data } = await cliente.auth.getSession()
    const claims = leerClaims(data.session!.access_token) as {
      app_metadata?: { rol?: string }
    }
    expect(claims.app_metadata?.rol).toBe('vendedor')
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:rls -- claim-rol`
Expected: FAIL — `app_metadata.rol` es `undefined`.

- [ ] **Step 3: Escribir la migración del hook**

`supabase/migrations/20260827000900_access_token_hook.sql`:

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_rol    text;
  v_claims jsonb;
BEGIN
  SELECT rol::text INTO v_rol
  FROM public.perfiles
  WHERE id = (event->>'user_id')::uuid;

  v_claims := event->'claims';

  IF v_claims->'app_metadata' IS NULL THEN
    v_claims := jsonb_set(v_claims, '{app_metadata}', '{}'::jsonb);
  END IF;

  v_claims := jsonb_set(
    v_claims, '{app_metadata,rol}',
    to_jsonb(COALESCE(v_rol, 'comprador'))
  );

  RETURN jsonb_set(event, '{claims}', v_claims);
END $$;

-- Solo el servicio de autenticacion puede ejecutar el hook.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- El hook necesita leer perfiles bajo su propio rol.
GRANT SELECT ON public.perfiles TO supabase_auth_admin;

CREATE POLICY perfiles_lectura_auth_admin ON public.perfiles
  FOR SELECT TO supabase_auth_admin
  USING (true);
```

- [ ] **Step 4: Registrar el hook en `supabase/config.toml`**

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

- [ ] **Step 5: Reiniciar Supabase y ejecutar**

```bash
supabase stop
supabase start
supabase db reset
npm run test:rls -- claim-rol
```

Expected: PASS — 1 prueba. El reinicio es necesario: `config.toml` no se recarga con `db reset`.

- [ ] **Step 6: Commit**

```bash
git add supabase tests
git commit -m "feat(auth): rol inyectado en el access token via hook"
```

---

## Task 9: Clientes de Supabase con la llave de servicio aislada

**Files:**
- Create: `src/lib/supabase/cliente-navegador.ts`, `src/lib/supabase/cliente-servidor.ts`, `src/lib/supabase/cliente-admin.ts`
- Create: `tests/unit/clientes-supabase.test.ts`

**Interfaces:**
- Consumes: variables de entorno de la Task 1
- Produces: `crearClienteNavegador()`, `crearClienteServidor()`, `crearClienteAdmin()`

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/unit/clientes-supabase.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('aislamiento de la llave de servicio', () => {
  it('cliente-admin declara server-only en la primera linea', () => {
    const contenido = readFileSync('src/lib/supabase/cliente-admin.ts', 'utf8')
    expect(contenido.trimStart().startsWith("import 'server-only'")).toBe(true)
  })

  it('el cliente de navegador nunca menciona la llave de servicio', () => {
    const contenido = readFileSync('src/lib/supabase/cliente-navegador.ts', 'utf8')
    expect(contenido).not.toContain('SERVICE_ROLE')
  })

  it('el cliente de servidor nunca menciona la llave de servicio', () => {
    const contenido = readFileSync('src/lib/supabase/cliente-servidor.ts', 'utf8')
    expect(contenido).not.toContain('SERVICE_ROLE')
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:unit -- clientes-supabase`
Expected: FAIL — los archivos no existen.

- [ ] **Step 3: Escribir el cliente de navegador**

`src/lib/supabase/cliente-navegador.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 4: Escribir el cliente de servidor**

`src/lib/supabase/cliente-servidor.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function crearClienteServidor() {
  const almacen = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (cookiesAEstablecer) => {
          try {
            for (const { name, value, options } of cookiesAEstablecer) {
              almacen.set(name, value, options)
            }
          } catch {
            // Llamado desde un Server Component: el middleware ya refresco la sesion.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 5: Escribir el cliente administrativo**

`src/lib/supabase/cliente-admin.ts`:

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * SALTA RLS POR COMPLETO. Usar solo para operaciones del sistema:
 * escribir auditoria y consultar el limite de intentos de login.
 * Nunca para atender datos que el usuario pidio.
 */
export function crearClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

- [ ] **Step 6: Ejecutar y confirmar que pasa**

Run: `npm run test:unit -- clientes-supabase`
Expected: PASS — 3 pruebas.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(supabase): clientes con la llave de servicio aislada del navegador"
```

---

## Task 10: Validación con Zod y mapeo de errores que no filtra el esquema

**Files:**
- Create: `src/lib/validacion/esquemas.ts`, `src/lib/errores/mapear.ts`
- Create: `tests/unit/validacion.test.ts`, `tests/unit/errores.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `esquemaRegistro`, `esquemaLogin`, tipos `DatosRegistro`/`DatosLogin`; `mapearError(error)` que retorna `{ mensaje: string; idCorrelacion: string }`; constantes `MENSAJE_GENERICO` y `MENSAJE_CREDENCIALES`

- [ ] **Step 1: Escribir las pruebas (fallan)**

`tests/unit/validacion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { esquemaRegistro, esquemaLogin } from '@/lib/validacion/esquemas'

const valido = {
  nombre: 'Ana Perez',
  correo: 'Ana@Ejemplo.COM',
  telefono: '3001234567',
  password: 'ClaveLargaSegura1',
  rol: 'comprador' as const,
}

describe('esquemaRegistro', () => {
  it('acepta datos validos y normaliza el correo a minusculas', () => {
    const r = esquemaRegistro.parse(valido)
    expect(r.correo).toBe('ana@ejemplo.com')
  })

  it('rechaza una contrasena de menos de 12 caracteres', () => {
    expect(esquemaRegistro.safeParse({ ...valido, password: 'Corta123' }).success).toBe(false)
  })

  it('rechaza el rol super_admin en la capa de validacion', () => {
    expect(esquemaRegistro.safeParse({ ...valido, rol: 'super_admin' }).success).toBe(false)
  })

  it('rechaza un celular que no es colombiano de 10 digitos', () => {
    expect(esquemaRegistro.safeParse({ ...valido, telefono: '12345' }).success).toBe(false)
  })

  it('rechaza un correo mal formado', () => {
    expect(esquemaRegistro.safeParse({ ...valido, correo: 'no-es-correo' }).success).toBe(false)
  })
})

describe('esquemaLogin', () => {
  it('acepta correo y contrasena', () => {
    expect(esquemaLogin.safeParse({ correo: 'a@b.com', password: 'x' }).success).toBe(true)
  })
})
```

`tests/unit/errores.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapearError, MENSAJE_GENERICO, MENSAJE_CREDENCIALES } from '@/lib/errores/mapear'

describe('mapearError', () => {
  it('nunca revela nombres de tablas ni restricciones de Postgres', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "perfiles_pkey"',
      details: 'Key (id)=(abc) already exists.',
    }
    const r = mapearError(error)
    expect(r.mensaje).toBe(MENSAJE_GENERICO)
    expect(r.mensaje).not.toContain('perfiles')
    expect(r.mensaje).not.toContain('constraint')
  })

  it('usa el mismo mensaje para credenciales invalidas', () => {
    const r = mapearError({ code: 'invalid_credentials', message: 'Invalid login credentials' })
    expect(r.mensaje).toBe(MENSAJE_CREDENCIALES)
  })

  it('usa el mismo mensaje para un usuario inexistente', () => {
    const r = mapearError({ code: 'user_not_found', message: 'User not found' })
    expect(r.mensaje).toBe(MENSAJE_CREDENCIALES)
  })

  it('genera un id de correlacion distinto en cada llamada', () => {
    const a = mapearError(new Error('x'))
    const b = mapearError(new Error('x'))
    expect(a.idCorrelacion).not.toBe(b.idCorrelacion)
    expect(a.idCorrelacion).toMatch(/^[0-9a-f-]{36}$/)
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que fallan**

Run: `npm run test:unit`
Expected: FAIL — los módulos no existen.

- [ ] **Step 3: Escribir los esquemas**

`src/lib/validacion/esquemas.ts`:

```ts
import { z } from 'zod'

export const esquemaRegistro = z.object({
  nombre: z.string().trim().min(2, 'Escribe tu nombre').max(80),
  correo: z.string().trim().toLowerCase().email('Correo invalido'),
  telefono: z.string().trim().regex(/^3\d{9}$/, 'Celular colombiano de 10 digitos'),
  password: z.string().min(12, 'Minimo 12 caracteres').max(72),
  // 'super_admin' no esta aqui: primera barrera antes del trigger de la base.
  rol: z.enum(['comprador', 'vendedor']),
})

export const esquemaLogin = z.object({
  correo: z.string().trim().toLowerCase().email('Correo invalido'),
  password: z.string().min(1, 'Escribe tu contrasena'),
})

export type DatosRegistro = z.infer<typeof esquemaRegistro>
export type DatosLogin = z.infer<typeof esquemaLogin>
```

`max(72)` en la contraseña: bcrypt trunca en 72 bytes, así que aceptar más da una falsa
sensación de fortaleza.

- [ ] **Step 4: Escribir el mapeo de errores**

`src/lib/errores/mapear.ts`:

```ts
import { randomUUID } from 'node:crypto'

export const MENSAJE_GENERICO =
  'No pudimos completar la operacion. Intenta de nuevo en un momento.'

export const MENSAJE_CREDENCIALES = 'Correo o contrasena incorrectos.'

const CODIGOS_DE_CREDENCIALES = new Set([
  'invalid_credentials',
  'user_not_found',
  'invalid_grant',
])

export interface ErrorPresentable {
  mensaje: string
  idCorrelacion: string
}

/**
 * Traduce cualquier error interno a un mensaje seguro.
 * El detalle completo se registra aparte, en registro_auditoria.
 *
 * Regla: el mensaje devuelto NUNCA se construye a partir del error original.
 */
export function mapearError(error: unknown): ErrorPresentable {
  const idCorrelacion = randomUUID()
  const codigo =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  if (CODIGOS_DE_CREDENCIALES.has(codigo)) {
    return { mensaje: MENSAJE_CREDENCIALES, idCorrelacion }
  }

  return { mensaje: MENSAJE_GENERICO, idCorrelacion }
}
```

- [ ] **Step 5: Ejecutar y confirmar que pasan**

Run: `npm run test:unit`
Expected: PASS — 10 pruebas nuevas.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(lib): validacion con Zod y mapeo de errores sin fugas de esquema"
```

---

## Task 11: Límite de intentos de login

**Files:**
- Create: `supabase/migrations/20260827001000_intentos_login.sql`, `src/lib/auth/limite-intentos.ts`
- Create: `tests/rls/limite-intentos.test.ts`

**Interfaces:**
- Consumes: `crearClienteAdmin()` (Task 9)
- Produces: `loginBloqueado(correo, ip): Promise<boolean>` y `registrarIntentoLogin(correo, ip, exitoso): Promise<void>`; RPC `public.login_bloqueado` y `public.registrar_intento_login`

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/rls/limite-intentos.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const CORREO = 'limite@prueba.test'
const IP = '203.0.113.5'

describe('limite de intentos de login', () => {
  beforeEach(async () => {
    await clienteAdmin().from('intentos_login').delete().eq('correo', CORREO)
  })

  it('no bloquea sin intentos previos', async () => {
    const { data } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(data).toBe(false)
  })

  it('no bloquea con 4 fallos', async () => {
    for (let i = 0; i < 4; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    const { data } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(data).toBe(false)
  })

  it('bloquea al quinto fallo', async () => {
    for (let i = 0; i < 5; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    const { data } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(data).toBe(true)
  })

  it('no bloquea la misma cuenta desde otra IP', async () => {
    for (let i = 0; i < 5; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    const { data } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: '198.51.100.9' })
    expect(data).toBe(false)
  })

  // Sin esta prueba, una funcion que filtrara SOLO por ip pasaria todo lo anterior:
  // las demas pruebas varian la IP pero nunca el correo. La combinacion es el diseno.
  it('no bloquea otra cuenta desde la misma IP', async () => {
    const otroCorreo = 'otro-usuario@prueba.test'
    await clienteAdmin().from('intentos_login').delete().eq('correo', otroCorreo)

    for (let i = 0; i < 5; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }

    const { data: bloqueadoOriginal } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(bloqueadoOriginal).toBe(true)

    const { data: bloqueadoOtro } = await clienteAdmin()
      .rpc('login_bloqueado', { p_correo: otroCorreo, p_ip: IP })
    expect(bloqueadoOtro).toBe(false)
  })

  // La rama IF p_exitoso THEN DELETE de registrar_intento_login no tenia cobertura:
  // todas las demas pruebas registran fallos. Un borrado de esa rama pasaria inadvertido.
  it('un login exitoso limpia los fallos previos de esa combinacion', async () => {
    for (let i = 0; i < 5; i++) {
      await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: false })
    }
    const { data: antes } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(antes).toBe(true)

    await clienteAdmin().rpc('registrar_intento_login', { p_correo: CORREO, p_ip: IP, p_exitoso: true })

    const { data: despues } = await clienteAdmin().rpc('login_bloqueado', { p_correo: CORREO, p_ip: IP })
    expect(despues).toBe(false)
  })

  it('un usuario autenticado no puede leer la tabla de intentos', async () => {
    const cuenta = { correo: 'curioso@prueba.test', password: 'ClaveDePrueba123!' }
    await crearUsuarioDePrueba({ ...cuenta, rol: 'comprador' })
    const cliente = await clienteComo(cuenta.correo, cuenta.password)
    const { data } = await cliente.from('intentos_login').select('id')
    expect(data ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:rls -- limite-intentos`
Expected: FAIL — la función `login_bloqueado` no existe.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/20260827001000_intentos_login.sql`:

```sql
CREATE TABLE public.intentos_login (
  id        bigserial PRIMARY KEY,
  correo    text NOT NULL,
  ip        inet NOT NULL,
  exitoso   boolean NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX intentos_login_ventana_idx
  ON public.intentos_login (correo, ip, creado_en DESC);

ALTER TABLE public.intentos_login ENABLE ROW LEVEL SECURITY;
-- Sin politicas y sin GRANT: ningun rol de aplicacion accede.

-- Se limita por correo + IP combinados: solo por IP se castiga a usuarios
-- legitimos detras de un NAT compartido; solo por correo queda abierto el
-- barrido distribuido de cuentas.
CREATE OR REPLACE FUNCTION public.login_bloqueado(p_correo text, p_ip inet)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*) >= 5
  FROM public.intentos_login
  WHERE correo = lower(p_correo)
    AND ip = p_ip
    AND exitoso = false
    AND creado_en > now() - interval '15 minutes';
$$;

CREATE OR REPLACE FUNCTION public.registrar_intento_login(
  p_correo text, p_ip inet, p_exitoso boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.intentos_login (correo, ip, exitoso)
  VALUES (lower(p_correo), p_ip, p_exitoso);

  -- Un login exitoso limpia la ventana de esa combinacion.
  IF p_exitoso THEN
    DELETE FROM public.intentos_login
    WHERE correo = lower(p_correo) AND ip = p_ip AND exitoso = false;
  END IF;

  -- Purga de registros viejos para que la tabla no crezca sin limite.
  DELETE FROM public.intentos_login WHERE creado_en < now() - interval '24 hours';
END $$;

REVOKE EXECUTE ON FUNCTION public.login_bloqueado FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_intento_login FROM anon, authenticated;
```

- [ ] **Step 4: Escribir la envoltura de TypeScript**

`src/lib/auth/limite-intentos.ts`:

```ts
import 'server-only'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'

export async function loginBloqueado(correo: string, ip: string): Promise<boolean> {
  const { data, error } = await crearClienteAdmin()
    .rpc('login_bloqueado', { p_correo: correo, p_ip: ip })
  // Ante un fallo de infraestructura se falla cerrado: bloquear es mas seguro
  // que dejar pasar intentos ilimitados.
  if (error) return true
  return data === true
}

export async function registrarIntentoLogin(
  correo: string, ip: string, exitoso: boolean,
): Promise<void> {
  await crearClienteAdmin()
    .rpc('registrar_intento_login', { p_correo: correo, p_ip: ip, p_exitoso: exitoso })
}
```

- [ ] **Step 5: Aplicar y ejecutar**

```bash
supabase db reset
npm run test:rls -- limite-intentos
```

Expected: PASS — 5 pruebas.

- [ ] **Step 6: Commit**

```bash
git add supabase src tests
git commit -m "feat(auth): limite de intentos de login por correo e IP"
```

---

## Task 12: Cabeceras de seguridad y CSP con nonce

**Files:**
- Create: `src/lib/seguridad/cabeceras.ts`
- Create: `tests/unit/cabeceras.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `construirCabeceras(nonce: string): Record<string, string>` y `generarNonce(): string`, consumidos por el middleware de la Task 16

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/unit/cabeceras.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { construirCabeceras, generarNonce } from '@/lib/seguridad/cabeceras'

describe('cabeceras de seguridad', () => {
  const cabeceras = construirCabeceras('abc123')

  it('impide que el sitio se embeba en un iframe', () => {
    expect(cabeceras['X-Frame-Options']).toBe('DENY')
  })

  it('desactiva el olfateo de tipo MIME', () => {
    expect(cabeceras['X-Content-Type-Options']).toBe('nosniff')
  })

  it('fuerza HTTPS por un ano con subdominios', () => {
    expect(cabeceras['Strict-Transport-Security']).toContain('max-age=31536000')
    expect(cabeceras['Strict-Transport-Security']).toContain('includeSubDomains')
  })

  it('restringe el referente entre origenes', () => {
    expect(cabeceras['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it('incluye el nonce en la directiva de scripts', () => {
    expect(cabeceras['Content-Security-Policy']).toContain("'nonce-abc123'")
  })

  it('la CSP no permite unsafe-inline en scripts', () => {
    const script = cabeceras['Content-Security-Policy']
      .split(';').find((d) => d.trim().startsWith('script-src'))!
    expect(script).not.toContain('unsafe-inline')
  })

  it('la CSP bloquea la incrustacion por frame-ancestors', () => {
    expect(cabeceras['Content-Security-Policy']).toContain("frame-ancestors 'none'")
  })

  it('genera nonces distintos en cada llamada', () => {
    expect(generarNonce()).not.toBe(generarNonce())
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:unit -- cabeceras`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir el constructor de cabeceras**

`src/lib/seguridad/cabeceras.ts`:

```ts
/**
 * GA4 se integra en el SP1. Su dominio ya esta contemplado aqui para que
 * anadir la etiqueta no obligue a reabrir la CSP con prisa.
 */
const ORIGENES_SCRIPT = ['https://www.googletagmanager.com']
const ORIGENES_CONEXION = [
  'https://*.supabase.co',
  'https://www.google-analytics.com',
  'https://challenges.cloudflare.com',
]

// Sin Buffer: este modulo lo importa el middleware, que corre en el runtime
// Edge, donde Buffer no existe. crypto.getRandomValues y btoa si estan.
export function generarNonce(): string {
  const aleatorio = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...aleatorio))
}

export function construirCabeceras(nonce: string): Record<string, string> {
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${ORIGENES_SCRIPT.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://*.supabase.co`,
    `font-src 'self'`,
    `connect-src 'self' ${ORIGENES_CONEXION.join(' ')}`,
    `frame-src https://challenges.cloudflare.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')

  return {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
  }
}
```

`style-src` conserva `unsafe-inline` porque Tailwind y Next inyectan estilos en línea; los
estilos no ejecutan código, así que el riesgo es de otra categoría que el de `script-src`.

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `npm run test:unit -- cabeceras`
Expected: PASS — 8 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(seguridad): cabeceras HTTP y CSP con nonce por peticion"
```

---

## Task 13: Lectura del rol y decisión de acceso por grupo de rutas

**Files:**
- Create: `src/lib/auth/roles.ts`
- Create: `tests/unit/roles.test.ts`

**Interfaces:**
- Consumes: el claim `app_metadata.rol` de la Task 8
- Produces: `type Rol = 'comprador' | 'vendedor' | 'super_admin'`; `rolDesdeToken(accessToken): Rol`; `rutaPermitida(ruta, rol): boolean`; `rutaDePanel(rol): string`

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/unit/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rolDesdeToken, rutaPermitida, rutaDePanel } from '@/lib/auth/roles'

function tokenFalso(claims: object): string {
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${parte({ alg: 'HS256' })}.${parte(claims)}.firma`
}

describe('rolDesdeToken', () => {
  it('lee el rol del claim app_metadata', () => {
    expect(rolDesdeToken(tokenFalso({ app_metadata: { rol: 'vendedor' } }))).toBe('vendedor')
  })

  it('cae en comprador si el claim no existe', () => {
    expect(rolDesdeToken(tokenFalso({}))).toBe('comprador')
  })

  it('cae en comprador ante un rol desconocido', () => {
    expect(rolDesdeToken(tokenFalso({ app_metadata: { rol: 'dios' } }))).toBe('comprador')
  })

  it('cae en comprador ante un token corrupto', () => {
    expect(rolDesdeToken('no-es-un-token')).toBe('comprador')
  })

  // Esta prueba es la razon de ser del paso TextDecoder. Llama a
  // decodificarBase64Url DIRECTAMENTE, y por eso hay que exportarla: a traves de
  // rolDesdeToken el fallo es inobservable, porque esa funcion solo devuelve el
  // rol y todos los roles son ASCII, donde TextDecoder y String.fromCharCode
  // coinciden. Sustituir TextDecoder por String.fromCharCode convierte 'José' en
  // 'JosÃ©', y esta prueba lo detecta.
  it('decodificarBase64Url maneja tildes y ñ sin corromperlos', () => {
    const carga = JSON.stringify({ nombre: 'José Muñoz Peñaranda' })
    // Buffer aqui es codigo de prueba corriendo en Node: legitimo.
    const codificado = Buffer.from(carga, 'utf8').toString('base64url')

    const decodificado = JSON.parse(decodificarBase64Url(codificado)) as {
      nombre: string
    }
    expect(decodificado.nombre).toBe('José Muñoz Peñaranda')
  })

  it('NO protege rutas que solo comparten prefijo de letras', () => {
    expect(rutaPermitida('/panelx', 'comprador')).toBe(true)
    expect(rutaPermitida('/panel-publico', 'comprador')).toBe(true)
    expect(rutaPermitida('/paneles-publicos', 'comprador')).toBe(true)
  })
})

describe('rutaPermitida', () => {
  it('el vendedor entra a su panel', () => {
    expect(rutaPermitida('/panel', 'vendedor')).toBe(true)
  })

  it('el comprador NO entra al panel del vendedor', () => {
    expect(rutaPermitida('/panel', 'comprador')).toBe(false)
  })

  it('el vendedor NO entra al control del super admin', () => {
    expect(rutaPermitida('/control', 'vendedor')).toBe(false)
  })

  it('el super admin entra al control', () => {
    expect(rutaPermitida('/control', 'super_admin')).toBe(true)
  })

  it('el comprador entra a mi-cuenta', () => {
    expect(rutaPermitida('/mi-cuenta', 'comprador')).toBe(true)
  })

  it('las rutas publicas quedan abiertas para cualquier rol', () => {
    expect(rutaPermitida('/', 'comprador')).toBe(true)
    expect(rutaPermitida('/propiedades/casa-en-riomar', 'vendedor')).toBe(true)
  })

  it('cubre las subrutas del panel', () => {
    expect(rutaPermitida('/panel/publicaciones/nueva', 'comprador')).toBe(false)
    expect(rutaPermitida('/panel/publicaciones/nueva', 'vendedor')).toBe(true)
  })
})

describe('rutaDePanel', () => {
  it('lleva a cada rol a su propio inicio', () => {
    expect(rutaDePanel('comprador')).toBe('/mi-cuenta')
    expect(rutaDePanel('vendedor')).toBe('/panel')
    expect(rutaDePanel('super_admin')).toBe('/control')
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:unit -- roles`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir el módulo de roles**

`src/lib/auth/roles.ts`:

```ts
export type Rol = 'comprador' | 'vendedor' | 'super_admin'

const ROLES_VALIDOS: readonly Rol[] = ['comprador', 'vendedor', 'super_admin']

/** Prefijos protegidos y el rol que los habilita. */
const RUTAS_PROTEGIDAS: ReadonlyArray<{ prefijo: string; rol: Rol }> = [
  { prefijo: '/mi-cuenta', rol: 'comprador' },
  { prefijo: '/panel', rol: 'vendedor' },
  { prefijo: '/control', rol: 'super_admin' },
]

/**
 * Lee el rol del access token sin verificar la firma: Supabase ya la valido
 * al emitirlo, y RLS vuelve a comprobar el rol del lado de la base de datos.
 * Ante cualquier duda cae en el rol de menos privilegio.
 */
/**
 * Decodifica base64url sin Buffer: este modulo lo importa el middleware, que
 * corre en el runtime Edge. atob y TextDecoder si estan disponibles alli.
 * TextDecoder es necesario porque un nombre con tilde en los claims saldria
 * corrupto si se leyera el resultado de atob como texto directamente.
 */
export function decodificarBase64Url(valor: string): string {
  const base64 = valor.replace(/-/g, '+').replace(/_/g, '/')
  const relleno = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binario = atob(relleno)
  const bytes = Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function rolDesdeToken(accessToken: string): Rol {
  try {
    const cuerpo = accessToken.split('.')[1]
    if (!cuerpo) return 'comprador'
    const claims = JSON.parse(decodificarBase64Url(cuerpo)) as {
      app_metadata?: { rol?: string }
    }
    const rol = claims.app_metadata?.rol
    return ROLES_VALIDOS.includes(rol as Rol) ? (rol as Rol) : 'comprador'
  } catch {
    return 'comprador'
  }
}

export function rutaPermitida(ruta: string, rol: Rol): boolean {
  const protegida = RUTAS_PROTEGIDAS.find(
    (r) => ruta === r.prefijo || ruta.startsWith(`${r.prefijo}/`),
  )
  if (!protegida) return true
  if (rol === 'super_admin') return true
  return protegida.rol === rol
}

export function rutaDePanel(rol: Rol): string {
  return RUTAS_PROTEGIDAS.find((r) => r.rol === rol)!.prefijo
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `npm run test:unit -- roles`
Expected: PASS — 12 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(auth): lectura de rol desde el token y guardas por ruta"
```

---

## Task 14: Registro con verificación por correo

**Files:**
- Create: `src/app/(auth)/registro/acciones.ts`, `src/app/(auth)/registro/page.tsx`, `src/app/(auth)/verificar-correo/page.tsx`, `src/app/confirmar/route.ts`
- Create: `tests/unit/accion-registro.test.ts`

**Interfaces:**
- Consumes: `esquemaRegistro` (Task 10), `crearClienteServidor()` (Task 9), `mapearError` (Task 10)
- Produces: server action `registrarUsuario(_estado, formData): Promise<EstadoFormulario>`; tipo `EstadoFormulario = { error?: string; exito?: boolean }`

- [ ] **Step 1: Escribir la prueba de la acción (falla)**

`tests/unit/accion-registro.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const signUp = vi.fn()
vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { signUp } }),
}))

const { registrarUsuario } = await import('@/app/(auth)/registro/acciones')

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return fd
}

const validos = {
  nombre: 'Ana Perez',
  correo: 'ana@ejemplo.com',
  telefono: '3001234567',
  password: 'ClaveLargaSegura1',
  rol: 'comprador',
}

describe('registrarUsuario', () => {
  beforeEach(() => {
    signUp.mockReset()
    signUp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  })

  it('envia el rol solicitado dentro de los metadatos', async () => {
    await registrarUsuario({}, formulario({ ...validos, rol: 'vendedor' }))
    expect(signUp.mock.calls[0][0].options.data.rol_solicitado).toBe('vendedor')
  })

  it('rechaza el rol super_admin sin llamar a Supabase', async () => {
    const r = await registrarUsuario({}, formulario({ ...validos, rol: 'super_admin' }))
    expect(signUp).not.toHaveBeenCalled()
    expect(r.error).toBeTruthy()
  })

  it('rechaza una contrasena corta sin llamar a Supabase', async () => {
    const r = await registrarUsuario({}, formulario({ ...validos, password: 'corta' }))
    expect(signUp).not.toHaveBeenCalled()
    expect(r.error).toBeTruthy()
  })

  it('no revela si el correo ya estaba registrado', async () => {
    signUp.mockResolvedValue({ data: { user: null }, error: { code: 'user_already_exists' } })
    const r = await registrarUsuario({}, formulario(validos))
    expect(r.error ?? '').not.toContain('registrado')
    expect(r.error ?? '').not.toContain('existe')
  })

  it('devuelve exito cuando el registro funciona', async () => {
    const r = await registrarUsuario({}, formulario(validos))
    expect(r.exito).toBe(true)
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:unit -- accion-registro`
Expected: FAIL — el módulo de acciones no existe.

- [ ] **Step 3: Escribir la server action**

`src/app/(auth)/registro/acciones.ts`:

```ts
'use server'

import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaRegistro } from '@/lib/validacion/esquemas'
import { mapearError } from '@/lib/errores/mapear'

export interface EstadoFormulario {
  error?: string
  exito?: boolean
}

export async function registrarUsuario(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // Se valida en el servidor aunque el cliente ya haya validado:
  // el cliente es del atacante.
  const analisis = esquemaRegistro.safeParse({
    nombre: formData.get('nombre'),
    correo: formData.get('correo'),
    telefono: formData.get('telefono'),
    password: formData.get('password'),
    rol: formData.get('rol'),
  })

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Revisa los datos del formulario.' }
  }

  const { nombre, correo, telefono, password, rol } = analisis.data
  const supabase = await crearClienteServidor()

  const { error } = await supabase.auth.signUp({
    email: correo,
    password,
    options: {
      // El trigger handle_new_user traduce esto contra una lista blanca.
      data: { nombre, telefono, rol_solicitado: rol },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3000'}/confirmar`,
    },
  })

  if (error) {
    // Nunca se distingue "correo ya registrado": eso convertiria el
    // formulario en un verificador de que cuentas existen.
    return { error: mapearError(error).mensaje }
  }

  return { exito: true }
}
```

- [ ] **Step 4: Escribir la página de registro**

`src/app/(auth)/registro/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { registrarUsuario, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export default function PaginaRegistro() {
  const [estado, accion, pendiente] = useActionState(registrarUsuario, INICIAL)

  if (estado.exito) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-semibold">Revisa tu correo</h1>
        <p className="mt-4">
          Te enviamos un enlace de verificacion. Tu cuenta se activa cuando lo abras.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>
      <form action={accion} className="mt-6 space-y-4">
        <input name="nombre" placeholder="Nombre completo" required className="w-full border p-2" />
        <input name="correo" type="email" placeholder="Correo" required className="w-full border p-2" />
        <input name="telefono" placeholder="Celular (10 digitos)" required className="w-full border p-2" />
        <input name="password" type="password" placeholder="Contrasena (minimo 12)" required minLength={12} className="w-full border p-2" />
        <fieldset className="space-y-2">
          <legend>Quiero</legend>
          <label className="block"><input type="radio" name="rol" value="comprador" defaultChecked /> Buscar propiedad</label>
          <label className="block"><input type="radio" name="rol" value="vendedor" /> Publicar propiedades</label>
        </fieldset>
        {estado.error && <p role="alert" className="text-red-600">{estado.error}</p>}
        <button type="submit" disabled={pendiente} className="w-full bg-black p-2 text-white">
          {pendiente ? 'Creando...' : 'Crear cuenta'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4b: Configurar la plantilla del correo de confirmación**

Sin este paso **ningún registro puede verificarse nunca**. La plantilla por defecto de
Supabase usa `{{ .ConfirmationURL }}`, que genera un enlace a
`/auth/v1/verify?token=...&type=signup&redirect_to=...`: Supabase verifica del lado del
servidor y luego redirige, **sin pasar `token_hash` ni `type=email`**. El manejador del
paso siguiente espera justo esos dos parámetros, así que entraría siempre por la guarda y
mandaría al usuario a `/login?verificacion=fallida`.

Añadir a `supabase/config.toml`, dentro de la sección `[auth.email]`:

```toml
[auth.email.template.confirmation]
subject = "Confirma tu cuenta en el portal"
content_path = "./supabase/templates/confirmacion.html"
```

Y crear `supabase/templates/confirmacion.html`:

```html
<h2>Confirma tu cuenta</h2>
<p>Para activar tu cuenta en el portal, abre este enlace:</p>
<p>
  <a href="{{ .SiteURL }}/confirmar?token_hash={{ .TokenHash }}&type=email">
    Confirmar mi correo
  </a>
</p>
<p>Si no creaste esta cuenta, ignora este mensaje.</p>
```

`{{ .TokenHash }}` es lo que `verifyOtp` consume. Tras editar `config.toml` hay que
reiniciar Supabase (`npx supabase stop && npx supabase start`), porque ese archivo solo se
lee al arrancar el contenedor.

- [ ] **Step 5: Escribir el manejador de confirmación**

`src/app/confirmar/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { rolDesdeToken, rutaDePanel } from '@/lib/auth/roles'

export async function GET(peticion: NextRequest) {
  const { searchParams, origin } = new URL(peticion.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (!token_hash || type !== 'email') {
    return NextResponse.redirect(`${origin}/login?verificacion=fallida`)
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.verifyOtp({ type: 'email', token_hash })

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?verificacion=fallida`)
  }

  const rol = rolDesdeToken(data.session.access_token)
  return NextResponse.redirect(`${origin}${rutaDePanel(rol)}`)
}
```

- [ ] **Step 6: Escribir la página de espera de verificación**

`src/app/(auth)/verificar-correo/page.tsx`:

```tsx
export default function PaginaVerificarCorreo() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Verifica tu correo</h1>
      <p className="mt-4">
        Tu cuenta todavia no esta activa. Abre el enlace que te enviamos para continuar.
      </p>
    </main>
  )
}
```

- [ ] **Step 7: Ejecutar y confirmar que pasa**

Run: `npm run test:unit -- accion-registro`
Expected: PASS — 5 pruebas.

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "feat(auth): registro con verificacion por correo y rol validado en servidor"
```

---

## Task 15: Login con límite de intentos aplicado

**Files:**
- Create: `src/app/(auth)/login/acciones.ts`, `src/app/(auth)/login/page.tsx`
- Create: `tests/unit/accion-login.test.ts`

**Interfaces:**
- Consumes: `esquemaLogin`, `mapearError`, `MENSAJE_CREDENCIALES` (Task 10); `loginBloqueado`, `registrarIntentoLogin` (Task 11); `rolDesdeToken`, `rutaDePanel` (Task 13)
- Produces: server action `iniciarSesion(_estado, formData): Promise<EstadoFormulario>`

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/unit/accion-login.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const signInWithPassword = vi.fn()
const loginBloqueado = vi.fn()
const registrarIntentoLogin = vi.fn()
const redirect = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { signInWithPassword } }),
}))
vi.mock('@/lib/auth/limite-intentos', () => ({ loginBloqueado, registrarIntentoLogin }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}))
vi.mock('next/navigation', () => ({ redirect }))

const { iniciarSesion } = await import('@/app/(auth)/login/acciones')
const { MENSAJE_CREDENCIALES } = await import('@/lib/errores/mapear')

function formulario(correo: string, password: string): FormData {
  const fd = new FormData()
  fd.append('correo', correo)
  fd.append('password', password)
  return fd
}

describe('iniciarSesion', () => {
  beforeEach(() => {
    signInWithPassword.mockReset()
    loginBloqueado.mockReset().mockResolvedValue(false)
    registrarIntentoLogin.mockReset().mockResolvedValue(undefined)
    redirect.mockReset()
  })

  it('rechaza sin llamar a Supabase cuando la combinacion esta bloqueada', async () => {
    loginBloqueado.mockResolvedValue(true)
    const r = await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(r.error).toContain('Demasiados intentos')
  })

  it('registra el intento fallido', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } })
    await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))
    expect(registrarIntentoLogin).toHaveBeenCalledWith('a@b.com', '203.0.113.7', false)
  })

  it('usa el mismo mensaje ante credenciales invalidas', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } })
    const r = await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))
    expect(r.error).toBe(MENSAJE_CREDENCIALES)
  })

  it('usa el mismo mensaje ante un usuario inexistente', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'user_not_found' } })
    const r = await iniciarSesion({}, formulario('nadie@b.com', 'ClaveLargaSegura1'))
    expect(r.error).toBe(MENSAJE_CREDENCIALES)
  })

  it('registra el intento exitoso y redirige al panel del rol', async () => {
    const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const token = `${parte({})}.${parte({ app_metadata: { rol: 'vendedor' } })}.f`
    signInWithPassword.mockResolvedValue({ data: { session: { access_token: token } }, error: null })

    await iniciarSesion({}, formulario('v@b.com', 'ClaveLargaSegura1'))
    expect(registrarIntentoLogin).toHaveBeenCalledWith('v@b.com', '203.0.113.7', true)
    expect(redirect).toHaveBeenCalledWith('/panel')
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:unit -- accion-login`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir la server action**

`src/app/(auth)/login/acciones.ts`:

```ts
'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaLogin } from '@/lib/validacion/esquemas'
import { mapearError, MENSAJE_CREDENCIALES } from '@/lib/errores/mapear'
import { loginBloqueado, registrarIntentoLogin } from '@/lib/auth/limite-intentos'
import { rolDesdeToken, rutaDePanel } from '@/lib/auth/roles'

export interface EstadoFormulario {
  error?: string
}

const MENSAJE_BLOQUEADO =
  'Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.'

async function ipDeLaPeticion(): Promise<string> {
  const cabeceras = await headers()
  const reenviada = cabeceras.get('x-forwarded-for')
  return reenviada?.split(',')[0]?.trim() || '127.0.0.1'
}

export async function iniciarSesion(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaLogin.safeParse({
    correo: formData.get('correo'),
    password: formData.get('password'),
  })
  if (!analisis.success) return { error: MENSAJE_CREDENCIALES }

  const { correo, password } = analisis.data
  const ip = await ipDeLaPeticion()

  if (await loginBloqueado(correo, ip)) {
    return { error: MENSAJE_BLOQUEADO }
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password })

  if (error || !data.session) {
    await registrarIntentoLogin(correo, ip, false)
    // El mismo mensaje para credenciales malas y usuario inexistente:
    // distinguirlos permitiria enumerar que correos tienen cuenta.
    return { error: error ? mapearError(error).mensaje : MENSAJE_CREDENCIALES }
  }

  await registrarIntentoLogin(correo, ip, true)
  redirect(rutaDePanel(rolDesdeToken(data.session.access_token)))
}
```

- [ ] **Step 4: Escribir la página de login**

`src/app/(auth)/login/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { iniciarSesion, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export default function PaginaLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, INICIAL)

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Iniciar sesion</h1>
      <form action={accion} className="mt-6 space-y-4">
        <input name="correo" type="email" placeholder="Correo" required className="w-full border p-2" />
        <input name="password" type="password" placeholder="Contrasena" required className="w-full border p-2" />
        {estado.error && <p role="alert" className="text-red-600">{estado.error}</p>}
        <button type="submit" disabled={pendiente} className="w-full bg-black p-2 text-white">
          {pendiente ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 5: Ejecutar y confirmar que pasa**

Run: `npm run test:unit -- accion-login`
Expected: PASS — 5 pruebas.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(auth): login con limite de intentos y mensaje uniforme"
```

---

## Task 16: Middleware — sesión, guardas de rol y cabeceras

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/(comprador)/mi-cuenta/page.tsx`, `src/app/(vendedor)/panel/page.tsx`, `src/app/(admin)/control/page.tsx`

**Interfaces:**
- Consumes: `construirCabeceras`, `generarNonce` (Task 12); `rolDesdeToken`, `rutaPermitida`, `rutaDePanel` (Task 13)
- Produces: protección efectiva de los tres grupos de rutas; las páginas mínimas que la Task 18 verifica de extremo a extremo

- [ ] **Step 1: Escribir el middleware**

`src/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { construirCabeceras, generarNonce } from '@/lib/seguridad/cabeceras'
import { rolDesdeToken, rutaPermitida, rutaDePanel } from '@/lib/auth/roles'

const RUTAS_PROTEGIDAS = ['/mi-cuenta', '/panel', '/control']

export async function middleware(peticion: NextRequest) {
  const nonce = generarNonce()

  // El nonce viaja tambien en la PETICION para que un Server Component pueda
  // leerlo con headers() y etiquetar sus scripts inline. Sin esto el nonce de la
  // CSP no tiene consumidor y strict-dynamic bloquea todo script inline.
  const cabecerasPeticion = new Headers(peticion.headers)
  cabecerasPeticion.set('x-nonce', nonce)

  let respuesta = NextResponse.next({ request: { headers: cabecerasPeticion } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => peticion.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value } of cookies) peticion.cookies.set(name, value)

          // Re-derivar las cabeceras DESPUES de mutar las cookies. peticion.cookies.set
          // reescribe la cabecera Cookie de la peticion, y reutilizar aqui el snapshot
          // tomado antes de getUser() la dejaria vieja: en la peticion donde Supabase
          // refresca el token, el navegador recibiria la cookie nueva pero los Server
          // Components de ESA misma peticion seguirian leyendo la anterior.
          const cabecerasRefrescadas = new Headers(peticion.headers)
          cabecerasRefrescadas.set('x-nonce', nonce)

          respuesta = NextResponse.next({ request: { headers: cabecerasRefrescadas } })
          for (const { name, value, options } of cookies) {
            respuesta.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              // Lax y no Strict: con Strict, el usuario que llega desde el
              // enlace de verificacion del correo aterriza sin sesion.
              sameSite: 'lax',
              path: '/',
            })
          }
        },
      },
    },
  )

  function aplicarCabeceras(destino: NextResponse): NextResponse {
    destino.headers.set('x-nonce', nonce)
    for (const [clave, valor] of Object.entries(construirCabeceras(nonce))) {
      destino.headers.set(clave, valor)
    }
    return destino
  }

  // Toda redireccion de guarda pasa por aqui, y no por NextResponse.redirect a
  // secas, por dos razones que costaron una ronda de revision:
  //  1. Un redirect nuevo NO lleva las cabeceras de seguridad. Las rutas a las
  //     que rebota la guarda son justamente las que hay que proteger.
  //  2. Un redirect nuevo esta desconectado de `respuesta`, asi que pierde las
  //     cookies que setAll pudo reescribir al refrescar el token durante
  //     getUser(). Perderlas provoca sesion caida o bucle de redirecciones.
  function redirigir(destino: string): NextResponse {
    const redireccion = NextResponse.redirect(new URL(destino, peticion.url))
    for (const cookie of respuesta.cookies.getAll()) {
      redireccion.cookies.set(cookie)
    }
    return aplicarCabeceras(redireccion)
  }

  // getUser revalida contra el servidor de auth; getSession solo lee la cookie.
  const { data: { user } } = await supabase.auth.getUser()
  const ruta = peticion.nextUrl.pathname
  const esProtegida = RUTAS_PROTEGIDAS.some((p) => ruta === p || ruta.startsWith(`${p}/`))

  if (esProtegida) {
    if (!user) {
      return redirigir('/login')
    }
    if (!user.email_confirmed_at) {
      return redirigir('/verificar-correo')
    }

    const { data: { session } } = await supabase.auth.getSession()
    const rol = rolDesdeToken(session?.access_token ?? '')

    if (!rutaPermitida(ruta, rol)) {
      return redirigir(rutaDePanel(rol))
    }
  }

  return aplicarCabeceras(respuesta)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
}
```

**Jerarquía a recordar:** este middleware es conveniencia. La seguridad real es RLS. Si
este archivo tuviera un bug, la base de datos seguiría negando el acceso a los datos.

- [ ] **Step 2: Escribir las tres páginas de panel**

`src/app/(comprador)/mi-cuenta/page.tsx`:

```tsx
export const metadata = { robots: { index: false, follow: false } }

export default function PaginaMiCuenta() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Mi cuenta</h1>
      <p className="mt-4">Panel del comprador. Se construye en el SP2.</p>
    </main>
  )
}
```

`src/app/(vendedor)/panel/page.tsx`:

```tsx
export const metadata = { robots: { index: false, follow: false } }

export default function PaginaPanelVendedor() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Panel del vendedor</h1>
      <p className="mt-4">Gestion de publicaciones. Se construye en el SP3.</p>
    </main>
  )
}
```

`src/app/(admin)/control/page.tsx`:

```tsx
export const metadata = { robots: { index: false, follow: false } }

export default function PaginaControl() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Control del sistema</h1>
      <p className="mt-4">Metricas y moderacion. Se construye en el SP7.</p>
    </main>
  )
}
```

El `robots: { index: false }` cumple el requisito de que los paneles autenticados nunca
se indexen.

- [ ] **Step 3: Verificar la compilación y los tipos**

```bash
npx tsc --noEmit
npm run build
```

Expected: sin errores.

- [ ] **Step 4: Verificar manualmente las cabeceras**

```bash
npm run dev
```

En otra terminal:

```bash
curl -sI http://127.0.0.1:3000/ | grep -iE 'content-security-policy|x-frame-options|strict-transport'
```

Expected: las tres cabeceras presentes, con `nonce-` dentro de la CSP.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(auth): middleware con guardas de rol y cabeceras de seguridad"
```

---

## Task 17: Seed de desarrollo con guarda contra producción

**Files:**
- Create: `supabase/seed.sql`
- Create: `tests/rls/seed.test.ts`

**Interfaces:**
- Consumes: todo el esquema (Tasks 2-11)
- Produces: los tres usuarios de prueba en local y staging, nunca en producción

- [ ] **Step 1: Escribir la prueba (falla)**

`tests/rls/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { clienteAdmin, clienteComo } from './ayudantes'

const CUENTAS = [
  { correo: 'admin@portal.com', password: 'AdminPrueba2026*', rol: 'super_admin' },
  { correo: 'vendedor@portal.com', password: 'VendedorPrueba2026*', rol: 'vendedor' },
  { correo: 'comprador@portal.com', password: 'CompradorPrueba2026*', rol: 'comprador' },
]

describe('seed de desarrollo', () => {
  it('el archivo aborta si el entorno es de produccion', () => {
    const sql = readFileSync('supabase/seed.sql', 'utf8')
    expect(sql).toContain('RAISE EXCEPTION')
    expect(sql).toContain('produccion')
  })

  for (const cuenta of CUENTAS) {
    it(`la cuenta ${cuenta.correo} existe con rol ${cuenta.rol}`, async () => {
      const cliente = await clienteComo(cuenta.correo, cuenta.password)
      const { data: sesion } = await cliente.auth.getUser()
      expect(sesion.user).not.toBeNull()

      const { data } = await clienteAdmin()
        .from('perfiles').select('rol').eq('id', sesion.user!.id).single()
      expect(data!.rol).toBe(cuenta.rol)
    })
  }

  it('las tres cuentas tienen el correo ya confirmado', async () => {
    const { data } = await clienteAdmin().auth.admin.listUsers()
    for (const cuenta of CUENTAS) {
      const u = data!.users.find((x) => x.email === cuenta.correo)
      expect(u?.email_confirmed_at).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:rls -- seed`
Expected: FAIL — `supabase/seed.sql` no existe.

- [ ] **Step 3: Escribir el seed**

`supabase/seed.sql`:

```sql
-- ============================================================================
-- SEED DE DESARROLLO. SOLO LOCAL Y STAGING.
--
-- Estas contrasenas son publicas: circularon en texto plano y estan en el
-- repositorio. Un super_admin con contrasena conocida es control total del
-- portal. Produccion recibe UNICAMENTE migraciones, nunca este archivo.
-- El super admin real se crea a mano, una vez, con contrasena generada.
-- ============================================================================

-- TRANSACCION EXPLICITA, y no es opcional. Un RAISE EXCEPTION dentro de un
-- bloque DO solo revierte ESE bloque: un `psql -f seed.sql` sin
-- -v ON_ERROR_STOP=1 imprimiria el error de la guarda y ejecutaria el bloque de
-- inserccion igualmente -- justo el escenario del que la guarda protege. Con
-- BEGIN/COMMIT, el fallo deja la transaccion abortada, todo lo que sigue falla
-- con "current transaction is aborted" y el COMMIT final revierte.
BEGIN;

DO $guarda$
BEGIN
  -- Se comprueba solo app.entorno. La condicion current_database() LIKE '%prod%'
  -- que habia antes era codigo muerto: Supabase llama 'postgres' a la base tanto
  -- en local como en produccion, asi que nunca disparaba.
  IF current_setting('app.entorno', true) = 'production' THEN
    RAISE EXCEPTION 'El seed de desarrollo no se ejecuta en produccion';
  END IF;
END
$guarda$;

DO $seed$
DECLARE
  v_id uuid;
  v_cuenta record;
BEGIN
  FOR v_cuenta IN
    SELECT * FROM (VALUES
      ('admin@portal.com',     'AdminPrueba2026*',     'super_admin', 'Admin Prueba'),
      ('vendedor@portal.com',  'VendedorPrueba2026*',  'vendedor',    'Vendedor Prueba'),
      ('comprador@portal.com', 'CompradorPrueba2026*', 'comprador',   'Comprador Prueba')
    ) AS t(correo, clave, rol, nombre)
  LOOP
    DELETE FROM auth.users WHERE email = v_cuenta.correo;

    v_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_cuenta.correo,
      -- Supabase Auth hashea con bcrypt; aqui se replica con pgcrypto.
      crypt(v_cuenta.clave, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nombre', v_cuenta.nombre, 'telefono', '3000000000'),
      now(), now()
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_cuenta.correo),
      'email', now(), now()
    );

    -- El trigger handle_new_user ya creo el perfil como comprador.
    -- El rol definitivo se fija por SQL directo, nunca desde la aplicacion.
    UPDATE public.perfiles SET rol = v_cuenta.rol::public.rol_usuario WHERE id = v_id;
  END LOOP;
END
$seed$;

COMMIT;
```

**Y una advertencia honesta sobre el alcance de esta guarda.** `app.entorno` es una variable
que nadie pone sola: ni Supabase ni Postgres la definen por su cuenta. Así que esta guarda
solo dispara si alguien la marcó a propósito. **No es la protección principal** — la
protección principal es que producción recibe únicamente migraciones y nunca este archivo.
La guarda es un segundo cinturón para el caso en que un operador con la variable puesta
ejecute el seed por error, y la transacción es lo que hace que ese cinturón realmente
sujete. No confiar en ella como si detectara producción por sí sola.

- [ ] **Step 4: Aplicar y ejecutar**

```bash
supabase db reset
npm run test:rls -- seed
```

Expected: PASS — 5 pruebas. Si `crypt` falla, activar la extensión con
`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;` en una migración previa.

- [ ] **Step 5: Verificar que el CI no aplica el seed**

Revisar `.github/workflows/ci.yml`: `supabase start` aplica migraciones y seed en local,
lo cual es correcto para CI. Añadir al README una nota explícita:

```markdown
## Despliegue a produccion

Produccion se actualiza SOLO con `supabase db push` (migraciones).
Nunca ejecutar `supabase db reset` ni aplicar `seed.sql` contra produccion.
El super admin de produccion se crea una vez, a mano, con contrasena generada.
```

- [ ] **Step 6: Commit**

```bash
git add supabase tests README.md
git commit -m "feat(db): seed de desarrollo con guarda contra produccion"
```

---

## Task 18: Prueba de extremo a extremo del flujo completo

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/ayudantes-correo.ts`, `tests/e2e/registro-y-guardas.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior
- Produces: verificación de los criterios de aceptación 2, 4 y 7 del spec

- [ ] **Step 1: Configurar Playwright**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
```

- [ ] **Step 2: Escribir el ayudante que lee el correo local**

`tests/e2e/ayudantes-correo.ts`:

```ts
const MAILPIT = 'http://127.0.0.1:54324'

/**
 * El CLI de Supabase levanta Mailpit para el correo local.
 * Si tu version del CLI usa Inbucket, el endpoint es
 * /api/v1/mailbox/<buzon> en lugar de /api/v1/messages.
 */
export async function ultimoEnlaceDeConfirmacion(destinatario: string): Promise<string> {
  for (let intento = 0; intento < 20; intento++) {
    const lista = await fetch(`${MAILPIT}/api/v1/messages`).then((r) => r.json())
    const mensaje = lista.messages?.find(
      (m: { To: { Address: string }[] }) =>
        m.To?.some((t) => t.Address.toLowerCase() === destinatario.toLowerCase()),
    )

    if (mensaje) {
      const detalle = await fetch(`${MAILPIT}/api/v1/message/${mensaje.ID}`).then((r) => r.json())
      const cuerpo: string = detalle.HTML || detalle.Text || ''
      const encontrado = cuerpo.match(/https?:\/\/[^\s"'<>]*token_hash=[^\s"'<>]+/)
      if (encontrado) return encontrado[0].replace(/&amp;/g, '&')
    }

    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No llego el correo de confirmacion a ${destinatario}`)
}

export async function limpiarBuzon(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}
```

- [ ] **Step 3: Escribir la prueba E2E**

`tests/e2e/registro-y-guardas.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { ultimoEnlaceDeConfirmacion, limpiarBuzon } from './ayudantes-correo'

const CORREO = `e2e-${Date.now()}@prueba.test`
const CLAVE = 'ClaveLargaSegura2026'

test('registro, verificacion por correo, login y guardas de rol', async ({ page }) => {
  await limpiarBuzon()

  await page.goto('/registro')
  await page.fill('input[name="nombre"]', 'Vendedor E2E')
  await page.fill('input[name="correo"]', CORREO)
  await page.fill('input[name="telefono"]', '3001234567')
  await page.fill('input[name="password"]', CLAVE)
  await page.check('input[value="vendedor"]')
  await page.click('button[type="submit"]')

  await expect(page.getByRole('heading', { name: /Revisa tu correo/i })).toBeVisible()

  const enlace = await ultimoEnlaceDeConfirmacion(CORREO)
  await page.goto(enlace)

  await expect(page.getByRole('heading', { name: /Panel del vendedor/i })).toBeVisible()

  // Guarda de rol: un vendedor no entra al control del super admin.
  await page.goto('/control')
  await expect(page).toHaveURL(/\/panel/)
})

test('el usuario sin sesion es enviado al login', async ({ page }) => {
  await page.goto('/panel')
  await expect(page).toHaveURL(/\/login/)
})

test('el sexto intento fallido de login es rechazado', async ({ page }) => {
  const correo = `bloqueo-${Date.now()}@prueba.test`

  for (let intento = 1; intento <= 6; intento++) {
    await page.goto('/login')
    await page.fill('input[name="correo"]', correo)
    await page.fill('input[name="password"]', 'ClaveEquivocada123')
    await page.click('button[type="submit"]')
    await expect(page.getByRole('alert')).toBeVisible()
  }

  await expect(page.getByRole('alert')).toContainText(/Demasiados intentos/i)
})

test('la respuesta incluye la CSP con nonce', async ({ page }) => {
  const respuesta = await page.goto('/login')
  expect(respuesta!.headers()['content-security-policy']).toContain('nonce-')
})
```

- [ ] **Step 4: Ejecutar las pruebas E2E**

```bash
supabase start
npm run test:e2e
```

Expected: PASS — 4 pruebas.

- [ ] **Step 5: Añadir el trabajo E2E al CI**

En `.github/workflows/ci.yml`, tras `npm run test:rls`:

```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 6: Ejecutar la suite completa**

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
npm run test:rls
npm run test:e2e
npm run build
```

Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add tests playwright.config.ts .github
git commit -m "test(e2e): flujo de registro, verificacion, login y guardas de rol"
```

---

## Verificación final contra los criterios de aceptación del spec

| # | Criterio | Verificado por |
|---|---|---|
| 1 | `supabase db reset` levanta el esquema con RLS en todas las tablas | Tasks 2-11, `npm run test:rls` |
| 2 | Los tres usuarios de prueba inician sesión en local | Task 17 |
| 3 | La matriz completa de RLS pasa | Tasks 2, 4, 5, 6, 7 |
| 4 | E2E de registro → verificación → login pasa leyendo el correo real | Task 18 |
| 5 | Nadie modifica su propio `rol` | Task 2 (3 capas) + Task 3 |
| 6 | `signUp` con `super_admin` produce un `comprador` | Task 3 |
| 7 | El sexto intento fallido en 15 minutos es rechazado | Tasks 11 y 18 |
| 8 | Cabeceras presentes y la CSP no rompe la app | Tasks 12 y 16 |
| 9 | `gitleaks` pasa y la llave de servicio no es importable desde cliente | Tasks 1 y 9 |
| 10 | Los barrios llegan por migración, no por seed | Task 4 |
