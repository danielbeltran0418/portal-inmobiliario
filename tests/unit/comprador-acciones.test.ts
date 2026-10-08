import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

const { eliminarBusquedaAction } = await import('@/lib/comprador/acciones-busquedas');
const { actualizarPerfilCompradorAction } = await import('@/lib/comprador/acciones-datos');

describe('CN-010: Acciones de comprador (verificación de rol, validación y .select("id"))', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('eliminarBusquedaAction', () => {
    it('rechaza identificador de búsqueda que no sea UUID válido', async () => {
      const res = await eliminarBusquedaAction('id-no-valido');
      expect(res.exito).toBe(false);
      expect(res.error).toBe('Identificador inválido');
    });

    it('rechaza si no hay sesión autenticada', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await eliminarBusquedaAction('11111111-1111-4111-8111-111111111111');
      expect(res.exito).toBe(false);
      expect(res.error).toBe('Debes iniciar sesión.');
    });

    it('rechaza si el usuario no tiene rol comprador', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'usr-vendedor-1' } },
      });
      mockFrom.mockImplementation((tabla: string) => {
        if (tabla === 'perfiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { rol: 'vendedor' }, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await eliminarBusquedaAction('11111111-1111-4111-8111-111111111111');
      expect(res.exito).toBe(false);
      expect(res.error).toBe('Solo compradores pueden eliminar búsquedas.');
    });

    it('falla si se intenta eliminar una búsqueda inexistente (0 filas afectadas)', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'usr-comprador-1' } },
      });
      mockFrom.mockImplementation((tabla: string) => {
        if (tabla === 'perfiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { rol: 'comprador' }, error: null }),
              }),
            }),
          };
        }
        if (tabla === 'busquedas_guardadas') {
          return {
            delete: () => ({
              eq: () => ({
                eq: () => ({
                  select: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await eliminarBusquedaAction('11111111-1111-4111-8111-111111111111');
      expect(res.exito).toBe(false);
      expect(res.error).toBe('Búsqueda no encontrada.');
    });

    it('elimina la búsqueda exitosamente con rol comprador y fila afectada', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'usr-comprador-1' } },
      });
      mockFrom.mockImplementation((tabla: string) => {
        if (tabla === 'perfiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { rol: 'comprador' }, error: null }),
              }),
            }),
          };
        }
        if (tabla === 'busquedas_guardadas') {
          return {
            delete: () => ({
              eq: () => ({
                eq: () => ({
                  select: async () => ({
                    data: [{ id: '11111111-1111-4111-8111-111111111111' }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await eliminarBusquedaAction('11111111-1111-4111-8111-111111111111');
      expect(res.exito).toBe(true);
    });
  });

  describe('actualizarPerfilCompradorAction', () => {
    it('rechaza datos con nombre menor a 2 caracteres', async () => {
      const res = await actualizarPerfilCompradorAction({ nombre: 'A' });
      expect(res.exito).toBe(false);
      expect(res.error).toContain('al menos 2 caracteres');
    });

    it('rechaza si no hay sesión autenticada', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await actualizarPerfilCompradorAction({ nombre: 'Juan Comprador' });
      expect(res.exito).toBe(false);
      expect(res.error).toBe('Debes iniciar sesión.');
    });

    it('rechaza si el usuario no tiene rol comprador', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'usr-admin-1' } },
      });
      mockFrom.mockImplementation((tabla: string) => {
        if (tabla === 'perfiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { rol: 'admin' }, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await actualizarPerfilCompradorAction({ nombre: 'Juan Comprador' });
      expect(res.exito).toBe(false);
      expect(res.error).toBe('Solo compradores pueden actualizar su perfil aquí.');
    });

    it('falla si 0 filas son actualizadas', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'usr-comprador-1' } },
      });
      mockFrom.mockImplementation((tabla: string) => {
        if (tabla === 'perfiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { rol: 'comprador' }, error: null }),
              }),
            }),
            update: () => ({
              eq: () => ({
                select: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await actualizarPerfilCompradorAction({ nombre: 'Juan Actualizado' });
      expect(res.exito).toBe(false);
      expect(res.error).toBe('No se pudo actualizar el perfil.');
    });

    it('actualiza el perfil exitosamente con rol comprador y fila afectada', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'usr-comprador-1' } },
      });
      mockFrom.mockImplementation((tabla: string) => {
        if (tabla === 'perfiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { rol: 'comprador' }, error: null }),
              }),
            }),
            update: () => ({
              eq: () => ({
                select: async () => ({ data: [{ id: 'usr-comprador-1' }], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await actualizarPerfilCompradorAction({
        nombre: 'Juan Actualizado',
        telefono: '3001234567',
      });
      expect(res.exito).toBe(true);
    });
  });
});
