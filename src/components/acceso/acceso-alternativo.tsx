'use client'

import { useActionState, useState } from 'react'
import { accesoAlternativo, type EstadoAccesoAlternativo } from './acciones-alternativas'
import { WidgetTurnstile } from '@/app/(auth)/widget-turnstile'

export interface MetodosAcceso { google: boolean; apple: boolean; magicLink: boolean; sms: boolean }
const INICIAL: EstadoAccesoAlternativo = {}
export function AccesoAlternativo({ metodos, claveTurnstile }: { metodos: MetodosAcceso; claveTurnstile: string | null }) {
  const [estado, accion, pendiente] = useActionState(accesoAlternativo, INICIAL)
  const [metodo, setMetodo] = useState<'magicLink' | 'sms'>('magicLink')
  if (!Object.values(metodos).some(Boolean)) return null
  return <section aria-label="Otras formas de iniciar sesión" className="mt-6 border-t border-linea pt-6">
    <div className="grid gap-2 sm:grid-cols-2">{(['google', 'apple'] as const).filter((proveedor) => metodos[proveedor]).map((proveedor) => <form key={proveedor} action={accion}>
      <input type="hidden" name="metodo" value={proveedor} />
      <button disabled={pendiente} className="min-h-12 w-full rounded-xl border border-linea text-sm font-semibold text-tinta disabled:opacity-50">Continuar con {proveedor === 'google' ? 'Google' : 'Apple'}</button>
    </form>)}</div>
    {(metodos.magicLink || metodos.sms) && <form action={accion} className="mt-4 flex flex-col gap-3">
      <label className="text-sm font-medium text-tinta">Entrar sin contraseña
        <select name="metodo" value={metodos[metodo] ? metodo : 'sms'} onChange={(evento) => setMetodo(evento.target.value as 'magicLink' | 'sms')} className="mt-2 h-12 w-full rounded-xl border border-linea bg-superficie px-3">
          {metodos.magicLink && <option value="magicLink">Enlace por correo</option>}{metodos.sms && <option value="sms">Código por SMS</option>}
        </select>
      </label>
      {(metodo === 'magicLink' && metodos.magicLink) ? <label className="text-sm text-tinta">Correo electrónico<input name="correo" type="email" required autoComplete="email" className="mt-1 h-12 w-full rounded-xl border border-linea px-3" /></label> : <>
        <label className="text-sm text-tinta">Celular con +57<input name="telefono" type="tel" required pattern="\+573[0-9]{9}" placeholder="+573001234567" autoComplete="tel" className="mt-1 h-12 w-full rounded-xl border border-linea px-3" /></label>
        {estado.codigoEnviado && <label className="text-sm text-tinta">Código SMS<input name="codigo" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} className="mt-1 h-12 w-full rounded-xl border border-linea px-3" /></label>}
      </>}
      <WidgetTurnstile clave={claveTurnstile} reiniciarCon={estado} />
      <button disabled={pendiente} className="min-h-12 rounded-xl bg-marca px-4 font-semibold text-marca-contraste disabled:opacity-50">{pendiente ? 'Procesando…' : estado.codigoEnviado && (metodo === 'sms' || !metodos.magicLink) ? 'Verificar código' : 'Enviar acceso'}</button>
    </form>}
    {estado.error && <p role="alert" className="mt-3 text-sm text-peligro">{estado.error}</p>}
    {estado.mensaje && <p role="status" className="mt-3 text-sm text-tinta-suave">{estado.mensaje}</p>}
  </section>
}