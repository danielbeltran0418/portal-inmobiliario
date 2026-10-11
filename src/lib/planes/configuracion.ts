import 'server-only'

export function configuracionWompi() {
  if (process.env.WOMPI_ENABLED !== 'true') return null
  const publica = process.env.WOMPI_PUBLIC_KEY
  const integridad = process.env.WOMPI_INTEGRITY_SECRET
  const eventos = process.env.WOMPI_EVENTS_SECRET
  const ambiente = process.env.WOMPI_ENVIRONMENT
  if (!publica || !integridad || !eventos || (ambiente !== 'test' && ambiente !== 'prod')) return null
  const prefijo = ambiente === 'test' ? 'test' : 'prod'
  if (!publica.startsWith(`pub_${prefijo}_`) || !integridad.startsWith(`${prefijo}_integrity_`) || !eventos.startsWith(`${prefijo}_events_`)) return null
  return { publica, integridad, eventos, ambiente, api: ambiente === 'test' ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1' }
}