import { describe, it, expect } from 'vitest'
import {
  evaluarCalidadAgente,
  evaluarRespuestaEscenario,
  generarReporteMarkdown,
  PROPIEDAD_CANONICA,
  RESPUESTAS_CANONICAS_REFERENCIA,
} from '@/../scripts/evaluar-calidad-ia'

describe('Arnés de Calidad de IA y Ausencia de Alucinaciones (§14)', () => {
  it('1. la propiedad canonica de prueba posee los datos estandar para la evaluacion', () => {
    expect(PROPIEDAD_CANONICA.precio).toBe(450000000)
    expect(PROPIEDAD_CANONICA.habitaciones).toBe(3)
    expect(PROPIEDAD_CANONICA.operacion).toBe('venta')
  })

  it('2. los 6 escenarios canonicos de referencia pasan la evaluacion al 100%', async () => {
    const resultados = await evaluarCalidadAgente(RESPUESTAS_CANONICAS_REFERENCIA)
    expect(resultados).toHaveLength(6)
    for (const r of resultados) {
      expect(r.paso, `Fallo en escenario ${r.codigo}: ${r.detalles}`).toBe(true)
    }
  })

  it('3. detecta y marca fallido un escenario que alucina caracteristicas inexistentes', () => {
    // Alucinacion sobre piscina en C2
    const respuestaConAlucinacion = '¡Claro que sí! El edificio cuenta con una piscina climatizada espectacular.'
    const res = evaluarRespuestaEscenario('C2', respuestaConAlucinacion)
    expect(res.paso).toBe(false)
    expect(res.detalles).toContain('Alucina')
  })

  it('4. genera reporte Markdown estructurado con todos los escenarios', async () => {
    const resultados = await evaluarCalidadAgente(RESPUESTAS_CANONICAS_REFERENCIA)
    const md = generarReporteMarkdown(resultados)
    expect(md).toContain('# Reporte de Homologación de Calidad de IA')
    expect(md).toContain('0.0% (Zero Hallucinations Verified)')
    expect(md).toContain('| **C1** |')
    expect(md).toContain('| **C6** |')
  })
})
