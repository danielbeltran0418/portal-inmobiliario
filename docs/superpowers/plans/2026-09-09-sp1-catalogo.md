# SP1 — Plan de implementación

> Ejecución por tareas con pruebas y revisión de integración. Diseño aprobado: docs/superpowers/specs/2026-09-08-portal-inmobiliario-sp1-design.md en el repositorio de planificación Nueva carpeta.

**Objetivo:** catálogo público de Barranquilla, filtros compartibles, fichas por barrio, imágenes privadas accesibles mediante autorización pública y SEO.
**Base verificada:** main 7b59845; 267 pruebas unitarias pasan el 2026-09-09. Las 121 RLS y 13 E2E son cifras heredadas, aún no reejecutadas en esta sesión.
**Rama:** codex/sp1-catalogo.

## Restricciones
- No modificar migraciones aplicadas ni divulgar claves de entorno.
- Consultas públicas sin sesión y con selección explícita de columnas; no usar SELECT * ni devolver dirección/coordenadas.
- Las publicaciones sin fotos no aparecen en listados.
- La CSP privada conserva nonce y strict-dynamic. No desplegar una CSP pública que impida la hidratación.
- No confundir render dinámico con falta de SEO: decidir la estrategia de caché mediante pruebas de producción.

## 1. Filtros y paginación
- [ ] Crear tests/unit/filtros-catalogo.test.ts y src/lib/catalogo/filtros.ts.
- [ ] Contrato: leerFiltros(parametros: Record<string, string | string[] | undefined>): FiltrosCatalogo.
- [ ] Admitir operacion venta/arriendo y tipo apartamento/casa/local/lote/oficina; precio_min/precio_max decimales positivos dentro de numeric(14,2); pagina entero seguro positivo.
- [ ] Ignorar valores inválidos y parámetros repetidos; un rango invertido elimina ambos extremos. Pagina inválida vuelve a 1.
- [ ] Probar primero ausencia de implementación; luego casos válidos, basura, duplicados, rango invertido y límites numéricos.

## 2. Lectura pública
- [ ] Crear cliente Supabase anónimo sin cookies y consultas de catálogo con campos explícitos, estado publicada, barrio y existencia de imagen.
- [ ] Orden estable por actualizado_en e id; paginación de 12 registros. Aplicar filtros mediante operadores del cliente, nunca SQL interpolado.
- [ ] Pruebas RLS con publicada y borrador, precio y barrio diferentes, fotos presentes/ausentes; verificar que dirección y coordenadas no viajan al consumidor.

## 3. Imágenes públicas
- [ ] Crear src/app/imagen/[id]/route.ts. Validar UUID, consultar elegibilidad publicada antes de firmar, responder 404 en recursos privados/inexistentes.
- [ ] Firma de corta duración, redirección temporal, respuesta no cacheada inicialmente. Documentar que una firma emitida sigue siendo válida hasta su vencimiento.
- [ ] Prueba de descarga real y prueba negativa del mismo recurso después de pausarlo.

## 4. Render y CSP: comprobación obligatoria antes de tocar la política
- [ ] La documentación instalada exige autorizar scripts inline. La propuesta de solo self no es suficiente.
- [ ] Evaluar hashes para HTML público estable; no confundir SRI de archivos externos con autorización de scripts inline/Flight.
- [ ] Separar cabecera con sesión del contenido público cacheable. No cachear HTML personalizado.
- [ ] Los filtros leídos mediante searchParams y estados HTTP 301/410 condicionan el render: comprobar soporte real antes de exigir prerender a todas las URL.
- [ ] Mantener política actual hasta demostrar una alternativa mediante next build + next start y navegador con cero errores CSP e interacción funcional.

## 5. Portada, barrio y ficha
- [ ] Implementar portada con barrios reales, listado con formulario GET y paginación, ficha con fotos y características públicas.
- [ ] Metadatos por datos reales, canonical, encabezado único y alt descriptivo.
- [ ] Resolver URL antigua de barrio sin exponer borradores. Para 410 distinguir historia pública de un borrador nunca publicado; no inferirlo con un cliente que elude RLS.

## 6. SEO e invalidación
- [ ] Sitemap solo con fichas elegibles, robots y JSON-LD escapado contra cierre de script.
- [ ] Invalidar datos públicos al editar, publicar, pausar, eliminar o cambiar fotos desde SP3.
- [ ] Comprobar retirada de ficha/foto y evitar caché de errores transitorios como catálogo vacío.

## 7. Aceptación
- [ ] E2E visitante: portada → barrio → filtros → ficha → foto; vendedor modifica y el público ve el estado nuevo.
- [ ] Ejecutar unitarias, RLS, E2E, build, verificar:render, tsc y lint. Adaptar guard solo junto a la estrategia de render verificada.
- [ ] Revisar diff completo, actualizar reporte y abrir PR; no declarar despliegue por un merge.

## Avance verificado — 2026-09-09

Implementados filtros, consulta pública anónima con columnas explícitas, listado con imágenes obligatorias, /catalogo, /[barrio], /[barrio]/[slug] y /imagen/[id]. La portada enlaza al catálogo. Firmas de 60 segundos, autorización previa por lectura anónima y estado publicada, redirección 307 no-store. Descarga real y denegación tras pausar comprobadas contra Supabase.

La CSP mantiene nonce y render dinámico. upgrade-insecure-requests se conserva en producción y se omite en desarrollo: al seguir la redirección de imagen, Chromium intentaba https://127.0.0.1:54321 en vez del Storage HTTP local. Regresión unitaria y recorrido de navegador verificados.

Verificaciones: build compiló las nuevas rutas, 124 RLS completas verdes y 14 E2E verdes con --workers=1. La ejecución paralela tuvo una interferencia de sesión entre pruebas antiguas que comparten la cuenta del seed y hacen signOut global. No se cambió ese comportamiento de producción. El ayudante de pruebas y seed ahora recorren todas las páginas de usuarios; antes fallaban al superar la primera página en la base persistente.

Pendiente para cerrar SP1: metadata por barrio/ficha, canonical, sitemap/robots y JSON-LD; estrategia de caché/CSP pública demostrada en producción; historial público para 410 sin revelar borradores; redirecciones 301 (actualmente permanentRedirect usa 308); revisión final y PR. Las rutas actuales no satisfacen todavía esos criterios. No se ha desplegado ni mergeado.
