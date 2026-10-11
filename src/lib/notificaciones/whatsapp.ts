import 'server-only'
export function configuracionWhatsApp() {
  if(process.env.WHATSAPP_AVISOS_ENABLED!=='true') return null
  const cuenta=process.env.TWILIO_ACCOUNT_SID; const secreto=process.env.TWILIO_AUTH_TOKEN
  const origen=process.env.TWILIO_WHATSAPP_FROM; const plantilla=process.env.TWILIO_LEAD_CONTENT_SID
  if(!cuenta || !/^AC[a-f0-9]{32}$/i.test(cuenta) || !secreto || !origen || !/^whatsapp:\+[1-9]\d{7,14}$/.test(origen) || !plantilla || !/^HX[a-f0-9]{32}$/i.test(plantilla)) return null
  return { cuenta,secreto,origen,plantilla }
}
export async function enviarAvisoWhatsApp(telefono: string, titulo: string, enlace: string) {
  const config=configuracionWhatsApp()
  if(!config || !/^\+573\d{9}$/.test(telefono)) throw new Error('WhatsApp no disponible')
  const cuerpo=new URLSearchParams({ From:config.origen,To:'whatsapp:'+telefono,ContentSid:config.plantilla,ContentVariables:JSON.stringify({ '1':titulo.replace(/\s+/g,' ').slice(0,120),'2':enlace }) })
  const respuesta=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+config.cuenta+'/Messages.json',{
    method:'POST',headers:{ Authorization:'Basic '+Buffer.from(config.cuenta+':'+config.secreto).toString('base64'),'Content-Type':'application/x-www-form-urlencoded' },
    body:cuerpo,signal:AbortSignal.timeout(5000),cache:'no-store',
  })
  if(!respuesta.ok) throw new Error('Proveedor rechazó el aviso WhatsApp')
}