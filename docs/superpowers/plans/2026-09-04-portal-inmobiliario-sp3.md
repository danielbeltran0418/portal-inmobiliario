# SP3 — Panel del vendedor · Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea a tarea.
> Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Que un vendedor pueda crear, mantener y publicar propiedades con fotos, y que
las fotos de sus borradores dejen de ser accesibles por enlace directo.

**Arquitectura:** Server actions en runtime Node por ruta del panel, siguiendo el patrón que
ya usan `login` y `registro`. La base de datos guarda las invariantes que no pueden depender
del formulario (una foto para publicar, unicidad del slug, cola de limpieza). Las imágenes se
procesan al subir y se sirven siempre con URL firmada.

**Stack:** Next.js 16 App Router · React 19 · TypeScript estricto · Tailwind v4 ·
Supabase (Postgres + Storage) · Zod · `sharp` · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-09-04-portal-inmobiliario-sp3-design.md`
**Rama:** crear `sp3-panel-vendedor` desde `main` (hoy en `1d8750d`).

## Restricciones globales

Se aplican a **todas** las tareas. No se repiten en cada una.

- **Nunca editar una migración ya aplicada.** Toda corrección va en migración nueva, con
  marca de tiempo posterior a `20260831000700`.
- **Nombres de dominio en español** (tablas, columnas, funciones, ficheros, variables).
  Excepciones ya ratificadas: `handle_new_user`, `on_auth_user_created`,
  `custom_access_token_hook`, y el vocabulario de plataforma (`claims`, `event`,
  `access_token`, `auth_admin`, roles de Postgres/Supabase).
- **`export const dynamic = "force-dynamic"` de `src/app/layout.tsx` no se toca.** Es lo que
  hace que el nonce de la CSP llegue a los scripts. `npm run verificar:render` debe seguir
  pasando.
- **Todo módulo que importe `src/middleware.ts` debe ser compatible con Edge**: nada de
  `Buffer`, `fs`, `sharp`. Los server actions **no** son Edge: ahí sí se puede.
- **Toda prueba que afirme una denegación debe demostrar por qué se deniega.**
  `expect(error).not.toBeNull()` no basta: asertar el código (`42501`, `23502`, `23514`).
  Cero filas no basta: fijar el caso positivo en la misma prueba. Un `UPDATE` de PostgREST que
  no afecta filas **devuelve `error` nulo**: encadenar `.select()`.
- **Falsificación obligatoria en todo control de seguridad:** aplicar, probar verde, romper a
  propósito, probar rojo, revertir, probar verde. Pegar la salida real en el reporte.
- **El CI de GitHub no funciona** en este repositorio (los jobs mueren en 3 s sin runner).
  Toda verificación es local.
- Entorno Windows. **No usar `rtk`.** Para git:
  `G=$(which git.exe 2>/dev/null || echo /usr/bin/git)`. Para crear ficheros usar la
  herramienta Write (los heredocs se rompen por CRLF).
- Base de pruebas a mantener en verde: **133 unitarias, 76 RLS, 12 E2E**.

---

## Estructura de ficheros

**Migraciones** (`supabase/migrations/`)
- `20260904000100_bucket_privado.sql` — el arreglo del riesgo aplazado
- `20260904000200_slug_con_digitos.sql` — amplía el CHECK
- `20260904000300_exigir_imagen_publicar.sql` — trigger
- `20260904000400_limpieza_almacenamiento.sql` — cola + trigger
- `20260904000500_indice_panel_vendedor.sql` — índice del listado

**Librería** (`src/lib/`)
- `propiedades/slug.ts` — generación del slug
- `propiedades/completitud.ts` — qué le falta a una propiedad para publicarse
- `imagenes/procesar.ts` — sharp: redimensionar, WebP, EXIF
- `imagenes/firmar.ts` — URLs firmadas
- `validacion/esquemas.ts` — **modificar**: añadir los esquemas de propiedad

**Aplicación** (`src/app/(vendedor)/panel/`)
- `page.tsx` — **modificar**: listado real en vez del marcador
- `propiedades/acciones.ts` — crear, actualizar, estados, eliminar
- `propiedades/nueva/page.tsx` + `formulario.tsx`
- `propiedades/[id]/page.tsx` + `formulario-datos.tsx` + `panel-fotos.tsx`
- `propiedades/[id]/acciones-imagenes.ts` — subir, borrar, reordenar

**Pruebas**
- `tests/rls/` — `bucket-privado`, `imagen-publicar`, `limpieza`, `propiedades-vendedor`
- `tests/unit/` — `slug`, `completitud`, `procesar-imagen`
- `tests/e2e/` — `panel-vendedor.spec.ts`

---

## Task 1: Bucket privado — el arreglo del riesgo aplazado

Es la tarea más importante del sub-proyecto. Cierra el agujero que SP0 documentó y aplazó.

**Files:**
- Create: `supabase/migrations/20260904000100_bucket_privado.sql`
- Create: `tests/rls/bucket-privado.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: el bucket `propiedades` queda con `public = false`. Todas las tareas posteriores
  que muestren imágenes **deben** usar URL firmada.

- [ ] **Step 1: Escribir la migración**

```sql
-- El bucket nacio public=true en 20260827000700. Un bucket publico se sirve por
-- /object/public/<bucket>/<ruta> SIN consultar RLS, asi que las politicas de
-- storage.objects que esa misma migracion escribio no gobernaban nada frente a
-- quien conociera la ruta: las fotos de una propiedad en BORRADOR eran
-- descargables. Riesgo registrado en el spec de SP0 y aplazado al SP3.
--
-- Con public=false desaparece esa via y toda lectura pasa por RLS o por una
-- URL firmada emitida en el servidor.
UPDATE storage.buckets SET public = false WHERE id = 'propiedades';
```

- [ ] **Step 2: Escribir la prueba que demuestra el cierre**

Crear `tests/rls/bucket-privado.test.ts`. Reutiliza `clienteAnonimo` y `clienteAdmin` de
`tests/rls/ayudantes.ts`.

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAnonimo, clienteAdmin } from './ayudantes'

const BUCKET = 'propiedades'
const RUTA = 'pruebas-bucket/imagen-de-borrador.webp'

describe('el bucket de propiedades es privado', () => {
  beforeAll(async () => {
    const admin = clienteAdmin()
    await admin.storage.from(BUCKET).remove([RUTA])
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(RUTA, new Uint8Array([1, 2, 3, 4]), { contentType: 'image/webp', upsert: true })
    expect(error).toBeNull()
  })

  // No se comprueba la bandera `public` de storage.buckets directamente porque
  // esa tabla no se expone por PostgREST. Se comprueba por su EFECTO, que es lo
  // que de verdad importa: la URL publica no sirve y la firmada si.

  it('la URL publica NO sirve el archivo', async () => {
    const { data } = clienteAnonimo().storage.from(BUCKET).getPublicUrl(RUTA)
    const respuesta = await fetch(data.publicUrl)
    expect(respuesta.ok).toBe(false)
    expect(respuesta.status).toBe(400)
  })

  it('CASO POSITIVO: la URL firmada SI sirve el archivo', async () => {
    const { data, error } = await clienteAdmin()
      .storage.from(BUCKET).createSignedUrl(RUTA, 60)
    expect(error).toBeNull()

    const respuesta = await fetch(data!.signedUrl)
    expect(respuesta.ok).toBe(true)
    expect((await respuesta.arrayBuffer()).byteLength).toBe(4)
  })
})
```

**Por qué el caso positivo es obligatorio:** sin él, la prueba pasaría igual si Storage
estuviera caído, si el archivo no existiera, o si la ruta estuviera mal escrita. Lo que hay
que demostrar no es «no se puede descargar», es «no se puede descargar **así**, y sí **asá**».

Borrar el bloque del Step 2 titulado `el bucket esta marcado como privado` si resulta que
`storage.buckets` no es consultable: las otras dos pruebas son las que prueban el
comportamiento. Deja un comentario diciendo por qué no se comprueba la bandera directamente.

- [ ] **Step 3: Aplicar y ejecutar**

```bash
npx supabase db reset
npx vitest run tests/rls/bucket-privado.test.ts
```
Esperado: las pruebas de URL pública y URL firmada en verde.

- [ ] **Step 4: FALSIFICAR**

Devolver el bucket a público a mano y comprobar que la prueba se pone en rojo:

```bash
npx supabase db reset
psql "$SUPABASE_DB_URL" -c "UPDATE storage.buckets SET public = true WHERE id='propiedades';"
npx vitest run tests/rls/bucket-privado.test.ts
```
Esperado: **FALLA** en `la URL publica NO sirve el archivo` (recibiría 200).
Después `npx supabase db reset` y volver a ejecutar: verde. **Pegar ambas salidas.**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260904000100_bucket_privado.sql tests/rls/bucket-privado.test.ts
git commit -m "fix(storage): bucket de propiedades privado, fotos de borrador ya no descargables"
```

---

## Task 2: Slug con dígitos y su generador

**Files:**
- Create: `supabase/migrations/20260904000200_slug_con_digitos.sql`
- Create: `src/lib/propiedades/slug.ts`
- Create: `tests/unit/slug.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `generarSlug(titulo: string, sufijo?: string): string` — la Task 7 la usa al crear
  la propiedad.

- [ ] **Step 1: Comprobar el nombre real de la restricción**

```bash
psql "$SUPABASE_DB_URL" -c "\d public.propiedades" | grep -i slug
```
Postgres la habrá llamado `propiedades_slug_check`. **Usar el nombre que devuelva el comando,
no el supuesto.**

- [ ] **Step 2: Escribir la migración**

```sql
-- El CHECK original era '^[a-z]+(-[a-z]+)*$': sin digitos. El slug se genera
-- como <titulo>-<4 hex> para no colisionar, y ese sufijo no cabia.
ALTER TABLE public.propiedades DROP CONSTRAINT propiedades_slug_check;
ALTER TABLE public.propiedades ADD CONSTRAINT propiedades_slug_check
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
```

- [ ] **Step 3: Escribir la prueba primero**

```ts
import { describe, it, expect } from 'vitest'
import { generarSlug } from '@/lib/propiedades/slug'

const PATRON = /^[a-z0-9]+(-[a-z0-9]+)*$/

describe('generarSlug', () => {
  it('convierte el titulo en un slug legible con sufijo', () => {
    expect(generarSlug('Casa en El Prado', 'a7f3')).toBe('casa-en-el-prado-a7f3')
  })

  it('quita las tildes y la enye', () => {
    expect(generarSlug('Apartamento con baño y jardín', 'b1c2'))
      .toBe('apartamento-con-bano-y-jardin-b1c2')
  })

  it('dos titulos iguales producen slugs distintos', () => {
    const uno = generarSlug('Casa en El Prado')
    const otro = generarSlug('Casa en El Prado')
    expect(uno).not.toBe(otro)
  })

  it('un titulo sin caracteres utilizables cae en la base propiedad', () => {
    expect(generarSlug('¿!¡---!?', 'c3d4')).toBe('propiedad-c3d4')
  })

  it('recorta sin partir palabras y sin dejar guion antes del sufijo', () => {
    const largo = 'Hermoso apartamento remodelado con vista al mar en el norte de Barranquilla'
    const slug = generarSlug(largo, 'e5f6')
    expect(slug).toMatch(PATRON)
    expect(slug.endsWith('-e5f6')).toBe(true)
    expect(slug.length).toBeLessThanOrEqual(65)
    expect(slug).not.toContain('--')
  })

  it('todo lo que genera cumple el CHECK de la base', () => {
    for (const titulo of ['Casa', '  ', '123 456', 'Ñandú --- Ñandú', 'A'.repeat(200)]) {
      expect(generarSlug(titulo)).toMatch(PATRON)
    }
  })
})
```

- [ ] **Step 4: Ejecutar y ver fallar**

Run: `npx vitest run tests/unit/slug.test.ts`
Esperado: FALLA — el módulo no existe.

- [ ] **Step 5: Implementar**

```ts
/** Longitud maxima de la parte legible, antes del sufijo. */
const LONGITUD_MAXIMA_BASE = 60

/**
 * El slug se genera UNA vez, al crear la propiedad, y no cambia nunca mas
 * aunque el vendedor edite el titulo: un slug que muta rompe los enlaces ya
 * publicados y es de lo peor que se le puede hacer al SEO.
 */
export function generarSlug(titulo: string, sufijo: string = sufijoAleatorio()): string {
  const base = titulo
    .normalize('NFD')
    // Rango de diacriticos combinantes, escrito con escapes: los caracteres
    // literales se corrompen al copiar entre editores con codificaciones
    // distintas, y este fichero se edita en Windows.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const recortado = recortarSinPartirPalabra(base, LONGITUD_MAXIMA_BASE)
  return `${recortado || 'propiedad'}-${sufijo}`
}

function recortarSinPartirPalabra(valor: string, maximo: number): string {
  if (valor.length <= maximo) return valor
  const corte = valor.lastIndexOf('-', maximo)
  const trozo = corte > 0 ? valor.slice(0, corte) : valor.slice(0, maximo)
  // Un guion final romperia el CHECK '^[a-z0-9]+(-[a-z0-9]+)*$'.
  return trozo.replace(/-+$/, '')
}

/** 4 hex = 65.536 combinaciones. La colision se resuelve reintentando (Task 7). */
function sufijoAleatorio(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(2))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 6: Ejecutar y ver pasar**

Run: `npx vitest run tests/unit/slug.test.ts` → PASS (6 pruebas).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260904000200_slug_con_digitos.sql src/lib/propiedades/slug.ts tests/unit/slug.test.ts
git commit -m "feat(propiedades): generador de slug estable con sufijo antocolision"
```

---

## Task 3: Una foto obligatoria para publicar

**Files:**
- Create: `supabase/migrations/20260904000300_exigir_imagen_publicar.sql`
- Create: `tests/rls/imagen-publicar.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: pasar a `publicada` sin imágenes lanza `23514`. La Task 9 traduce ese código a un
  mensaje para el vendedor.

- [ ] **Step 1: Escribir la migración**

```sql
-- Unica excepcion a "publicacion directa": una ficha sin fotos no sirve en un
-- portal inmobiliario y es la que mas dana el catalogo que construira el SP1.
-- Va en la base y no solo en el formulario porque PostgREST esta expuesto: un
-- PATCH directo se saltaria cualquier validacion de la aplicacion.
CREATE OR REPLACE FUNCTION public.exigir_imagen_para_publicar() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.estado = 'publicada'::public.estado_propiedad
     AND (TG_OP = 'INSERT'
          OR OLD.estado IS DISTINCT FROM 'publicada'::public.estado_propiedad)
     AND NOT EXISTS (
       SELECT 1 FROM public.imagenes_propiedad i WHERE i.propiedad_id = NEW.id
     )
  THEN
    RAISE EXCEPTION 'Una propiedad publicada necesita al menos una imagen'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER propiedades_exigir_imagen
  BEFORE INSERT OR UPDATE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.exigir_imagen_para_publicar();
```

- [ ] **Step 2: Escribir la prueba**

Crear `tests/rls/imagen-publicar.test.ts`. Necesita una sesión de vendedor: mirar cómo lo hace
`tests/rls/propiedades.test.ts` y seguir ese patrón exacto para iniciar sesión y crear datos.

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { clienteAdmin, sesionVendedor } from './ayudantes'

describe('publicar exige al menos una imagen', () => {
  let propiedadId: string
  let cliente: Awaited<ReturnType<typeof sesionVendedor>>

  beforeAll(async () => {
    cliente = await sesionVendedor()
    const { data, error } = await cliente
      .from('propiedades')
      .insert({
        titulo: 'Casa de prueba para el trigger',
        descripcion: 'Descripcion suficiente para la prueba.',
        slug: `prueba-trigger-${Date.now().toString(36)}`,
        operacion: 'venta', tipo_inmueble: 'casa', precio: 100000000,
      })
      .select('id').single()
    expect(error).toBeNull()
    propiedadId = data!.id
  })

  afterAll(async () => {
    await clienteAdmin().from('propiedades').delete().eq('id', propiedadId)
  })

  it('sin imagenes, publicar es rechazado por la base con 23514', async () => {
    const { error } = await cliente
      .from('propiedades').update({ estado: 'publicada' }).eq('id', propiedadId).select()
    expect(error?.code).toBe('23514')

    const { data } = await clienteAdmin()
      .from('propiedades').select('estado').eq('id', propiedadId).single()
    expect(data!.estado).toBe('borrador')
  })

  it('CASO POSITIVO: con una imagen, publicar funciona', async () => {
    const { error: errorImagen } = await cliente.from('imagenes_propiedad').insert({
      propiedad_id: propiedadId,
      ruta_storage: 'prueba/imagen.webp',
      alt_text: 'Fachada de la casa de prueba',
    })
    expect(errorImagen).toBeNull()

    const { data, error } = await cliente
      .from('propiedades').update({ estado: 'publicada' }).eq('id', propiedadId).select('estado')
    expect(error).toBeNull()
    expect(data![0].estado).toBe('publicada')
  })
})
```

Si `sesionVendedor` no existe en `ayudantes.ts`, **crearla ahí** siguiendo el patrón de las
otras suites (iniciar sesión con `vendedor@portal.com` / `VendedorPrueba2026*` y devolver el
cliente autenticado). No duplicar ese código en cada suite.

- [ ] **Step 3: Aplicar y ejecutar**

```bash
npx supabase db reset && npx vitest run tests/rls/imagen-publicar.test.ts
```

- [ ] **Step 4: FALSIFICAR**

```bash
psql "$SUPABASE_DB_URL" -c "DROP TRIGGER propiedades_exigir_imagen ON public.propiedades;"
npx vitest run tests/rls/imagen-publicar.test.ts
```
Esperado: **FALLA** en la primera prueba (`expected undefined to be '23514'`).
Restaurar con `npx supabase db reset`, volver a ejecutar, verde. **Pegar ambas salidas.**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260904000300_exigir_imagen_publicar.sql tests/rls/imagen-publicar.test.ts tests/rls/ayudantes.ts
git commit -m "feat(db): exigir al menos una imagen para publicar una propiedad"
```

---

## Task 4: Cola de limpieza de Storage

`ON DELETE CASCADE` borra las filas de `imagenes_propiedad`, pero **los archivos se quedan en
Storage para siempre**. Y borrar filas de `storage.objects` por SQL no elimina los bytes: eso
solo lo hace la API de Storage. De ahí la cola.

**Files:**
- Create: `supabase/migrations/20260904000400_limpieza_almacenamiento.sql`
- Create: `tests/rls/limpieza.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `limpieza_almacenamiento (id bigserial, ruta text, intentos smallint,
  creado_en timestamptz)`. La Task 8 la drena con el cliente admin.

- [ ] **Step 1: Escribir la migración**

```sql
CREATE TABLE public.limpieza_almacenamiento (
  id        bigserial PRIMARY KEY,
  ruta      text NOT NULL,
  intentos  smallint NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX limpieza_pendiente_idx ON public.limpieza_almacenamiento (creado_en);

ALTER TABLE public.limpieza_almacenamiento ENABLE ROW LEVEL SECURITY;
-- Sin GRANT a anon ni a authenticated: solo el servidor la toca, con
-- service_role, igual que registro_auditoria.

-- SECURITY DEFINER porque el vendedor que borra la imagen no tiene permiso
-- sobre esta tabla: es el trigger quien anota, no el.
CREATE OR REPLACE FUNCTION public.encolar_limpieza_imagen() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.limpieza_almacenamiento (ruta) VALUES (OLD.ruta_storage);
  RETURN OLD;
END $$;

-- Cubre tambien el borrado en cascada: al borrar la propiedad, CASCADE borra
-- sus imagenes y este trigger dispara por cada una.
CREATE TRIGGER imagenes_encolar_limpieza
  AFTER DELETE ON public.imagenes_propiedad
  FOR EACH ROW EXECUTE FUNCTION public.encolar_limpieza_imagen();
```

- [ ] **Step 2: Escribir la prueba**

```ts
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo, sesionVendedor } from './ayudantes'

describe('cola de limpieza de Storage', () => {
  it('borrar una propiedad encola las rutas de todas sus imagenes', async () => {
    const cliente = await sesionVendedor()
    const ruta = `prueba-limpieza/${Date.now()}.webp`

    const { data: propiedad } = await cliente.from('propiedades').insert({
      titulo: 'Casa para probar la limpieza',
      descripcion: 'Descripcion suficiente.',
      slug: `limpieza-${Date.now().toString(36)}`,
      operacion: 'venta', tipo_inmueble: 'casa', precio: 50000000,
    }).select('id').single()

    await cliente.from('imagenes_propiedad').insert({
      propiedad_id: propiedad!.id, ruta_storage: ruta, alt_text: 'Imagen de prueba',
    })

    await cliente.from('propiedades').delete().eq('id', propiedad!.id)

    const { data: cola } = await clienteAdmin()
      .from('limpieza_almacenamiento').select('ruta').eq('ruta', ruta)
    expect(cola).toHaveLength(1)
  })

  it('un usuario autenticado no puede leer ni escribir la cola', async () => {
    const cliente = await sesionVendedor()

    const { data: lectura } = await cliente.from('limpieza_almacenamiento').select('id')
    expect(lectura ?? []).toHaveLength(0)

    const { error } = await cliente
      .from('limpieza_almacenamiento').insert({ ruta: 'intruso/x.webp' }).select()
    expect(error?.code).toBe('42501')
  })

  it('un anonimo tampoco', async () => {
    const { error } = await clienteAnonimo()
      .from('limpieza_almacenamiento').insert({ ruta: 'anon/x.webp' }).select()
    expect(error?.code).toBe('42501')
  })
})
```

- [ ] **Step 3: Ejecutar**

```bash
npx supabase db reset && npx vitest run tests/rls/limpieza.test.ts
```

- [ ] **Step 4: FALSIFICAR**

```bash
psql "$SUPABASE_DB_URL" -c "GRANT INSERT ON public.limpieza_almacenamiento TO authenticated;"
npx vitest run tests/rls/limpieza.test.ts
```
Esperado: **FALLA** en la segunda prueba. Restaurar con `db reset`. **Pegar ambas salidas.**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260904000400_limpieza_almacenamiento.sql tests/rls/limpieza.test.ts
git commit -m "feat(db): cola de limpieza para los archivos huerfanos de Storage"
```

---

## Task 5: Índice y esquemas de validación

**Files:**
- Create: `supabase/migrations/20260904000500_indice_panel_vendedor.sql`
- Modify: `src/lib/validacion/esquemas.ts`
- Create: `src/lib/propiedades/completitud.ts`
- Create: `tests/unit/completitud.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `esquemaPropiedad` y `esquemaPropiedadNueva` (Zod), tipos `DatosPropiedad`,
    `DatosPropiedadNueva`.
  - `faltantesParaPublicar(p: PropiedadParaCompletitud): string[]` — lista de textos en
    español; vacía significa «lista para publicar». La usan las Tasks 9, 10 y 11.

- [ ] **Step 1: La migración del índice**

```sql
CREATE INDEX propiedades_del_vendedor_idx
  ON public.propiedades (vendedor_id, actualizado_en DESC);
```

- [ ] **Step 2: Añadir los esquemas a `esquemas.ts`**

Añadir al final del fichero, **sin tocar lo existente**:

```ts
export const OPERACIONES = ['venta', 'arriendo'] as const
export const TIPOS_INMUEBLE = ['apartamento', 'casa', 'local', 'lote', 'oficina'] as const

/** Alta: solo el titulo. El resto se completa despues, sobre el borrador. */
export const esquemaPropiedadNueva = z.object({
  titulo: z.string().trim().min(10, 'Minimo 10 caracteres').max(120, 'Maximo 120'),
})

/** Edicion del borrador. Casi todo opcional: se guarda a medias a proposito. */
export const esquemaPropiedad = z.object({
  titulo: z.string().trim().min(10, 'Minimo 10 caracteres').max(120, 'Maximo 120'),
  descripcion: z.string().trim().max(4000).default(''),
  operacion: z.enum(OPERACIONES),
  tipo_inmueble: z.enum(TIPOS_INMUEBLE),
  precio: z.coerce.number().positive('El precio debe ser mayor que cero'),
  habitaciones: z.coerce.number().int().min(0).max(50).optional(),
  banos: z.coerce.number().int().min(0).max(50).optional(),
  area_m2: z.coerce.number().positive().max(100000).optional(),
  barrio_id: z.string().uuid('Elige un barrio').optional(),
  direccion: z.string().trim().max(200).optional(),
})

export type DatosPropiedadNueva = z.infer<typeof esquemaPropiedadNueva>
export type DatosPropiedad = z.infer<typeof esquemaPropiedad>
```

- [ ] **Step 3: Escribir la prueba de completitud**

```ts
import { describe, it, expect } from 'vitest'
import { faltantesParaPublicar } from '@/lib/propiedades/completitud'

const COMPLETA = {
  descripcion: 'Una descripcion con suficiente detalle para el catalogo.',
  barrio_id: '11111111-1111-1111-1111-111111111111',
  precio: 250000000,
  numeroDeImagenes: 3,
}

describe('faltantesParaPublicar', () => {
  it('una propiedad completa no tiene faltantes', () => {
    expect(faltantesParaPublicar(COMPLETA)).toEqual([])
  })

  it('sin imagenes lo reporta', () => {
    expect(faltantesParaPublicar({ ...COMPLETA, numeroDeImagenes: 0 }))
      .toContain('Al menos una foto')
  })

  it('sin barrio lo reporta', () => {
    expect(faltantesParaPublicar({ ...COMPLETA, barrio_id: null }))
      .toContain('El barrio')
  })

  it('con descripcion demasiado corta lo reporta', () => {
    expect(faltantesParaPublicar({ ...COMPLETA, descripcion: 'Corta' }))
      .toContain('Una descripcion de al menos 40 caracteres')
  })

  it('acumula todos los faltantes, no solo el primero', () => {
    const faltan = faltantesParaPublicar({
      descripcion: '', barrio_id: null, precio: 0, numeroDeImagenes: 0,
    })
    expect(faltan).toHaveLength(4)
  })
})
```

- [ ] **Step 4: Ejecutar y ver fallar**

Run: `npx vitest run tests/unit/completitud.test.ts` → FALLA, el módulo no existe.

- [ ] **Step 5: Implementar**

```ts
export interface PropiedadParaCompletitud {
  descripcion: string | null
  barrio_id: string | null
  precio: number | null
  numeroDeImagenes: number
}

const DESCRIPCION_MINIMA = 40

/**
 * Lo que le falta a una propiedad para poder publicarse, en texto para el
 * vendedor. Vacio = lista.
 *
 * Solo "Al menos una foto" esta ademas garantizado por la base (trigger
 * propiedades_exigir_imagen). Los otros tres son guia del panel: se eligio
 * publicacion directa, no moderacion.
 */
export function faltantesParaPublicar(p: PropiedadParaCompletitud): string[] {
  const faltan: string[] = []
  if (p.numeroDeImagenes < 1) faltan.push('Al menos una foto')
  if (!p.barrio_id) faltan.push('El barrio')
  if (!p.precio || p.precio <= 0) faltan.push('El precio')
  if ((p.descripcion ?? '').trim().length < DESCRIPCION_MINIMA) {
    faltan.push(`Una descripcion de al menos ${DESCRIPCION_MINIMA} caracteres`)
  }
  return faltan
}
```

- [ ] **Step 6: Ejecutar** → PASS (5 pruebas).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260904000500_indice_panel_vendedor.sql src/lib/validacion/esquemas.ts src/lib/propiedades/completitud.ts tests/unit/completitud.test.ts
git commit -m "feat(propiedades): esquemas de validacion y calculo de completitud"
```

---

## Task 6: Procesamiento de imágenes

**Files:**
- Modify: `package.json` (añadir `sharp`)
- Create: `src/lib/imagenes/procesar.ts`
- Create: `tests/unit/procesar-imagen.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ANCHO_MAXIMO = 1600`, `MAXIMO_IMAGENES_POR_PROPIEDAD = 12`
  - `procesarImagen(entrada: Buffer): Promise<Buffer>` — devuelve WebP sin metadatos.
  - `TIPOS_ACEPTADOS: readonly string[]`, `TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024`

- [ ] **Step 1: Instalar sharp**

```bash
npm install sharp
```

- [ ] **Step 2: Escribir la prueba primero**

```ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { procesarImagen, ANCHO_MAXIMO } from '@/lib/imagenes/procesar'

async function jpegDePrueba(ancho: number, alto: number, conGps = false) {
  let imagen = sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 120, b: 60 } },
  }).jpeg()
  if (conGps) {
    imagen = imagen.withExif({ IFD0: { Copyright: 'prueba' }, GPS: { GPSLatitude: '10/1 59/1 0/1' } })
  }
  return imagen.toBuffer()
}

describe('procesarImagen', () => {
  it('devuelve WebP', async () => {
    const salida = await procesarImagen(await jpegDePrueba(800, 600))
    expect((await sharp(salida).metadata()).format).toBe('webp')
  })

  it('reduce las imagenes mas anchas que el maximo', async () => {
    const salida = await procesarImagen(await jpegDePrueba(3000, 2000))
    expect((await sharp(salida).metadata()).width).toBe(ANCHO_MAXIMO)
  })

  it('NO amplia las mas pequenas', async () => {
    const salida = await procesarImagen(await jpegDePrueba(400, 300))
    expect((await sharp(salida).metadata()).width).toBe(400)
  })

  it('ELIMINA los metadatos EXIF, incluidas las coordenadas GPS', async () => {
    const conGps = await jpegDePrueba(800, 600, true)
    expect((await sharp(conGps).metadata()).exif).toBeDefined()

    const salida = await procesarImagen(conGps)
    expect((await sharp(salida).metadata()).exif).toBeUndefined()
  })

  it('el resultado pesa menos que el original', async () => {
    const original = await jpegDePrueba(3000, 2000)
    const salida = await procesarImagen(original)
    expect(salida.byteLength).toBeLessThan(original.byteLength)
  })
})
```

- [ ] **Step 3: Ejecutar y ver fallar**

Run: `npx vitest run tests/unit/procesar-imagen.test.ts` → FALLA, el módulo no existe.

- [ ] **Step 4: Implementar**

```ts
import sharp from 'sharp'

export const ANCHO_MAXIMO = 1600
export const MAXIMO_IMAGENES_POR_PROPIEDAD = 12
export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024
export const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp'] as const

/**
 * Procesa la imagen del vendedor antes de guardarla.
 *
 * El .rotate() SIN argumentos es imprescindible y va PRIMERO: aplica la
 * orientacion que declara el EXIF y luego la descarta. Si se quitara, las
 * fotos verticales de movil -- que se guardan apaisadas con una etiqueta de
 * rotacion -- apareceran giradas, porque al eliminar los metadatos se pierde
 * la etiqueta que las enderezaba.
 *
 * sharp descarta los metadatos salvo que se pida .withMetadata(), asi que
 * NO se pide: una foto tomada en la propiedad lleva las coordenadas GPS
 * exactas incrustadas, y el spec dice que la direccion exacta no es publica.
 */
export async function procesarImagen(entrada: Buffer): Promise<Buffer> {
  return sharp(entrada)
    .rotate()
    .resize({ width: ANCHO_MAXIMO, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}
```

- [ ] **Step 5: Ejecutar** → PASS (5 pruebas).

- [ ] **Step 6: FALSIFICAR el borrado de EXIF**

Añadir `.withMetadata()` antes de `.toBuffer()`, ejecutar: la prueba de EXIF **debe fallar**.
Quitarlo, ejecutar: verde. **Pegar ambas salidas.** Es el control de privacidad de esta tarea.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/imagenes/procesar.ts tests/unit/procesar-imagen.test.ts
git commit -m "feat(imagenes): procesar a WebP redimensionado y sin metadatos EXIF"
```

---

## Task 7: URLs firmadas

**Files:**
- Create: `src/lib/imagenes/firmar.ts`

**Interfaces:**
- Consumes: `crearClienteServidor` de `@/lib/supabase/cliente-servidor`.
- Produces:
  - `BUCKET_PROPIEDADES = 'propiedades'`
  - `firmarImagenes(rutas: string[]): Promise<Map<string, string>>` — ruta → URL firmada.
    Las Tasks 10 y 11 la usan para renderizar.

- [ ] **Step 1: Implementar**

```ts
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'

export const BUCKET_PROPIEDADES = 'propiedades'

/** Una hora. Se firma al renderizar; una recarga renueva. */
const SEGUNDOS_DE_VIGENCIA = 3600

/**
 * El bucket es privado desde la migracion 20260904000100. NUNCA construir una
 * URL publica de Storage: no serviria el archivo, y si el bucket volviera a ser
 * publico por error, expondria las fotos de los borradores.
 */
export async function firmarImagenes(rutas: string[]): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>()
  if (rutas.length === 0) return firmadas

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.storage
    .from(BUCKET_PROPIEDADES)
    .createSignedUrls(rutas, SEGUNDOS_DE_VIGENCIA)

  if (error || !data) return firmadas

  for (const entrada of data) {
    if (entrada.signedUrl && entrada.path) firmadas.set(entrada.path, entrada.signedUrl)
  }
  return firmadas
}
```

Devolver un `Map` vacío ante error es deliberado: la vista muestra un hueco en lugar de
reventar. La imagen es accesoria; el panel tiene que seguir siendo usable.

- [ ] **Step 2: Comprobar que compila**

Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/imagenes/firmar.ts
git commit -m "feat(imagenes): firmar URLs de Storage para el bucket privado"
```

---

## Task 8: Server actions de propiedad — crear y actualizar

**Files:**
- Create: `src/app/(vendedor)/panel/propiedades/acciones.ts`

**Interfaces:**
- Consumes: `generarSlug`, `esquemaPropiedadNueva`, `esquemaPropiedad`, `mapearError`,
  `crearClienteServidor`.
- Produces:
  - `interface EstadoPropiedad { error?: string; errores?: Record<string, string> }`
  - `crearBorrador(estado, formData): Promise<EstadoPropiedad>` — redirige a
    `/panel/propiedades/<id>`.
  - `actualizarPropiedad(estado, formData): Promise<EstadoPropiedad>`

- [ ] **Step 1: Implementar `crearBorrador` con reintento de slug**

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaPropiedad, esquemaPropiedadNueva } from '@/lib/validacion/esquemas'
import { mapearError, MENSAJE_GENERICO } from '@/lib/errores/mapear'
import { generarSlug } from '@/lib/propiedades/slug'

export interface EstadoPropiedad {
  error?: string
  errores?: Record<string, string>
}

const INTENTOS_DE_SLUG = 3

export async function crearBorrador(
  _estado: EstadoPropiedad,
  formData: FormData,
): Promise<EstadoPropiedad> {
  const analisis = esquemaPropiedadNueva.safeParse({ titulo: formData.get('titulo') })
  if (!analisis.success) {
    return { errores: { titulo: analisis.error.issues[0]!.message } }
  }

  const supabase = await crearClienteServidor()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario.user) redirect('/login')

  let id: string | null = null

  // 4 hex dan 65.536 combinaciones y slug es UNIQUE: la colision es improbable
  // pero posible. 23505 = unique_violation.
  for (let intento = 0; intento < INTENTOS_DE_SLUG && !id; intento++) {
    const { data, error } = await supabase
      .from('propiedades')
      .insert({
        vendedor_id: usuario.user.id,
        titulo: analisis.data.titulo,
        slug: generarSlug(analisis.data.titulo),
        descripcion: '',
        operacion: 'venta',
        tipo_inmueble: 'apartamento',
        precio: 1,
      })
      .select('id')
      .single()

    if (!error) { id = data!.id; break }
    if (error.code !== '23505') {
      mapearError(error)
      return { error: MENSAJE_GENERICO }
    }
  }

  if (!id) return { error: MENSAJE_GENERICO }

  revalidatePath('/panel')
  redirect(`/panel/propiedades/${id}`)
}
```

Los valores por defecto de `operacion`, `tipo_inmueble` y `precio` existen porque las columnas
son `NOT NULL` en la tabla de SP0 y el alta solo pide el título. El vendedor los corrige en la
pantalla siguiente, y `faltantesParaPublicar` le avisa de lo que queda por poner.

- [ ] **Step 2: Implementar `actualizarPropiedad`**

```ts
export async function actualizarPropiedad(
  _estado: EstadoPropiedad,
  formData: FormData,
): Promise<EstadoPropiedad> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: MENSAJE_GENERICO }

  const analisis = esquemaPropiedad.safeParse({
    titulo: formData.get('titulo'),
    descripcion: formData.get('descripcion') ?? '',
    operacion: formData.get('operacion'),
    tipo_inmueble: formData.get('tipo_inmueble'),
    precio: formData.get('precio'),
    habitaciones: formData.get('habitaciones') || undefined,
    banos: formData.get('banos') || undefined,
    area_m2: formData.get('area_m2') || undefined,
    barrio_id: formData.get('barrio_id') || undefined,
    direccion: formData.get('direccion') || undefined,
  })

  if (!analisis.success) {
    const errores: Record<string, string> = {}
    for (const problema of analisis.error.issues) {
      errores[String(problema.path[0])] = problema.message
    }
    return { errores }
  }

  const supabase = await crearClienteServidor()

  // El slug NO se actualiza nunca, aunque cambie el titulo: un slug que muta
  // rompe los enlaces ya publicados.
  const { data, error } = await supabase
    .from('propiedades').update(analisis.data).eq('id', id).select('id')

  if (error) { mapearError(error); return { error: MENSAJE_GENERICO } }

  // RLS deniega filtrando filas: cero filas significa "no es tuya".
  if (!data || data.length === 0) return { error: MENSAJE_GENERICO }

  revalidatePath(`/panel/propiedades/${id}`)
  revalidatePath('/panel')
  return {}
}
```

- [ ] **Step 3: Comprobar tipos y commitear**

```bash
npx tsc --noEmit
git add "src/app/(vendedor)/panel/propiedades/acciones.ts"
git commit -m "feat(panel): acciones de crear borrador y actualizar propiedad"
```

---

## Task 9: Server actions de estado y eliminación

**Files:**
- Modify: `src/app/(vendedor)/panel/propiedades/acciones.ts`
- Modify: `src/lib/errores/mapear.ts`

**Interfaces:**
- Consumes: lo de la Task 8, más `firmarImagenes` no (aquí no hace falta).
- Produces: `cambiarEstado(id: string, estado: EstadoDestino)`, `eliminarPropiedad(id: string)`,
  y la constante exportada `MENSAJE_SIN_FOTOS` en `mapear.ts`.

- [ ] **Step 1: Añadir el mensaje del trigger a `mapear.ts`**

```ts
export const MENSAJE_SIN_FOTOS =
  'Para publicar necesitas subir al menos una foto de la propiedad.'
```

Y dentro de `mapearError`, antes del `return` final:

```ts
  // 23514 = check_violation. Lo lanza el trigger propiedades_exigir_imagen.
  if (codigo === '23514') {
    return { mensaje: MENSAJE_SIN_FOTOS, idCorrelacion }
  }
```

Nota: se traduce el **código**, nunca el texto del error de Postgres. La regla de este módulo
es que el mensaje devuelto jamás se construye a partir del error original.

- [ ] **Step 2: Añadir las acciones de estado**

```ts
export type EstadoDestino = 'publicada' | 'pausada' | 'vendida' | 'borrador'

export async function cambiarEstado(id: string, estado: EstadoDestino): Promise<EstadoPropiedad> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('propiedades').update({ estado }).eq('id', id).select('id')

  if (error) return { error: mapearError(error).mensaje }
  if (!data || data.length === 0) return { error: MENSAJE_GENERICO }

  revalidatePath('/panel')
  revalidatePath(`/panel/propiedades/${id}`)
  return {}
}
```

`mapearError(error).mensaje` se usa aquí —y no `MENSAJE_GENERICO` a secas— justamente para que
el `23514` del trigger llegue al vendedor como «necesitas al menos una foto».

- [ ] **Step 3: Añadir la eliminación con drenado de la cola**

```ts
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { BUCKET_PROPIEDADES } from '@/lib/imagenes/firmar'

export async function eliminarPropiedad(id: string): Promise<EstadoPropiedad> {
  const supabase = await crearClienteServidor()

  // Borrar como el vendedor: RLS garantiza que solo puede borrar lo suyo.
  const { data, error } = await supabase
    .from('propiedades').delete().eq('id', id).select('id')

  if (error) { mapearError(error); return { error: MENSAJE_GENERICO } }
  if (!data || data.length === 0) return { error: MENSAJE_GENERICO }

  await drenarLimpieza()
  revalidatePath('/panel')
  return {}
}

/**
 * El CASCADE ya borro las filas de imagenes_propiedad y el trigger dejo sus
 * rutas en limpieza_almacenamiento. Los bytes solo los borra la API de Storage,
 * y esa tabla solo la puede tocar service_role.
 *
 * Si esto falla, las rutas se quedan en la cola: basura acumulada, nunca un
 * archivo perdido sin registro.
 */
async function drenarLimpieza(): Promise<void> {
  // crearClienteAdmin ya existe en src/lib/supabase/cliente-admin.ts, con
  // import 'server-only'. NO construir otro cliente aqui.
  const admin = crearClienteAdmin()

  const { data: pendientes } = await admin
    .from('limpieza_almacenamiento').select('id, ruta').limit(100)

  if (!pendientes || pendientes.length === 0) return

  const { data: borrados } = await admin.storage
    .from(BUCKET_PROPIEDADES)
    .remove(pendientes.map((p) => p.ruta))

  const rutasBorradas = new Set((borrados ?? []).map((o) => o.name))
  const idsCumplidos = pendientes.filter((p) => rutasBorradas.has(p.ruta)).map((p) => p.id)

  if (idsCumplidos.length > 0) {
    await admin.from('limpieza_almacenamiento').delete().in('id', idsCumplidos)
  }
}
```

**Resuelto en el escaneo previo:** `crearClienteAdmin()` **ya existe** en
`src/lib/supabase/cliente-admin.ts`, con `import 'server-only'` y la advertencia de que salta
RLS por completo. Se reutiliza. No construir otro cliente de service_role en este fichero.

- [ ] **Step 4: Tipos y commit**

```bash
npx tsc --noEmit
git add "src/app/(vendedor)/panel/propiedades/acciones.ts" src/lib/errores/mapear.ts
git commit -m "feat(panel): transiciones de estado y borrado con limpieza de Storage"
```

---

## Task 10: Acciones de imágenes

**Files:**
- Create: `src/app/(vendedor)/panel/propiedades/[id]/acciones-imagenes.ts`

**Interfaces:**
- Consumes: `procesarImagen`, `TIPOS_ACEPTADOS`, `TAMANO_MAXIMO_BYTES`,
  `MAXIMO_IMAGENES_POR_PROPIEDAD`, `BUCKET_PROPIEDADES`.
- Produces: `subirImagen(estado, formData)`, `eliminarImagen(imagenId, propiedadId)`,
  `reordenarImagen(imagenId, propiedadId, direccion: 'arriba' | 'abajo')`.

- [ ] **Step 1: Implementar la subida**

```ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { mapearError, MENSAJE_GENERICO } from '@/lib/errores/mapear'
import { BUCKET_PROPIEDADES } from '@/lib/imagenes/firmar'
import {
  procesarImagen, TIPOS_ACEPTADOS, TAMANO_MAXIMO_BYTES, MAXIMO_IMAGENES_POR_PROPIEDAD,
} from '@/lib/imagenes/procesar'

export interface EstadoImagen { error?: string }

export async function subirImagen(
  _estado: EstadoImagen,
  formData: FormData,
): Promise<EstadoImagen> {
  const propiedadId = String(formData.get('propiedad_id') ?? '')
  const altText = String(formData.get('alt_text') ?? '').trim()
  const archivo = formData.get('archivo')

  if (!propiedadId || !(archivo instanceof File) || archivo.size === 0) {
    return { error: 'Elige una imagen.' }
  }
  if (altText.length < 5) {
    return { error: 'Describe la foto en al menos 5 caracteres.' }
  }
  // Validar ANTES de procesar: no gastar CPU en algo que se va a rechazar.
  if (!TIPOS_ACEPTADOS.includes(archivo.type as (typeof TIPOS_ACEPTADOS)[number])) {
    return { error: 'Solo se aceptan imagenes JPG, PNG o WebP.' }
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return { error: 'La imagen supera los 5 MB.' }
  }

  const supabase = await crearClienteServidor()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario.user) return { error: MENSAJE_GENERICO }

  const { count } = await supabase
    .from('imagenes_propiedad')
    .select('id', { count: 'exact', head: true })
    .eq('propiedad_id', propiedadId)

  if ((count ?? 0) >= MAXIMO_IMAGENES_POR_PROPIEDAD) {
    return { error: `Maximo ${MAXIMO_IMAGENES_POR_PROPIEDAD} fotos por propiedad.` }
  }

  let procesada: Buffer
  try {
    procesada = await procesarImagen(Buffer.from(await archivo.arrayBuffer()))
  } catch {
    return { error: 'No pudimos procesar esa imagen. Prueba con otra.' }
  }

  // La ruta DEBE empezar por el uid: es lo que exige la politica
  // storage_propiedades_escritura de SP0.
  const ruta = `${usuario.user.id}/${propiedadId}/${randomUUID()}.webp`

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_PROPIEDADES)
    .upload(ruta, procesada, { contentType: 'image/webp' })

  if (errorSubida) { mapearError(errorSubida); return { error: MENSAJE_GENERICO } }

  const { error: errorFila } = await supabase.from('imagenes_propiedad').insert({
    propiedad_id: propiedadId, ruta_storage: ruta, alt_text: altText, orden: count ?? 0,
  })

  // Si la fila no entra, el archivo quedaria huerfano SIN registro en la cola
  // (la cola se alimenta al borrar filas, y aqui no hay fila). Se borra a mano.
  if (errorFila) {
    await supabase.storage.from(BUCKET_PROPIEDADES).remove([ruta])
    mapearError(errorFila)
    return { error: MENSAJE_GENERICO }
  }

  revalidatePath(`/panel/propiedades/${propiedadId}`)
  return {}
}
```

- [ ] **Step 2: Implementar borrado y reordenación**

```ts
export async function eliminarImagen(imagenId: string, propiedadId: string): Promise<EstadoImagen> {
  const supabase = await crearClienteServidor()

  const { data, error } = await supabase
    .from('imagenes_propiedad').delete().eq('id', imagenId).select('ruta_storage')

  if (error) { mapearError(error); return { error: MENSAJE_GENERICO } }
  if (!data || data.length === 0) return { error: MENSAJE_GENERICO }

  // El trigger imagenes_encolar_limpieza ya anoto la ruta. Se intenta borrar
  // el archivo aqui; si falla, queda en la cola.
  await supabase.storage.from(BUCKET_PROPIEDADES).remove([data[0].ruta_storage])

  revalidatePath(`/panel/propiedades/${propiedadId}`)
  return {}
}

export async function reordenarImagen(
  imagenId: string,
  propiedadId: string,
  direccion: 'arriba' | 'abajo',
): Promise<EstadoImagen> {
  const supabase = await crearClienteServidor()

  const { data: imagenes } = await supabase
    .from('imagenes_propiedad')
    .select('id, orden')
    .eq('propiedad_id', propiedadId)
    .order('orden', { ascending: true })

  if (!imagenes) return { error: MENSAJE_GENERICO }

  const posicion = imagenes.findIndex((i) => i.id === imagenId)
  const destino = direccion === 'arriba' ? posicion - 1 : posicion + 1
  if (posicion < 0 || destino < 0 || destino >= imagenes.length) return {}

  const a = imagenes[posicion]!
  const b = imagenes[destino]!

  await supabase.from('imagenes_propiedad').update({ orden: b.orden }).eq('id', a.id)
  await supabase.from('imagenes_propiedad').update({ orden: a.orden }).eq('id', b.id)

  revalidatePath(`/panel/propiedades/${propiedadId}`)
  return {}
}
```

- [ ] **Step 3: Tipos y commit**

```bash
npx tsc --noEmit
git add "src/app/(vendedor)/panel/propiedades/[id]/acciones-imagenes.ts"
git commit -m "feat(panel): subir, eliminar y reordenar las fotos de una propiedad"
```

---

## Task 11: El panel — listado de mis propiedades

**Files:**
- Modify: `src/app/(vendedor)/panel/page.tsx`

**Interfaces:**
- Consumes: `faltantesParaPublicar`, `crearClienteServidor`.
- Produces: nada que otras tareas usen.

- [ ] **Step 1: Reemplazar el marcador de posición**

Sustituir el contenido actual (que dice «Se construye en el SP3») por el listado real. Debe:

- Leer las propiedades del vendedor con `crearClienteServidor()` — RLS ya filtra por dueño,
  **no** hace falta un `.eq('vendedor_id', ...)`, aunque añadirlo no daña.
- Traer el número de imágenes de cada una, para `faltantesParaPublicar`.
- Ordenar por `actualizado_en` descendente (el índice de la Task 5).
- Mostrar por cada propiedad: título, estado, precio, y **la lista de lo que le falta** si no
  está publicada.
- Un enlace a `/panel/propiedades/nueva`.
- Un estado vacío en español cuando no hay ninguna: explicar qué hacer, no dejar la página en
  blanco.

```tsx
export const metadata = {
  title: 'Mis propiedades | Portal Inmobiliario',
  description: 'Publica y administra tus propiedades en venta y arriendo.',
  robots: { index: false, follow: false },
}

export default async function PaginaPanelVendedor() {
  const supabase = await crearClienteServidor()

  const { data: propiedades } = await supabase
    .from('propiedades')
    .select('id, titulo, estado, precio, barrio_id, descripcion, imagenes_propiedad(id)')
    .order('actualizado_en', { ascending: false })

  // ...render
}
```

`imagenes_propiedad(id)` es una consulta anidada de PostgREST: devuelve el array de imágenes
relacionadas, y su `.length` es el `numeroDeImagenes` que pide `faltantesParaPublicar`.

**Conservar `robots: { index: false, follow: false }`.** Es un panel privado; SP0 ya lo tenía
y no puede perderse.

- [ ] **Step 2: Comprobar visualmente**

```bash
npm run dev
```
Entrar con `vendedor@portal.com` / `VendedorPrueba2026*` y ver `/panel`. Sin propiedades debe
verse el estado vacío, no una página en blanco.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(vendedor)/panel/page.tsx"
git commit -m "feat(panel): listado de propiedades del vendedor con lo que falta a cada una"
```

---

## Task 12: Pantallas de alta y edición

**Files:**
- Create: `src/app/(vendedor)/panel/propiedades/nueva/page.tsx`
- Create: `src/app/(vendedor)/panel/propiedades/nueva/formulario.tsx`
- Create: `src/app/(vendedor)/panel/propiedades/[id]/page.tsx`
- Create: `src/app/(vendedor)/panel/propiedades/[id]/formulario-datos.tsx`
- Create: `src/app/(vendedor)/panel/propiedades/[id]/panel-fotos.tsx`

**Interfaces:**
- Consumes: todas las acciones de las Tasks 8, 9 y 10, y `firmarImagenes`.
- Produces: nada que otras tareas usen.

- [ ] **Step 1: La pantalla de alta**

`nueva/page.tsx` es un server component con la metadata (`robots: noindex`) que renderiza
`formulario.tsx`, un componente de cliente con `useActionState(crearBorrador, {})`. Un solo
campo, `titulo`, y un botón. Seguir el patrón exacto de
`src/app/(auth)/login/formulario.tsx`: `'use client'`, `useActionState`, y el error mostrado
con `role="alert"`.

- [ ] **Step 2: La pantalla de edición**

`[id]/page.tsx` (server component):
- Carga la propiedad con sus imágenes y la lista de barrios.
- Si no existe o no es del vendedor, RLS devuelve cero filas → `notFound()`.
- Firma las URLs de las imágenes con `firmarImagenes`.
- Renderiza `formulario-datos.tsx` y `panel-fotos.tsx`.
- Muestra los faltantes y los botones de estado, deshabilitando **Publicar** cuando
  `faltantesParaPublicar` no está vacío.
- Metadata con `robots: { index: false, follow: false }`.

- [ ] **Step 3: `formulario-datos.tsx`**

Cliente, con `useActionState(actualizarPropiedad, {})`. Campos: `titulo`, `descripcion`,
`operacion` (select con `OPERACIONES`), `tipo_inmueble` (select con `TIPOS_INMUEBLE`),
`precio`, `habitaciones`, `banos`, `area_m2`, `barrio_id` (select con los barrios recibidos
por props), `direccion`. Un `<input type="hidden" name="id">`. Los errores por campo salen de
`estado.errores`.

Junto al campo de dirección, un texto que diga que **no se muestra públicamente**: el catálogo
enseñará el barrio. Que el vendedor lo sepa evita que la deje en blanco por desconfianza.

- [ ] **Step 4: `panel-fotos.tsx`**

Cliente. Muestra las imágenes ya subidas con su `alt_text` y botones de subir/eliminar/mover.
Formulario de subida con `useActionState(subirImagen, {})`: `<input type="file">`, campo de
texto alternativo **obligatorio**, y un `<input type="hidden" name="propiedad_id">`.

Usar **`next/image` con la prop `unoptimized`**, y las URLs firmadas como `src`.

`unoptimized` desactiva el optimizador —que con URLs que caducan es frágil, y por eso se
decidió evitarlo— pero conserva lo que sí interesa: `next/image` **obliga a declarar `width` y
`height`**, y eso evita el salto de maquetación al cargar. El encargo original exige cuidar
las métricas de Core Web Vitals, y el desplazamiento de contenido es una de ellas.

`<img>` a secas **no** vale: el eslint del proyecto extiende `core-web-vitals`, donde
`@next/next/no-img-element` es **error**, y la verificación final exige que `npm run lint`
pase.

Poner `alt={imagen.alt_text}` — el `alt` es obligatorio en la base precisamente para esto.

- [ ] **Step 5: Comprobar el flujo entero a mano**

Con `npm run dev`: crear borrador → completar datos → subir foto → publicar → pausar.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(vendedor)/panel/propiedades"
git commit -m "feat(panel): pantallas de alta y edicion de propiedades con gestion de fotos"
```

---

## Task 13: RLS entre vendedores, E2E y verificación final

**Files:**
- Create: `tests/rls/propiedades-vendedor.test.ts`
- Create: `tests/e2e/panel-vendedor.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada.

- [ ] **Step 1: La prueba de aislamiento entre vendedores**

El seed solo trae un vendedor. Crear un segundo con `clienteAdmin().auth.admin.createUser`
(mirar cómo lo hace `tests/rls/registro-rol.test.ts`) y comprobar que:

- El vendedor B **no ve** el borrador del vendedor A (cero filas), **y** el caso positivo: A sí
  lo ve.
- El vendedor B **no puede actualizar** la propiedad de A: `.update(...).select()` devuelve
  cero filas, **y** el dato en la base sigue intacto leído con `clienteAdmin()`.
- El vendedor B **no puede insertar** una imagen en la propiedad de A: asertar `42501`.
- El vendedor B **no puede borrar** la propiedad de A: cero filas y la propiedad sigue ahí.

- [ ] **Step 2: El E2E**

`tests/e2e/panel-vendedor.spec.ts`, siguiendo el estilo de la suite existente:

1. Entrar como vendedor.
2. Ir a `/panel`, pulsar el enlace de crear.
3. Escribir un título, enviar; comprobar que estamos en `/panel/propiedades/<id>`.
4. Completar datos y guardar.
5. Comprobar que **Publicar está deshabilitado** y que aparece «Al menos una foto».
6. Subir una imagen de prueba con su texto alternativo.
7. Publicar; comprobar el estado `publicada`.
8. Pausar; comprobar `pausada`.

El paso 5 es el que demuestra la integración: sin él, el resto pasaría igual aunque la lista de
faltantes no funcionara.

- [ ] **Step 3: Verificación final**

```bash
npx supabase db reset
npm run test:unit
npm run test:rls
npm run test:e2e
npm run build
npm run verificar:render
npx tsc --noEmit
npm run lint
```

Base a superar: **133 unitarias, 76 RLS, 12 E2E**. Todo verde, el build compilando y el guard
del prerender pasando. **Pegar los totales reales.** Si algo queda en rojo, decirlo con la
salida.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test(sp3): aislamiento entre vendedores y recorrido completo del panel"
```

---

## Autorrevisión del plan

**Cobertura del spec:**

| Requisito del spec | Tarea |
|---|---|
| §4.1 bucket privado | 1 |
| §4.2 CHECK del slug | 2 |
| §4.3 trigger de una foto | 3 |
| §4.4 cola de limpieza | 4 |
| §4.5 índice | 5 |
| §5.1 procesar al subir, EXIF | 6, 10 |
| §5.2 URLs firmadas | 7 |
| §6 slug estable | 2, 8 |
| §7 rutas y máquina de estados | 9, 11, 12 |
| §8 errores | 9, 10 |
| §9 pruebas y falsificación | 1, 3, 4, 6, 13 |
| §12 criterios 1–11 | 1, 2, 3, 4, 6, 9, 12, 13 |

**Consistencia de tipos:** `EstadoPropiedad` (Tasks 8, 9) y `EstadoImagen` (Task 10) son
interfaces distintas a propósito: viven en ficheros distintos y no se mezclan.
`faltantesParaPublicar` recibe `numeroDeImagenes`, que en la Task 11 sale de
`imagenes_propiedad(id).length`. `BUCKET_PROPIEDADES` se define una sola vez, en
`firmar.ts` (Task 7), y lo importan las Tasks 9 y 10.

**Riesgo conocido:** la Task 9 crea un cliente de service_role dentro del fichero de acciones.
Antes de escribirlo hay que mirar `src/lib/supabase/cliente-admin.ts` y reutilizarlo si ya
expone lo necesario, en vez de duplicar la construcción del cliente. Está anotado en la propia
tarea.
