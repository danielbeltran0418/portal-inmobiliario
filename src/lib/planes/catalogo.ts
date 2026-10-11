export type IdPlan = 'basico' | 'destacado' | 'pro'
export interface PlanPublicacion {
  id: IdPlan
  nombre: string
  descripcion: string
  prestaciones: readonly string[]
}
export const PLANES: readonly PlanPublicacion[] = [
  { id: 'basico', nombre: 'Básico', descripcion: 'Tu primera propiedad, sin costo.', prestaciones: ['1 publicación durante 30 días', 'Hasta 8 fotografías', 'Contacto y agenda de visitas'] },
  { id: 'destacado', nombre: 'Destacado', descripcion: 'Más visibilidad para agentes individuales.', prestaciones: ['Hasta 5 propiedades', 'Prioridad en búsquedas', 'Tour de 360°', 'Verificación del perfil sujeta a revisión'] },
  { id: 'pro', nombre: 'Inmobiliaria Pro', descripcion: 'Un espacio para todo tu equipo.', prestaciones: ['Propiedades ilimitadas', 'Publicaciones destacadas en portada', 'Analítica de visitas y contactos', 'Gestión de varios agentes'] },
]
/** Solo enteros COP positivos: no se inventan tarifas ni se aceptan NaN o decimales. */
export function precioConfigurado(valor: string | undefined): number | null {
  if (!valor || !/^[1-9]\d{0,8}$/.test(valor)) return null
  const precio = Number(valor)
  return Number.isSafeInteger(precio * 100) ? precio : null
}