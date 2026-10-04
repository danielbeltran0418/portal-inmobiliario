import { Button } from '@/components/ui/button';
import { darDeBajaBusqueda } from './acciones';

export const metadata = { title: 'Desactivar alertas', robots: { index: false } };

/**
 * Pagina de destino del enlace de baja de los correos de alertas. Abrirla no
 * cambia nada: la baja la hace el boton, por POST. Ver acciones.ts.
 */
export default async function PaginaBaja({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const { token } = await searchParams;

  if (typeof token !== 'string' || token === '') {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-tinta">Enlace no válido</h1>
        <p className="mt-2 text-tinta-suave">
          Este enlace de baja está incompleto. Puedes desactivar las alertas desde tu panel en{' '}
          <strong>Mi cuenta &gt; Búsquedas guardadas</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-tinta">¿Desactivar estas alertas?</h1>
      <p className="mt-2 text-tinta-suave">
        Dejarás de recibir correos con propiedades nuevas para esta búsqueda guardada.
      </p>
      <form action={darDeBajaBusqueda} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <Button type="submit">Desactivar alertas</Button>
      </form>
    </div>
  );
}
