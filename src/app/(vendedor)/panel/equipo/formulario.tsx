'use client'
import { useActionState } from 'react'
import { invitarAgente, aceptarEquipo, type EstadoEquipo } from './acciones'
export function FormularioEquipo({ propietario }: { propietario: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoEquipo, FormData>(propietario ? invitarAgente : aceptarEquipo,{})
  return <form action={accion} className="space-y-4 rounded-3xl border border-linea bg-superficie p-6">
    <h2 className="font-titulo text-xl">{propietario ? 'Invitar a un agente' : 'Unirme a un equipo'}</h2>
    <label className="block text-sm">{propietario ? 'Correo del agente' : 'Código de invitación'}
      <input name={propietario ? 'correo' : 'codigo'} type={propietario ? 'email' : 'text'} required maxLength={propietario ? 254 : 64} autoComplete={propietario ? 'email' : 'off'} className="mt-2 block min-h-12 w-full rounded-xl border border-linea px-3" />
    </label>
    <button disabled={pendiente} className="min-h-12 rounded-xl bg-marca px-5 font-semibold text-marca-contraste">{pendiente ? 'Procesando…' : propietario ? 'Crear invitación' : 'Aceptar invitación'}</button>
    {estado.error && <p role="alert">{estado.error}</p>}
    {estado.mensaje && <p role="status">{estado.mensaje}</p>}
    {estado.codigo && <label className="block text-sm">Código para compartir<input readOnly value={estado.codigo} onFocus={e => e.currentTarget.select()} className="mt-2 w-full rounded-xl border border-linea p-3 font-mono" /></label>}
  </form>
}