# Guía para continuar sin mí

Fecha: 2026-09-01. Escrita para que puedas seguir tú o con otra sesión sin perder contexto.

---

## 1. Dónde está todo

| Qué | Dónde |
|---|---|
| **Código** | `C:\Users\eduar\Downloads\portal-inmobiliario` |
| **Repo remoto** | https://github.com/danielbeltran0418/portal-inmobiliario (**público**) |
| **PR abierto** | [#1](https://github.com/danielbeltran0418/portal-inmobiliario/pull/1) · `correcciones-sp0` → `main` |
| **Specs y planes** | `C:\Users\eduar\Downloads\Nueva carpeta\docs\superpowers\` |
| **Bitácora del trabajo** | `...\Nueva carpeta\.superpowers\sdd\2026-08-27-portal-inmobiliario-sp0\progress.md` |

`progress.md` es el mapa de recuperación: tiene cada commit, cada decisión y cada error
cometido, en orden. Si retomas con otra sesión de Claude, **haz que lea ese archivo primero**.

Documentos clave, en orden de lectura:

1. `specs/2026-08-31-portal-inmobiliario-descomposicion.md` — el mapa SP0→SP7
2. `specs/2026-08-27-portal-inmobiliario-sp0-design.md` — el spec de SP0 (§12 = criterios)
3. `.superpowers/sdd/.../segunda-pasada-brief.md` — **el próximo trabajo, ya escrito**

---

## 2. Estado exacto ahora

**SP0 está construido, revisado y aprobado para merge.** 9 de 10 criterios de aceptación
cumplidos, 0 hallazgos críticos. Las tres suites pasan en local: **69 unitarias, 54 de RLS,
6 E2E**, más `build`, `eslint` y `tsc` limpios. Un revisor independiente lo reprodujo todo y
falsificó por su cuenta los controles de seguridad.

**El criterio 9 sigue abierto** (que `gitleaks` pase en CI) y no por culpa del código.

---

## 3. Lo primero: el CI está roto del lado de GitHub

Los workflows **no arrancan**. Lo que ya descarté, para que no lo repitas:

- No es el YAML: parsea correctamente.
- No es un BOM: los primeros bytes son `6e 61 6d 65`, no `EF BB BF`.
- No son los finales de línea: el blob commiteado está en LF.
- No es que Actions esté deshabilitado: la API dice `enabled: true`.
- **No es nuestro workflow**: un workflow de 10 líneas que solo hace `echo hola` falló igual.
- No era solo el repo privado: al hacerlo público el run ya apunta a `ci.yml` en vez de
  `BuildFailed`, o sea que **eso sí mejoró**, pero ahora el job muere en 3 segundos sin que
  se le asigne runner (`runner_name: ""`, sin logs, sin pasos). Reintentado dos veces.

**Qué mirar tú, en este orden:**

1. **github.com/settings/billing** → límite de gasto de Actions. Si está en cero o los
   minutos están agotados, súbelo. En repos públicos no debería consumir minutos, pero un
   límite bloqueado puede seguir frenando la asignación.
2. **github.com/settings/actions** → que no haya restricciones a nivel de cuenta.
3. Si tu cuenta es nueva o ha estado inactiva, GitHub a veces restringe Actions hasta
   verificar. Si nada de lo anterior lo explica, **abre un ticket en support.github.com**
   pegando este dato: *los jobs terminan en 3 segundos con `runner_name` vacío y sin logs,
   también con un workflow trivial en repo público*. Es el síntoma exacto que necesitan.

**Mientras tanto no estás bloqueado.** La verificación local es la que ha sostenido todo el
proyecto. Antes de dar por bueno cualquier cambio:

```bash
npx supabase db reset && npm run test:unit && npm run test:rls && npm run test:e2e && npm run build
```

Lo único que no puedes comprobar en local es `gitleaks`. Si quieres cerrarlo sin CI,
instálalo y córrelo a mano:

```bash
gitleaks detect --source . --config .gitleaks.toml --verbose
```

---

## 4. Decisiones que solo puedes tomar tú

**Rotar las credenciales del seed.** El repo es público y las tres contraseñas están en el
historial (`README.md` y `supabase/seed.sql`), así que borrarlas en un commit nuevo **no las
quita**. Son de una instancia local `127.0.0.1` que nunca llega a producción y la guarda que
lo impide está probada ejecutándola, así que el riesgo real es bajo — pero si te incomoda, la
única solución de verdad es reescribir el historial y forzar el push, y eso obliga a rehacer
el PR. Decide y sigue; no lo dejes en el aire.

**Mergear el PR #1 o no.** Está aprobado. El criterio 9 se cierra cuando el CI funcione, no
antes. Yo lo mergearía.

**SP4 y SP5.** En el mapa de descomposición son reconstrucción mía, no estaban escritos en
ningún documento. Si tu idea era otra (por ejemplo leads y citas juntos), corrígelo **antes**
de escribir el spec de SP3, porque se escribe encima de ese mapa.

---

## 5. La secuencia de trabajo

### Paso 1 · Mergear el PR #1

```bash
gh pr merge 1 --squash --delete-branch
```

(o desde la web). Después, en local: `git checkout main && git pull`.

### Paso 2 · Segunda pasada de SP0 — **el brief ya está escrito**

`.superpowers\sdd\2026-08-27-portal-inmobiliario-sp0\segunda-pasada-brief.md`

Nueve puntos, en este orden de prioridad:

| | Qué | Por qué importa |
|---|---|---|
| **S1** | Guard en CI que falle si el build prerenderiza alguna página | **Máxima prioridad, antes de que empiece SP1.** Sin esto, cualquier segmento futuro pisa el `force-dynamic` del layout raíz y el catálogo público no hidrata en producción sin que ninguna prueba lo note |
| **S2** | Quitar a `anon` los `INSERT/UPDATE/DELETE/TRUNCATE` sobre las seis tablas | `TRUNCATE` queda fuera del alcance de RLS por diseño: ahí no hay segunda capa |
| **I3** | La IP del limitador viene del cliente (`x-forwarded-for`) | Falsificable: rota la IP y el límite deja de existir |
| **I6** | `minimum_password_length = 6` contra los 12 del spec | GoTrue acepta 6 aunque el formulario pida 12 |
| **I7** | `imagenes_propiedad` sin política de super_admin | Hoy el administrador no puede moderar imágenes |
| **I5** | Nadie escribe en `registro_auditoria` | Tabla de auditoría vacía = falsa sensación de trazabilidad |
| **I4** | No hay captcha (Turnstile) | Necesita cuenta de Cloudflare; el brief plantea las dos salidas |
| **S5** | Menores: README:126-127, boilerplate de `layout.tsx` | Cosméticos |

### Paso 3 · SP0.5, el remate para que la app sea recorrible

No es un sub-proyecto, es pequeño: landing en `/` (hoy es el boilerplate de Next),
**cerrar sesión** (`signOut` no existe en el código: entras y no puedes salir), header común
y metadata por página.

### Paso 4 · SP3, el panel del vendedor

Es el siguiente sub-proyecto recomendado: el único que **genera datos**, y por eso desbloquea
a todos los demás. Necesita spec y plan propios, igual que SP0.

**Su primera decisión, antes de escribir una línea:** las fotos de propiedades en borrador
accesibles por enlace directo. Un bucket con `public = true` se sirve saltándose RLS, así que
ninguna política lo evita. Las dos salidas —bucket privado con URLs firmadas, o mover
archivos al publicar— cambian el flujo de subida de SP3 **y** el renderizado de SP1. Cuanto
más tarde se decida, más se rehace.

---

## 6. Si retomas con otra sesión de Claude

Dale este arranque:

> Lee `C:\Users\eduar\Downloads\Nueva carpeta\.superpowers\sdd\2026-08-27-portal-inmobiliario-sp0\progress.md`
> y `docs\superpowers\GUIA-CONTINUAR.md`. El código está en
> `C:\Users\eduar\Downloads\portal-inmobiliario`. Continúa por [el paso que toque].

Para la segunda pasada, además: *«usa el brief `segunda-pasada-brief.md`, despacha un solo
agente con la lista completa, y después una única re-revisión acotada»*.

---

## 7. Las dos disciplinas que no se pueden perder

Esto es lo que más caro costó aprender en SP0. En esta rama hubo **siete** pruebas que
pasaban por el motivo equivocado — una de ellas afirmaba una denegación contra una tabla que
no existía, y otra habría seguido verde aunque se borrara entera la guarda que protege el
riesgo número uno del proyecto.

1. **Toda prueba que afirme una denegación debe demostrar *por qué* se deniega.**
   `expect(error).not.toBeNull()` no basta: asertar el código (`42501`, `23502`, `23514`).
   Cero filas no basta: fijar además el caso positivo en la misma prueba. Y encadenar
   `.select()` en los `UPDATE`, porque uno que no afecta filas **devuelve `error` nulo**.

2. **Todo control de seguridad necesita ciclo de falsificación.** Aplicar el arreglo, probar
   verde, **romperlo a propósito**, comprobar que la prueba falla, revertir, probar verde.
   Sin eso no está verificado — está escrito.

Y una regla de arquitectura, del mapa de descomposición: **si al diseñar un sub-proyecto hace
falta modificar uno anterior para que la IA se entere de algo, la costura se cortó mal.**

---

## 8. Chuleta

```bash
# Levantar todo
npx supabase start
npm run dev                    # http://localhost:3000
                               # correos en http://127.0.0.1:54324 (Mailpit)

# Variables de entorno (genera .env.local)
npx supabase status -o env

# Verificación completa
npx supabase db reset
npm run test:unit && npm run test:rls && npm run test:e2e && npm run build
```

**Rutas:** `/registro` · `/login` · `/panel` (vendedor) · `/mi-cuenta` (comprador) ·
`/control` (super admin). Las tres últimas redirigen a login sin sesión.

**Credenciales de desarrollo** (en `supabase/seed.sql`, nunca en producción):
`admin@portal.com` · `vendedor@portal.com` · `comprador@portal.com`, contraseñas en el README.

**Nunca:** editar una migración ya aplicada (siempre una nueva), commitear `.env.local`,
ejecutar `seed.sql` en producción.
