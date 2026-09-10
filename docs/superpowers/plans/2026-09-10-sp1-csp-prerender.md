# SP1: prueba de CSP para HTML prerenderizado (2026-09-10)

## Decisión del usuario
Mantener HTML prerenderizado y resolver primero la CSP. No sustituir este requisito por HTML dinámico con caché de datos.

## Estado encontrado
Rama codex/sp1-catalogo, HEAD 1dffead. Los commits f65862d, 40ffaeb y 1dffead son posteriores a la sesión anterior: historial de URLs, diseño y corrección de imágenes, y guía de despliegue. Se preservaron sin modificaciones. El layout raíz todavía declara force-dynamic y renderiza Cabecera con sesión.

## Experimento reproducible
Ejecutar desde la raíz:
```powershell
npm run build
node scripts/probar-csp-estatica.mjs
```

Requiere Chromium instalado por Playwright. El script usa el archivo .next/server/app/_global-error.html del build existente, sirve sus assets locales y calcula SHA-256 sobre el textContent de sus scripts inline mediante DOMParser. El servidor temporal escucha solo en 127.0.0.1 y se cierra al acabar.

Resultado obtenido con el build disponible:
- Solo self: dos scripts inline de Next y el script de ataque bloqueados (3).
- Hashes exactos: solo el ataque bloqueado (1).
- Primer script alterado sin actualizar su hash: ese script y el ataque bloqueados (2).
- El ataque no se ejecutó en ningún escenario.

Los recuentos son aserciones que provocan error si cambian; no son solo mensajes. No se usa la existencia de window.__next_f como criterio, porque los bundles externos pueden inicializarla aunque los scripts inline sean bloqueados. El script no concede hashes al ataque: los obtiene del artefacto original antes de inyectarlo.

Esta prueba acredita la autorización de scripts inline por hashes, no la hidratación del catálogo, su navegación ni ISR. La política del servidor de prueba no se instala en producción. No se modificaron rutas, RLS, datos ni configuración de Next.

## Lo que falta para activar el prerender
1. Separar el layout público de la cabecera con sesión; el HTML compartido no puede llevar datos del visitante.
2. Definir el punto de generación y entrega de la pareja HTML/CSP. Al cambiar el HTML cambian los hashes. Una lista de hashes fija en middleware o next.config no sirve para una ficha regenerada mediante ISR.
3. Comprobar la solución en el destino de despliegue: un postprocesador sobre archivos de build no intercepta automáticamente las regeneraciones de Vercel. No incorporar un servidor personalizado suponiendo que Vercel lo ejecutará.
4. Distinguir páginas públicas base prerenderizadas de variantes de filtros que leen searchParams. No eliminar los filtros para conseguir un marcador estático.
5. Coordinar invalidación al editar/publicar/pausar/eliminar y mantener 301/410 antes de entregar una copia antigua.
6. Probar una ficha real en producción: navegación e imagen, scripts legítimos ejecutados, inyección bloqueada, HTML y CSP coincidentes después de editarla, y ausencia de personalización con dos sesiones.
7. Solo entonces trasladar force-dynamic a segmentos privados y ampliar el guard verificar:render con evidencia del build real.

No se declara SP1 completo ni listo para despliegue por este experimento.

## Referencias contrastadas
- Documentación instalada: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
- https://nextjs.org/docs/app/guides/content-security-policy
- https://github.com/vercel/next.js/issues/95354 (reporte de inline Flight no cubierto por SRI; la conclusión de este documento descansa en la prueba local, no solo en el issue).
