import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { proponerSlug, crearBarrio, cambiarEstadoBarrio } from '@/lib/admin/barrios'

describe('proponerSlug (unico en todo el pais)', () => {
  it('usa el nombre si esta libre', () => {
    expect(proponerSlug('El Poblado', 'Medellín', new Set())).toBe('el-poblado')
  })

  it('un homonimo de otra ciudad lleva la ciudad en el slug', () => {
    expect(proponerSlug('El Prado', 'Bucaramanga', new Set(['el-prado']))).toBe('el-prado-bucaramanga')
  })

  it('si tambien existe con ciudad, numera', () => {
    expect(proponerSlug('El Prado', 'Bucaramanga', new Set(['el-prado', 'el-prado-bucaramanga']))).toBe('el-prado-bucaramanga-2')
  })

  it('nunca propone una ruta del portal', () => {
    expect(proponerSlug('Panel', 'Cali', new Set())).toBe('panel-cali')
  })
})

function admin(opciones: { existentes?: string[]; errorInsert?: { code: string } } = {}) {
  const insert = vi.fn(() => ({ select: () => ({ single: async () => (opciones.errorInsert ? { data: null, error: opciones.errorInsert } : { data: { id: 'b-nuevo' }, error: null }) }) }))
  const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { slug: 'chapinero' }, error: null }) }) }) }))
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const from = vi.fn(() => ({
    select: async () => ({ data: (opciones.existentes ?? []).map((slug) => ({ slug })), error: null }),
    insert,
    update,
  }))
  return { db: { from, rpc } as unknown as SupabaseClient, insert, update, rpc }
}

describe('crearBarrio', () => {
  it('crea con el slug propuesto, la ciudad tal cual y deja auditoria', async () => {
    const a = admin({ existentes: ['el-prado'] })
    const r = await crearBarrio(a.db, { nombre: ' El Prado ', ciudad: 'Bucaramanga' }, 'admin-1')
    expect(r).toEqual({ ok: true, slug: 'el-prado-bucaramanga' })
    expect(a.insert).toHaveBeenCalledWith({ nombre: 'El Prado', ciudad: 'Bucaramanga', slug: 'el-prado-bucaramanga' })
    expect(a.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', expect.objectContaining({ p_accion: 'barrio_creado', p_actor_id: 'admin-1' }))
  })

  it('exige nombre y ciudad', async () => {
    const a = admin()
    expect((await crearBarrio(a.db, { nombre: 'X', ciudad: 'Cali' }, 'admin-1')).ok).toBe(false)
    expect((await crearBarrio(a.db, { nombre: 'Chapinero', ciudad: '' }, 'admin-1')).ok).toBe(false)
    expect(a.insert).not.toHaveBeenCalled()
  })

  it('una carrera con otro admin (23505) da un mensaje claro', async () => {
    const r = await crearBarrio(admin({ errorInsert: { code: '23505' } }).db, { nombre: 'Chapinero', ciudad: 'Bogotá' }, 'admin-1')
    expect(r).toEqual({ ok: false, error: 'Ese barrio ya existe. Recarga la página.' })
  })
})

describe('cambiarEstadoBarrio', () => {
  it('desactiva sin borrar y deja auditoria', async () => {
    const a = admin()
    expect(await cambiarEstadoBarrio(a.db, 'b1', false, 'admin-1')).toEqual({ ok: true, slug: 'chapinero' })
    expect(a.update).toHaveBeenCalledWith({ activo: false })
    expect(a.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', expect.objectContaining({ p_accion: 'barrio_desactivado' }))
  })
})
