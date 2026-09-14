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
| `lead_capturado` | SP4 ✅ | SP5, SP6, SP7 |
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
| **SP4** | Leads: formulario, bandeja del vendedor, ocultamiento por RLS | ✅ Construido (rama `sp4-leads`) |
| **SP1** | Catálogo público y SEO | 📋 **Spec escrito, sin plan ni código** |
| SP2, SP5, SP6, SP7 | Comprador, citas, IA, admin | ⬜ Sin empezar |

## Lo que un usuario puede hacer hoy

**Como visitante:** ver la landing, registrarse como comprador o vendedor, verificar su correo
y entrar.

**Como vendedor:** crear un borrador escribiendo solo el título, completarlo cuando pueda,
subir y ordenar fotos, publicar, pausar, marcar vendida y eliminar. El panel le dice de cada
propiedad qué le falta para poder publicarse. Y en `/panel/leads`, ver los mensajes que dejan
los compradores sobre sus propiedades **sin su contacto**, y aceptar o descartar cada uno.

**Como comprador con cuenta:** abrir una ficha publicada y enviar un lead (nombre, teléfono,
mensaje) al vendedor. Un único envío por propiedad; el contacto solo lo ve el vendedor si acepta.

**Nota histórica de esta sección:** cuando se escribió esta parte del documento, el catálogo
público (SP1) todavía no tenía plan ni código. Ya lo tiene — la ficha pública en
`/<barrio>/<slug>` es justo lo que consume el formulario de lead de SP4 — pero el resto de esta
Parte 2 no se reescribió para reflejarlo. No lo arregla esta tarea (SP4); qué tan al día está el
estado de SP1 y SP2 en este documento queda pendiente de una revisión aparte.

## Rutas construidas

```
/                          landing (pública)
/registro  /login          alta y acceso
/verificar-correo          instrucciones tras registrarse
/confirmar                 destino del enlace del correo
/panel                     listado del vendedor          🔒 vendedor
/panel/propiedades/nueva   alta de propiedad             🔒 vendedor
/panel/propiedades/[id]    edición, fotos y estados      🔒 vendedor
/panel/leads               bandeja de leads, sin contacto 🔒 vendedor    (SP4)
/mi-cuenta                 marcador de posición          🔒 comprador  (SP2)
/control                   marcador de posición          🔒 super admin (SP7)
```

## Base de datos

**36 migraciones.** Nunca se edita una ya aplicada: toda corrección va en una nueva.

Tablas: `perfiles`, `barrios`, `propiedades`, `imagenes_propiedad`, `registro_auditoria`,
`intentos_accion` (antes `intentos_login`: SP4 la generalizó para cubrir también el límite de
registro), `limpieza_almacenamiento`, `leads`, `leads_contacto` (SP4).

**Seis invariantes viven en la base, no en el formulario**, porque PostgREST está expuesto y un
`PATCH` directo se saltaría cualquier validación de la aplicación:

1. Una propiedad publicada necesita **al menos una imagen**.
2. Una propiedad publicada necesita **precio**, y no se le puede vaciar después.
3. Un vendedor solo ve y toca **lo suyo** (RLS).
4. Nadie puede cambiarse el **rol** a sí mismo (tres capas: privilegio de columna, política y trigger).
5. Dos imágenes de una propiedad **no pueden compartir orden** (`UNIQUE` diferido).
6. La dirección exacta y las coordenadas de una propiedad viven en `propiedades_ubicacion`
   (20260914000100), no en `propiedades`, y solo son visibles para el dueño y el
   `super_admin` (RLS por fila). `authenticated` conserva el SELECT de tabla completa sobre
   `propiedades` (ver la trampa 1 más abajo): ninguna columna privada nueva puede añadirse ahí,
   tiene que ir en una tabla aparte con su propia RLS, el mismo patrón que `leads_contacto`.

## `lead_capturado`, para quien construya SP6

El hecho de negocio `lead_capturado` (tabla de la Parte 1) **no es un evento que haya que
suscribir ni una cola que drenar**: es observable directamente como fila. Todo lead nuevo entra
en `leads` con `estado = 'nuevo'`, y la tabla tiene un índice parcial ya construido para leerlos
así: `leads_nuevos_idx` sobre `leads (creado_en) WHERE estado = 'nuevo'`.

SP6 puede consultar esa fila —o cambiar el estado del lead cuando lo procese— **sin tocar nada de
SP4**: el modelo de datos, la RLS y el índice ya están puestos. `leads_contacto` (correo y
teléfono del comprador) solo se hace visible al vendedor cuando el lead pasa a `'aceptado'`
(RLS, no la interfaz); un consumidor con `service_role` la ve siempre, como cualquier lectura
administrativa.

## Pruebas

**381 unitarias · 155 de RLS · 16 E2E.** Todas verdes (medido en `fix/ubicacion-privada` tras
cerrar los hallazgos de su ronda de corrección, con `npx supabase db reset` antes de cada
corrida).

La suite E2E completa (`npm run test:e2e`) se corrió tres veces seguidas para esta medición
—una corrida verde no descarta una carrera— y las tres dieron 16/16. La causa de fondo de por qué
esto puede fallar sin ser un bug de producto está documentada en la Parte 4, en las trampas del
entorno.

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

**1. El captcha está apagado.** Necesita claves de Cloudflare. SP4 le puso un límite propio al
registro (máximo tres altas por hora y por IP, ver la Parte 2), pero eso es un techo, no un
sustituto: sigue sin haber nada que distinga a una persona de un script por debajo de ese número.
Es lo más urgente antes de exponer esto a internet.

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
npx supabase db reset       # aplica las 36 migraciones y el seed
npm run dev                 # http://localhost:3000
```

Los correos de verificación **no salen a internet**: se ven en Mailpit, en
`http://127.0.0.1:54324`.

Credenciales de desarrollo (solo local, nunca en producción): `admin@portal.com`,
`vendedor@portal.com`, `comprador@portal.com`. Las contraseñas están en el README.

## Comandos

```bash
npm run test:unit         # 381 pruebas
npm run test:rls          # 155 pruebas, necesita la pila de Supabase arriba
npm run test:e2e          # 16 pruebas de navegador
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
- **Correr `npm run test:e2e` varias veces seguidas sin `db reset` de por medio puede tumbar la
  propia prueba de registro.** El límite de registro por IP (SP4) cuenta altas exitosas por hora,
  y en desarrollo `ipDeConfianza()` devuelve siempre `127.0.0.1` — todas las corridas comparten la
  misma IP. Al cuarto registro real acumulado (de cualquier corrida anterior, no solo de la
  actual) el quinto sale bloqueado con "Se han creado demasiadas cuentas desde esta conexión", y
  `registro-y-guardas.spec.ts` falla por una razón que no tiene nada que ver con lo que esa prueba
  quiere comprobar. No es un bug: es el límite haciendo exactamente lo que tiene que hacer. Si vas
  a repetir la suite E2E completa varias veces, resetea la base entre corridas (o entre grupos de
  tres) para no gastar el cupo.
- **Un login por server action (`useActionState`) no navega al hacer click: el `click()` de
  Playwright vuelve antes de que el `redirect()` del servidor se resuelva en el cliente.** Si
  después del click se navega directo a otra ruta sin esperar a que la URL deje de ser `/login`,
  esa navegación puede adelantarse a la cookie de sesión y el guardián de ruta manda de vuelta al
  login -- la prueba falla mucho después, en un `getByText` que no encuentra nada, y el rastro
  hasta la causa real no es obvio. `tests/e2e/leads.spec.ts` espera explícitamente
  `page.waitForURL((url) => url.pathname !== '/login')` antes de seguir; `entrar()` en
  `ayudantes-sesion.ts` lo consigue por otra vía, encadenando siempre un `toHaveURL` justo después
  del click.

---

# Parte 5 · Trampas del código que muerden

Siete cosas que ya causaron fallos reales. Léelas antes de tocar nada.

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

### 5. El HTML servido puede llevar un dato que la pantalla no muestra

Al falsificar `contacto_lectura_vendedor` para la Task 9 de SP4 —quitando
`AND l.estado <> 'nuevo'` de
`supabase/migrations/20260911000300_leads.sql:107-114`— el correo del comprador
apareció incrustado en el payload RSC que Next serializa dentro de un
`<script>` del HTML servido. **La pantalla se veía exactamente igual, con o sin
esa cláusula**: la lista de leads no pintaba el correo en ningún caso, porque
nada en la interfaz lo mostraba todavía. El dato ya había viajado hasta el
navegador; solo no se estaba dibujando.

Una aserción de visibilidad (`toBeVisible`) habría pasado en verde con la fuga
intacta. Por eso `tests/e2e/leads.spec.ts` comprueba `page.content()` —el HTML
tal como el servidor lo mandó— y no lo que se ve en pantalla. Es la misma
lección que la trampa anterior sobre el `UPDATE` de PostgREST: hay que
comprobar lo que de verdad ocurrió (la fila que cambió, el HTML que se sirvió),
no la señal que parece indicarlo (el mensaje de éxito, el layout visual).

### 6. Postgres concede `EXECUTE` a `PUBLIC` por defecto

En toda función nueva. `REVOKE ... FROM anon, authenticated` **no quita** lo heredado vía
`PUBLIC`. Hay que nombrar `PUBLIC` y la firma exacta. Ese error dejó dos funciones
`SECURITY DEFINER` invocables sin autenticar, con bypass total del límite de intentos.

### 7. `pg_default_acl` concede CRUD completo a `authenticated` en toda tabla nueva

La hermana de la trampa anterior, y la misma familia de error: Postgres concede
algo que nadie pidió, esta vez sobre tablas y no sobre funciones. Supabase trae
de fábrica un `ALTER DEFAULT PRIVILEGES` que da a `authenticated` los siete
privilegios de escritura —`arwdDxtm`: INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
REFERENCES, TRIGGER, MAINTAIN— sobre **toda tabla que se cree**, sin que nadie
lo pida. **RLS no cambia nada de esto**: son dos capas distintas, y una tabla
con RLS activada pero sin `REVOKE` explícito nace escribible por cualquier
usuario autenticado de todas formas.

Verificado contra `pg_default_acl` antes de escribir `leads`/`leads_contacto`
(`supabase/migrations/20260911000300_leads.sql:56-80`): sin el
`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ...
FROM authenticated` de esa migración, las dos tablas habrían nacido con CRUD
completo para cualquier autenticado, tuvieran política de RLS o no. El mismo
hallazgo, con la misma cita de `pg_default_acl`, se repite en
`20260831000700_escritores_auditoria.sql` y
`20260904000400_limpieza_almacenamiento.sql` — no es un incidente aislado de
SP4, es de fábrica en cada tabla nueva del proyecto.

`anon` ya viene neutralizado para esto de una vez por todas: un único
`ALTER DEFAULT PRIVILEGES FOR ROLE postgres` (`20260831000400_revocar_escritura_anon.sql`)
le reduce el privilegio por defecto a solo `SELECT` en **toda tabla futura**,
sin que nadie tenga que repetirlo. **`authenticated` no tiene ese seguro
global** —se dejó así a propósito, porque sus privilegios reales varían tabla
por tabla— así que cada tabla nueva necesita su propio `REVOKE` explícito, a
mano, en su propia migración. Falta uno y esa tabla nace abierta.

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
