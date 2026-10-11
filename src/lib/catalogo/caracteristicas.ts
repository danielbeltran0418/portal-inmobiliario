export const CARACTERISTICAS = ['conjunto_cerrado', 'mascotas', 'balcon', 'piscina', 'amoblado'] as const
export type Caracteristica = typeof CARACTERISTICAS[number]
export const ETIQUETAS_CARACTERISTICAS: Record<Caracteristica, string> = {
  conjunto_cerrado: 'Conjunto cerrado', mascotas: 'Acepta mascotas', balcon: 'Balcón', piscina: 'Piscina', amoblado: 'Amoblado',
}