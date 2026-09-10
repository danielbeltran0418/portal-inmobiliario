# Despliegue a Vercel + Supabase alojado

Guía para poner el portal en una URL que otra persona pueda abrir.

**Regla que gobierna todo lo demás:** producción recibe **únicamente migraciones**
(`supabase db push`), **nunca `seed.sql`**. El seed crea tres cuentas con contraseñas que están
en un repositorio público, una de ellas `super_admin`. Hay una guarda en el propio seed que lo
impide, y está probada ejecutándola — pero la protección real es no invocarlo.

---

## Lo que hay que hacer, en orden

### 1 · Crear el proyecto en Supabase

En [supabase.com](https://supabase.com), proyecto nuevo. Anota la **contraseña de la base** y
el **project ref** (lo verás en la URL del panel).

Elige la región más cercana a Barranquilla — `us-east-1` suele ser la mejor latencia desde
Colombia.

### 2 · Aplicar el esquema

```bash
npx supabase login
npx supabase link --project-ref <tu-ref>
npx supabase db push
```

`db push` aplica **solo las migraciones**. No toca `seed.sql`, que únicamente corre en
`db reset` local. Comprueba al terminar que aplicó las 28.

### 3 · Las cuatro variables en Vercel

```bash
vercel login
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NEXT_PUBLIC_APP_URL production
```

Los tres primeros valores están en Supabase → *Project Settings* → *API*.
`NEXT_PUBLIC_APP_URL` es la URL que te dé Vercel, **sin barra final**.

> `SUPABASE_SERVICE_ROLE_KEY` **salta RLS por completo**. Solo se usa en el servidor, detrás de
> `import 'server-only'`. Nunca la pegues en una variable con prefijo `NEXT_PUBLIC_`: eso la
> enviaría al navegador.

### 4 · Desplegar

```bash
vercel --prod
```

---

## Lo que rompe en silencio si nadie lo configura

Estas cuatro cosas viven en `supabase/config.toml`, que gobierna **solo el entorno local**. El
proyecto alojado tiene su propia configuración y no la hereda.

### El enlace de verificación apuntará a tu portátil

`site_url` está en `http://127.0.0.1:3000`. Si no se cambia, el correo de confirmación llevará
a tu compañero a **su propio ordenador** y no podrá activar la cuenta. Nadie podrá registrarse.

En el panel: **Authentication → URL Configuration**
- *Site URL*: la URL de Vercel
- *Redirect URLs*: añade `https://<tu-url>/confirmar`

### Los roles no llegarán al token

`custom_access_token_hook` inyecta el rol en el JWT, y el middleware lo lee para decidir a qué
panel puede entrar cada quien. En local se activa desde `config.toml`; **en el proyecto alojado
hay que activarlo a mano**.

En el panel: **Authentication → Hooks** → *Custom Access Token* → apuntar a
`public.custom_access_token_hook`.

Sin esto, las guardas por rol no se comportan como en local.

### Los correos casi no se enviarán

Supabase alojado trae un servicio de correo de cortesía con un límite muy bajo — unos pocos
envíos por hora. Para una revisión entre dos personas puede bastar; para cualquier cosa más,
hace falta un SMTP propio en **Authentication → Emails**.

Si tu compañero dice que no le llega el correo, es esto, no un fallo de la aplicación.

### Falta la mitad de la política de contraseñas

El spec exige longitud mínima **más** verificación contra contraseñas filtradas. La longitud
(12) viaja en las migraciones; lo segundo **no se puede configurar desde `config.toml`**.

En el panel: **Authentication → Settings** → *Prevent use of leaked passwords*.

---

## Crear el super admin, a mano

No hay seed en producción, así que la primera cuenta se crea así:

1. Regístrate por la aplicación con tu correo real.
2. Verifica desde el correo.
3. En **Table Editor → perfiles**, cambia tu `rol` a `super_admin`.

El paso 3 se hace desde el panel de Supabase a propósito: la aplicación **nunca** asigna
`super_admin`, y hay tres capas que lo impiden.

---

## Antes de compartir la URL, dos avisos

**El registro no tiene límite de intentos.** El captcha está apagado —faltan las claves de
Cloudflare— y el limitador existente solo cubre el login. Una URL pública queda abierta al alta
masiva de cuentas. Para que lo vea un compañero es asumible; para dejarlo publicado, no.

**El catálogo estará vacío.** La base remota nace sin propiedades. Tu compañero tendrá que
registrarse como vendedor y publicar algo, o lo haces tú antes de pasarle el enlace.

---

## Comprobación después de desplegar

En este orden, porque cada paso depende del anterior:

1. La portada carga.
2. `/registro` permite crear una cuenta y **llega el correo**.
3. El enlace del correo apunta a **tu dominio**, no a `127.0.0.1`.
4. Tras verificar, el login lleva al panel que corresponde al rol.
5. Publicar una propiedad con foto, y verla en `/<barrio>/<slug>`.
6. **La foto se ve.** Si no, revisa que `img-src` de la CSP admita el dominio de Storage: en
   producción cubre `https://*.supabase.co`, que es donde vive un proyecto alojado.
