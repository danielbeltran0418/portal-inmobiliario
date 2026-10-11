import { createHash } from 'node:crypto'
import { beforeEach,expect,it,vi } from 'vitest'
vi.mock('server-only',()=>({}))
const m=vi.hoisted(()=>({ getUser:vi.fn(),getSession:vi.fn(),insertar:vi.fn(),plan:vi.fn(),admin:vi.fn() }))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('@/lib/supabase/cliente-servidor',()=>({crearClienteServidor:async()=>({
  auth:{getUser:m.getUser,getSession:m.getSession},
  from:()=>{const q={select:()=>q,eq:()=>q,gt:()=>q,maybeSingle:m.plan};return q},
})}))
vi.mock('@/lib/supabase/cliente-admin',()=>({crearClienteAdmin:m.admin}))
import { invitarAgente } from '@/app/(vendedor)/panel/equipo/acciones'
const fd=()=>{const datos=new FormData();datos.set('correo','agente@example.test');return datos}
beforeEach(()=>{
 vi.clearAllMocks();vi.unstubAllEnvs();vi.stubEnv('EQUIPOS_PRO_ENABLED','true')
 m.getUser.mockResolvedValue({data:{user:{id:'usuario',email:'titular@example.test',app_metadata:{}}}})
 const token='x.'+Buffer.from(JSON.stringify({app_metadata:{rol:'vendedor'}})).toString('base64url')+'.x'
 m.getSession.mockResolvedValue({data:{session:{access_token:token}}})
 m.plan.mockResolvedValue({data:{plan:'pro'},error:null})
 const q={select:()=>q,eq:()=>q,gt:()=>q,insert:m.insertar,single:async()=>({data:{id:'invitacion'},error:null}),then:(resolver:(v:unknown)=>unknown)=>Promise.resolve({count:0,error:null}).then(resolver)}
 m.insertar.mockReturnValue(q);m.admin.mockReturnValue({from:()=>q})
})
it('usa el rol del hook JWT aunque getUser no incluya ese metadato',async()=>{
 const resultado=await invitarAgente({},fd())
 expect(resultado.codigo).toMatch(/^[a-f0-9]{64}$/)
 expect(m.insertar).toHaveBeenCalledWith(expect.objectContaining({token_hash:createHash('sha256').update(resultado.codigo!).digest('hex')}))
 expect(JSON.stringify(m.insertar.mock.calls)).not.toContain(resultado.codigo)
})
it('no crea invitaciones si el equipo está desactivado o falta Pro',async()=>{
 vi.stubEnv('EQUIPOS_PRO_ENABLED','false')
 expect(await invitarAgente({},fd())).toHaveProperty('error');expect(m.admin).not.toHaveBeenCalled()
 vi.stubEnv('EQUIPOS_PRO_ENABLED','true');m.plan.mockResolvedValue({data:{plan:'destacado'},error:null})
 expect(await invitarAgente({},fd())).toHaveProperty('error');expect(m.admin).not.toHaveBeenCalled()
})