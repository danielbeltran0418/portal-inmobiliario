import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clienteAnonimo,
  clienteAdmin,
  clienteComo,
  crearUsuarioDePrueba,
  sesionVendedor,
} from './ayudantes';

const COMPRADOR1 = { correo: `comp1-sp2-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' };
const COMPRADOR2 = { correo: `comp2-sp2-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' };

describe('RLS: Panel del Comprador (Favoritos y Búsquedas Guardadas)', () => {
  let clienteComprador1: SupabaseClient;
  let clienteComprador2: SupabaseClient;
  let clienteVendedor: SupabaseClient;
  let comprador1Id: string;
  let comprador2Id: string;
  let vendedorId: string;
  let propiedadId: string;
  const anonimo = clienteAnonimo();

  beforeAll(async () => {
    clienteVendedor = await sesionVendedor();
    const { data: uV } = await clienteVendedor.auth.getUser();
    vendedorId = uV.user!.id;

    comprador1Id = await crearUsuarioDePrueba({ ...COMPRADOR1, rol: 'comprador' });
    comprador2Id = await crearUsuarioDePrueba({ ...COMPRADOR2, rol: 'comprador' });

    clienteComprador1 = await clienteComo(COMPRADOR1.correo, COMPRADOR1.password);
    clienteComprador2 = await clienteComo(COMPRADOR2.correo, COMPRADOR2.password);

    // Crear propiedad publicada para el vendedor
    const admin = clienteAdmin();
    const { data: prop, error: errProp } = await admin
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        titulo: 'Casa para pruebas de favoritos SP2',
        descripcion: 'Descripcion para favoritos SP2',
        slug: 'casa-fav-' + Date.now().toString(36),
        precio: 350000000,
        estado: 'borrador',
        tipo_inmueble: 'casa',
        operacion: 'venta',
      })
      .select('id')
      .single();

    if (errProp || !prop) throw errProp ?? new Error('No se pudo crear propiedad de prueba');
    propiedadId = prop.id;
  });

  describe('Tabla favoritos', () => {
    it('comprador autenticado puede agregar una propiedad a sus favoritos', async () => {
      const { data, error } = await clienteComprador1
        .from('favoritos')
        .insert({
          usuario_id: comprador1Id,
          propiedad_id: propiedadId,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.usuario_id).toBe(comprador1Id);
      expect(data?.propiedad_id).toBe(propiedadId);
    });

    it('comprador puede consultar sus propios favoritos', async () => {
      const { data, error } = await clienteComprador1
        .from('favoritos')
        .select('*, propiedades(titulo, precio)')
        .eq('usuario_id', comprador1Id);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.propiedad_id).toBe(propiedadId);
    });

    it('FALSIFICACIÓN RLS: comprador NO puede insertar favoritos a nombre de otro usuario', async () => {
      const { error } = await clienteComprador1
        .from('favoritos')
        .insert({
          usuario_id: comprador2Id, // Suplantando comprador2
          propiedad_id: propiedadId,
        });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
    });

    it('FALSIFICACIÓN RLS: comprador2 no puede ver los favoritos de comprador1', async () => {
      const { data, error } = await clienteComprador2
        .from('favoritos')
        .select('*')
        .eq('usuario_id', comprador1Id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('FALSIFICACIÓN RLS: comprador2 no puede eliminar los favoritos de comprador1', async () => {
      const { data } = await clienteComprador2
        .from('favoritos')
        .delete()
        .eq('usuario_id', comprador1Id)
        .select();

      expect(data).toHaveLength(0);

      // Verificamos con admin que el favorito sigue intacto
      const admin = clienteAdmin();
      const { data: existente } = await admin
        .from('favoritos')
        .select('*')
        .eq('usuario_id', comprador1Id);
      expect(existente).toHaveLength(1);
    });

    it('FALSIFICACIÓN RLS: usuario anónimo no puede insertar en favoritos', async () => {
      const { error } = await anonimo
        .from('favoritos')
        .insert({
          usuario_id: comprador1Id,
          propiedad_id: propiedadId,
        });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
    });

    it('comprador puede eliminar su propio favorito', async () => {
      const { error } = await clienteComprador1
        .from('favoritos')
        .delete()
        .eq('usuario_id', comprador1Id)
        .eq('propiedad_id', propiedadId);

      expect(error).toBeNull();

      const { data } = await clienteComprador1
        .from('favoritos')
        .select('*')
        .eq('usuario_id', comprador1Id);
      expect(data).toHaveLength(0);
    });
  });

  describe('Tabla busquedas_guardadas', () => {
    let busquedaId: string;

    it('comprador autenticado puede guardar una búsqueda con filtros', async () => {
      const { data, error } = await clienteComprador1
        .from('busquedas_guardadas')
        .insert({
          usuario_id: comprador1Id,
          nombre: 'Casas en Chapinero hasta 500M',
          filtros: {
            tipo_operacion: 'venta',
            precio_max: 500000000,
            ciudad: 'Bogotá',
          },
          notificaciones_activas: false,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.nombre).toBe('Casas en Chapinero hasta 500M');
      expect(data?.usuario_id).toBe(comprador1Id);
      busquedaId = data?.id;
    });

    it('comprador puede consultar sus búsquedas guardadas', async () => {
      const { data, error } = await clienteComprador1
        .from('busquedas_guardadas')
        .select('*')
        .eq('usuario_id', comprador1Id);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.nombre).toBe('Casas en Chapinero hasta 500M');
    });

    it('comprador puede actualizar el nombre o notificaciones de su búsqueda', async () => {
      const { data, error } = await clienteComprador1
        .from('busquedas_guardadas')
        .update({
          nombre: 'Casas en Chapinero hasta 450M (Ajustado)',
          notificaciones_activas: true,
        })
        .eq('id', busquedaId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.nombre).toBe('Casas en Chapinero hasta 450M (Ajustado)');
      expect(data?.notificaciones_activas).toBe(true);
    });

    it('FALSIFICACIÓN RLS: comprador NO puede crear búsqueda a nombre de otro usuario', async () => {
      const { error } = await clienteComprador1
        .from('busquedas_guardadas')
        .insert({
          usuario_id: comprador2Id,
          nombre: 'Búsqueda fraudulenta',
          filtros: {},
        });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
    });

    it('FALSIFICACIÓN RLS: comprador2 no puede ver las búsquedas de comprador1', async () => {
      const { data, error } = await clienteComprador2
        .from('busquedas_guardadas')
        .select('*')
        .eq('usuario_id', comprador1Id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('FALSIFICACIÓN RLS: comprador2 no puede modificar las búsquedas de comprador1', async () => {
      const { data } = await clienteComprador2
        .from('busquedas_guardadas')
        .update({ nombre: 'Hackeado' })
        .eq('id', busquedaId)
        .select();

      expect(data).toHaveLength(0);
    });

    it('FALSIFICACIÓN RLS: usuario anónimo no puede acceder ni crear búsquedas guardadas', async () => {
      const { error: insertError } = await anonimo
        .from('busquedas_guardadas')
        .insert({
          usuario_id: comprador1Id,
          nombre: 'Anónimo intentando guardar',
          filtros: {},
        });
      expect(insertError).not.toBeNull();
      expect(insertError?.code).toBe('42501');

      const { data: readData } = await anonimo
        .from('busquedas_guardadas')
        .select('*');
      expect(readData).toHaveLength(0);
    });

    it('comprador puede eliminar su propia búsqueda guardada', async () => {
      const { error } = await clienteComprador1
        .from('busquedas_guardadas')
        .delete()
        .eq('id', busquedaId);

      expect(error).toBeNull();

      const { data } = await clienteComprador1
        .from('busquedas_guardadas')
        .select('*')
        .eq('id', busquedaId);
      expect(data).toHaveLength(0);
    });
  });
});
