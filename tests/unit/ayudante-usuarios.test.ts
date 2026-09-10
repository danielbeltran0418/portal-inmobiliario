import { expect, it, vi } from 'vitest'
const listUsers = vi.fn()
const deleteUser = vi.fn().mockResolvedValue({ error: null })
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { admin: { listUsers, deleteUser, createUser: async () => ({ data: { user: { id: 'nuevo' } }, error: null }) } },
  from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
}) }))
for (const clave of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DB_URL']) vi.stubEnv(clave, 'valor-simulado')
const { crearUsuarioDePrueba } = await import('../rls/ayudantes')
it('busca la cuenta de prueba más allá de la primera página antes de recrearla', async () => {
  listUsers.mockResolvedValueOnce({ data: { users: [{ id: 'otro', email: 'otro@prueba.test' }], nextPage: 2 }, error: null })
    .mockResolvedValueOnce({ data: { users: [{ id: 'existente', email: 'cuenta@prueba.test' }], nextPage: null }, error: null })
  await crearUsuarioDePrueba({ correo: 'cuenta@prueba.test', password: 'simulada', rol: 'vendedor' })
  expect(deleteUser).toHaveBeenCalledWith('existente')
  expect(listUsers).toHaveBeenCalledTimes(2)
})
