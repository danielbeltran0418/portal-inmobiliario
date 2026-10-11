export interface PinCatalogo { id: string; titulo: string; precio: number; operacion: string; latitud: number; longitud: number; ruta: string }
export function precioPin(precio: number, operacion: string): string {
  const compacto = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(precio)
  return `$${compacto}${operacion === 'arriendo' ? '/mes' : operacion === 'temporal' ? '/noche' : ''}`
}