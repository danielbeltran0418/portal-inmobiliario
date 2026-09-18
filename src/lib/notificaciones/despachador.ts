// src/lib/notificaciones/despachador.ts
import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';
import { obtenerBusquedasParaNotificar } from './busquedas';
import { enviarDigestBusqueda } from './resend';

export interface ResultadoNotificaciones {
  procesadas: number;
  enviadas: number;
  fallidas: number;
}

export async function procesarNotificacionesBusquedas(): Promise<ResultadoNotificaciones> {
  const admin = crearClienteAdmin();
  const busquedas = await obtenerBusquedasParaNotificar();

  let enviadas = 0;
  let fallidas = 0;

  for (const busqueda of busquedas) {
    try {
      const { data: usuario, error: errUsuario } = await admin.auth.admin.getUserById(busqueda.usuarioId);
      const email = usuario?.user?.email;
      if (errUsuario || !email) {
        throw new Error(`No se pudo resolver el email del usuario ${busqueda.usuarioId}`);
      }

      await enviarDigestBusqueda({
        destinatarioEmail: email,
        nombreBusqueda: busqueda.nombre,
        tokenBaja: busqueda.tokenBaja,
        propiedades: busqueda.propiedades,
      });

      await admin
        .from('busquedas_guardadas')
        .update({ ultima_notificacion_en: new Date().toISOString() })
        .eq('id', busqueda.busquedaId);

      enviadas += 1;
    } catch (error) {
      console.error('[Notificaciones] Fallo al procesar busqueda', busqueda.busquedaId, error);
      fallidas += 1;
    }
  }

  return { procesadas: busquedas.length, enviadas, fallidas };
}
