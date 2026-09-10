# SP1 — Catálogo público y SEO técnico

Fecha: 2026-09-08
Sub-proyecto: SP1 del portal inmobiliario de Barranquilla
Depende de: SP0 (fundación) y SP3 (panel del vendedor), ambos mergeados
Mapa: `2026-08-31-portal-inmobiliario-descomposicion.md`
Spec de SP3: `2026-09-04-portal-inmobiliario-sp3-design.md`

## 1. Qué es y por qué ahora

SP3 le dio al vendedor la capacidad de publicar. **Sin catálogo, esas publicaciones no van a
ninguna parte**: nadie puede verlas. SP1 es lo que convierte el trabajo de SP3 en un producto.

Es además la **superficie de SEO técnico** que el encargo original pedía cuidar, y la primera
parte del proyecto que un desconocido va a ver.

Consume el hecho de negocio `propiedad_publicada`. No produce ninguno.

## 2. Lo que ya existe y condiciona el diseño

- **`propiedades`** con RLS: la política `propiedades_lectura_publica` deja ver a `anon` las
  filas con `estado = 'publicada'`, y **solo esas**.
- **Columnas ocultas al público**: `direccion`, `latitud` y `longitud` fueron retiradas del
  `GRANT` a `anon` en SP0. La base lo impide; el catálogo muestra el **barrio**.
- **`slug`** único global, con sufijo hexadecimal, generado una vez y estable para siempre.
- **`barrios`** con `nombre`, `slug` y `ciudad`, cargados por migración.
- **Bucket privado**: toda imagen se sirve con URL firmada emitida en el servidor.
- **Índice parcial** `propiedades_publicadas_idx (barrio_id, operacion, precio)
  WHERE estado = 'publicada'` — sirve exactamente la consulta del listado.
- **`force-dynamic` en el layout raíz**, para que el nonce de la CSP llegue a los scripts.
- **Un guard en CI** (`npm run verificar:render`) que falla si el build prerenderiza alguna
  página.

## 3. Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Caché vs. nonce | **CSP por ruta** | Preserva las dos cosas: nonce donde hay sesión, caché donde hay SEO |
| Filtros | **Básicos en la URL** | Cada combinación es indexable y compartible; el índice parcial ya la sirve |
| Imágenes cacheadas | **Ruta propia que redirige** | La página cacheada guarda un enlace estable; la firma se emite fresca |
| Forma de las URL | **Barrio en la ruta** | Cada barrio gana autoridad propia: es el cluster de SEO local del encargo |
| Publicada sin fotos | **Se oculta del listado** | Decisión del controlador. Solo puede venir del hueco parkeado; ocultarla es defensa |

## 4. Rutas

| Ruta | Qué es | Indexable | Render |
|---|---|---|---|
| `/` | Portada: entrada a los barrios | Sí | Cacheada |
| `/<barrio>` | Listado del barrio, con filtros | Sí | Cacheada, revalidada |
| `/<barrio>/<slug>` | Ficha de la propiedad | Sí | Cacheada, revalidada |
| `/imagen/<id>` | Redirección a la URL firmada | No | Dinámica |
| `/sitemap.xml`, `/robots.txt` | Para buscadores | — | Generados |

Filtros como parámetros de consulta: `/alto-prado?operacion=venta&tipo=apartamento&precio_max=400000000`.

**Las páginas con filtro llevan canónica al listado del barrio sin filtros.** Si no, cada
combinación de parámetros compite consigo misma por la misma intención de búsqueda y diluye la
autoridad que el cluster por barrio pretende concentrar.

### Qué pasa cuando una propiedad deja de estar publicada

Su ficha deja de ser visible. **Devuelve 410 Gone**, no 404: le dice al buscador que la página
existió y ya no, que es lo que de verdad ocurrió, y acelera su retirada del índice. Un 404
sugiere que nunca existió y el buscador la reintenta durante semanas.

Si la propiedad cambia de barrio, su URL cambia. **La ruta vieja redirige con 301** a la nueva.
Sin eso, cada corrección de barrio rompe los enlaces ya indexados — y es la única desventaja
conocida de haber puesto el barrio en la ruta.

## 5. La CSP por ruta

`construirCabeceras` pasa a recibir la ruta y emite **dos políticas**:

- **Rutas públicas** (`/`, `/<barrio>`, `/<barrio>/<slug>`, sitemap): `script-src 'self'`, sin
  nonce y sin `strict-dynamic`. Por eso pueden prerenderizarse y cachearse.
- **Rutas privadas y de autenticación**: exactamente la política de hoy, con nonce y
  `strict-dynamic`.

Entonces `force-dynamic` **baja del layout raíz** a los segmentos que sí reciben nonce.

### El guard de CI hay que ajustarlo, y es obligatorio

Hoy falla si aparece **cualquier** HTML prerenderizado. Con este diseño eso pasa a ser el
comportamiento correcto para las rutas públicas, así que el guard empezaría a fallar por el
diseño bueno — y quien lo viera fallar lo desactivaría, que es como se pierden las redes.

Debe invertirse por familia de rutas: **las públicas tienen que estar prerenderizadas y las
privadas no**. Un guard que solo prohíbe es más débil que uno que además exige.

## 6. Las imágenes

Ruta `/imagen/<id>`: recibe el id de una fila de `imagenes_propiedad`, y **antes de firmar
comprueba que su propiedad está publicada**. Si no lo está, responde 404.

Ese control es el punto entero de la ruta. Sin él sería una vía para descargar fotos de
borradores conociendo un id — exactamente el agujero que SP3 cerró, reabierto por la puerta de
atrás.

Responde con **redirección temporal** a la URL firmada, y con cabeceras de caché cortas: lo
bastante para que un listado no firme cien veces, lo bastante poco para que despublicar una
propiedad retire sus fotos en minutos, no en días.

## 7. Lo que el catálogo hereda de SP3, y no puede ignorar

Dos huecos conocidos, ambos con ticket propio y **ninguno cerrado**:

- Una propiedad publicada **puede quedarse sin fotos** (borrando sus filas hijas, que no
  disparan el trigger del padre).
- El equivalente del precio **ya está cerrado** (migración `20260908000400`), así que el
  catálogo sí puede asumir que una publicada tiene precio.

Por tanto: el listado **oculta** las propiedades sin fotos, y la ficha de una propiedad sin
fotos debe renderizar sin reventar. No es defensa teórica: el hueco existe hoy.

## 8. SEO técnico

Aquí está el trabajo real de este sub-proyecto. **La lista del encargo original hay que
convertirla en criterios verificables**, no en buenas intenciones. Como mínimo:

- `title` y `meta description` propios y distintos en cada página, derivados de datos reales.
- **Datos estructurados** de anuncio inmobiliario en la ficha, con precio, ubicación por barrio
  y fotos. Nunca la dirección exacta.
- **Canónicas**: la ficha a sí misma; los listados con filtro, al barrio sin filtros.
- **`sitemap.xml`** generado desde las propiedades publicadas, con su fecha de actualización.
- **`robots.txt`** que permita las públicas y excluya `/panel`, `/mi-cuenta`, `/control`,
  `/imagen` y las rutas de autenticación.
- Imágenes con `alt` real — ya garantizado por la base, que lo exige `NOT NULL`.
- Encabezados jerárquicos correctos y un solo `h1` por página.

**Prueba de que esto sirve de algo**: cada punto necesita una prueba automatizada. Un SEO
"revisado a ojo" se rompe en el primer cambio y nadie se entera.

## 9. Rendimiento

Es parte del SEO, no algo aparte. Las imágenes ya llegan procesadas de SP3 (WebP,
redimensionadas), así que lo que queda es no estropearlo: dimensiones declaradas para evitar el
salto de maquetación, carga diferida fuera de la primera pantalla, y no meter JavaScript que la
página pública no necesite.

## 10. Errores

- Barrio inexistente → 404.
- Slug inexistente → 404.
- Propiedad despublicada → 410, como dice §4.
- Filtros con valores basura → se ignoran y se sirve el listado sin ese filtro, **nunca un
  error**. Una URL manipulada no debe romper una página pública.

## 11. Pruebas

- **RLS**: un visitante anónimo ve las publicadas y **no** ve borradores ni pausadas. Con caso
  positivo. Y no puede leer `direccion`, `latitud` ni `longitud`.
- **La ruta de imagen**: con una propiedad publicada devuelve la imagen; con un borrador
  devuelve 404. **Falsificación obligatoria**: quitar la comprobación de estado y ver que la
  prueba se pone roja.
- **Filtros**: cada uno acota de verdad; valores basura no rompen.
- **410 vs 404**: despublicar una propiedad y comprobar el código.
- **SEO**: canónicas, sitemap, robots, un solo `h1`, datos estructurados válidos.
- **E2E**: entrar por un barrio, filtrar, abrir una ficha, ver las fotos.
- **El guard de render invertido**: que falla si una ruta pública deja de prerenderizarse y
  también si una privada empieza a hacerlo.

## 12. Fuera de alcance

Panel del comprador y favoritos (SP2) · formulario de contacto y leads (SP4) · citas (SP5) ·
descripciones generadas por IA (SP6) · `destacada`, moderación y pagos (SP7).

**Sin mapa** y sin dirección exacta: se muestra el barrio. **Sin buscador de texto libre**: los
filtros son los de §4. **Sin paginación infinita**: paginación clásica, que es indexable.

## 13. Criterios de aceptación

1. Un visitante anónimo ve el listado de un barrio con solo las propiedades publicadas de ese
   barrio, y ninguna en otro estado.
2. Los cuatro filtros acotan de verdad, se reflejan en la URL, y un valor basura no rompe la
   página.
3. La ficha muestra título, precio, barrio, características y fotos — y **nunca** la dirección
   exacta, verificado contra la respuesta, no contra la interfaz.
4. `/imagen/<id>` sirve la foto de una publicada y devuelve 404 para la de un borrador, con
   falsificación demostrada.
5. Una propiedad publicada **sin fotos** no aparece en el listado, y su ficha no revienta.
6. Despublicar una propiedad hace que su ficha devuelva 410.
7. Cambiar una propiedad de barrio hace que la URL vieja redirija con 301 a la nueva.
8. Las rutas públicas están prerenderizadas y las privadas no, verificado por el guard
   invertido en CI.
9. La CSP de las rutas públicas no lleva nonce; la de las privadas sí, y sigue sin
   `unsafe-inline` en `script-src`. Comprobado contra un build de producción.
10. Cada página tiene `title` y `description` propios, canónica correcta, y un solo `h1`.
11. `sitemap.xml` lista todas las publicadas y ninguna más; `robots.txt` excluye las rutas
    privadas y `/imagen`.
12. Las suites siguen en verde sobre la base actual (267 unitarias, 121 RLS, 13 E2E) y el
    build compila.
