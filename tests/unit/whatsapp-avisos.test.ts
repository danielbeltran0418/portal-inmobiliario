import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only',()=>({}))
import { configuracionWhatsApp,enviarAvisoWhatsApp } from '@/lib/notificaciones/whatsapp'
const enviar=vi.fn()
beforeEach(()=>{
  vi.unstubAllEnvs();vi.clearAllMocks();vi.stubGlobal('fetch',enviar)
  vi.stubEnv('WHATSAPP_AVISOS_ENABLED','true')
  vi.stubEnv('TWILIO_ACCOUNT_SID','AC'+'a'.repeat(32));vi.stubEnv('TWILIO_AUTH_TOKEN','secreto-privado')
  vi.stubEnv('TWILIO_WHATSAPP_FROM','whatsapp:+573001234567');vi.stubEnv('TWILIO_LEAD_CONTENT_SID','HX'+'b'.repeat(32))
  enviar.mockResolvedValue(new Response('{}',{status:201}))
})
describe('WhatsApp opcional',()=>{
  it('no sale ninguna petición si está desactivado o el destinatario no es válido',async()=>{
    vi.stubEnv('WHATSAPP_AVISOS_ENABLED','false')
    expect(configuracionWhatsApp()).toBeNull()
    await expect(enviarAvisoWhatsApp('+573001234567','Casa','https://portal.test/panel/leads')).rejects.toThrow()
    vi.stubEnv('WHATSAPP_AVISOS_ENABLED','true')
    await expect(enviarAvisoWhatsApp('https://evil.test','Casa','https://portal.test/panel/leads')).rejects.toThrow()
    expect(enviar).not.toHaveBeenCalled()
  })
  it('usa un endpoint fijo y plantilla; el secreto solo va en autenticación',async()=>{
    await enviarAvisoWhatsApp('+573001234567','Casa luminosa','https://portal.test/panel/leads')
    const [url,opciones]=enviar.mock.calls[0]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC'+'a'.repeat(32)+'/Messages.json')
    const cuerpo=opciones.body as URLSearchParams
    expect(cuerpo.get('To')).toBe('whatsapp:+573001234567')
    expect(cuerpo.get('ContentSid')).toBe('HX'+'b'.repeat(32))
    expect(cuerpo.toString()).not.toContain('secreto')
    expect(cuerpo.has('Body')).toBe(false)
  })
  it('no confunde rechazo del proveedor con envío',async()=>{
    enviar.mockResolvedValue(new Response('{}',{status:400}))
    await expect(enviarAvisoWhatsApp('+573001234567','Casa','https://portal.test/panel/leads')).rejects.toThrow('Proveedor rechazó')
  })
})