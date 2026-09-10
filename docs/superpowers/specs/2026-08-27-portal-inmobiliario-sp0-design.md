# Spec: Portal Inmobiliario — Sub-proyecto 0: Fundación

**Fecha:** 2026-08-27
**Proyecto:** Portal inmobiliario con agentes IA (Barranquilla)
**Naturaleza:** Negocio real — usuarios, propiedades y datos personales reales
**Equipo:** 2-4 personas
**Plazo:** sin fecha fija; se prioriza calidad sobre velocidad

> **Ubicación de este documento.** El código del portal vivirá en un repositorio nuevo y
> separado. Este spec se escribe por ahora en el repo de trabajo actual para mantener la
> continuidad con los demás specs, y se traslada al repo nuevo cuando se cree.

---

## 1. Contexto y decisiones previas

El requerimiento original describe un portal inmobiliario completo con tres front-ends,
agentes de IA, monetización, un checklist estricto de SEO técnico y otro de seguridad.
Es demasiado para un solo ciclo de diseño e implementación, así que se descompuso.

### Enfoque elegido: C — "núcleo con las costuras cortadas para los agentes"

Se evaluaron tres enfoques:

| Enfoque | Descripción | Resultado |
|---|---|---|
| A | Portal completo primero, agentes atornillados después | Descartado: alto riesgo de migrar tablas con datos reales adentro |
| B | El chat conversacional es la interfaz principal | **Descartado activamente**: incompatible con el requisito de SEO. El contenido dentro de un chat no se indexa |
| **C** | Mismo orden de entrega que A, pero el modelo de datos y las fronteras de módulos se diseñan desde ahora alrededor de los hechos del negocio | **Elegido** |

Los hechos del negocio alrededor de los cuales se cortan las fronteras:
`propiedad_publicada`, `lead_capturado`, `cita_solicitada`, `pago_posicionamiento_recibido`.
Los agentes son **consumidores** de esos hechos, no código incrustado en las pantallas.

### Diferenciador del producto

La automatización, en tres frentes que el dueño priorizó:

1. El ciclo completo del lead: atender → calificar → agendar.
2. La carga y mantenimiento de publicaciones.
3. La operación interna: moderación, métricas, cobros.

### Descomposición completa

| # | Sub-proyecto | Depende de |
|---|---|---|
| **0** | **Fundación** — este spec | — |
| 1 | Catálogo público + SEO | 0 |
| 2 | Panel del comprador (autenticado, `noindex`) | 0, 1 |
| 3 | Panel del vendedor | 0 |
| 4 | Puente de leads — define el contrato que el agente llenará | 1, 2, 3 |
| 5 | Agente del ciclo de lead | 4 |
| 6 | Publicación asistida por IA | 3 |
| 7 | Super Admin + monetización | todos |

```
0 (nadie avanza sin esto)
   ├─→ 1 (SEO)
   ├─→ 2 (panel comprador)
   └─→ 3 (panel vendedor)
        └─→ 4 (la costura)
             ├─→ 5
             └─→ 6
                  └─→ 7
```

Cada sub-proyecto tiene su propio spec, su propio plan y su propio ciclo de implementación.

---

## 2. Alcance del sub-proyecto 0

### Entra

- Repositorio, configuración de Next.js + Supabase, entornos y CI.
- Esquema de datos núcleo con RLS activo desde la primera tabla.
- Registro con verificación por correo, login, sesiones, guardas de ruta por rol.
- Límite de intentos de login.
- Cabeceras de seguridad HTTP, CORS, protección contra bots.
- Gestión de secretos.
- Seeders de desarrollo y datos de referencia de producción.
- Las tres capas de pruebas, con énfasis en la matriz de RLS.

### No entra

Pantallas del catálogo, filtros de búsqueda, dashboards, subida de imágenes desde la
interfaz, cualquier agente de IA, pasarela de pagos, sitemap y demás artefactos de SEO.
Todo eso pertenece a los sub-proyectos 1 a 7. SP0 crea el *bucket* de Storage y sus
políticas; la interfaz de carga es del SP3.

---

## 3. Stack y estructura

**Next.js 16 (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, Storage).**
Deploy en Vercel. En local, Supabase CLI sobre Docker para Postgres y migraciones versionadas.

Supabase se elige porque RLS —requisito explícito— es nativo de Postgres, y porque su Auth
resuelve el hasheo de contraseñas sin que el equipo escriba esa parte.

```
portal-inmobiliario/
├─ supabase/
│  ├─ migrations/          # SQL versionado — una migración por cambio
│  ├─ seed.sql             # SOLO local/staging
│  └─ config.toml
├─ src/
│  ├─ app/
│  │  ├─ (publico)/        # catálogo, indexable        → SP1
│  │  ├─ (comprador)/      # panel comprador, noindex   → SP2
│  │  ├─ (vendedor)/       # panel vendedor, noindex    → SP3
│  │  ├─ (admin)/          # super admin, noindex       → SP7
│  │  └─ (auth)/           # registro, login, verificar
│  ├─ lib/
│  │  ├─ supabase/         # clientes: browser / server / admin
│  │  ├─ auth/             # guardas de rol
│  │  └─ validacion/       # esquemas Zod compartidos
│  ├─ components/
│  └─ middleware.ts        # sesión + guardas + cabeceras
├─ tests/
└─ .env.example
```

Los paréntesis son *route groups* de Next: organizan carpetas **sin aparecer en la URL**.
Los tres front-ends quedan separados en el código y las URLs siguen limpias, que es un
requisito de SEO del SP1.

---

## 4. Modelo de datos

### Enums

```sql
CREATE TYPE rol_usuario      AS ENUM ('comprador','vendedor','super_admin');
CREATE TYPE tipo_operacion   AS ENUM ('venta','arriendo');
CREATE TYPE tipo_inmueble    AS ENUM ('apartamento','casa','local','lote','oficina');
CREATE TYPE estado_propiedad AS ENUM
  ('borrador','en_revision','publicada','pausada','vendida','rechazada');
```

### Tablas

| Tabla | Propósito | Lectura | Escritura |
|---|---|---|---|
| `perfiles` | Extiende `auth.users`: `rol`, `nombre`, `telefono` | dueño + super_admin | dueño, **excepto `rol`** |
| `barrios` | `nombre`, `slug`, `ciudad` — base de los clusters SEO del SP1 | público | super_admin |
| `propiedades` | Ficha completa, `operacion`, `estado`, `destacada` | público solo si `estado='publicada'`; vendedor las suyas | vendedor dueño |
| `imagenes_propiedad` | `ruta_storage`, `alt_text`, `orden` | igual que su propiedad | vendedor dueño |
| `intentos_login` | Ventana deslizante para el límite de intentos | nadie | solo el servidor |
| `registro_auditoria` | Logs del sistema | **solo super_admin** | solo el servidor |

Campos destacados de `propiedades`: `slug` único (URL limpia), `precio numeric(14,2)`,
`moneda` por defecto `'COP'`, `habitaciones`, `banos`, `area_m2`, `barrio_id`, `direccion`,
`latitud`, `longitud`, `destacada boolean`, `destacada_hasta timestamptz`.

**La dirección exacta no se expone públicamente**: el catálogo público del SP1 mostrará
barrio y ubicación aproximada. La dirección completa se entrega al confirmarse una cita.

### Dos decisiones deliberadas

**`alt_text` es `NOT NULL`.** El requisito de SEO "alt en todas las imágenes" deja de
depender de que alguien se acuerde: la base rechaza la imagen sin alt.

**`destacada` es un booleano manual.** Es el estado "HOT" del SP7. Hasta que exista
pasarela de pagos, el super admin lo activa al recibir el pago por fuera del sistema.

### Cifrado de datos sensibles

El requisito original pide "cifrar los datos sensibles". La decisión tomada, explícita
para que sea decisión y no descuido:

- **SP0 usa**: TLS en tránsito + cifrado en reposo (provisto por Supabase) + RLS estricto.
- **No se cifra el teléfono a nivel de columna.** `pgcrypto` sobre esa columna rompe la
  búsqueda y obliga a gestionar llaves, a cambio de poco cuando RLS ya restringe quién lee
  la fila.
- **Se reserva `pgcrypto`** para el día que se recolecte documento de identidad u otro dato
  de alta sensibilidad.

### Habeas data (Ley 1581 de 2012)

El portal recolecta datos personales de compradores en Colombia. SP0 deja preparado:
`registro_auditoria` para trazabilidad del tratamiento, y el modelo de `perfiles` con
borrado en cascada desde `auth.users`. El ejercicio de derechos por parte del usuario
(consultar, actualizar, suprimir) se implementa en el **SP2**, dentro del panel del
comprador, en vez de como una página legal suelta.

---

## 5. Row-Level Security

RLS se activa en **todas** las tablas del núcleo, en la misma migración que las crea.

### El punto crítico: el rol no es actualizable

RLS filtra **filas, no columnas**. Si el comprador puede actualizar su propio perfil,
puede escribir `rol = 'super_admin'` en esa misma fila que legítimamente le pertenece.
Se defiende en tres capas:

```sql
-- 1. Privilegio a nivel de columna: 'rol' no es actualizable
REVOKE UPDATE ON perfiles FROM authenticated;
GRANT  UPDATE (nombre, telefono) ON perfiles TO authenticated;

-- 2. RLS a nivel de fila
CREATE POLICY perfil_propio ON perfiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 3. Trigger como red de seguridad
CREATE OR REPLACE FUNCTION bloquear_cambio_rol() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'El rol no se modifica desde la aplicación';
  END IF;
  RETURN NEW;
END $$;
```

`super_admin` no se asigna nunca desde la aplicación: solo por SQL directo.

### Políticas por tabla

- `propiedades`: `SELECT` anónimo permitido solo con `estado = 'publicada'`. El vendedor
  ve y modifica únicamente donde `vendedor_id = auth.uid()`. El super_admin, todo.
- `imagenes_propiedad`: hereda la visibilidad de su propiedad.
- `barrios`: `SELECT` público; escritura solo super_admin.
- `registro_auditoria`: `SELECT` solo super_admin; sin `INSERT` para `authenticated`
  (se escribe con `service_role` o desde triggers).
- `intentos_login`: sin acceso para ningún rol de aplicación.

---

## 6. Autenticación

### Registro y la trampa del rol

El formulario pide nombre, correo, teléfono, contraseña y rol (comprador o vendedor).
Los metadatos que el cliente envía en `signUp` **son escribibles por el cliente**: quien
abra las herramientas del navegador puede mandar `rol: 'super_admin'`.

La defensa es no confiar en ese valor. Un trigger lo traduce contra una lista blanca:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rol public.rol_usuario;
BEGIN
  v_rol := CASE NEW.raw_user_meta_data->>'rol_solicitado'
             WHEN 'vendedor' THEN 'vendedor'::public.rol_usuario
             ELSE 'comprador'::public.rol_usuario   -- cualquier otra cosa cae aquí
           END;
  INSERT INTO public.perfiles (id, rol, nombre, telefono)
  VALUES (NEW.id, v_rol,
          NEW.raw_user_meta_data->>'nombre',
          NEW.raw_user_meta_data->>'telefono');
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

`super_admin` no está en el `CASE`: si alguien lo inyecta, sale convertido en comprador.

El `SET search_path = ''` no es decorativo. Sin él, una función `SECURITY DEFINER` es
secuestrable redefiniendo el esquema de búsqueda.

### Verificación por correo

`Confirm email` activado: la cuenta no puede iniciar sesión hasta confirmar. En local los
correos caen en Mailpit (Supabase CLI, puerto 54324), lo que permite pruebas E2E reales.

**Pendiente antes de abrir el registro al público:** el SMTP por defecto de Supabase tiene
límites muy bajos y los correos de verificación se empiezan a caer. Hay que conectar un
proveedor propio (Resend o SendGrid).

### Contraseñas

Supabase Auth las hashea con **bcrypt** internamente. El requisito queda cumplido sin que
nadie del equipo escriba esa parte, que es lo correcto: hashear a mano es de las formas más
frecuentes de romper la seguridad creyendo que se refuerza.

Política: mínimo 12 caracteres + **verificación contra contraseñas filtradas**
(HaveIBeenPwned, incluido en Supabase). Bloquea las contraseñas que realmente se usan en
ataques, que es más útil que exigir símbolos raros.

### Sesiones

Cookies vía `@supabase/ssr`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, refrescadas
en `middleware.ts`.

**`Lax` y no `Strict`, a propósito.** Con `Strict`, el usuario que hace clic en el enlace de
verificación de su correo llega al sitio sin sesión, porque el navegador no manda la cookie
en una navegación entrante. Es un bug que aparece en producción y cuesta días encontrar.

### El rol dentro del token

Un *Custom Access Token Hook* inyecta el rol como claim del JWT, para que el middleware no
consulte `perfiles` en cada petición y para que las políticas RLS puedan leerlo.

**Costo aceptado:** el claim queda congelado hasta que el token se refresque (~1 hora). Si
el super admin degrada a un vendedor, ese vendedor conserva su acceso hasta el refresco.
Mitigación: las acciones administrativas o destructivas revalidan el rol contra la base;
para navegar, el claim basta.

### Guardas de ruta

`middleware.ts` protege `(comprador)`, `(vendedor)` y `(admin)` por rol, y redirige al
usuario no verificado a confirmar su correo.

**Jerarquía explícita: el middleware es conveniencia, RLS es la seguridad.** Si el
middleware tiene un bug, la base sigue negando. Si la protección viviera solo en el
middleware, un `if` mal escrito expondría todo.

### Límite de intentos de login

Supabase no limita intentos por IP. Se implementa con la tabla `intentos_login` y una
ventana deslizante: **5 fallos en 15 minutos sobre la combinación correo + IP**, con espera
progresiva.

Combinada, no por separado: solo por IP se castiga a usuarios legítimos detrás de un NAT
compartido; solo por correo se deja abierto el barrido de cuentas. Cuando el tráfico lo
justifique se migra a Redis (Upstash); al inicio Postgres alcanza y es un proveedor menos.

---

## 7. Seguridad operativa

### Cabeceras HTTP

`Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, y **CSP con nonce
por petición** generado en el middleware (Next inyecta scripts inline; sin nonce, una CSP
estricta rompe la app). La CSP debe contemplar GA4 cuando el SP1 lo integre.

CORS restringido al propio origen — nunca `*`. Turnstile de Cloudflare en registro y login.

### Secretos

| Variable | Dónde vive | Por qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador | pública por diseño |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador | Pública **por diseño**. Solo es segura porque RLS está activo |
| `SUPABASE_SERVICE_ROLE_KEY` | solo servidor | **Salta RLS por completo** |

`lib/supabase/admin.ts` empieza con `import 'server-only'`: si alguien lo importa desde un
componente cliente, el build falla en vez de filtrar la llave.

Como el repositorio es nuevo, "eliminar secretos del historial de Git" es prevención:
`.gitignore` desde el commit inicial y `gitleaks` en pre-commit y en CI.

### Subidas de archivos

SP0 crea el bucket de Storage y sus políticas RLS. Las reglas que el SP3 deberá respetar,
definidas aquí: validar el **tipo real por magic bytes** (no la extensión ni el
`Content-Type` que manda el cliente), imponer tamaño máximo, y re-procesar la imagen con
`sharp` para descartar payloads incrustados.

---

## 8. Manejo de errores

**Nunca devolver el error crudo de Postgres.** Un `duplicate key value violates unique
constraint "perfiles_pkey"` regala los nombres de tablas y restricciones. Al usuario le
llega un mensaje genérico más un id de correlación; el error completo va a
`registro_auditoria`.

**Login: el mismo mensaje siempre** — "Correo o contraseña incorrectos", nunca "ese correo
no está registrado". Distinguirlos convierte el login en un verificador de qué correos
tienen cuenta. Igual en el registro: Supabase por defecto no confirma si un correo ya
existe, y ese comportamiento se deja activo aunque la experiencia sea menos amable.

**Validar en el servidor siempre**, aunque el cliente ya valide. El cliente valida para la
experiencia; el servidor valida porque el cliente es del atacante. Esquemas Zod compartidos
en `lib/validacion/` para escribir la regla una sola vez.

**Escapar el contenido generado.** React escapa por defecto; la regla es
`dangerouslySetInnerHTML` prohibido sin sanitización explícita. Importa especialmente
porque las descripciones de los vendedores (SP3) y las generadas por IA (SP6) son contenido
no confiable renderizado en páginas públicas.

**Inyección SQL:** el cliente de Supabase parametriza solo. El riesgo real vive en funciones
Postgres que armen SQL dinámico con `EXECUTE`; ahí, `format()` con `%I`/`%L`, nunca
concatenación.

---

## 9. Pruebas

### Vitest — lógica pura

Validadores Zod, mapeo de errores, la traducción de rol del trigger, guardas.

### Pruebas de RLS — la red principal

Contra Postgres local, con un cliente autenticado por cada rol. Matriz mínima:

| Caso | Esperado |
|---|---|
| anónimo lee propiedad `publicada` | permitido |
| anónimo lee propiedad en `borrador` | 0 filas |
| vendedor A lee o edita propiedad de vendedor B | 0 filas |
| comprador ejecuta `UPDATE perfiles SET rol='super_admin'` | excepción del trigger |
| comprador lee `registro_auditoria` | 0 filas |
| `signUp` con `rol_solicitado: 'super_admin'` | perfil creado como `comprador` |
| `service_role` lee todas las tablas | permitido |

**Por qué esta matriz es la red principal y no un extra:** RLS mal escrito **no falla
ruidosamente**. No hay pantalla roja. Devuelve cero filas cuando debía devolver datos, o
—el caso caro— devuelve filas de más y nadie se entera hasta que alguien lo publica.

### Playwright — flujo completo

Registro → correo → confirmación → login → acceso a su panel → **rechazo en el panel de
otro rol**. Los correos se leen de Mailpit, así que la prueba abre el enlace de verificación
real en vez de simularlo.

### CI

Cada PR levanta Supabase local, aplica migraciones y corre las tres capas más `gitleaks`.

---

## 10. Datos iniciales

Distinción que evita un error común:

- **Barrios de Barranquilla = datos de referencia** → van en una **migración**. Producción
  también los necesita. Incluye Villa Carolina y El Paraíso.
- **Usuarios de prueba = datos de desarrollo** → van en `seed.sql`, que solo corre en local
  y staging.

### Credenciales de desarrollo

| Rol | Correo | Contraseña |
|---|---|---|
| Super Admin | `admin@portal.com` | `AdminPrueba2026*` |
| Vendedor | `vendedor@portal.com` | `VendedorPrueba2026*` |
| Comprador | `comprador@portal.com` | `CompradorPrueba2026*` |

### Restricción de producción — no negociable

Estas credenciales son adecuadas para desarrollo y quedan tal cual en el seed. Pero el
proyecto es un negocio real, no una entrega académica.

Un super admin con contraseña conocida es control total del portal: publicaciones, datos
personales de compradores, cobros. Esa contraseña ya circuló en texto plano, así que se
trata como pública desde hoy. Si el seed llega a producción **una sola vez**, entra
cualquiera que reconozca el patrón — y `AdminPrueba2026*` es exactamente lo que un escáner
automatizado prueba.

Por lo tanto:

1. Producción recibe **solo migraciones**, nunca `seed.sql`.
2. `seed.sql` abre con un bloque que aborta si detecta un marcador de entorno de producción.
3. El super admin real se crea una vez, a mano, con contraseña generada y guardada en un
   gestor de contraseñas.

---

## 11. Riesgos y puntos abiertos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Seed de desarrollo llega a producción | Compromiso total del portal | Sección 10, tres capas |
| Rol congelado en el JWT hasta el refresco | Acceso residual tras una degradación | Revalidar contra la base en acciones administrativas |
| SMTP por defecto de Supabase | Correos de verificación se caen al crecer | Conectar Resend/SendGrid antes de abrir el registro |
| CSP con nonce rompe scripts de terceros | Páginas rotas al integrar GA4 en SP1 | Definir la CSP contemplando GA4 desde SP0 |
| **Arranque en frío del marketplace** | Un portal sin propiedades no sirve, por bien construido que esté | Fuera del alcance técnico: hay que asegurar las primeras ~20 propiedades reales antes del lanzamiento |
| **Fotos de propiedades en borrador accesibles por enlace directo** | Un vendedor sube fotos y deja la propiedad sin publicar; los archivos siguen descargables para quien tenga la ruta exacta | **Decisión aplazada al SP3 por el dueño del proyecto.** Cerrado en SP0 lo que sí se podía cerrar: el bucket ya no se puede enumerar (`storage_propiedades_lectura` restringida al dueño, `anon` retirado). Lo que queda abierto es que un bucket con `public = true` se sirve por `/object/public/` saltándose RLS, así que ninguna política lo evita — requiere bucket privado con URLs firmadas o mover los archivos al publicar, y ambas opciones cambian el flujo de subida del SP3 y el renderizado del catálogo del SP1. **Retomar al diseñar el SP3** |

---

## 12. Criterios de aceptación

SP0 está terminado cuando:

1. `supabase db reset` en local levanta el esquema completo con RLS activo en todas las tablas.
2. Los tres usuarios de prueba existen y pueden iniciar sesión en local.
3. La matriz completa de pruebas de RLS pasa.
4. La prueba E2E de registro → verificación por correo → login pasa leyendo el correo real de Mailpit.
5. Un usuario autenticado no puede modificar su propio `rol` por ninguna vía.
6. Un intento de `signUp` con `rol_solicitado: 'super_admin'` produce un perfil `comprador`.
7. El sexto intento fallido de login en 15 minutos es rechazado.
8. Las cabeceras de seguridad están presentes en la respuesta y la CSP no rompe la aplicación.
9. `gitleaks` pasa en CI y `SUPABASE_SERVICE_ROLE_KEY` no es importable desde código cliente.
10. Los barrios de Barranquilla están disponibles vía migración, no vía seed.
