/**
 * Crea 10 publicaciones de prueba para revisar la moderacion (/control/moderacion),
 * el catalogo y el panel del vendedor.
 *
 *   npx tsx scripts/sembrar-publicaciones-prueba.ts                  # vendedor@portal.com (seed local)
 *   npx tsx scripts/sembrar-publicaciones-prueba.ts --vendedor tu@correo.com
 *   npx tsx scripts/sembrar-publicaciones-prueba.ts --vendedor nuevo@correo.com --crear-vendedor
 *   npx tsx scripts/sembrar-publicaciones-prueba.ts --limpiar        # borra solo las de prueba
 *
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.local. Contra
 * un proyecto que no sea local exige ademas --confirmar: la clave de servicio
 * salta RLS y lo que se cree aqui es visible en el catalogo publico.
 *
 * --crear-vendedor crea la cuenta si no existe, ya confirmada y con rol vendedor
 * (lo asigna el trigger handle_new_user a partir de rol_solicitado), e imprime
 * una contrasena aleatoria para entrar con ella.
 *
 * Todas las publicaciones llevan el slug con el prefijo PREFIJO_SLUG, que es lo
 * unico que usa --limpiar para encontrarlas: nunca toca otra propiedad.
 */
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', quiet: true })

const PREFIJO_SLUG = 'prueba-moderacion-'
const BUCKET = 'propiedades'

type Estado = 'publicada' | 'en_revision' | 'pausada' | 'rechazada'

interface Semilla {
  titulo: string
  descripcion: string
  operacion: 'venta' | 'arriendo'
  tipo: 'apartamento' | 'casa' | 'local' | 'lote' | 'oficina'
  precio: number
  habitaciones: number | null
  banos: number | null
  area: number
  barrio: string
  estado: Estado
  color: string
}

/**
 * Anuncios realistas, con la descripcion del inmueble, repartidos en varios
 * estados para probar suspender y reactivar desde moderacion.
 */
const SEMILLAS: Semilla[] = [
  {
    titulo: 'Apartamento con vista al mar en Riomar',
    descripcion: 'Apartamento de 3 habitaciones en piso 12, con balcon y vista al mar. Sala-comedor amplia, cocina integral, estudio y zona de ropas. El conjunto tiene piscina, gimnasio y parqueadero cubierto. A 5 minutos del Buenavista.',
    operacion: 'venta', tipo: 'apartamento', precio: 780_000_000, habitaciones: 3, banos: 2, area: 110,
    barrio: 'riomar', estado: 'publicada', color: '#2f6f8f',
  },
  {
    titulo: 'Casa familiar en Villa Santos con patio',
    descripcion: 'Casa de dos pisos con 4 habitaciones (la principal con vestier y bano), sala, comedor, cocina remodelada, patio amplio con arboles frutales y terraza en el segundo piso. Garaje para 2 carros. Cerca a colegios y centros comerciales.',
    operacion: 'venta', tipo: 'casa', precio: 950_000_000, habitaciones: 4, banos: 3, area: 220,
    barrio: 'villa-santos', estado: 'publicada', color: '#8f6a2f',
  },
  {
    titulo: 'Apartaestudio amoblado en El Prado',
    descripcion: 'Apartaestudio amoblado con cama doble, escritorio, cocineta equipada y bano con agua caliente. Aire acondicionado e internet incluidos, igual que agua y gas. Ideal para estudiantes o profesionales, a pasos de la Cra. 54.',
    operacion: 'arriendo', tipo: 'apartamento', precio: 1_600_000, habitaciones: 1, banos: 1, area: 38,
    barrio: 'el-prado', estado: 'publicada', color: '#4f8f2f',
  },
  {
    titulo: 'Local comercial esquinero en Boston',
    descripcion: 'Local esquinero de 65 m2 sobre via principal con alto flujo peatonal y vehicular. Doble fachada en vidrio, bano, deposito y punto de agua. Apto para comercio, restaurante o consultorio.',
    operacion: 'arriendo', tipo: 'local', precio: 4_500_000, habitaciones: null, banos: 1, area: 65,
    barrio: 'boston', estado: 'publicada', color: '#6a2f8f',
  },
  {
    titulo: 'Casa amplia en Alto Prado con piscina',
    descripcion: 'Casa esquinera de 5 habitaciones, cada una con bano privado. Sala-comedor de doble altura, cocina abierta con isla, estudio, piscina y jardin. Garaje para 3 carros y cuarto de servicio. Calle tranquila a dos cuadras de la Cra. 53.',
    operacion: 'venta', tipo: 'casa', precio: 2_100_000_000, habitaciones: 5, banos: 4, area: 300,
    barrio: 'alto-prado', estado: 'publicada', color: '#8f2f2f',
  },
  {
    titulo: 'Oficina en Ciudad Jardin lista para estrenar',
    descripcion: 'Oficina de 45 m2 en piso 6 con vista a la ciudad. Dos espacios de trabajo, sala de reuniones pequena, bano privado y cocineta. Aire acondicionado central, piso en porcelanato y un parqueadero. Edificio con recepcion y vigilancia 24 horas.',
    operacion: 'arriendo', tipo: 'oficina', precio: 2_800_000, habitaciones: null, banos: 1, area: 45,
    barrio: 'ciudad-jardin', estado: 'publicada', color: '#2f8f7a',
  },
  {
    titulo: 'Lote para construir en Miramar',
    descripcion: 'Lote plano de 250 m2 (10 x 25) en zona residencial consolidada, con acometidas de agua, luz y gas en el frente. Permite construir vivienda de hasta 3 pisos segun el POT.',
    operacion: 'venta', tipo: 'lote', precio: 420_000_000, habitaciones: null, banos: null, area: 250,
    barrio: 'miramar', estado: 'en_revision', color: '#7a8f2f',
  },
  {
    titulo: 'Penthouse duplex en Riomar con terraza',
    descripcion: 'Penthouse de dos niveles con 3 habitaciones, estudio y terraza privada con BBQ. Cocina integral abierta, zona de ropas y deposito. El conjunto tiene piscina, gimnasio, salon social y dos parqueaderos cubiertos.',
    operacion: 'venta', tipo: 'apartamento', precio: 1_350_000_000, habitaciones: 3, banos: 3, area: 180,
    barrio: 'riomar', estado: 'en_revision', color: '#2f5a8f',
  },
  {
    titulo: 'Casa en La Concepcion para arriendo',
    descripcion: 'Casa de un piso con 3 habitaciones, 2 banos, sala-comedor, cocina integral, patio y zona de ropas. Garaje cubierto para un carro. Sector tranquilo, cerca a rutas de transporte y al centro comercial Portal del Prado.',
    operacion: 'arriendo', tipo: 'casa', precio: 2_300_000, habitaciones: 3, banos: 2, area: 140,
    barrio: 'la-concepcion', estado: 'pausada', color: '#8f7a2f',
  },
  {
    titulo: 'Apartamento en Villa Carolina cerca a la Cra. 51B',
    descripcion: 'Apartamento de 2 habitaciones y 2 banos en piso 4, con balcon y buena ventilacion. Cocina integral, zona de ropas independiente y un parqueadero. Conjunto con piscina y parque infantil, cerca a supermercados y colegios.',
    operacion: 'venta', tipo: 'apartamento', precio: 520_000_000, habitaciones: 2, banos: 2, area: 80,
    barrio: 'villa-carolina', estado: 'rechazada', color: '#5a5a5a',
  },
]

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function esLocal(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)
}

/** Foto de relleno: un dibujo de una casa sobre el color de la semilla. Sin texto, sin fuentes. */
async function imagenDePrueba(color: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <rect width="1200" height="800" fill="${color}"/>
    <polygon points="600,180 900,420 300,420" fill="#ffffff" opacity="0.85"/>
    <rect x="360" y="420" width="480" height="260" fill="#ffffff" opacity="0.85"/>
    <rect x="560" y="530" width="80" height="150" fill="${color}"/>
  </svg>`
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer()
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  }
  if (!esLocal(url) && !process.argv.includes('--confirmar')) {
    throw new Error(
      `${url} no es local. Si de verdad quieres crear o borrar publicaciones de prueba ahi, ` +
      'repite el comando con --confirmar.',
    )
  }

  const admin = createClient(url, clave, { auth: { persistSession: false } })

  if (process.argv.includes('--limpiar')) {
    const { data: filas, error } = await admin
      .from('propiedades').select('id, imagenes_propiedad(ruta_storage)').like('slug', `${PREFIJO_SLUG}%`)
    if (error) throw error
    const rutas = (filas ?? []).flatMap((f) =>
      (f.imagenes_propiedad as { ruta_storage: string }[]).map((i) => i.ruta_storage))
    if (rutas.length) await admin.storage.from(BUCKET).remove(rutas)
    const { error: errBorrado } = await admin.from('propiedades').delete().like('slug', `${PREFIJO_SLUG}%`)
    if (errBorrado) throw errBorrado
    console.log(`Borradas ${filas?.length ?? 0} publicaciones de prueba.`)
    return
  }

  const correo = (argumento('--vendedor') ?? 'vendedor@portal.com').toLowerCase()
  let vendedorId: string | undefined
  for (let pagina = 1; !vendedorId; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error) throw error
    vendedorId = data.users.find((u) => u.email?.toLowerCase() === correo)?.id
    if (data.users.length < 200) break
  }
  if (!vendedorId && process.argv.includes('--crear-vendedor')) {
    const clave = `Prueba-${randomUUID().slice(0, 12)}`
    const { data, error } = await admin.auth.admin.createUser({
      email: correo, password: clave, email_confirm: true,
      user_metadata: { nombre: 'Vendedor de prueba', telefono: '3000000000', rol_solicitado: 'vendedor' },
    })
    if (error) throw error
    vendedorId = data.user.id
    console.log(`Cuenta vendedor creada: ${correo} / contrasena: ${clave}\n`)
  }
  if (!vendedorId) {
    throw new Error(
      `No existe ninguna cuenta con el correo ${correo}. ` +
      'Anade --crear-vendedor para crearla ya confirmada y con rol vendedor.',
    )
  }

  const { data: perfil } = await admin.from('perfiles').select('rol').eq('id', vendedorId).single()
  if (perfil?.rol !== 'vendedor') {
    throw new Error(
      `${correo} tiene rol "${perfil?.rol}", no "vendedor". Usa otra cuenta, o un correo nuevo con --crear-vendedor.`,
    )
  }

  const { data: barrios, error: errBarrios } = await admin.from('barrios').select('id, slug')
  if (errBarrios) throw errBarrios
  const barrioPorSlug = new Map(barrios.map((b) => [b.slug, b.id]))

  for (const [n, s] of SEMILLAS.entries()) {
    const slug = `${PREFIJO_SLUG}${n + 1}-${randomUUID().slice(0, 4)}`

    // Se crea en borrador y se publica DESPUES de subir la foto: el trigger
    // propiedades_exigir_imagen rechaza cualquier 'publicada' sin imagen.
    const { data: prop, error } = await admin.from('propiedades').insert({
      vendedor_id: vendedorId, slug, titulo: s.titulo, descripcion: s.descripcion,
      operacion: s.operacion, tipo_inmueble: s.tipo, precio: s.precio,
      habitaciones: s.habitaciones, banos: s.banos, area_m2: s.area,
      barrio_id: barrioPorSlug.get(s.barrio) ?? null, estado: 'borrador',
    }).select('id').single()
    if (error) throw error

    // Misma forma de ruta que acciones-imagenes.ts: <uid>/<propiedad>/<uuid>.webp
    const ruta = `${vendedorId}/${prop.id}/${randomUUID()}.webp`
    const { error: errSubida } = await admin.storage.from(BUCKET)
      .upload(ruta, await imagenDePrueba(s.color), { contentType: 'image/webp' })
    if (errSubida) throw errSubida

    const { error: errImagen } = await admin.from('imagenes_propiedad').insert({
      propiedad_id: prop.id, ruta_storage: ruta, alt_text: `Foto de ${s.titulo}`, orden: 0,
    })
    if (errImagen) throw errImagen

    const { error: errEstado } = await admin.from('propiedades').update({ estado: s.estado }).eq('id', prop.id)
    if (errEstado) throw errEstado

    console.log(`${String(n + 1).padStart(2)}. [${s.estado.padEnd(11)}] ${s.titulo}`)
  }
  console.log(`\nListo: ${SEMILLAS.length} publicaciones de ${correo}. Revisalas en /control/moderacion.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  // exitCode y no process.exit(): en Windows, salir de golpe con conexiones
  // HTTP aun cerrandose dispara "Assertion failed: UV_HANDLE_CLOSING".
  process.exitCode = 1
})
