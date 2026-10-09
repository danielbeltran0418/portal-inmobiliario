import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'

// Dos PRs que crean una migracion con la misma marca de tiempo se mergean sin
// conflicto de git (los nombres de archivo difieren), pero `supabase db reset`
// y `db push` abortan con 23505 en schema_migrations_pkey y NO aplican ninguna
// migracion posterior. Paso con 20261014000100 (mfa_super_admin y
// limite_login_5_minutos): main quedo con el CI en rojo. docs/ESTADO-Y-GUIA.md
// ya pide coordinar la marca de tiempo; esto lo hace cumplir.
describe('migraciones de supabase', () => {
  const archivos = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))

  it('todas empiezan por una version de 14 digitos', () => {
    const malas = archivos.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f))
    expect(malas, `nombres que el CLI de Supabase no entiende: ${malas.join(', ')}`).toEqual([])
  })

  it('ninguna versión se repite', () => {
    const porVersion = new Map<string, string[]>()
    for (const archivo of archivos) {
      const version = archivo.slice(0, 14)
      porVersion.set(version, [...(porVersion.get(version) ?? []), archivo])
    }
    const repetidas = [...porVersion.entries()].filter(([, lista]) => lista.length > 1)
    expect(
      repetidas.map(([version, lista]) => `${version}: ${lista.join(' + ')}`),
      'versiones repetidas: db reset falla con schema_migrations_pkey',
    ).toEqual([])
  })
})
