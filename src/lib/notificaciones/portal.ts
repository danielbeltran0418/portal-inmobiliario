import 'server-only'

import { configuracionWhatsApp, enviarAvisoWhatsApp } from './whatsapp'
import { Resend } from 'resend'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { urlPublica } from '@/lib/catalogo/seo'

interface AvisoPendiente { id: string; usuario_id: string; propiedad_id: string; tipo: 'lead' | 'precio'; canal: 'correo' | 'whatsapp'; precio_anterior: number | null; precio_nuevo: number | null }
export async function despacharAvisosPortal() {
  if (process.env.NOTIFICACIONES_PORTAL_ENABLED !== 'true') return { enviados: 0, omitidos: 0, fallidos: 0 }
  const clave = process.env.RESEND_API_KEY; const remitente = process.env.RESEND_FROM
  if (!clave || !remitente) throw new Error('Proveedor de correo no configurado')
  const admin = crearClienteAdmin(); const resend = new Resend(clave)
  const { data, error } = await admin.rpc('reclamar_avisos_portal', { p_whatsapp: Boolean(configuracionWhatsApp()) })
  if (error) throw new Error('No se pudieron obtener avisos')
  let enviados = 0; let omitidos = 0; let fallidos = 0
  for (const aviso of (data ?? []) as AvisoPendiente[]) {
    try {
      const [{ data: preferencias, error: errorPreferencias }, { data: propiedad, error: errorPropiedad }, { data: usuario, error: errorUsuario }] = await Promise.all([
        admin.from('preferencias_notificacion').select('avisos_leads,avisos_precios,avisos_leads_whatsapp').eq('usuario_id', aviso.usuario_id).maybeSingle(),
        admin.from('propiedades').select('titulo,slug,estado,publicada_hasta,barrios(slug)').eq('id', aviso.propiedad_id).maybeSingle(),
        admin.auth.admin.getUserById(aviso.usuario_id),
      ])
      if (errorPreferencias || errorPropiedad || errorUsuario) throw new Error('No se pudo resolver el aviso')
      const habilitado = aviso.canal === 'whatsapp' ? preferencias?.avisos_leads_whatsapp : aviso.tipo === 'lead' ? preferencias?.avisos_leads : preferencias?.avisos_precios
      const barrio = propiedad && (Array.isArray(propiedad.barrios) ? propiedad.barrios[0] : propiedad.barrios)
      const vigente = propiedad && (!propiedad.publicada_hasta || new Date(propiedad.publicada_hasta).getTime() > Date.now())
      if (!habilitado || !(aviso.canal === 'whatsapp' ? usuario.user?.phone_confirmed_at && usuario.user?.phone : usuario.user?.email) || !propiedad || propiedad.estado !== 'publicada' || !vigente || !barrio) {
        const { error: errorOmitir } = await admin.from('avisos_portal').update({ enviado_en: new Date().toISOString() }).eq('id', aviso.id).select('id').single()
        if (errorOmitir) throw new Error('No se pudo cerrar el aviso')
        omitidos++; continue
      }
      const enlace = aviso.tipo === 'lead' ? urlPublica('/panel/leads') : urlPublica(`/${barrio.slug}/${propiedad.slug}`)
      const precio = (valor: number | null) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor ?? 0)
      const asunto = aviso.tipo === 'lead' ? `Nueva solicitud: ${propiedad.titulo}` : `Bajó de precio: ${propiedad.titulo}`
      const texto = aviso.tipo === 'lead' ? `Recibiste una solicitud de información sobre ${propiedad.titulo}. Revisa el contacto en tu panel.` : `${propiedad.titulo} bajó de ${precio(aviso.precio_anterior)} a ${precio(aviso.precio_nuevo)}.`
      if (aviso.canal === 'whatsapp') {
        await enviarAvisoWhatsApp(usuario.user!.phone!, propiedad.titulo, enlace)
      } else {
      const resultado = await resend.emails.send({ from: remitente, to: usuario.user!.email!, subject: asunto, text: `${texto}\n\n${enlace}\n\nPuedes cambiar tus preferencias de avisos desde tu cuenta.` }, { idempotencyKey: `aviso-portal-${aviso.id}` })
      if (resultado.error) throw new Error('Proveedor rechazó el aviso')
      }
      const { error: errorActualizar } = await admin.from('avisos_portal').update({ enviado_en: new Date().toISOString() }).eq('id', aviso.id).select('id').single()
      if (errorActualizar) throw new Error('No se pudo registrar el envío')
      enviados++
    } catch { fallidos++; console.error('[avisos-portal] envío pendiente de reintento', aviso.id) }
  }
  return { enviados, omitidos, fallidos }
}