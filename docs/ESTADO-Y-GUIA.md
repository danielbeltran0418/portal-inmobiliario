# Portal inmobiliario — estado del proyecto y guía para el equipo

Fecha: 2026-09-08 · Rama `main`, 90 commits · Barranquilla, Colombia

Este documento sirve para dos cosas: saber **qué hay construido y qué falta**, y **poder empezar
a trabajar hoy** sin haber estado en las conversaciones anteriores.

---

# Parte 1 · Qué es el proyecto

Portal inmobiliario de venta y arriendo. El diferenciador no es el catálogo —eso lo tiene
cualquiera— sino la **automatización**: el ciclo completo del lead (atender → calificar →
agendar), la carga y el mantenimiento de las publicaciones, y la operación interna.

El sistema se cortó en ocho sub-proyectos alrededor de **cuatro hechos de negocio**. Ese corte
es la decisión de arquitectura más importante del proyecto:

| Hecho | Lo produce | Lo consume |
|---|---|---|
| `propiedad_publicada` | SP3 ✅ | SP1, SP6, SP7 |
| `lead_capturado` | SP4 | SP5, SP6, SP7 |
| `cita_solicitada` | SP5 | SP6, SP7 |
| `pago_posicionamiento_recibido` | SP7 | SP1 |

**Regla de diseño que se hereda:** si al construir un sub-proyecto hace falta modificar uno
anterior para que la IA se entere de algo, la costura se cortó mal.

---

# Parte 2 · Qué está hecho

## Sub-proyectos completados

| | Qué es | Estado |
|---|---|---|
| **SP0** | Fundación: auth, roles, RLS, seguridad | ✅ Mergeado |
| **SP0.5** | Landing, cabecera, cerrar sesión | ✅ Mergeado |
| **SP3** | Panel del vendedor | ✅ Mergeado |
| **SP1** | Catálogo público y SEO | 📋 **Spec escrito, sin plan ni código** |
| SP2, SP4, SP5, SP6, SP7 | Comprador, leads, citas, IA, admin | ⬜ Sin empezar |

## Lo que un usuario puede hacer hoy

**Como visitante:** ver la landing, registrarse como comprador o vendedor, verificar su correo
y entrar.

**Como vendedor:** crear un borrador escribiendo solo el título, completarlo cuando pueda,
subir y ordenar fotos, publicar, pausar, marcar vendida y eliminar. El panel le dice de cada
propiedad qué le falta para poder publicarse.

**Lo que todavía no existe:** el catálogo público. Las propiedades se publican pero **nadie
puede verlas** — eso es SP1, y por eso es lo siguiente.

## Rutas construidas

```
/                          landing (pública)
/registro  /login          alta y acceso
/verificar-correo          instrucciones tras registrarse
/confirmar                 destino del enlace del correo
/panel                     listado del vendedor          🔒 vendedor
/panel/propiedades/nueva   alta de propiedad             🔒 vendedor
/panel/propiedades/[id]    edición, fotos y estados      🔒 vendedor
/mi-cuenta                 marcador de posición          🔒 comprador  (SP2)
/control                   marcador de posición          🔒 super admin (SP7)
```

## Base de datos

**27 migraciones.** Nunca se edita una ya aplicada: toda corrección va en una nueva.

Tablas: `perfiles`, `barrios`, `propiedades`, `imagenes_propiedad`, `registro_auditoria`,
`intentos_login`, `limpieza_almacenamiento`.

**Cinco invariantes viven en la base, no en el formulario**, porque PostgREST está expuesto y un
`PATCH` directo se saltaría cualquier validación de la aplicación:

1. Una propiedad publicada necesita **al menos una imagen**.
2. Una propiedad publicada necesita **precio**, y no se le puede vaciar después.
3. Un vendedor solo ve y toca **lo suyo** (RLS).
4. Nadie puede cambiarse el **rol** a sí mismo (tres capas: privilegio de columna, política y trigger).
5. Dos imágenes de una propiedad **no pueden compartir orden** (`UNIQUE` diferido).

## Pruebas

**267 unitarias · 121 de RLS · 13 E2E.** Todas verdes.

Dos disciplinas que costaron caro aprender y que **no son negociables**:

**1. Toda prueba que afirme una denegación debe demostrar por qué se deniega.**
`expect(error).not.toBeNull()` no basta: hay que asertar el código (`42501`, `23514`). Cero
filas no basta: hay que fijar el caso positivo en la misma prueba. Y encadenar `.select()` en
los `UPDATE`, porque uno que no afecta filas **devuelve `error` nulo**.

**2. Todo control de seguridad necesita ciclo de falsificación.** Aplicar, probar verde, romper
a propósito, comprobar que la prueba falla, revertir. Sin eso no está verificado — está escrito.

> En este proyecto hubo **siete pruebas que pasaban por el motivo equivocado**. Una afirmaba una
> denegación contra una tabla que no existía. Otra habría seguido verde aunque se borrara entera
> la guarda que protege el riesgo número uno del proyecto. La falsificación no es ceremonia.

---

# Parte 3 · Qué falta, con prioridad

## Bloqueantes para producción

**1. El captcha está apagado.** Necesita claves de Cloudflare. Mientras tanto **el registro no
tiene límite de intentos propio** —el existente solo cubre el login—, así que no hay nada contra
el alta masiva de cuentas. Es lo más urgente antes de exponer esto a internet.

**2. El CI de GitHub no funciona.** Los jobs mueren en 3 segundos sin que se les asigne runner,
también con un workflow trivial. Descartado: YAML, BOM, finales de línea, Actions deshabilitado,
y facturación (0 de 2000 minutos usados). Pendiente de soporte de GitHub. **Toda la verificación
es local.**

**3. Las credenciales de desarrollo están en el historial público.** El repositorio es público y
`supabase/seed.sql` y el README las contienen. Son de una instancia local que nunca llega a
producción, pero conviene decidir si se rotan.

## Deuda técnica con ticket propio

| Qué | Por qué importa |
|---|---|
| Una propiedad publicada **puede quedarse sin fotos** | Borrando sus filas hijas, que no disparan el trigger del padre. Cerrarlo obliga a reescribir fixtures que **dependen del agujero** |
| `cerrarSesion()` usa ámbito **global** | Cierra sesión en todos los dispositivos. Viene de SP0.5 y no parece decisión deliberada |
| Higiene del drenado de la cola de limpieza | `intentos` nunca se incrementa; una ruta ya ausente no se marca como saldada |
| Mensaje de error al vaciar el precio de una publicada | Sale el genérico. Reutilizar el mapeo existente no vale: ese texto habla de *publicar* y de *fotos* |

## Ocho menores triadas

Ninguna bloquea. Las dos de mejor relación valor/esfuerzo: **añadir a la prueba de EXIF las
aserciones de ICC, XMP e IPTC** (tres líneas, fija para siempre un control de privacidad), y
**que `sesionVendedor()` limpie el usuario que crea** (hoy cada corrida deja uno huérfano).

---

# Parte 4 · Cómo empezar a trabajar

## Requisitos

Node 20 o superior, Docker Desktop corriendo, y Git.

## Puesta en marcha

```bash
git clone https://github.com/danielbeltran0418/portal-inmobiliario.git
cd portal-inmobiliario
npm install
npx supabase start          # tarda unos minutos la primera vez
npx supabase status -o env  # copia estas variables a .env.local
npx supabase db reset       # aplica las 27 migraciones y el seed
npm run dev                 # http://localhost:3000
```

Los correos de verificación **no salen a internet**: se ven en Mailpit, en
`http://127.0.0.1:54324`.

Credenciales de desarrollo (solo local, nunca en producción): `admin@portal.com`,
`vendedor@portal.com`, `comprador@portal.com`. Las contraseñas están en el README.

## Comandos

```bash
npm run test:unit         # 267 pruebas
npm run test:rls          # 121 pruebas, necesita la pila de Supabase arriba
npm run test:e2e          # 13 pruebas de navegador
npm run build             # compila
npm run verificar:render  # guard: falla si alguna página queda prerenderizada
npm run lint
npx tsc --noEmit
```

## Trampas del entorno, comprobadas

Estas cuestan horas si no se saben:

- **En Windows, `npx vitest` por Bash puede devolver JSON mal interpretado que oculta el error
  real.** Usar PowerShell para vitest, Playwright y Supabase.
- **`psql` no está en el PATH.** Usar
  `docker exec supabase_db_portal-inmobiliario psql -U postgres -d postgres -c "..."`.
- **Los heredocs se rompen por CRLF.** Crear ficheros con el editor, no con `cat <<EOF`.
- Las capturas del navegador salen en negro en algunos entornos: verificar leyendo el DOM.

---

# Parte 5 · Trampas del código que muerden

Cinco cosas que ya causaron fallos reales. Léelas antes de tocar nada.

### 1. «RLS ya filtra por dueño» es FALSO para `propiedades`

La tabla tiene **dos políticas `SELECT` permisivas** para usuarios autenticados —
`vendedor_id = auth.uid()` **y** `estado = 'publicada'` — y **Postgres las combina con `OR`**.

Sin un filtro explícito, el panel de un vendedor lista sus propiedades **más todas las
publicadas de todos los demás**. Costó un hallazgo bloqueante, y el bug se vio en pantalla
durante el desarrollo sin que nadie lo reconociera como fallo.

`UPDATE` y `DELETE` sí tienen política única, así que la **escritura** está protegida. La
asimetría explica por qué aquello era un fallo de visibilidad y no de integridad.

### 2. El nonce de la CSP obliga a renderizar dinámicamente

`app-render` es el único punto que inyecta el nonce, y solo corre en la petición. Una página
prerenderizada en el build **no puede llevarlo**, y con `strict-dynamic` sus scripts quedan
bloqueados. Por eso el layout raíz declara `force-dynamic`, y por eso existe el guard de CI.

**Un segmento hijo puede pisar esa configuración** (Next resuelve con el último que la declare).
Si alguien marca el catálogo como estático, sus scripts salen sin nonce y la página no hidrata.
El guard es la red.

### 3. El bucket de Storage es privado

Toda imagen se sirve con **URL firmada** emitida en el servidor. **Nunca construir una URL
pública.** Cerrarlo fue el trabajo de una tarea entera: antes, las fotos de propiedades en
borrador eran descargables por enlace directo.

### 4. Un `UPDATE` de PostgREST que no afecta filas devuelve `error` **nulo**

Es la forma en que RLS deniega: filtrando filas, no lanzando error. Hay que encadenar
`.select()` y comprobar que volvieron cero filas. Si no, se le dice «guardado» a alguien que no
guardó nada.

### 5. Postgres concede `EXECUTE` a `PUBLIC` por defecto

En toda función nueva. `REVOKE ... FROM anon, authenticated` **no quita** lo heredado vía
`PUBLIC`. Hay que nombrar `PUBLIC` y la firma exacta. Ese error dejó dos funciones
`SECURITY DEFINER` invocables sin autenticar, con bypass total del límite de intentos.

---

# Parte 6 · Cómo se trabaja aquí

El método que produjo lo que hay, y que conviene mantener:

```
brainstorming → spec → plan → implementación por tareas
              → revisión independiente por tarea → revisión final de rama
              → una única ola de correcciones → merge
```

**Lo que hace que funcione**: quien revisa **no es** quien escribió el plan, y se le pide
*comprobar*, no confiar. De los hallazgos que importaron en el último sub-proyecto, la mayoría
fueron defectos **del plan**, no del código: supuestos falsos que se propagaron hasta la
pantalla.

Y el hallazgo más instructivo de todos solo apareció en la revisión de rama completa: **el
listado no enlazaba a las propiedades**. Una tarea construyó la lista, otra la pantalla de
detalle, ambas pasaron su revisión, y una propiedad solo era editable durante la visita que la
creó. Ninguna revisión por tarea podía verlo, porque cada una miraba su propio diff.

## Cómo repartir el trabajo entre varias personas

Los sub-proyectos **no son igual de paralelizables**. El camino crítico es
**SP3 → SP4 → SP5 → SP6**, y SP3 ya está.

**Se pueden hacer a la vez**, porque tocan superficies distintas:

- **SP1 (catálogo público)** — ya tiene spec. Toca rutas públicas, CSP y SEO.
- **SP2 (panel del comprador)** — favoritos y derechos sobre datos personales.
- **SP4 (leads)** — depende de que exista la ficha pública de SP1 para el formulario, pero el
  modelo de datos y la bandeja del vendedor se pueden diseñar en paralelo.

**Lo que conviene que haga una sola persona**: cualquier cambio en `src/lib/seguridad/` (la CSP),
en `src/middleware.ts` o en las políticas RLS. Son transversales, y dos personas tocándolos a la
vez se pisan de formas que las pruebas no siempre detectan.

**Regla de oro para las migraciones**: nunca editar una ya aplicada. Si dos personas crean
migraciones el mismo día, coordinar la marca de tiempo para que el orden sea el que se espera.

---

# Parte 7 · El siguiente paso concreto

**SP1, el catálogo público.** Tiene spec escrito y aprobado:
`docs/superpowers/specs/2026-09-08-portal-inmobiliario-sp1-design.md`

Cuatro decisiones ya tomadas:

1. **CSP por ruta** — las públicas sin nonce, cacheables; las privadas con nonce.
2. **Filtros básicos en la URL** — barrio, operación, tipo y rango de precio.
3. **Ruta `/imagen/<id>` que redirige** a la URL firmada, para que la página cacheada guarde un
   enlace estable. **Debe comprobar que la propiedad está publicada antes de firmar**, o sería
   una vía para descargar fotos de borradores.
4. **El barrio en la ruta**: `/alto-prado/casa-en-el-prado-a7f3`.

Lo que falta: escribir el plan de implementación por tareas y ejecutarlo.

**Y una advertencia**: el guard de CI hay que **invertirlo**, no desactivarlo. Hoy falla si
aparece cualquier HTML prerenderizado; con la CSP por ruta eso pasa a ser correcto para las
públicas. Tiene que exigir que **las públicas estén prerenderizadas y las privadas no**. Un
guard que solo prohíbe es más débil que uno que además exige — y si empieza a fallar por el
diseño bueno, alguien lo desactivará.

---

## Dónde está el registro completo

`.superpowers/sdd/` guarda la bitácora de cada sub-proyecto: qué se hizo, qué encontró cada
revisión, cada ciclo de falsificación y cada decisión adjudicada, incluidos los errores.

No es documentación de cortesía: es donde está escrito **por qué** el código es como es, y qué
se probó antes de descartarlo.
