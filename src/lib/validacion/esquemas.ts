import { z } from 'zod'

export const esquemaRegistro = z.object({
  nombre: z.string().trim().min(2, 'Escribe tu nombre').max(80),
  correo: z.string().trim().toLowerCase().email('Correo invalido'),
  telefono: z.string().trim().regex(/^3\d{9}$/, 'Celular colombiano de 10 digitos'),
  password: z.string().min(12, 'Minimo 12 caracteres').max(72),
  // 'super_admin' no esta aqui: primera barrera antes del trigger de la base.
  rol: z.enum(['comprador', 'vendedor']),
})

export const esquemaLogin = z.object({
  correo: z.string().trim().toLowerCase().email('Correo invalido'),
  password: z.string().min(1, 'Escribe tu contrasena'),
})

export type DatosRegistro = z.infer<typeof esquemaRegistro>
export type DatosLogin = z.infer<typeof esquemaLogin>

export const OPERACIONES = ['venta', 'arriendo'] as const
export const TIPOS_INMUEBLE = ['apartamento', 'casa', 'local', 'lote', 'oficina'] as const

/** Alta: solo el titulo. El resto se completa despues, sobre el borrador. */
export const esquemaPropiedadNueva = z.object({
  titulo: z.string().trim().min(10, 'Minimo 10 caracteres').max(120, 'Maximo 120'),
})

/** Edicion del borrador. Casi todo opcional: se guarda a medias a proposito. */
export const esquemaPropiedad = z.object({
  titulo: z.string().trim().min(10, 'Minimo 10 caracteres').max(120, 'Maximo 120'),
  descripcion: z.string().trim().max(4000).default(''),
  operacion: z.enum(OPERACIONES),
  tipo_inmueble: z.enum(TIPOS_INMUEBLE),
  precio: z.coerce.number().positive('El precio debe ser mayor que cero'),
  habitaciones: z.coerce.number().int().min(0).max(50).optional(),
  banos: z.coerce.number().int().min(0).max(50).optional(),
  area_m2: z.coerce.number().positive().max(100000).optional(),
  barrio_id: z.string().uuid('Elige un barrio').optional(),
  direccion: z.string().trim().max(200).optional(),
})

export type DatosPropiedadNueva = z.infer<typeof esquemaPropiedadNueva>
export type DatosPropiedad = z.infer<typeof esquemaPropiedad>
