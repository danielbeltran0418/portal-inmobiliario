import 'server-only';
import { Resend } from 'resend';
import { urlPublica } from '@/lib/catalogo/seo';
import type { PropiedadCoincidente } from './busquedas';

export interface DatosDigestBusqueda {
  destinatarioEmail: string;
  nombreBusqueda: string;
  tokenBaja: string;
  propiedades: PropiedadCoincidente[];
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatearPrecio(precio: number, moneda: string): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(precio);
}

function urlFicha(p: PropiedadCoincidente): string {
  return urlPublica(`/${p.barrioSlug}/${p.slug}`);
}

function urlImagen(p: PropiedadCoincidente): string {
  return p.imagenId ? urlPublica(`/imagen/${p.imagenId}`) : urlPublica('/og-fallback.jpg');
}

function armarHtml(datos: DatosDigestBusqueda, urlBaja: string): string {
  const filasPropiedades = datos.propiedades
    .map(
      (p) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <a href="${urlFicha(p)}" style="text-decoration:none;color:#111827;">
              <img src="${urlImagen(p)}" alt="${escaparHtml(p.titulo)}" width="120" style="border-radius:8px;display:block;margin-bottom:8px;" />
              <strong>${escaparHtml(p.titulo)}</strong><br/>
              ${formatearPrecio(p.precio, p.moneda)} · ${escaparHtml(p.barrioSlug)}
            </a>
          </td>
        </tr>`
    )
    .join('');

  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2>${escaparHtml(datos.nombreBusqueda)}</h2>
      <p>Encontramos ${datos.propiedades.length} propiedad(es) nueva(s) que coinciden con esta búsqueda:</p>
      <table style="width:100%;border-collapse:collapse;">${filasPropiedades}</table>
      <p style="margin-top:24px;font-size:12px;color:#6b7280;">
        ¿Ya no quieres recibir estas alertas?
        <a href="${urlBaja}">Dejar de recibir esta búsqueda</a>.
      </p>
    </div>`;
}

export async function enviarDigestBusqueda(datos: DatosDigestBusqueda): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY es obligatoria para enviar notificaciones');

  const urlBaja = urlPublica(`/notificaciones/baja?token=${datos.tokenBaja}`);
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: 'Portal Inmobiliario <alertas@portal-inmobiliario.test>',
    to: [datos.destinatarioEmail],
    subject: `Nuevas propiedades para "${datos.nombreBusqueda}"`,
    html: armarHtml(datos, urlBaja),
  });

  if (error) throw new Error(`Fallo el envio de Resend: ${error.message}`);
}
