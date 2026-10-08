import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'

// Supabase guarda cada migracion en supabase_migrations.schema_migrations con
// su NUMERO de version (lo que va antes del primer "_") como clave primaria.
// Dos archivos con el mismo numero rompen `supabase db reset` y `db push`
// ("duplicate key value violates unique constraint schema_migrations_pkey").
// Paso el 2026-10-08: dos PRs abiertos a la vez eligieron 20261014000100, el
// CI de main cayo y en produccion una de las dos migraciones no se aplico.
describe('migraciones', () => {
  const archivos = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))

  it('cada archivo empieza por una version numerica', () => {
    for (const archivo of archivos) expect(archivo).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/)
  })

  it('no hay dos migraciones con el mismo numero de version', () => {
    const versiones = archivos.map((f) => f.split('_')[0])
    const repetidas = versiones.filter((v, i) => versiones.indexOf(v) !== i)
    expect([...new Set(repetidas)]).toEqual([])
  })
})
