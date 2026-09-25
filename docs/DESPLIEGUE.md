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
`db reset` local. Comprueba al terminar que aplicó las 36.

### 3 · Las cinco variables en Vercel

```bash
vercel login
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add IP_CABECERA_CONFIABLE production
```

Los tres primeros valores están en Supabase → *Project Settings* → *API*.
`NEXT_PUBLIC_APP_URL` es la URL que te dé Vercel, **sin barra final**.
`IP_CABECERA_CONFIABLE` es el **nombre** de la cabecera que tu plataforma garantiza reescribir
con la IP real del cliente — en Vercel, `x-vercel-forwarded-for`. Ver
`src/lib/http/ip-cliente.ts` para el porqué (no es `x-forwarded-for`: esa la puede componer
cualquiera).

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

### Sin `IP_CABECERA_CONFIABLE`, el registro queda CERRADO — no degradado

Esta, a diferencia de las cuatro anteriores, no viene de `config.toml`: es la variable de entorno
del paso 3. La incluyo aquí porque su ausencia rompe en silencio exactamente igual.

En producción, `ipDeConfianza()` (`src/lib/http/ip-cliente.ts`) lee **únicamente** la cabecera
cuyo nombre esté en `IP_CABECERA_CONFIABLE`. En Vercel ese valor es `x-vercel-forwarded-for`, no
`x-forwarded-for` — esa la puede componer cualquiera que mande la petición, y confiar en ella
dejaría el límite por IP en nada.

Si la variable no está configurada, la función no puede determinar una IP de confianza y
devuelve `null`. Para el límite de **login** eso es una degradación segura: cuenta por correo en
vez de por IP, más estricto y no falsificable. Pero para el límite de **registro** no hay
degradación posible — el spam de altas usa un correo distinto en cada intento, así que "contar
por clave" contaría siempre uno, que equivale a **sin límite**. `accion_bloqueada('registro', …)`
resuelve la ausencia de IP al revés que el login: **bloquea siempre**.

Es decir: sin esta variable, `/registro` responde a todo el mundo con "Se han creado demasiadas
cuentas desde esta conexión" y **nadie puede darse de alta**, en ningún rol. No es un límite más
estricto, es la puerta cerrada. Es deliberado — la alternativa (fallar abierto) es la que deja el
alta masiva de cuentas sin ningún control — pero es fácil confundirlo con un bug si nadie lo
documenta: revisa los logs del servidor buscando `[ip-cliente]` si el registro deja de funcionar
justo después de un despliegue nuevo.

---

## Crear una cuenta de vendedor para pruebas

1. En `/registro`, marca **Publicar propiedades**. El rol se fija al crear la cuenta; no se
   puede cambiar desde la aplicación después.
2. Abre el enlace del correo. `/confirmar` acepta tanto la plantilla propia (`token_hash`) como
   la plantilla por defecto de Supabase alojado (`code`), así que no hace falta tocar
   *Authentication → Emails → Templates*. Ábrelo **en el mismo navegador** en que te registraste:
   el `code` se canjea contra una cookie que dejó el registro. Si lo abres en otro, el correo
   queda verificado igual y basta con iniciar sesión.
3. **Si el correo no llega** (límite del correo de cortesía), en el panel:
   *Authentication → Users* → la cuenta → *Confirm email*. Luego inicia sesión normalmente.
4. Si entras y te manda a `/mi-cuenta` en vez de `/panel`, falta activar el hook de *Custom
   Access Token* (ver arriba): sin él el token no lleva el rol y todo el mundo es comprador.
   También puedes revisar en *Table Editor → perfiles* que el `rol` sea `vendedor`.

Recuerda el límite: **tres altas por hora desde la misma IP**. Para varias cuentas de prueba
seguidas, espera o vacía las filas `accion = 'registro'` de `intentos_accion`.

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

**El captcha del registro está apagado** —faltan las claves de Cloudflare—, y el límite por IP
(máximo tres altas por hora, ver arriba) es la única barrera que queda contra el alta masiva de
cuentas; no reemplaza al captcha, solo pone un techo. Para que lo vea un compañero es asumible;
para dejarlo publicado, no.

**El catálogo estará vacío.** La base remota nace sin propiedades. Tu compañero tendrá que
registrarse como vendedor y publicar algo, o lo haces tú antes de pasarle el enlace.

Para probar moderación y catálogo sin publicar a mano, `npm run sembrar:publicaciones` crea 10
publicaciones con foto en estados variados (publicadas, en revisión, pausada, rechazada, y varias
sospechosas a propósito: precio irreal, contacto en la descripción, duplicado). Contra el proyecto
alojado hace falta la clave de servicio en `.env.local` y los flags `--vendedor <correo>
--confirmar` (con `--crear-vendedor` crea esa cuenta si no existe); `--limpiar` borra solo esas 10 (slug `prueba-moderacion-…`).

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
