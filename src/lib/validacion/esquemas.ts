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

// numeric(14,2) en la columna `precio`: 12 digitos enteros + 2 decimales.
// Sin este limite, un valor exagerado pasa la validacion de la aplicacion y
// llega a Postgres, que responde con un "numeric field overflow" crudo en
// vez de un mensaje de formulario.
const PRECIO_MAXIMO = 999_999_999_999.99

// Un campo de formulario HTML vacio llega como '', no como undefined. Sin
// normalizar, z.coerce.number() convierte '' en 0 en silencio (guardaria
// "0 habitaciones" como si fuera un dato real) y z.string().uuid() rechaza
// '' pese a estar marcado .optional(): dos comportamientos distintos para
// el mismo "el vendedor no ha escrito nada todavia". Este preprocesado hace
// que los cinco campos opcionales signifiquen lo mismo ante una cadena
// vacia: ausencia de dato, no un valor por defecto ni un error.
const opcional = <T extends z.ZodTypeAny>(esquema: T) =>
  z.preprocess((valor) => (valor === '' ? undefined : valor), esquema.optional())

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
  precio: z.coerce.number()
    .positive('El precio debe ser mayor que cero')
    .max(PRECIO_MAXIMO, 'El precio supera el maximo permitido'),
  habitaciones: opcional(z.coerce.number().int().min(0).max(50)),
  banos: opcional(z.coerce.number().int().min(0).max(50)),
  area_m2: opcional(z.coerce.number().positive().max(100000)),
  barrio_id: opcional(z.string().uuid('Elige un barrio')),
  direccion: opcional(z.string().trim().max(200)),
})

export type DatosPropiedadNueva = z.infer<typeof esquemaPropiedadNueva>
export type DatosPropiedad = z.infer<typeof esquemaPropiedad>
