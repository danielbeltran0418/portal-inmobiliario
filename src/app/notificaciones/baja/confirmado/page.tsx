export const metadata = { title: 'Alertas desactivadas' };

export default function PaginaConfirmacionBaja() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-tinta">Alertas desactivadas</h1>
      <p className="mt-2 text-tinta-suave">
        No volverás a recibir correos para esta búsqueda guardada. Puedes reactivarla en cualquier
        momento desde tu panel en <strong>Mi cuenta &gt; Búsquedas guardadas</strong>.
      </p>
    </div>
  );
}
