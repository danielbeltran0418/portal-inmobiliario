import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const m=vi.hoisted(()=>({sesion:vi.fn(),upsert:vi.fn(),usuario:vi.fn()}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('@/lib/auth/sesion',()=>({sesionActual:m.sesion}))
vi.mock('@/lib/supabase/cliente-servidor',()=>({crearClienteServidor:async()=>({
 auth:{getUser:m.usuario},
 from:()=>({upsert:m.upsert}),
})}))
import {guardarPreferencias} from '@/components/acceso/acciones-preferencias'
beforeEach(()=>{
 vi.clearAllMocks();vi.unstubAllEnvs();vi.stubEnv('WHATSAPP_AVISOS_ENABLED','false')
 m.sesion.mockResolvedValue({idUsuario:'dueno'})
 m.upsert.mockReturnValue({select:()=>({single:async()=>({data:{usuario_id:'dueno'},error:null})})})
 m.usuario.mockResolvedValue({data:{user:{phone:'573001234567'}}})
})
it('rechaza preferencias manipuladas y no escribe sin sesión',async()=>{
 const fd=new FormData();fd.set('avisos_leads','true')
 expect(await guardarPreferencias({},fd)).toHaveProperty('error');expect(m.upsert).not.toHaveBeenCalled()
 m.sesion.mockResolvedValue({idUsuario:null})
 expect(await guardarPreferencias({},new FormData())).toHaveProperty('error');expect(m.upsert).not.toHaveBeenCalled()
})
it('guarda solo las preferencias del dueño y no activa WhatsApp deshabilitado',async()=>{
 const fd=new FormData();fd.set('usuario_id','ajeno');fd.set('avisos_leads','on');fd.set('avisos_leads_whatsapp','on')
 expect(await guardarPreferencias({},fd)).toEqual({guardado:true})
 expect(m.upsert).toHaveBeenCalledWith({usuario_id:'dueno',avisos_leads:true,avisos_precios:false,avisos_leads_whatsapp:false})
})
it('requiere celular Auth confirmado para el opt-in WhatsApp',async()=>{
 vi.stubEnv('WHATSAPP_AVISOS_ENABLED','true')
 const fd=new FormData();fd.set('avisos_leads_whatsapp','on')
 expect(await guardarPreferencias({},fd)).toHaveProperty('error');expect(m.upsert).not.toHaveBeenCalled()
 m.usuario.mockResolvedValue({data:{user:{phone:'+573001234567',phone_confirmed_at:'2026-10-11T00:00:00Z'}}})
 expect(await guardarPreferencias({},fd)).toEqual({guardado:true})
})