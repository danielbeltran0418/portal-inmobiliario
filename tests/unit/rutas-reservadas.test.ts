import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { RUTAS_RESERVADAS, esRutaFicha } from '@/lib/catalogo/rutas'

/** Primer segmento de cada ruta real de src/app (entrando en los grupos "(x)"). */
function segmentosDeApp(dir = 'src/app'): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (!statSync(ruta).isDirectory()) return []
    if (nombre.startsWith('(') && nombre.endsWith(')')) return segmentosDeApp(ruta)
    if (nombre.startsWith('[') || nombre.startsWith('_')) return []
    return [nombre]
  })
}

describe('rutas reservadas frente a los barrios', () => {
  it('cada ruta de primer nivel de la app esta reservada: un barrio no puede taparla', () => {
    for (const segmento of segmentosDeApp()) expect(RUTAS_RESERVADAS).toContain(segmento)
  })

  it('una ruta reservada nunca se trata como ficha', () => {
    for (const r of ['/api/cron', '/recuperar/x', '/notificaciones/baja', '/buscar/x']) {
      expect(esRutaFicha(r)).toBe(false)
    }
    expect(esRutaFicha('/el-prado/casa-a1b2')).toBe(true)
  })

  it('la base prohibe los mismos slugs de barrio (ultima version: migracion 20261014000400)', () => {
    const sql = readFileSync('supabase/migrations/20261014000400_mfa_super_admin.sql', 'utf8')
    for (const segmento of RUTAS_RESERVADAS) expect(sql).toContain(`'${segmento}'`)
  })
})
