import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/auth/sesion';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';
import { obtenerPerfilComprador } from '@/lib/comprador/datos-personales';
import { FormularioDatosComprador } from '@/components/comprador/FormularioDatosComprador';

export const metadata: Metadata = {
  title: 'Datos Personales y Privacidad | Portal Inmobiliario',
  description: 'Consulta y actualización de tus datos y derechos ARCO en el Portal Inmobiliario.',
  robots: { index: false, follow: false },
};

export default async function PaginaDatos() {
  const sesion = await sesionActual();
  if (!sesion.idUsuario) redirect('/login');

  const supabase = await crearClienteServidor();
  const [perfil, { data: authData }] = await Promise.all([
    obtenerPerfilComprador(supabase, sesion.idUsuario),
    supabase.auth.getUser(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-tinta">Mis Datos Personales</h2>
        <p className="text-sm text-tinta-suave">
          Ejerce tus derechos de acceso, rectificación y supresión de datos personales conforme al régimen de Habeas Data.
        </p>
      </div>

      <FormularioDatosComprador
        nombreInicial={perfil?.nombre_completo ?? ''}
        telefonoInicial={perfil?.telefono ?? ''}
        correo={authData?.user?.email ?? ''}
      />
    </div>
  );
}
