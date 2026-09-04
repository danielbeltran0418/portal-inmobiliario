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
| `npm run test:rls` | RLS y privilegios contra la base real (`tests/rls/`) | Supabase levantado + las cuatro variables de §3 |
| `npm run test:e2e` | flujos de punta a punta con Playwright (`tests/e2e/`) | Supabase levantado + las cuatro variables de §3 |
| `npm run lint` | ESLint | nada |
| `npm run build` | build de produccion de Next | variables `NEXT_PUBLIC_*` |

Las variables **no tienen que venir de `.env.local`**: basta con que esten en el
entorno del proceso. `.env.local` es una comodidad para trabajar en local, y se
carga solo si existe; lo que ya este exportado gana sobre el archivo. Es lo que
hace CI, donde ese archivo no existe. Si falta alguna, la suite aborta diciendo
cual y como obtenerla — no falla en silencio.

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

## 9. Politica de contrasenas

Minimo **12 caracteres**, aplicado en dos sitios porque uno solo no basta:

| Donde | Que cubre |
|---|---|
| `src/lib/validacion/esquemas.ts` (Zod) | el formulario, con el mensaje al usuario |
| `supabase/config.toml` → `minimum_password_length` | **todo lo demas**: un POST a `/auth/v1/signup`, el SDK desde una consola, o un cambio de contrasena que no pase por el formulario |

No se exigen clases de caracteres (`password_requirements` vacio), y es una
decision, no un olvido: obligan a patrones predecibles del tipo `P@ssw0rd1`
que los diccionarios de ataque ya tienen. El spec elige longitud +
verificacion contra contrasenas filtradas en su lugar.

> **Pendiente en produccion:** esa verificacion contra contrasenas filtradas
> (HaveIBeenPwned) **no se puede configurar desde `config.toml`** — es una
> opcion de la plataforma alojada, no del CLI local. Hay que activarla a mano
> en el proyecto de produccion: *Authentication → Settings → Prevent use of
> leaked passwords*.

## 10. Captcha (Turnstile de Cloudflare)

El spec pide captcha en registro y login. Esta implementado **tras bandera de
entorno**, porque las claves las emite Cloudflare y todavia no hay cuenta:

| Variable | Donde vive | |
|---|---|---|
| `TURNSTILE_SITE_KEY` | llega al navegador dentro del HTML | clave publica del widget |
| `TURNSTILE_SECRET_KEY` | **solo servidor** | la que canjea el token contra Cloudflare |

**Las dos o ninguna.** Con las dos definidas se pinta el widget y el server
action **verifica el token contra Cloudflare antes de procesar el formulario**.
Sin ninguna, el captcha se omite y los formularios se comportan igual que antes.
Con una sola, el captcha queda desactivado y se avisa por consola: con solo la
secreta no habria widget y nadie podria entrar; con solo la publica se pintaria
un desafio que nadie verifica, que aparenta una proteccion que no existe.

### Como obtenerlas

1. <https://dash.cloudflare.com> → **Turnstile** → *Add site*.
2. Dominio del despliegue (para probar en local, `127.0.0.1` vale).
3. Widget mode **Managed**.
4. Copiar *Site Key* y *Secret Key* al entorno.

Para probarlo **sin cuenta**, Cloudflare publica claves de prueba que siempre
dan el mismo veredicto (documentadas en
<https://developers.cloudflare.com/turnstile/troubleshooting/testing/>):

| Efecto | `TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` |
|---|---|---|
| siempre aprueba | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| siempre rechaza | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` |

La pareja que **rechaza** es la util: demuestra que la verificacion del servidor
esta corriendo de verdad. Con la que aprueba, siteverify devuelve `success` ante
cualquier token, asi que no distingue "verifico" de "no verifico".

### Decisiones que conviene conocer

- **La verificacion es del servidor.** El widget solo produce un token; quien
  decide es `siteverify`, llamado desde el server action. Un captcha comprobado
  solo en el cliente lo salta cualquiera con `curl`.
- **Se falla cerrado.** Si Cloudflare no responde, el formulario se rechaza. Lo
  contrario convertiria una caida —o cualquier interferencia con esa peticion
  saliente— en un interruptor para apagar el captcha.
- **La CSP no se toco.** La politica lleva `strict-dynamic`, que hace que el
  navegador ignore la lista de origenes de `script-src`; el script de Turnstile
  se autoriza por **nonce**, igual que los de Next. `frame-src` y `connect-src`
  ya contemplaban `challenges.cloudflare.com` desde antes.
- **Un captcha fallido no cuenta como intento fallido de login.** Si contara,
  cinco envios con el captcha en blanco bloquearian la cuenta de cualquiera.

## 11. Despliegue a produccion

Produccion se actualiza SOLO con `supabase db push` (migraciones).
Nunca ejecutar `supabase db reset` ni aplicar `seed.sql` contra produccion.
El super admin de produccion se crea una vez, a mano, con contrasena generada y
guardada en un gestor de contrasenas.

Variables que hay que fijar en el entorno de produccion, ademas de las de
Supabase (ver `.env.example`):

| Variable | Por que |
|---|---|
| `NEXT_PUBLIC_APP_URL` | obligatoria: sin ella el origen de las redirecciones falla cerrado |
| `IP_CABECERA_CONFIABLE` | nombre de la cabecera que **reescribe la plataforma** con la IP real (en Vercel, `x-vercel-forwarded-for`). Sin ella el limite de intentos degrada a ventana por correo |
| `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` | activan el captcha de registro y login (§10). Sin ellas SP0 funciona, pero sin captcha |

## 12. Estructura

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
