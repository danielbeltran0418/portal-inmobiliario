'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  actualizarPerfilCompradorAction,
  suprimirCuentaCompradorAction,
} from '@/lib/comprador/acciones-datos';

interface Props {
  nombreInicial: string;
  telefonoInicial: string;
  correo: string;
}

export function FormularioDatosComprador({
  nombreInicial,
  telefonoInicial,
  correo,
}: Props) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombreInicial);
  const [telefono, setTelefono] = useState(telefonoInicial);
  const [mensajePerfil, setMensajePerfil] = useState<string | null>(null);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);
  const [isPendingPerfil, startTransitionPerfil] = useTransition();

  // Estado de Supresión de Cuenta
  const [textoConfirmacion, setTextoConfirmacion] = useState('');
  const [errorSupresion, setErrorSupresion] = useState<string | null>(null);
  const [isPendingSupresion, startTransitionSupresion] = useTransition();

  const handleActualizar = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorPerfil(null);
    setMensajePerfil(null);

    startTransitionPerfil(async () => {
      const res = await actualizarPerfilCompradorAction({
        nombre_completo: nombre,
        telefono: telefono.trim() || null,
      });

      if (res.exito) {
        setMensajePerfil('Datos actualizados correctamente.');
        router.refresh();
      } else {
        setErrorPerfil(res.error ?? 'Error al actualizar');
      }
    });
  };

  const handleSuprimir = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorSupresion(null);

    if (textoConfirmacion !== 'ELIMINAR MI CUENTA') {
      setErrorSupresion('Escribe exactamente "ELIMINAR MI CUENTA" para proceder.');
      return;
    }

    startTransitionSupresion(async () => {
      const res = await suprimirCuentaCompradorAction(textoConfirmacion);
      if (res.exito) {
        router.push('/');
      } else {
        setErrorSupresion(res.error ?? 'No se pudo suprimir la cuenta');
      }
    });
  };

  return (
    <div className="space-y-10">
      {/* Sección 1: Datos Personales */}
      <div className="p-6 rounded-xl border border-linea bg-superficie shadow-xs">
        <h3 className="text-lg font-semibold text-tinta mb-1">Información de tu Perfil</h3>
        <p className="text-sm text-tinta-suave mb-6">
          Actualiza tus datos de contacto utilizados al solicitar información de inmuebles.
        </p>

        {mensajePerfil && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm">
            {mensajePerfil}
          </div>
        )}

        {errorPerfil && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 rounded-lg text-sm">
            {errorPerfil}
          </div>
        )}

        <form onSubmit={handleActualizar} className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-tinta-suave mb-1">
              Correo Electrónico
            </label>
            <input
              type="text"
              disabled
              value={correo}
              className="w-full px-3 py-2 border border-linea rounded-lg bg-superficie-alt text-tinta-suave cursor-not-allowed text-sm"
            />
            <p className="text-xs text-tinta-tenue mt-1">El correo está vinculado a tu cuenta y no se puede modificar.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-tinta-suave mb-1">
              Nombre Completo
            </label>
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2 border border-linea rounded-lg bg-superficie text-tinta focus:outline-none focus:ring-2 focus:ring-marca text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-tinta-suave mb-1">
              Teléfono de Contacto
            </label>
            <input
              type="text"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej. 3001234567"
              className="w-full px-3 py-2 border border-linea rounded-lg bg-superficie text-tinta focus:outline-none focus:ring-2 focus:ring-marca text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={isPendingPerfil}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-marca text-marca-contraste hover:bg-marca-fuerte disabled:opacity-50 transition-colors"
          >
            {isPendingPerfil ? 'Guardando cambios...' : 'Actualizar datos'}
          </button>
        </form>
      </div>

      {/* Sección 2: Derechos ARCO y Supresión de Cuenta (Habeas Data) */}
      <div className="p-6 rounded-xl border border-rose-200 dark:border-rose-950/60 bg-rose-50/30 dark:bg-rose-950/10 shadow-xs">
        <h3 className="text-lg font-semibold text-rose-700 dark:text-rose-400 mb-1">
          Derecho al Olvido y Supresión de Cuenta (Habeas Data)
        </h3>
        <p className="text-sm text-tinta-suave mb-4">
          Conforme a las leyes de protección de datos personales, tienes derecho a suprimir tus datos de nuestra plataforma.
        </p>

        <div className="text-xs text-tinta-suave space-y-2 mb-6 p-4 rounded-lg bg-superficie border border-linea">
          <p><strong>Al confirmar la supresión de tu cuenta:</strong></p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>Se eliminarán permanentemente tus favoritos y búsquedas guardadas.</li>
            <li>Se cancelarán las citas futuras que tengas agendadas.</li>
            <li>Tus datos de contacto en solicitudes enviadas a vendedores serán anonimizados de forma irreversible para preservar únicamente métricas de negocio agregadas.</li>
            <li>Tus credenciales de inicio de sesión serán eliminadas y tu sesión se cerrará de inmediato.</li>
          </ul>
        </div>

        {errorSupresion && (
          <div className="mb-4 p-3 bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg text-sm">
            {errorSupresion}
          </div>
        )}

        <form onSubmit={handleSuprimir} className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-rose-700 dark:text-rose-400 mb-1">
              Para confirmar, escribe exactamente: <span className="font-mono bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-rose-200 dark:border-rose-900">ELIMINAR MI CUENTA</span>
            </label>
            <input
              type="text"
              required
              value={textoConfirmacion}
              onChange={(e) => setTextoConfirmacion(e.target.value)}
              placeholder="ELIMINAR MI CUENTA"
              className="w-full px-3 py-2 border border-rose-300 dark:border-rose-900 rounded-lg bg-white dark:bg-slate-900 text-tinta focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
              data-testid="input-confirmar-supresion"
            />
          </div>

          <button
            type="submit"
            disabled={isPendingSupresion || textoConfirmacion !== 'ELIMINAR MI CUENTA'}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            data-testid="boton-confirmar-supresion"
          >
            {isPendingSupresion ? 'Procesando supresión...' : 'Suprimir mi cuenta definitivamente'}
          </button>
        </form>
      </div>
    </div>
  );
}
