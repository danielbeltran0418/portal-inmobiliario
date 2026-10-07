import type { Metadata } from 'next'
import { FormularioNuevaPropiedad } from './formulario'

export const metadata: Metadata = {
  title: 'Nueva propiedad | Portal Inmobiliario',
  description: 'Crea el borrador de una nueva propiedad para publicar.',
  // Privada: no se indexa, y ademas no se sigue ningun enlace desde ella.
  robots: { index: false, follow: false },
}

/**
 * Alta de una propiedad: solo pide el titulo. crearBorrador (Task 8) crea la
 * fila con el resto de columnas vacias/por defecto y redirige de inmediato a
 * /panel/propiedades/[id], donde se completan datos y fotos.
 */
export default function PaginaNuevaPropiedad() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <h1 className="font-titulo text-3xl font-semibold text-tinta">Nueva propiedad</h1>
      <p className="mt-2 text-tinta-suave">
        Empieza con un título. Vas a poder completar el resto de los datos y las fotos
        despues, sobre el borrador.
      </p>
      <FormularioNuevaPropiedad />
    </main>
  )
}
