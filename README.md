# Portal inmobiliario — SP0

Base del portal: autenticacion con roles (`comprador`, `vendedor`, `super_admin`),
esquema de base de datos con RLS, limite de intentos de login y cabeceras de
seguridad con CSP por nonce.

Stack: Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage) + TypeScript.

---

## 1. Requisitos

| Herramienta | Version | Para que |
|---|---|---|
| Node.js | 20 o superior | la aplicacion y las pruebas |
| npm | el que trae Node 20 | dependencias |
| Docker | corriendo | la pila local de Supabase (Postgres, Auth, Storage, Mailpit) |

Docker tiene que estar **arrancado** antes de `npx supabase start`. No hace falta
instalar el CLI de Supabase aparte: se invoca con `npx supabase`.

## 2. Puesta en marcha

```bash
git clone <url-del-repositorio>
cd portal-inmobiliario
npm install
npx supabase start
```

`npx supabase start` levanta los contenedores y aplica las migraciones y el seed.
La primera vez tarda varios minutos porque descarga las imagenes.

## 3. Generar `.env.local`

`.env.local` **no esta en el repositorio** (lo excluye `.gitignore`, y no debe
commitearse nunca: contiene la `SUPABASE_SERVICE_ROLE_KEY`, que salta RLS por
completo). `.env.example` documenta las claves que hacen falta.

Los nombres que emite el CLI (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
`DB_URL`) **no** son los que usa la aplicacion, asi que hay que remapearlos.
`--override-name` lo hace por ti.

**Linux / macOS / Git Bash:**

```bash
npx supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY \
  --override-name db.url=SUPABASE_DB_URL \
  | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL)=' \
  | sed 's/="\(.*\)"$/=\1/' > .env.local
printf 'NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000\nAPP_ENTORNO=local\n' >> .env.local
```

**PowerShell (Windows):**

```powershell
npx supabase status -o env `
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL `
  --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY `
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY `
  --override-name db.url=SUPABASE_DB_URL |
  Select-String '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL)=' |
  ForEach-Object { $_.Line -replace '="(.*)"$', '=$1' } |
  Set-Content -Encoding utf8 .env.local
Add-Content -Encoding utf8 .env.local "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000"
Add-Content -Encoding utf8 .env.local "APP_ENTORNO=local"
```

El resultado tiene que contener estas seis claves:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
APP_ENTORNO=local
```

Si falta alguna de las cuatro primeras, la suite de pruebas aborta con un
mensaje que dice cual falta y como obtenerla. No falla en silencio.

`SUPABASE_DB_URL` es la conexion directa a Postgres. La usa una sola prueba, la
de la guarda de `supabase/seed.sql`: para comprobarla hay que ejecutar el
archivo de verdad, y eso no se puede hacer por la API REST.

Las mismas variables pueden llegar por el entorno del proceso en lugar del
archivo; eso es lo que hace CI, donde `.env.local` no existe. Lo que ya este
exportado gana sobre el archivo.

## 4. Base de datos

```bash
npx supabase db reset    # recrea la base, aplica migraciones y seed
```

Las migraciones viven en `supabase/migrations/` y se aplican en orden por su
marca de tiempo. **Una migracion ya aplicada no se edita**: toda correccion va
en una migracion nueva.

## 5. Levantar la aplicacion

```bash
npm run dev
```

Abre <http://127.0.0.1:3000> (no `localhost`: los enlaces de verificacion del
correo usan `127.0.0.1`, y para el navegador son hosts distintos, asi que cruzar
de uno a otro pierde la cookie de sesion).

## 6. Correos en desarrollo

Supabase local no envia correo de verdad: lo captura **Mailpit**.

- Bandeja: <http://127.0.0.1:54324>
- Ahi aparecen los correos de verificacion del registro.

## 7. Pruebas

| Comando | Que corre | Necesita |
|---|---|---|
| `npm run test:unit` | pruebas unitarias (`tests/unit/`) | nada |
| `npm run test:rls` | RLS y privilegios contra la base real (`tests/rls/`) | Supabase levantado + `.env.local` |
| `npm run test:e2e` | flujos de punta a punta con Playwright (`tests/e2e/`) | Supabase levantado + `.env.local` |
| `npm run lint` | ESLint | nada |
| `npm run build` | build de produccion de Next | variables `NEXT_PUBLIC_*` |

La primera vez que corras Playwright:

```bash
npx playwright install --with-deps chromium
```

`test:e2e` arranca `npm run dev` por su cuenta y reutiliza el servidor si ya lo
tienes corriendo.

Las pruebas de RLS y las e2e escriben en la base local. Si una queda a medias,
`npx supabase db reset` la deja limpia.

## 8. Credenciales de prueba

`supabase/seed.sql` crea tres cuentas, una por rol:

| Correo | Contrasena | Rol |
|---|---|---|
| `admin@portal.com` | `AdminPrueba2026*` | `super_admin` |
| `vendedor@portal.com` | `VendedorPrueba2026*` | `vendedor` |
| `comprador@portal.com` | `CompradorPrueba2026*` | `comprador` |

> ### ⚠ `supabase/seed.sql` es SOLO de desarrollo
>
> **Jamas se ejecuta en produccion.** Estas contrasenas son publicas: estan en
> el repositorio y circularon en texto plano. Un `super_admin` con contrasena
> conocida es control total del portal.
>
> Produccion se actualiza **unicamente** con `supabase db push` (migraciones).
> Nunca `supabase db reset`, nunca `seed.sql`.
>
> El archivo lleva ademas una guarda: si el parametro de sesion `app.entorno`
> vale `'production'`, el seed aborta y **no** crea ninguna cuenta. Es una
> segunda capa, no la primera — nadie fija ese marcador automaticamente. El
> control que de verdad importa es no aplicar el archivo.

## 9. Despliegue a produccion

Produccion se actualiza SOLO con `supabase db push` (migraciones).
Nunca ejecutar `supabase db reset` ni aplicar `seed.sql` contra produccion.
El super admin de produccion se crea una vez, a mano, con contrasena generada y
guardada en un gestor de contrasenas.

## 10. Estructura

```
src/app/            rutas del App Router (auth, vendedor, comprador, admin)
src/lib/            auth, supabase, validacion, seguridad, errores
src/middleware.ts   guardas de rol y cabeceras de seguridad (runtime Edge)
supabase/migrations esquema y politicas RLS
supabase/seed.sql   datos de desarrollo (NO produccion)
tests/unit          vitest, sin dependencias externas
tests/rls           vitest contra la base real
tests/e2e           playwright
```
