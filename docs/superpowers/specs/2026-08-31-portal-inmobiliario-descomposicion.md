# Portal inmobiliario — descomposición en sub-proyectos

Fecha: 2026-08-31
Estado: SP0 construido y aprobado para merge. SP1 a SP7 sin spec.
Código: `C:\Users\eduar\Downloads\portal-inmobiliario`
Spec de SP0: `2026-08-27-portal-inmobiliario-sp0-design.md`

## Por qué existe este documento

Hasta hoy la descomposición vivía únicamente en la conversación de diseño. El único
documento del proyecto era el spec de SP0, y el resto de sub-proyectos aparecía solo como
menciones sueltas dentro de él (`→ SP1`, `→ SP2`). SP4, SP5 y SP6 no estaban definidos en
ninguna parte.

Este archivo fija el mapa. No es un spec: no tiene el detalle suficiente para construir.
Cada sub-proyecto necesita su propio spec y su propio plan antes de implementarse, igual que
se hizo con SP0.

## El negocio en una línea

Portal inmobiliario de venta y arriendo en **Barranquilla, Colombia**. El diferenciador no
es el catálogo —eso lo tiene cualquiera— sino la **automatización**: el ciclo completo del
lead (atender → calificar → agendar), la carga y el mantenimiento de las publicaciones, y la
operación interna (moderación, métricas, cobros).

## El criterio que define los cortes

Se eligió el **enfoque C**: construir el núcleo con las costuras ya cortadas alrededor de
los hechos de negocio, para que los agentes de IA se puedan enchufar después sin rehacer
nada. Los cuatro hechos son:

| Hecho de negocio | Lo produce | Lo consume |
|---|---|---|
| `propiedad_publicada` | SP3 | SP1, SP6, SP7 |
| `lead_capturado` | SP4 | SP5, SP6, SP7 |
| `cita_solicitada` | SP5 | SP6, SP7 |
| `pago_posicionamiento_recibido` | SP7 | SP1 (orden del catálogo) |

**Regla de diseño que se hereda de SP0:** cada sub-proyecto que produzca uno de estos hechos
debe emitirlo de forma que SP6 pueda reaccionar a él sin tocar el código del productor. Si al
diseñar un SP hace falta modificar un SP anterior para que la IA se entere de algo, la costura
se cortó mal.

## Grafo de dependencias

```
                          SP0  Fundación
                           │   (auth, roles, RLS, seguridad)
                           ▼
                          SP3  Panel del vendedor
                           │   → propiedad_publicada
              ┌────────────┼────────────┐
              ▼            ▼            ▼
             SP1          SP4          SP2
          Catálogo       Leads       Panel del
          público     → lead_        comprador
          + SEO        capturado
              │            │            │
              │            ▼            │
              │           SP5           │
              │        Citas            │
              │      → cita_solicitada  │
              │            │            │
              └────────────┼────────────┘
                           ▼
                          SP6  Agentes de IA
                           │   (atender, calificar, agendar, describir)
                           ▼
                          SP7  Super admin
                               (moderación, métricas, posicionamiento pagado)
```

**Camino crítico: SP0 → SP3 → SP4 → SP5 → SP6.** Es la cadena que produce el diferenciador.
SP1 y SP2 cuelgan de SP3 pero no bloquean a SP6.

---

## SP0 — Fundación · *construido*

Autenticación con verificación por correo, tres roles (`comprador`, `vendedor`,
`super_admin`), modelo de datos con RLS, cabeceras de seguridad con CSP y nonce, límite de
intentos de login, y los tres shells de panel vacíos.

Entrega: 10 tablas, 13 migraciones, bucket de Storage con políticas, 20 archivos de prueba.

Estado real: **aprobado para merge**. La revisión final dictaminó "no listo", la ola de
correcciones cerró los hallazgos en 9 commits, y la re-revisión confirmó 9 de los 10
criterios de aceptación cumplidos. El décimo —que `gitleaks` pase en CI— queda parcial y
solo se puede cerrar abriendo el PR, porque el workflow nunca se ha ejecutado.
Ver `.superpowers/sdd/2026-08-27-portal-inmobiliario-sp0/progress.md`.

### SP0.5 — Cierre de navegación · *pendiente, pequeño*

No es un sub-proyecto: es el remate que falta para que SP0 sea recorrible.

- Landing `/` mínima (hoy es el boilerplate de `create-next-app`, con enlaces a Vercel)
- **Cerrar sesión** — `signOut` no existe en el código; entras y no puedes salir
- Header/navegación común (hoy solo hay `layout.tsx` raíz)
- Metadata por página (el `<title>` es `Create Next App` en todas)

---

## SP1 — Catálogo público y SEO técnico

**Entrega:** las páginas indexables. Listado con filtros, ficha de propiedad, y los clusters
por barrio que ya tienen su tabla en SP0 (`barrios`, con `slug` y `ciudad`).

**Depende de:** SP3 (sin publicaciones no hay nada que mostrar).

**Costuras que toca:** consume `propiedad_publicada`. El orden del listado consume
`pago_posicionamiento_recibido` de SP7.

**Restricciones que ya vienen dadas de SP0:**
- La **dirección exacta no se expone públicamente**. Se muestra el barrio. La ola de
  correcciones ya retiró `direccion`, `latitud` y `longitud` del `GRANT` a `anon`, así que
  la base lo impide; SP1 debe respetarlo en la UI y en el `sitemap`.
- La CSP con nonce ya contempla GA4 (`googletagmanager.com` está en `script-src`). Integrar
  analítica no debería requerir tocar la CSP; si lo requiere, revisar antes de debilitarla.
- **La app entera está en `force-dynamic`, y SP1 no puede simplemente quitarlo.** Es el
  precio del nonce por petición: el nonce solo existe si `app-render` corre en la petición,
  y una página prerenderizada en el build no puede llevarlo. Hoy cuesta casi nada porque
  ninguna ruta de SP0 es superficie SEO cacheable — pero **SP1 es exactamente esa
  superficie**.

**La primera decisión de diseño de SP1, antes de escribir una línea de catálogo.** Si un
segmento declara `export const dynamic = 'force-static'` para cachear el catálogo, pisa al
layout raíz (Next resuelve la configuración de segmento con el último que la declare), sus
scripts salen sin nonce, el middleware sigue mandando `strict-dynamic`, y **el catálogo
público no hidrata en producción**. Ninguna prueba actual lo detectaría: la unitaria mira el
layout raíz, la E2E corre contra `dev`, y el build no afirma nada.

La salida correcta no está en la capa de render sino en la de **CSP**: que las cabeceras se
emitan por ruta —nonce y `strict-dynamic` para lo dinámico, `script-src 'self'` sin nonce
para lo prerenderizable— y entonces `force-dynamic` baja del layout raíz a los segmentos que
sí reciben nonce. Hasta entonces, la segunda pasada de SP0 añade un guard en CI que falla si
el build prerenderiza alguna página.

**Lo grande de aquí es la lista de SEO técnico del encargo original**, que todavía no está
traducida a criterios verificables. El spec de SP1 tiene que convertirla en pruebas, no en
buenas intenciones.

**Decisiones abiertas:** estrategia de URLs (¿`/barrio/tipo/slug`?), renderizado
(estático con revalidación vs dinámico), y qué se hace con las fichas de propiedades
despublicadas (¿410, redirección, se quedan?).

---

## SP2 — Panel del comprador

**Entrega:** lo que un comprador autenticado hace con su cuenta. Favoritos, búsquedas
guardadas, historial de contactos y citas.

**Depende de:** SP3 (para tener qué guardar), SP4 y SP5 (para mostrar sus leads y citas).

**Obligación heredada de SP0:** el spec de SP0 asigna a SP2 los **derechos sobre datos
personales** — consultar, actualizar y suprimir. No es opcional ni cosmético: hay datos
personales reales (nombre, celular, correo) y la supresión tiene que resolver qué pasa con
los leads y citas asociados.

**Decisiones abiertas:** si "suprimir" es borrado o anonimización; qué se conserva por
obligación frente al vendedor que ya recibió el contacto.

---

## SP3 — Panel del vendedor · *siguiente recomendado*

**Entrega:** publicar y mantener propiedades. Formulario de alta, carga de imágenes,
edición, despublicación, estados (borrador / publicada / pausada).

**Depende de:** solo SP0. Las tablas `propiedades` e `imagenes_propiedad` y el bucket de
Storage ya existen con sus políticas.

**Costuras que toca:** **produce `propiedad_publicada`.** Es el primer sub-proyecto que
genera datos, y por eso desbloquea a todos los demás.

**Decisión aplazada que SP3 tiene que cerrar sí o sí:**
las **fotos de propiedades en borrador accesibles por enlace directo**. SP0 cerró lo que
podía —el bucket ya no se puede enumerar— pero queda abierto que un bucket con `public =
true` se sirve por `/object/public/` saltándose RLS, así que ninguna política lo evita.
Las salidas son bucket privado con URLs firmadas, o mover los archivos al publicar. **Ambas
cambian el flujo de subida de SP3 y el renderizado del catálogo de SP1**, así que cuanto más
tarde se decida, más se rehace. Ver el registro de riesgos del spec de SP0.

**Otras decisiones abiertas:** límites por vendedor, moderación previa o posterior
(interactúa con SP7), y qué campos son obligatorios para poder publicar.

---

## SP4 — Leads y contacto

**Entrega:** el mecanismo por el que un interesado contacta sobre una propiedad, y la
bandeja donde el vendedor los recibe.

**Depende de:** SP3 (leads sobre algo), SP1 (el formulario vive en la ficha pública).

**Costuras que toca:** **produce `lead_capturado`.** SP6 se enchufa aquí para atender y
calificar automáticamente, así que el hecho tiene que emitirse de forma que un agente pueda
reaccionar sin que SP4 sepa que existe.

**Punto de atención de seguridad:** un formulario público de contacto es superficie de spam
y de abuso. Aquí es donde el captcha (Turnstile) que SP0 dejó pendiente deja de ser opcional.
El límite de intentos de SP0 protege el login, no esto.

**Decisiones abiertas:** si el lead requiere cuenta o se puede enviar como anónimo; qué ve
el vendedor y qué se le oculta hasta cierto punto del embudo.

---

## SP5 — Citas y agenda

**Entrega:** solicitar, confirmar, reprogramar y cancelar visitas a una propiedad.

**Depende de:** SP4 (una cita nace de un lead), SP3.

**Costuras que toca:** **produce `cita_solicitada`.** Es el final del ciclo que SP6 debe
poder recorrer solo: atender → calificar → **agendar**.

**Decisiones abiertas:** disponibilidad del vendedor (¿calendario propio, franjas fijas,
integración externa?), zona horaria, recordatorios y por qué canal.

---

## SP6 — Agentes de IA · *el diferenciador*

**Entrega:** la automatización que justifica el negocio.

- **Ciclo del lead:** atender el primer mensaje, calificar al interesado, agendar la visita
- **Publicaciones:** ayudar al vendedor a cargar y mantener sus propiedades
- **Descripciones generadas** para las fichas

**Depende de:** SP3, SP4, SP5 — los tres hechos de negocio que consume.

**Restricción heredada de SP0:** las descripciones generadas por IA son **contenido no
confiable** a efectos de la política de seguridad, igual que las que escriben los vendedores.
El spec de SP0 ya lo trata así. SP6 no puede relajarlo.

**Decisiones abiertas, y son grandes:** qué modelo y con qué coste por lead; cuánta autonomía
tiene el agente antes de requerir intervención humana; qué canal usa (¿WhatsApp, correo, chat
en el sitio?); y cómo se audita lo que el agente le dijo a un cliente real. Esta última no es
opcional si el negocio es real.

---

## SP7 — Super admin: moderación, métricas y posicionamiento

**Entrega:** la operación interna. Moderar publicaciones, ver métricas del portal, y
gestionar el posicionamiento pagado.

**Depende de:** prácticamente todo, porque observa todo.

**Costuras que toca:** **produce `pago_posicionamiento_recibido`**, que SP1 consume para
ordenar el catálogo.

**Ya existe de SP0:** la columna `destacada` en `propiedades` es un booleano manual — es el
estado "HOT" que SP7 tiene que gobernar. Y la tabla `registro_auditoria` existe pero **nadie
escribe en ella** todavía (hallazgo I5 de la revisión final, pendiente de la segunda pasada).

**Punto de atención:** `imagenes_propiedad` no tiene política de super_admin (hallazgo I7),
así que hoy el administrador no puede moderar imágenes. Se corrige en la segunda pasada de
SP0, antes de que SP7 lo necesite.

**Decisiones abiertas:** pasarela de pago, modelo de cobro (por publicación, suscripción,
por posición), y facturación en Colombia.

---

## Lo que hay que confirmar

SP1, SP2, SP3, SP6 y SP7 están anclados por nombre en el spec de SP0. **SP4 y SP5 son una
reconstrucción**: se derivan de los hechos de negocio `lead_capturado` y `cita_solicitada`
que se eligieron al definir el enfoque C, pero sus límites no estaban escritos en ningún
documento. Si la intención era otra —por ejemplo, leads y citas juntos en un solo
sub-proyecto— este es el momento de corregirlo, porque el spec de SP3 se escribe sobre este
mapa.

## Cómo se construye cada uno

El mismo método que SP0, que ya demostró funcionar: **brainstorming → spec → plan →
implementación por subagentes con revisión por tarea → revisión final de rama → una única
ola de correcciones**.

Dos disciplinas que se llevaron caro aprender en SP0 y que valen para todos los demás:

1. **Toda prueba que afirme una denegación debe demostrar por qué se deniega.** Asertar el
   código de error, fijar el caso positivo en la misma prueba, y encadenar `.select()` en los
   `UPDATE` porque uno que no afecta filas devuelve `error` nulo. En SP0 hubo **seis** pruebas
   que pasaban por el motivo equivocado, incluida una que afirmaba una denegación contra una
   tabla que no existía.
2. **Todo control de seguridad necesita ciclo de falsificación:** romperlo a propósito,
   comprobar que la prueba falla, revertir. Sin eso, no está verificado — está escrito.
