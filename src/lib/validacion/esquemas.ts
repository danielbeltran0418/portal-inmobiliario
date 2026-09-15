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

// Un campo de formulario HTML vacio no siempre llega como undefined: puede
// llegar como '' (input vacio), como una cadena de solo espacios (el
// vendedor toco el campo y no escribio nada visible) o como null (limpiado
// desde el cliente). Las tres significan lo mismo: "sin dato". Sin
// normalizar, z.coerce.number() convierte cualquiera de ellas en 0 en
// silencio (Number('') === Number('   ') === Number(null) === 0, guardaria
// "0 habitaciones" como si fuera un dato real) y z.string().uuid() las
// rechaza con un mensaje crudo de zod pese a estar marcado .optional().
// Este preprocesado hace que los cinco campos opcionales signifiquen lo
// mismo ante las tres: ausencia de dato, no un valor por defecto ni un
// error.
const esVacio = (valor: unknown) =>
  valor === null || (typeof valor === 'string' && valor.trim() === '')

const opcional = <T extends z.ZodTypeAny>(esquema: T) =>
  z.preprocess((valor) => (esVacio(valor) ? undefined : valor), esquema.optional())

/** Alta: solo el titulo. El resto se completa despues, sobre el borrador. */
export const esquemaPropiedadNueva = z.object({
  titulo: z.string().trim().min(10, 'Minimo 10 caracteres').max(120, 'Maximo 120'),
})

/**
 * Edicion del borrador. Casi todo opcional: se guarda a medias a proposito.
 *
 * `precio` es opcional desde la correccion del hallazgo Importante "un
 * borrador no se puede guardar sin precio": la columna admite NULL desde
 * 20260907000100 (un borrador recien creado GENUINAMENTE no tiene precio
 * todavia) y el input del formulario nunca llevo `required`, pero este
 * esquema seguia exigiendolo positivo -- `actualizarPropiedad` (acciones.ts)
 * hace un `.update()` todo-o-nada, asi que un vendedor que guardara sin
 * precio perdia TAMBIEN la descripcion, el barrio y las habitaciones recien
 * escritas, aunque esos campos fueran validos. La puerta real sigue en la
 * base: publicar sin precio ya esta bloqueado por el trigger
 * propiedades_exigir_precio (mismo criterio que barrio y descripcion, que
 * son solo guia del panel -- ver completitud.ts).
 */
export const esquemaPropiedad = z.object({
  titulo: z.string().trim().min(10, 'Minimo 10 caracteres').max(120, 'Maximo 120'),
  descripcion: z.string().trim().max(4000).default(''),
  operacion: z.enum(OPERACIONES),
  tipo_inmueble: z.enum(TIPOS_INMUEBLE),
  precio: opcional(
    z.coerce.number()
      .positive('El precio debe ser mayor que cero')
      .max(PRECIO_MAXIMO, 'El precio supera el maximo permitido'),
  ),
  habitaciones: opcional(z.coerce.number().int().min(0).max(50)),
  banos: opcional(z.coerce.number().int().min(0).max(50)),
  area_m2: opcional(z.coerce.number().positive().max(100000)),
  barrio_id: opcional(z.string().uuid('Elige un barrio')),
  direccion: opcional(z.string().trim().max(200)),
})

export type DatosPropiedadNueva = z.infer<typeof esquemaPropiedadNueva>
export type DatosPropiedad = z.infer<typeof esquemaPropiedad>

export const esquemaLead = z.object({
  // El limite alto coincide con el CHECK de la tabla: si divergen, el usuario
  // recibiria un error de base de datos en vez de uno del formulario.
  mensaje: z.string().trim()
    .min(10, 'Cuentale al vendedor que te interesa, con al menos 10 caracteres.')
    .max(1000, 'El mensaje no puede pasar de 1000 caracteres.'),
  // Obligatorio aunque `perfiles.telefono` sea nullable: un lead sin telefono
  // no le sirve de nada al vendedor.
  telefono: z.string().trim()
    .min(7, 'Escribe un telefono de contacto.')
    .max(20, 'Ese telefono es demasiado largo.'),
})

export type DatosLead = z.infer<typeof esquemaLead>

// ---------------------------------------------------------------------------
// SP5: visitas.
//
// El instante llega del value de un boton que pinto la propia pagina con lo
// que devolvio franjas_libres ("2026-09-17T20:00:00+00:00"). Se exige zona
// explicita: un instante sin zona lo interpretaria la base con su TimeZone, y
// eso es justo lo que SP5 prohibe. La validez de la franja la decide la base.
const instanteConZona = z.string().trim().pipe(z.iso.datetime({ offset: true }))
const identificador = z.string().trim().uuid()

export const esquemaReserva = z.object({ lead_id: identificador, inicio: instanteConZona })
export const esquemaMoverCita = z.object({ cita_id: identificador, inicio: instanteConZona })
export const esquemaCancelarCita = z.object({ cita_id: identificador })
export const esquemaIdentificador = z.object({ id: identificador })

// SP5: disponibilidad del vendedor.
//
// Un campo ausente llega como null, y uno manipulado como File: los dos se
// tratan como texto vacio para que el mensaje sea el del formulario y no el
// generico de zod en ingles. Las comparaciones de abajo son de TEXTO
// ("09:00" < "10:00", "2026-12-24" <= "2026-12-26"), validas porque el formato
// esta fijado con cero a la izquierda. La regla que manda es el CHECK de la
// tabla (20260915000200); esto solo adelanta el mensaje.
const comoTexto = (valor: unknown) => (typeof valor === 'string' ? valor : '')
const HORA_EN_PUNTO = /^([01]\d|2[0-4]):00$/
const horaEnPunto = z.preprocess(comoTexto, z.string().trim().regex(HORA_EN_PUNTO, 'Elige una hora en punto'))
const fechaDeCalendario = z.preprocess(
  comoTexto, z.string().trim().pipe(z.iso.date({ message: 'Elige una fecha' })),
)

export const esquemaFranjaSemanal = z.object({
  dia_semana: z.coerce.number().int().min(1, 'Elige un dia').max(7, 'Elige un dia'),
  hora_inicio: horaEnPunto,
  hora_fin: horaEnPunto,
}).refine((franja) => franja.hora_fin > franja.hora_inicio, {
  message: 'La hora de fin tiene que ser posterior a la de inicio',
  path: ['hora_fin'],
})

export const esquemaBloqueo = z.object({
  desde: fechaDeCalendario,
  hasta: fechaDeCalendario,
}).refine((bloqueo) => bloqueo.hasta >= bloqueo.desde, {
  message: 'La fecha final no puede ser anterior a la inicial',
  path: ['hasta'],
})
