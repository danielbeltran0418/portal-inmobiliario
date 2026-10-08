'use client'

import { useActionState } from 'react'
import { iniciarAlta, verificarCodigo, type EstadoAlta, type EstadoCodigo } from './acciones'
import { CAMPO_ACCESO } from '../login/formulario'
import { MarcoAcceso } from '@/components/acceso/marco-acceso'

const BOTON =
  'h-12 w-full rounded-xl bg-marca text-base font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte active:scale-[0.98] disabled:opacity-60'

function AvisoError({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null
  return (
    <p role="alert" className="rounded-xl border border-peligro/30 bg-peligro-suave px-4 py-3 text-sm text-peligro">
      {mensaje}
    </p>
  )
}

function CampoCodigo({ factorId }: { factorId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoCodigo, FormData>(verificarCodigo, {})
  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="factor_id" value={factorId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="codigo" className="text-sm font-medium text-tinta">Código de 6 dígitos</label>
        <input
          id="codigo" name="codigo" type="text" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7}
          autoComplete="one-time-code" required autoFocus className={CAMPO_ACCESO}
        />
      </div>
      <AvisoError mensaje={estado.error} />
      <button type="submit" disabled={pendiente} className={BOTON}>
        {pendiente ? 'Verificando…' : 'Verificar'}
      </button>
    </form>
  )
}

export function FormularioDobleFactor({ factorId }: { factorId: string | null }) {
  const [alta, pedirAlta, pidiendo] = useActionState<EstadoAlta>(iniciarAlta, {})
  const factor = factorId ?? alta.factorId ?? null

  return (
    <MarcoAcceso>
      <h1 className="font-titulo text-3xl font-semibold text-tinta">Verificación en dos pasos</h1>

      {factorId ? (
        <>
          <p className="mt-1 mb-6 text-sm text-tinta-suave">
            Abre tu app de autenticación y escribe el código del Portal Inmobiliario.
          </p>
          <CampoCodigo factorId={factorId} />
        </>
      ) : alta.factorId && alta.qr ? (
        <>
          <p className="mt-1 mb-4 text-sm text-tinta-suave">
            Escanea este código con tu app de autenticación (Google Authenticator, 1Password,
            Authy…) y escribe el código de 6 dígitos que te muestre.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI SVG de Supabase, no pasa por el optimizador */}
          <img src={alta.qr} alt="Código QR para tu app de autenticación" className="mx-auto mb-3 h-48 w-48 rounded-xl bg-white p-2" />
          <p className="mb-6 text-center text-xs text-tinta-suave">
            ¿No puedes escanearlo? Escribe esta clave:{' '}
            <code data-testid="secreto-totp" className="break-all font-mono text-tinta">{alta.secreto}</code>
          </p>
          {factor && <CampoCodigo factorId={factor} />}
        </>
      ) : (
        <>
          <p className="mt-1 mb-6 text-sm text-tinta-suave">
            El panel de control exige un segundo factor. Configura una app de autenticación en tu
            teléfono; solo tienes que hacerlo una vez.
          </p>
          <form action={pedirAlta} className="flex flex-col gap-4">
            <AvisoError mensaje={alta.error} />
            <button type="submit" disabled={pidiendo} className={BOTON}>
              {pidiendo ? 'Preparando…' : 'Configurar autenticador'}
            </button>
          </form>
        </>
      )}
    </MarcoAcceso>
  )
}
