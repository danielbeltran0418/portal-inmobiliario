'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminarPropiedad } from '../acciones'

const MENSAJE_CONFIRMACION =
  '¿Eliminar esta propiedad? Esta acción no se puede deshacer: también se ' +
  'borrarán todas sus fotos.'

/**
 * Hallazgo Importante de la revision final de rama: eliminarPropiedad()
 * (acciones.ts) estaba construida, probada (tests/unit/accion-propiedades.test.ts,
 * tests/rls/eliminar-propiedad.test.ts) y con su propia falsificacion hecha,
 * pero NINGUNA pantalla la llamaba. Consecuencia real, no solo teorica:
 * drenarLimpieza() SOLO se invoca desde dentro de eliminarPropiedad, asi que
 * sin un llamador en produccion la cola limpieza_almacenamiento nunca se
 * drena y solo crece. DECISION DEL CONTROLADOR: se cablea la accion ya
 * construida, no se enmienda el spec (que en su S7 dice "Eliminar es posible
 * desde cualquier estado").
 *
 * eliminarPropiedad() es una funcion 'use server' de firma (id) =>
 * Promise<EstadoPropiedad> -- NO el patron (prevState, formData) de
 * useActionState, y ademas devuelve datos (r.error) que hace falta leer antes
 * de decidir que hacer. Por eso NO se envuelve en un <form action={...}>
 * como el resto de PanelFotos (que ignora el resultado de
 * eliminarImagen/reordenarImagen): aqui hace falta (a) bloquear el envio con
 * un window.confirm ANTES de llamar al servidor -- irreversible, borra fotos
 * -- y (b) navegar a /panel solo si la propiedad realmente desaparecio, no si
 * la accion fallo por RLS o por un error de Storage. Un boton de tipo
 * "button" con onClick, useTransition para el estado pendiente/pantalla que
 * no se congela, y useRouter().push tras confirmar el exito consiguen las
 * dos cosas sin necesitar un <form> de por medio.
 *
 * Un window.confirm basta -- lo pide el brief explicitamente -- no se monta
 * un modal propio para una unica confirmacion binaria.
 */
export function BotonEliminar({ id }: { id: string }) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function manejarClic() {
    if (!window.confirm(MENSAJE_CONFIRMACION)) return

    setError(null)
    iniciarTransicion(async () => {
      const resultado = await eliminarPropiedad(id)
      if (resultado.error) {
        setError(resultado.error)
        return
      }
      // eliminarPropiedad ya revalido /panel (revalidatePath); la propiedad
      // dejo de existir, asi que esta pantalla ya no tiene nada que mostrar.
      router.push('/panel')
    })
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={manejarClic}
        disabled={pendiente}
        className="rounded border border-red-600 px-4 py-2 text-sm text-red-600 hover:bg-red-600/10 disabled:opacity-40"
      >
        {pendiente ? 'Eliminando...' : 'Eliminar propiedad'}
      </button>
      {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
    </div>
  )
}
