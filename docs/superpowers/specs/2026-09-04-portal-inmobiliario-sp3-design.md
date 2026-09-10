# SP3 — Panel del vendedor

Fecha: 2026-09-04
Sub-proyecto: SP3 del portal inmobiliario de Barranquilla
Depende de: SP0 (fundación), completo y mergeado
Mapa: `2026-08-31-portal-inmobiliario-descomposicion.md`
Spec de SP0: `2026-08-27-portal-inmobiliario-sp0-design.md`

## 1. Por qué este sub-proyecto va primero

SP3 es **el único sub-proyecto que genera datos**. Sin propiedades publicadas, el catálogo
público (SP1) no tiene nada que mostrar, los leads (SP4) no tienen sobre qué existir y los
agentes de IA (SP6) no tienen sobre qué actuar. Produce el primero de los cuatro hechos de
negocio: **`propiedad_publicada`**.

También es donde se cierra la decisión que SP0 dejó aplazada por escrito: las fotos de
propiedades en borrador accesibles por enlace directo.

## 2. Lo que ya existe y no hay que volver a construir

SP0 dejó montado más de lo que parece. **Leer esto antes de escribir nada.**

- **`propiedades`** con todos sus campos y su RLS completa: el vendedor hace CRUD de lo suyo
  (`propiedades_lectura_dueno`, `_insercion_dueno`, `_actualizacion_dueno`, `_borrado_dueno`),
  el público solo ve `estado = 'publicada'`, y el super admin lee y actualiza cualquiera.
- **`imagenes_propiedad`** con `alt_text NOT NULL CHECK (length(TRIM(alt_text)) >= 5)` — el
  requisito de SEO «alt en todas las imágenes» ya no depende de que alguien se acuerde — más
  `orden`, y RLS que hereda la visibilidad de su propiedad, con política de super_admin.
- **Bucket `propiedades`** en Storage: 5 MB por archivo, `image/jpeg|png|webp`, con políticas
  de lectura, escritura y borrado limitadas a la carpeta propia:
  `(storage.foldername(name))[1] = auth.uid()::text`.
- **`barrios`** con sus 10 filas, cargadas por migración.
- **`estado_propiedad`**: `borrador`, `en_revision`, `publicada`, `pausada`, `vendida`,
  `rechazada`.
- El panel `/panel` existe como marcador de posición, ya protegido por rol, y la cabecera de
  SP0.5 ya enlaza a él.

## 3. Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Fotos de borrador | **Bucket privado + URLs firmadas** | Es lo único que cierra el agujero de verdad. Un bucket `public = true` se sirve por `/object/public/` saltándose RLS: ninguna política lo evita |
| Moderación | **Publicación directa** | Con revisión previa nada se publicaría hasta SP7, y SP3 dejaría de servir por sí solo |
| Slug | **Título + sufijo corto** | Nunca colisiona, no consulta la base ni reintenta, y no tiene carrera entre dos vendedores simultáneos |
| Imágenes | **Procesar al subir** | Archivos pequeños de entrada, y no depende del optimizador de Next, que con URLs firmadas se vuelve frágil |
| Alta | **Guardar borrador y completar** | El vendedor típico publica desde el móvil con las fotos recién tomadas: perder lo escrito es el fallo más probable |
| Mínimo para publicar | **Al menos una foto**, validado en la base | Única excepción a «publicación directa». Una ficha sin fotos no sirve en un portal inmobiliario y es la que más daña el catálogo que SP1 construirá |

## 4. Modelo de datos: migraciones nuevas

**Ninguna migración existente se edita.** Timestamps posteriores a `20260831000700`.

### 4.1 Bucket a privado

```sql
UPDATE storage.buckets SET public = false WHERE id = 'propiedades';
```

Es el arreglo del riesgo aplazado. Las políticas de `storage.objects` que SP0 ya escribió
pasan a gobernar de verdad todo acceso.

### 4.2 Ampliar el CHECK del slug

Hoy es `^[a-z]+(-[a-z]+)*$`: **no admite dígitos**, así que el sufijo desambiguador no cabe.
Se sustituye por `^[a-z0-9]+(-[a-z0-9]+)*$`.

### 4.3 Exigir una foto para publicar

Trigger `BEFORE INSERT OR UPDATE` sobre `propiedades`: si el estado resultante es `publicada`
y no existe ninguna fila en `imagenes_propiedad` para esa propiedad, se rechaza con un mensaje
propio. Cubre también el `INSERT` directo en `publicada`, no solo la transición.

Va en la base y no solo en el formulario porque el formulario no es la única vía: PostgREST
está expuesto y un `PATCH` directo se saltaría cualquier validación de la aplicación.

### 4.4 Cola de limpieza de Storage

**El problema:** `ON DELETE CASCADE` borra las filas de `imagenes_propiedad` cuando se borra
la propiedad, pero **los archivos se quedan en Storage para siempre**. Y borrar filas de
`storage.objects` por SQL no elimina los bytes del backend: eso solo lo hace la API de Storage.

**La solución:** tabla `limpieza_almacenamiento` (`id`, `ruta`, `creado_en`, `intentos`), más
un trigger `AFTER DELETE ON imagenes_propiedad` que apunta ahí la `ruta_storage`. El server
action de borrado drena la cola llamando a la API de Storage; lo que falle se queda anotado en
vez de perderse en silencio.

RLS activa y **sin `GRANT` a `anon` ni a `authenticated`**: solo el servidor la toca, igual que
`registro_auditoria`.

### 4.5 Índice

`propiedades (vendedor_id, actualizado_en DESC)` para el listado del panel.

## 5. Arquitectura de imágenes

### 5.1 Subida

Server action —corre en runtime Node, no Edge, así que puede procesar—:

1. Validar tipo y tamaño **antes** de procesar.
2. Redimensionar a un ancho máximo de **1600 px** (sin ampliar las más pequeñas).
3. Convertir a **WebP**.
4. **Eliminar todos los metadatos EXIF.** Una foto tomada con el móvil en la propiedad lleva
   las **coordenadas GPS exactas** incrustadas. El spec de SP0 dice que la dirección exacta no
   es pública; publicar la foto sin limpiar la anularía por la puerta de atrás. Esto no es
   optimización, es privacidad.
5. Subir a `<uid>/<propiedad_id>/<uuid>.webp` — la ruta **debe** empezar por el uid porque es
   lo que exigen las políticas de Storage de SP0.
6. Insertar la fila en `imagenes_propiedad` con su `alt_text` y su `orden`.

Máximo **12 imágenes por propiedad**.

### 5.2 Lectura

Siempre **URL firmada**, generada en el servidor al renderizar, con caducidad de una hora.
Nunca se construye una URL pública de Storage.

### 5.3 Lo que SP1 hereda

El catálogo público también tendrá que firmar URLs, y una URL que caduca complica el caché y
el SEO de imágenes. **Es el precio de tener el borrador protegido.** Queda escrito aquí para
que SP1 lo encuentre al diseñarse, no a mitad de construirlo.

## 6. El slug

Se genera **una sola vez, al crear la propiedad**, y **no cambia nunca más**, aunque el
vendedor edite el título. Un slug que muta rompe los enlaces existentes y es de las peores
cosas que se le pueden hacer al SEO.

Derivación: título → quitar tildes → minúsculas → todo lo que no sea `[a-z0-9]` a guion →
colapsar guiones repetidos → quitar guiones de los extremos → **recortar a 60 caracteres sin
partir una palabra por la mitad** → añadir `-` y **4 caracteres hexadecimales** aleatorios.

Casos límite que la implementación debe cubrir, y que las pruebas fijan:

- Si el título no deja ningún carácter utilizable (por ejemplo, solo signos de puntuación), la
  base es `propiedad`.
- El recorte no puede dejar un guion final, porque `^[a-z0-9]+(-[a-z0-9]+)*$` lo rechazaría.
- 4 caracteres hexadecimales dan 65.536 combinaciones por título. La colisión es improbable
  pero no imposible, y `slug` es `UNIQUE`: si el `INSERT` choca, se reintenta con un sufijo
  nuevo, **hasta tres veces**, antes de dar error al vendedor.

## 7. Estructura de la aplicación

| Ruta | Qué hace |
|---|---|
| `/panel` | Lista de mis propiedades: estado, y **qué le falta a cada una** para publicarse |
| `/panel/propiedades/nueva` | Pide solo el título, crea el `borrador` y redirige a editar |
| `/panel/propiedades/[id]` | Datos, ubicación, fotos y las acciones de estado |

Server actions por ruta en `acciones.ts`, siguiendo el patrón que ya usan `login` y `registro`.
Componentes y validación reutilizan `src/lib/validacion/esquemas.ts` y
`src/lib/errores/mapear.ts`.

### Máquina de estados

```
borrador ──publicar──> publicada ──pausar──> pausada
                           │  ▲                 │
                    marcar vendida      reanudar│
                           │  └─────────────────┘
                           ▼
                        vendida
```

Eliminar es posible desde cualquier estado. `en_revision` y `rechazada` **no se usan en SP3**:
quedan reservados para la moderación de SP7.

## 8. Errores

Se extiende `src/lib/errores/mapear.ts`, sin inventar un mecanismo nuevo. Casos propios:

- El procesamiento de la imagen falla → mensaje claro, y **no** se inserta la fila.
- La subida a Storage falla después de procesar → no queda fila huérfana.
- Publicar sin fotos → el trigger devuelve su mensaje; se traduce a algo que el vendedor
  entienda, no al texto crudo de Postgres.
- Límite de 12 imágenes alcanzado.
- El vendedor toca una propiedad que no es suya → `42501`, que ya se mapea.

## 9. Pruebas

### Lo que hay que demostrar, y su falsificación

**El agujero que este sub-proyecto cierra.** La URL pública de Storage de una imagen de un
borrador **debe dejar de funcionar**. La prueba tiene que fijar además el caso positivo: que la
URL firmada **sí** sirve la imagen. Sin esa mitad, la prueba pasaría igual si Storage estuviera
caído. Falsificación: devolver el bucket a `public = true` y comprobar que la prueba falla.

**RLS.** Un vendedor no lee, edita ni borra propiedades ni imágenes de otro: asertar `42501` y
fijar el caso positivo en la misma prueba. Los `UPDATE` encadenan `.select()`, porque uno que
no afecta filas devuelve `error` nulo.

**El trigger de la foto.** Intentar publicar sin imágenes debe fallar; con una imagen debe
funcionar. Falsificación: quitar el trigger y comprobar que la prueba se pone en rojo.

**EXIF.** Subir una imagen con coordenadas GPS y verificar que el archivo resultante **no las
lleva**.

**Slug.** Dos propiedades con el mismo título producen slugs distintos. Editar el título de una
propiedad existente **no** cambia su slug.

**E2E.** Crear borrador → subir foto → publicar → pausar, comprobando el estado en cada paso.

### Restricciones heredadas que siguen vigentes

- Toda prueba que afirme una denegación demuestra **por qué**: código de error y caso positivo.
- Todo control de seguridad lleva ciclo de falsificación con su salida real pegada.
- `force-dynamic` del layout raíz **no se toca**; `npm run verificar:render` debe seguir verde.
- Nombres de dominio en español.
- Nunca se edita una migración ya aplicada.

## 10. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Pasar el bucket a privado rompe algo que asumía URLs públicas | Imágenes rotas | Hoy **nada** consume esas imágenes: el catálogo es SP1 y no existe. Es el momento más barato posible para hacer el cambio |
| La cola de limpieza se llena y nadie la drena | Basura acumulada en Storage | La tabla registra `intentos`; el listado del panel del super admin (SP7) la expondrá. En SP3 se drena en cada borrado |
| Procesar imágenes alarga la subida | Vendedor esperando en el móvil | Ancho máximo y WebP mantienen el trabajo acotado; se sube de una en una con indicación de progreso |
| Una URL firmada caducada rompe una vista larga | Imagen rota tras una hora | Se firman al renderizar; una recarga las renueva. SP1 necesitará una estrategia propia |

## 11. Fuera de alcance

Catálogo público y SEO (SP1) · panel del comprador (SP2) · leads (SP4) · citas (SP5) ·
descripciones generadas por IA (SP6) · moderación, métricas, `destacada` y pagos (SP7).

**Sin selector de mapa.** `latitud` y `longitud` existen en la tabla desde SP0, pero SP3 no
trae interfaz de mapa: la dirección se escribe como texto. Ponerlas es trabajo de quien
necesite geolocalización de verdad.

## 12. Criterios de aceptación

1. El bucket `propiedades` es privado, y la URL pública de una imagen de borrador **no** sirve
   el archivo, con la URL firmada demostrada como caso positivo.
2. Un vendedor crea un borrador escribiendo solo el título, y no pierde lo escrito al salir.
3. El panel lista sus propiedades con el estado y qué le falta a cada una para publicarse.
4. Subir una foto la guarda como WebP, redimensionada, **sin metadatos EXIF**, dentro de la
   carpeta del propio vendedor.
5. Publicar sin ninguna foto es rechazado **por la base de datos**, no solo por el formulario.
6. Publicar con al menos una foto funciona, y la propiedad pasa a `publicada`.
7. Las transiciones publicada ⇄ pausada y → vendida funcionan desde el panel.
8. Un vendedor no puede leer, editar ni borrar propiedades ni imágenes de otro, con `42501` y
   caso positivo.
9. Borrar una propiedad deja su cola de limpieza registrada y elimina los archivos de Storage.
10. Dos propiedades con el mismo título tienen slugs distintos, y editar el título no cambia el
    slug ya asignado.
11. Las tres suites siguen en verde sobre la base actual (133 unitarias, 76 RLS, 12 E2E), el
    build compila y `verificar:render` pasa.
