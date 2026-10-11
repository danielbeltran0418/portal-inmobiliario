import 'server-only'
import { after } from 'next/server'
import { despacharAvisosPortal } from './portal'
export function programarAvisosPortal() {
  if (process.env.NOTIFICACIONES_PORTAL_ENABLED !== 'true') return
  after(async () => { try { await despacharAvisosPortal() } catch { console.error('[avisos-portal] quedan avisos pendientes para el cron') } })
}