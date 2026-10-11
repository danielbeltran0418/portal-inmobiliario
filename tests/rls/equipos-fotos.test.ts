import { Client } from 'pg'
import { randomUUID, createHash } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { URL_BASE_DE_DATOS, clienteAdmin, crearUsuarioDePrueba } from './ayudantes'
const admin=clienteAdmin()
let dueno:string; let agente:string; let ajeno:string
beforeAll(async () => {
  const crear=(prefijo:string)=>crearUsuarioDePrueba({ password:'ClaveDePrueba123!',rol:'vendedor',correo:prefijo+'-'+randomUUID()+'@prueba.test' })
  dueno=await crear('equipo'); agente=await crear('agente'); ajeno=await crear('ajeno')
})
afterAll(async()=> { for(const id of [dueno,agente,ajeno]) if(id) await admin.auth.admin.deleteUser(id) })
async function transaccion(tarea:(db:Client)=>Promise<void>) {
  const db=new Client({ connectionString:URL_BASE_DE_DATOS }); await db.connect(); await db.query('BEGIN')
  try { await tarea(db) } finally { await db.query('ROLLBACK'); await db.end() }
}
async function identidad(db:Client,id:string) {
  await db.query('SET LOCAL ROLE authenticated')
  await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({ sub:id,role:'authenticated',app_metadata:{ rol:'vendedor' } })])
}
describe('equipos y límites de fotos',()=>{
  it('con seis anuncios históricos permite Pro pero rechaza cobrar Destacado',()=>transaccion(async db=>{
    await db.query('UPDATE public.configuracion_comercial SET planes_activos=false WHERE singleton')
    for(let i=0;i<6;i++){
      const id=randomUUID()
      await db.query("INSERT INTO public.propiedades(id,vendedor_id,slug,titulo,descripcion,operacion,tipo_inmueble,precio) VALUES($1,$2,$3,'Casa de prueba','Descripción','venta','casa',1000)",[id,dueno,'cuota-'+id])
      await db.query("INSERT INTO public.imagenes_propiedad(propiedad_id,ruta_storage,alt_text) VALUES($1,$2,'Fachada de prueba')",[id,dueno+'/'+id+'/foto.webp'])
      await db.query("UPDATE public.propiedades SET estado='publicada' WHERE id=$1",[id])
    }
    await db.query("INSERT INTO public.ordenes_plan(usuario_id,plan,periodo,centavos,ambiente) VALUES($1,'pro','mensual',10000,'prod')",[dueno])
    await expect(db.query("INSERT INTO public.ordenes_plan(usuario_id,plan,periodo,centavos,ambiente) VALUES($1,'destacado','mensual',10000,'prod')",[dueno])).rejects.toMatchObject({code:'23514'})
  }))
  it('un webhook tardío de otro plan registra el pago sin sobrescribir Pro',()=>transaccion(async db=>{
    const pro=randomUUID();const destacado=randomUUID()
    await db.query("INSERT INTO public.ordenes_plan(id,usuario_id,plan,periodo,centavos,ambiente) VALUES($1,$3,'pro','mensual',20000,'prod'),($2,$3,'destacado','mensual',10000,'prod')",[pro,destacado,dueno])
    expect((await db.query("SELECT public.confirmar_orden_plan($1,'tx-primero',20000,'prod','APPROVED') AS ok",[pro])).rows[0].ok).toBe(true)
    expect((await db.query("SELECT public.confirmar_orden_plan($1,'tx-tarde',10000,'prod','APPROVED') AS ok",[destacado])).rows[0].ok).toBe(true)
    expect((await db.query('SELECT plan FROM public.suscripciones_plan WHERE usuario_id=$1',[dueno])).rows[0].plan).toBe('pro')
    expect((await db.query('SELECT estado,requiere_revision FROM public.ordenes_plan WHERE id=$1',[destacado])).rows[0]).toEqual({estado:'APPROVED',requiere_revision:true})
  }))
  it('separa WhatsApp de correo y no reclama el canal desactivado',()=>transaccion(async db=>{
    const id=randomUUID()
    await db.query("INSERT INTO public.propiedades(id,vendedor_id,slug,titulo,descripcion,operacion,tipo_inmueble,precio) VALUES($1,$2,$3,'Casa de prueba','Descripción','venta','casa',1000)",[id,dueno,'aviso-'+id])
    await db.query("INSERT INTO public.avisos_portal(usuario_id,propiedad_id,tipo,canal) VALUES($1,$2,'lead','correo'),($1,$2,'lead','whatsapp')",[dueno,id])
    expect((await db.query('SELECT canal FROM public.reclamar_avisos_portal(false) WHERE propiedad_id=$1',[id])).rows).toEqual([{canal:'correo'}])
    expect((await db.query('SELECT canal FROM public.reclamar_avisos_portal(true) WHERE propiedad_id=$1',[id])).rows).toEqual([{canal:'whatsapp'}])
    await identidad(db,ajeno)
    await expect(db.query('SELECT * FROM public.avisos_portal')).rejects.toMatchObject({code:'42501'})
  }))
  it('la sexta orden en media hora se rechaza en la base',()=>transaccion(async db=>{
    for(let i=0;i<5;i++) await db.query("INSERT INTO public.ordenes_plan(usuario_id,plan,periodo,centavos,ambiente) VALUES($1,'pro','mensual',10000,'test')",[dueno])
    expect((await db.query('SELECT count(*)::int AS n FROM public.ordenes_plan WHERE usuario_id=$1',[dueno])).rows[0].n).toBe(5)
    await expect(db.query("INSERT INTO public.ordenes_plan(usuario_id,plan,periodo,centavos,ambiente) VALUES($1,'pro','mensual',10000,'test')",[dueno])).rejects.toMatchObject({code:'23514'})
  }))
  it('permite renovar Pro y bloquea cambiarlo por Destacado mientras esté activo',()=>transaccion(async db=>{
    const orden=randomUUID()
    await db.query("INSERT INTO public.ordenes_plan(id,usuario_id,plan,periodo,centavos,ambiente) VALUES($1,$2,'pro','mensual',10000,'prod')",[orden,dueno])
    await db.query("SELECT public.confirmar_orden_plan($1,'tx-plan-activo',10000,'prod','APPROVED')",[orden])
    await db.query("INSERT INTO public.ordenes_plan(usuario_id,plan,periodo,centavos,ambiente) VALUES($1,'pro','anual',20000,'prod')",[dueno])
    await expect(db.query("INSERT INTO public.ordenes_plan(usuario_id,plan,periodo,centavos,ambiente) VALUES($1,'destacado','mensual',10000,'prod')",[dueno])).rejects.toMatchObject({code:'23514'})
  }))
  it('ocho fotos permitidas; la novena se rechaza aunque ya esté publicado',()=>transaccion(async db=>{
    await db.query('UPDATE public.configuracion_comercial SET planes_activos=true WHERE singleton')
    const id=randomUUID()
    await db.query("INSERT INTO public.propiedades(id,vendedor_id,slug,titulo,descripcion,operacion,tipo_inmueble,precio) VALUES($1,$2,$3,'Casa de prueba','Descripción','venta','casa',1000)",[id,dueno,'foto-'+id])
    for(let i=0;i<8;i++) await db.query("INSERT INTO public.imagenes_propiedad(propiedad_id,ruta_storage,alt_text,orden) VALUES($1,$2,'Fachada de prueba',$3)",[id,dueno+'/'+id+'/'+i+'.webp',i])
    await db.query("UPDATE public.propiedades SET estado='publicada' WHERE id=$1",[id])
    expect((await db.query('SELECT count(*)::int AS n FROM public.imagenes_propiedad WHERE propiedad_id=$1',[id])).rows[0].n).toBe(8)
    await expect(db.query("INSERT INTO public.imagenes_propiedad(propiedad_id,ruta_storage,alt_text,orden) VALUES($1,$2,'Fachada de prueba',8)",[id,dueno+'/'+id+'/9.webp'])).rejects.toMatchObject({code:'23514'})
  }))
  it('solo el correo confirmado invitado entra; nadie ve otros equipos',()=>transaccion(async db=>{
    const orden=randomUUID()
    await db.query("INSERT INTO public.ordenes_plan(id,usuario_id,plan,periodo,centavos,ambiente) VALUES($1,$2,'pro','mensual',10000,'prod')",[orden,dueno])
    await db.query("SELECT public.confirmar_orden_plan($1,'tx-equipo',10000,'prod','APPROVED')",[orden])
    const hash=createHash('sha256').update('codigo-de-prueba').digest('hex')
    await db.query("INSERT INTO public.equipo_invitaciones(propietario_id,correo,token_hash) SELECT $1,email,$2 FROM auth.users WHERE id=$3",[dueno,hash,agente])
    await identidad(db,ajeno)
    expect((await db.query('SELECT public.aceptar_equipo($1) AS ok',[hash])).rows[0].ok).toBe(false)
    expect((await db.query('SELECT * FROM public.resumen_equipo()')).rows).toHaveLength(0)
    await identidad(db,agente)
    expect((await db.query('SELECT public.aceptar_equipo($1) AS ok',[hash])).rows[0].ok).toBe(true)
    expect((await db.query('SELECT * FROM public.resumen_equipo()')).rows).toHaveLength(2)
    expect((await db.query('SELECT public.aceptar_equipo($1) AS ok',[hash])).rows[0].ok).toBe(false)
    await identidad(db,ajeno)
    expect((await db.query('SELECT * FROM public.equipo_miembros')).rows).toHaveLength(0)
    await expect(db.query('INSERT INTO public.equipo_miembros VALUES($1,$2)',[dueno,ajeno])).rejects.toMatchObject({code:'42501'})
  }))
})