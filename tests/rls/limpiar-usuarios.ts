import { Client } from 'pg'
import { URL_BASE_DE_DATOS } from './ayudantes'

/**
 * Purga de la base de datos local todos los usuarios de prueba efímeros
 * creados con el dominio `@prueba.test`.
 *
 * Se ejecuta directamente por conexión de Postgres para garantizar una
 * limpieza instantánea (milisegundos) sin saturar la API HTTP de GoTrue.
 */
export async function purgarUsuariosDePrueba(): Promise<number> {
  const cliente = new Client({ connectionString: URL_BASE_DE_DATOS })
  await cliente.connect()
  try {
    const res = await cliente.query("DELETE FROM auth.users WHERE email LIKE '%@prueba.test';")
    return res.rowCount ?? 0
  } finally {
    await cliente.end()
  }
}

if (process.argv[1]?.includes('limpiar-usuarios')) {
  purgarUsuariosDePrueba()
    .then((n) => {
      console.log(`Purgados exitosamente ${n} usuarios efímeros (@prueba.test).`)
      process.exit(0)
    })
    .catch((error) => {
      console.error('Error al purgar usuarios de prueba:', error)
      process.exit(1)
    })
}
