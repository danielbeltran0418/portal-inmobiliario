import type { SupabaseClient } from '@supabase/supabase-js';

export interface SolicitudHistorial {
  id: string;
  propiedad_id: string;
  propiedad_titulo: string;
  estado: string;
  mensaje: string;
  creado_en: string;
}

export interface CitaHistorial {
  id: string;
  propiedad_id: string;
  propiedad_titulo: string;
  estado: string;
  inicio: string;
  fin: string;
}

interface LeadFila {
  id: string;
  propiedad_id: string;
  estado: string;
  mensaje: string;
  creado_en: string;
  propiedades?: { titulo: string } | null;
}

interface CitaFila {
  id: string;
  propiedad_id: string;
  estado: string;
  rango: string;
  propiedades?: { titulo: string } | null;
}

export async function obtenerPerfilComprador(
  supabase: SupabaseClient,
  usuarioId: string
) {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, rol, nombre_completo, telefono, creado_en, suprimido_en')
    .eq('id', usuarioId)
    .single();

  if (error || !data) {
    console.error('[SP2] Error obteniendo perfil:', error);
    return null;
  }

  return data;
}

export async function obtenerHistorialComprador(
  supabase: SupabaseClient,
  usuarioId: string
): Promise<{ leads: SolicitudHistorial[]; citas: CitaHistorial[] }> {
  // 1. Leads de contacto enviados
  const { data: leadsData } = await supabase
    .from('leads')
    .select(`
      id,
      propiedad_id,
      estado,
      mensaje,
      creado_en,
      propiedades (titulo)
    `)
    .eq('comprador_id', usuarioId)
    .order('creado_en', { ascending: false });

  const filasLeads = (leadsData ?? []) as unknown as LeadFila[];
  const leads: SolicitudHistorial[] = filasLeads.map((l) => ({
    id: l.id,
    propiedad_id: l.propiedad_id,
    propiedad_titulo: l.propiedades?.titulo ?? 'Propiedad',
    estado: l.estado,
    mensaje: l.mensaje,
    creado_en: l.creado_en,
  }));

  // 2. Citas agendadas asociadas al comprador
  const leadIds = leads.map((l) => l.id);
  let citas: CitaHistorial[] = [];

  if (leadIds.length > 0) {
    const { data: citasData } = await supabase
      .from('citas')
      .select(`
        id,
        propiedad_id,
        estado,
        rango,
        propiedades (titulo)
      `)
      .in('lead_id', leadIds)
      .order('creado_en', { ascending: false });

    const filasCitas = (citasData ?? []) as unknown as CitaFila[];
    citas = filasCitas.map((c) => {
      let inicio = '';
      let fin = '';
      if (typeof c.rango === 'string') {
        const parts = c.rango.replace(/["\[\]\(\)]/g, '').split(',');
        inicio = parts[0] ?? '';
        fin = parts[1] ?? '';
      }
      return {
        id: c.id,
        propiedad_id: c.propiedad_id,
        propiedad_titulo: c.propiedades?.titulo ?? 'Propiedad',
        estado: c.estado,
        inicio,
        fin,
      };
    });
  }

  return { leads, citas };
}
