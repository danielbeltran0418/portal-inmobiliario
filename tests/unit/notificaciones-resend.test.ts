import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }) }));

vi.mock('resend', () => {
  const MockResend = class {
    constructor() {
      this.emails = { send: sendMock };
    }
  };
  return { Resend: MockResend };
});

import { enviarDigestBusqueda } from '@/lib/notificaciones/resend';

describe('enviarDigestBusqueda', () => {
  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'clave-de-prueba';
    process.env.NEXT_PUBLIC_APP_URL = 'https://portal.test';
  });

  it('envia el correo con el destinatario y el asunto correctos', async () => {
    await enviarDigestBusqueda({
      destinatarioEmail: 'comprador@prueba.test',
      nombreBusqueda: 'Casas en Riomar',
      tokenBaja: 'token-abc',
      propiedades: [
        { id: 'p1', slug: 'casa-1', titulo: 'Casa 1', precio: 300000000, moneda: 'COP', barrioSlug: 'riomar', imagenId: null },
      ],
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const llamada = sendMock.mock.calls[0][0];
    expect(llamada.to).toEqual(['comprador@prueba.test']);
    expect(llamada.subject).toContain('Casas en Riomar');
  });

  it('escapa caracteres HTML en el titulo de la propiedad y el nombre de la busqueda', async () => {
    await enviarDigestBusqueda({
      destinatarioEmail: 'comprador@prueba.test',
      nombreBusqueda: '<script>alert(1)</script>',
      tokenBaja: 'token-abc',
      propiedades: [
        { id: 'p1', slug: 'casa-1', titulo: '<img src=x onerror=alert(2)>', precio: 300000000, moneda: 'COP', barrioSlug: 'riomar', imagenId: null },
      ],
    });

    const llamada = sendMock.mock.calls[0][0];
    expect(llamada.html).not.toContain('<script>');
    expect(llamada.html).not.toContain('<img src=x onerror=alert(2)>');
    expect(llamada.html).toContain('&lt;script&gt;');
  });

  it('incluye el enlace de baja con el token en el HTML', async () => {
    await enviarDigestBusqueda({
      destinatarioEmail: 'comprador@prueba.test',
      nombreBusqueda: 'Casas en Riomar',
      tokenBaja: 'token-abc',
      propiedades: [
        { id: 'p1', slug: 'casa-1', titulo: 'Casa 1', precio: 300000000, moneda: 'COP', barrioSlug: 'riomar', imagenId: null },
      ],
    });

    const llamada = sendMock.mock.calls[0][0];
    expect(llamada.html).toContain('https://portal.test/notificaciones/baja?token=token-abc');
  });

  it('lanza un error si RESEND_API_KEY no esta configurada', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      enviarDigestBusqueda({
        destinatarioEmail: 'comprador@prueba.test',
        nombreBusqueda: 'Casas en Riomar',
        tokenBaja: 'token-abc',
        propiedades: [],
      })
    ).rejects.toThrow('RESEND_API_KEY');
  });
});
