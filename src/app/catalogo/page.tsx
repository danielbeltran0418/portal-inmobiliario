import Link from 'next/link'
import type { Metadata } from 'next'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
export const metadata: Metadata = { title: 'Propiedades por barrio en Barranquilla', description: 'Explora propiedades en venta y arriendo por barrio en Barranquilla.' }
export default async function Catalogo() {
  const { data, error } = await crearClientePublico().from('barrios').select('nombre,slug').eq('activo', true).order('nombre')
  if (error) throw new Error('No se pudieron cargar los barrios')
  return <main className="mx-auto w-full max-w-5xl px-6 py-12">
    <h1 className="text-3xl font-semibold">Encuentra tu próximo lugar en Barranquilla</h1>
    <p className="mt-4">Elige un barrio para explorar propiedades en venta y arriendo.</p>
    <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.map(b => <li key={b.slug}><Link className="block rounded-lg border p-6 text-lg hover:underline" href={`/${b.slug}`}>{b.nombre}</Link></li>)}</ul>
  </main>
}
