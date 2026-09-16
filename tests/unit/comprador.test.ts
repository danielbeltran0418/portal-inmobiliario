import { describe, it, expect } from 'vitest';
import { construirQueryStringBusqueda } from '@/lib/comprador/busquedas';
import { z } from 'zod';

const esquemaGuardarBusqueda = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
  filtros: z.record(z.string(), z.unknown()).default({}),
  notificaciones: z.boolean().default(false),
});

const esquemaPerfil = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  telefono: z.string().trim().max(20).optional().nullable(),
});

describe('Unitaria: Lógica y validaciones del Panel de Comprador (SP2)', () => {
  describe('construirQueryStringBusqueda', () => {
    it('serializa parámetros correctamente en querystring', () => {
      const filtros = {
        operacion: 'venta',
        tipo: 'apartamento',
        precio_max: 500000000,
      };

      const qs = construirQueryStringBusqueda(filtros);
      expect(qs).toBe('?operacion=venta&tipo=apartamento&precio_max=500000000');
    });

    it('descarta claves con valor null, undefined o string vacía', () => {
      const filtros = {
        operacion: 'arriendo',
        tipo: '',
        precio_min: null,
        precio_max: undefined,
        habitaciones: 3,
      };

      const qs = construirQueryStringBusqueda(filtros);
      expect(qs).toBe('?operacion=arriendo&habitaciones=3');
    });

    it('devuelve cadena vacía si no hay filtros válidos', () => {
      expect(construirQueryStringBusqueda({})).toBe('');
      expect(construirQueryStringBusqueda({ vacio: '', nulo: null })).toBe('');
    });
  });

  describe('Esquema de validación para guardar búsqueda', () => {
    it('acepta nombres válidos con filtros asociados', () => {
      const res = esquemaGuardarBusqueda.safeParse({
        nombre: 'Casas en El Prado',
        filtros: { operacion: 'venta', precio_max: 800000000 },
        notificaciones: true,
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.nombre).toBe('Casas en El Prado');
        expect(res.data.notificaciones).toBe(true);
      }
    });

    it('rechaza nombres vacíos o que solo contienen espacios', () => {
      const res = esquemaGuardarBusqueda.safeParse({
        nombre: '   ',
        filtros: {},
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('El nombre es obligatorio');
      }
    });

    it('rechaza nombres que superan los 100 caracteres', () => {
      const res = esquemaGuardarBusqueda.safeParse({
        nombre: 'a'.repeat(101),
        filtros: {},
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('Máximo 100 caracteres');
      }
    });
  });

  describe('Esquema de actualización de perfil y datos personales', () => {
    it('acepta datos de perfil válidos', () => {
      const res = esquemaPerfil.safeParse({
        nombre: 'Carlos Comprador',
        telefono: '3001234567',
      });

      expect(res.success).toBe(true);
    });

    it('permite teléfono nulo u omitido', () => {
      const res = esquemaPerfil.safeParse({
        nombre: 'Laura Compradora',
        telefono: null,
      });

      expect(res.success).toBe(true);
    });

    it('rechaza nombres con menos de 2 caracteres', () => {
      const res = esquemaPerfil.safeParse({
        nombre: 'A',
        telefono: '3001234567',
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('al menos 2 caracteres');
      }
    });
  });

  describe('Validación de texto de confirmación para supresión de cuenta', () => {
    function validarConfirmacion(texto: string): boolean {
      return texto === 'ELIMINAR MI CUENTA';
    }

    it('solo admite la frase exacta ELIMINAR MI CUENTA', () => {
      expect(validarConfirmacion('ELIMINAR MI CUENTA')).toBe(true);
      expect(validarConfirmacion('eliminar mi cuenta')).toBe(false);
      expect(validarConfirmacion('ELIMINAR')).toBe(false);
      expect(validarConfirmacion(' ELIMINAR MI CUENTA ')).toBe(false);
    });
  });
});
