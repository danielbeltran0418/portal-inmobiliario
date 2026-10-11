import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { URL_BASE_DE_DATOS, clienteAdmin, crearUsuarioDePrueba } from './ayudantes'

let usuarioA: string; let usuarioB: string
const ordenA = randomUUID(); const ordenB = randomUUID()
const admin = clienteAdmin()
beforeAll(async () => {
  const datos = { password: 'ClaveDePrueba123!', rol: 'vendedor' as const }
  usuarioA = await crearUsuarioDePrueba({ ...datos, correo: `plan-a-${randomUUID()}@prueba.test` })
  usuarioB = await crearUsuarioDePrueba({ ...datos, correo: `plan-b-${randomUUID()}@prueba.test` })
  const { error } = await admin.from('ordenes_plan').insert([{ id: ordenA, usuario_id: usuarioA, plan: 'destacado', periodo: 'mensual', centavos: 10000, ambiente: 'test' }, { id: ordenB, usuario_id: usuarioB, plan: 'pro', periodo: 'anual', centavos: 20000, ambiente: 'prod' }])
  if (error) throw error
})
afterAll(async () => { if (usuarioA) await admin.auth.admin.deleteUser(usuarioA); if (usuarioB) await admin.auth.admin.deleteUser(usuarioB) })
async function transaccion(tarea: (db: Client) => Promise<void>) {
  const db = new Client({ connectionString: URL_BASE_DE_DATOS }); await db.connect(); await db.query('BEGIN')
  try { await tarea(db) } finally { await db.query('ROLLBACK'); await db.end() }
}
async function como(db: Client, rol: string, usuario?: string) {
  await db.query(`SET LOCAL ROLE ${rol}`)
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: usuario, role: rol, app_metadata: { rol: 'vendedor' } })])
}
describe('órdenes y suscripciones: permisos e idempotencia', () => {
  it('el dueño lee su orden y no la ajena; no puede fabricarse un pago', async () => transaccion(async (db) => {
    await como(db, 'authenticated', usuarioA)
    expect((await db.query('SELECT id FROM public.ordenes_plan WHERE id = $1', [ordenA])).rows).toHaveLength(1)
    expect((await db.query('SELECT id FROM public.ordenes_plan WHERE id = $1', [ordenB])).rows).toHaveLength(0)
    await expect(db.query("UPDATE public.ordenes_plan SET estado = 'APPROVED' WHERE id = $1", [ordenA])).rejects.toMatchObject({ code: '42501' })
  }))
  it('un usuario no puede ejecutar la confirmación; service_role sí', async () => {
    await transaccion(async (db) => {
      await como(db, 'service_role')
      expect((await db.query("SELECT public.confirmar_orden_plan($1,'tx-a',10000,'test','APPROVED') AS ok", [ordenA])).rows[0].ok).toBe(true)
    })
    await transaccion(async (db) => {
      await como(db, 'authenticated', usuarioA)
      await expect(db.query("SELECT public.confirmar_orden_plan($1,'tx-a',10000,'test','APPROVED')", [ordenA])).rejects.toMatchObject({ code: '42501' })
    })
  })
  it('rechaza monto o ambiente alterado y una repetición no prolonga la vigencia', async () => transaccion(async (db) => {
    await como(db, 'service_role')
    expect((await db.query("SELECT public.confirmar_orden_plan($1,'tx-b',1,'prod','APPROVED') AS ok", [ordenB])).rows[0].ok).toBe(false)
    expect((await db.query("SELECT public.confirmar_orden_plan($1,'tx-b',20000,'test','APPROVED') AS ok", [ordenB])).rows[0].ok).toBe(false)
    expect((await db.query("SELECT public.confirmar_orden_plan($1,'tx-b',20000,'prod','APPROVED') AS ok", [ordenB])).rows[0].ok).toBe(true)
    const antes = (await db.query('SELECT vigente_hasta FROM public.suscripciones_plan WHERE usuario_id = $1', [usuarioB])).rows[0].vigente_hasta
    expect((await db.query("SELECT public.confirmar_orden_plan($1,'tx-b',20000,'prod','APPROVED') AS ok", [ordenB])).rows[0].ok).toBe(true)
    const despues = (await db.query('SELECT vigente_hasta FROM public.suscripciones_plan WHERE usuario_id = $1', [usuarioB])).rows[0].vigente_hasta
    expect(despues).toEqual(antes)
    expect((await db.query("SELECT public.confirmar_orden_plan($1,'tx-otro',20000,'prod','APPROVED') AS ok", [ordenB])).rows[0].ok).toBe(false)
  }))
  it('sandbox nunca activa una suscripción de producción', async () => transaccion(async (db) => {
    await como(db, 'service_role')
    await db.query("SELECT public.confirmar_orden_plan($1,'tx-test',10000,'test','APPROVED')", [ordenA])
    expect((await db.query('SELECT usuario_id FROM public.suscripciones_plan WHERE usuario_id = $1', [usuarioA])).rows).toHaveLength(0)
  }))
  it('la base limita el plan básico y fija 30 días al publicar', async () => transaccion(async (db) => {
    await db.query('UPDATE public.configuracion_comercial SET planes_activos = true WHERE singleton')
    const ids = [randomUUID(),randomUUID()]
    for (const id of ids) {
      await db.query("INSERT INTO public.propiedades(id,vendedor_id,slug,titulo,descripcion,operacion,tipo_inmueble,precio) VALUES ($1,$2,$3,'Casa de prueba de planes','Descripción','venta','casa',100000)", [id,usuarioA,`plan-${id}`])
      await db.query("INSERT INTO public.imagenes_propiedad(propiedad_id,ruta_storage,alt_text) VALUES ($1,$2,'Fachada')", [id,`${usuarioA}/${id}/foto.webp`])
    }
    await db.query("UPDATE public.propiedades SET estado = 'publicada' WHERE id = $1", [ids[0]])
    expect((await db.query('SELECT publicada_hasta > now() + interval \'29 days\' AS vigente FROM public.propiedades WHERE id = $1', [ids[0]])).rows[0].vigente).toBe(true)
    await como(db,'authenticated',usuarioA)
    await expect(db.query("UPDATE public.propiedades SET estado = 'publicada' WHERE id = $1", [ids[1]])).rejects.toMatchObject({ code: '23514' })
  }))
})