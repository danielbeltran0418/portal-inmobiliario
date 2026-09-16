# SP2 — Panel del Comprador (Favoritos, Búsquedas, Citas/Contactos y Derechos ARCO)

> **Ruta:** docs/superpowers/plans/2026-09-17-sp2-panel-comprador-plan.md  
> **Spec de referencia:** docs/superpowers/specs/2026-09-17-portal-inmobiliario-sp2-design.md  
> **Rama de trabajo:** sp2-panel-comprador (originada desde main)  
> **Base previa:** SP0–SP7 integrados en main.

---

## Resumen Ejecutivo

El Subproyecto 2 (SP2) dota a los compradores registrados de una experiencia personalizada y da cumplimiento legal al régimen de Habeas Data (Derechos ARCO):
1. **Favoritos:** Marcar/desmarcar propiedades del catálogo y gestionarlas en /mi-cuenta/favoritos.
2. **Búsquedas guardadas:** Persistir criterios de búsqueda con un click desde /propiedades y re-ejecutarlos desde /mi-cuenta/busquedas.
3. **Historial de interacción comercial:** Vista unificada en /mi-cuenta/solicitudes de leads enviados (SP4) y citas solicitadas (SP5).
4. **Habeas Data y Derecho al Olvido:** Consulta y edición de datos de perfil, junto con la política de supresión segura: anonimización de PII en leads comerciales sin destruir las métricas del vendedor, cancelación de citas futuras y revocación de credenciales en Supabase Auth.

---

## Tareas de Implementación

### Tarea 1: Esquema de Base de Datos y Políticas RLS
- **Archivo:** supabase/migrations/20260918000100_sp2_panel_comprador.sql
- **Contenido:**
  - Tablas avoritos y usquedas_guardadas con FKs e índices.
  - Columna suprimido_en en perfiles.
  - Políticas RLS para avoritos y usquedas_guardadas restringidas a uth.uid() = usuario_id.
  - Aplicar migración con 
px supabase db reset o supabase migration up.

### Tarea 2: Pruebas de RLS y Ciclo de Falsificación
- **Archivo:** 	ests/rls/comprador.test.ts
- **Casos:**
  - Propietario lee, inserta y elimina sus favoritos.
  - Usuario ajeno recibe denegación al intentar leer o modificar favoritos ajenos (falsificación con código 42501).
  - Anónimo recibe denegación total en favoritos y búsquedas guardadas.
  - Propietario gestiona sus búsquedas guardadas; terceros son bloqueados.

### Tarea 3: Servicios y Server Actions de Favoritos
- **Archivos:**
  - src/lib/comprador/favoritos.ts
  - src/lib/comprador/acciones-favoritos.ts
- **Funcionalidad:**
  - conmutarFavorito(propiedadId) (toggle idempotente).
  - obtenerFavoritosUsuario(usuarioId).
  - esFavorito(propiedadId).
  - Revalidación de rutas /mi-cuenta/favoritos y /propiedades/[id].

### Tarea 4: Servicios y Server Actions de Búsquedas Guardadas
- **Archivos:**
  - src/lib/comprador/busquedas.ts
  - src/lib/comprador/acciones-busquedas.ts
- **Funcionalidad:**
  - guardarBusqueda(nombre, filtros).
  - obtenerBusquedasGuardadas(usuarioId).
  - eliminarBusquedaGuardada(id).

### Tarea 5: Servicios y Server Actions de Habeas Data y Supresión de Cuenta
- **Archivos:**
  - src/lib/comprador/datos-personales.ts
  - src/lib/comprador/acciones-datos.ts
- **Funcionalidad:**
  - obtenerHistorialInteracciones(usuarioId) (leads y citas del comprador).
  - ctualizarDatosPersonales(usuarioId, payload).
  - suprimirCuentaComprador(usuarioId): anonimización de perfil y leads, cancelación de citas, borrado de favoritos/búsquedas, cierre de chats IA, y eliminación en uth.admin.deleteUser.

### Tarea 6: Componentes Interactivos de Catálogo y Ficha
- **Archivos:**
  - src/components/comprador/BotonFavorito.tsx
  - src/components/comprador/BotonGuardarBusqueda.tsx
- **Integración:**
  - Añadir botón de favorito en src/app/propiedades/[id]/page.tsx y en tarjetas de catálogo si aplica.
  - Añadir botón de guardar búsqueda en la barra de filtros de /propiedades.

### Tarea 7: Interfaz del Panel del Comprador en /mi-cuenta
- **Archivos:**
  - src/app/mi-cuenta/layout.tsx (navegación lateral con tabs: Asistente IA, Favoritos, Búsquedas, Solicitudes, Mis Datos).
  - src/app/mi-cuenta/page.tsx (dashboard resumen + asistente IA).
  - src/app/mi-cuenta/favoritos/page.tsx (grid de propiedades favoritas).
  - src/app/mi-cuenta/busquedas/page.tsx (listado con link a ejecutar búsqueda).
  - src/app/mi-cuenta/solicitudes/page.tsx (historial de contactos y citas).
  - src/app/mi-cuenta/datos/page.tsx (gestión de perfil y zona de peligro ARCO).

### Tarea 8: Pruebas Unitarias de Lógica y Esquemas
- **Archivo:** 	ests/unit/comprador.test.ts
- **Casos:**
  - Validación de esquemas Zod de filtros y nombres.
  - Lógica de construcción de querystring para re-ejecución de búsquedas.
  - Formateo y validación de anonimización en supresión de datos.

### Tarea 9: Suite E2E de Panel del Comprador
- **Archivo:** 	ests/e2e/panel-comprador.spec.ts
- **Flujo:**
  - Comprador inicia sesión.
  - Añade a favoritos una propiedad desde catálogo.
  - Guarda una búsqueda filtrada.
  - Visita /mi-cuenta y navega a /mi-cuenta/favoritos y /mi-cuenta/busquedas.
  - Re-ejecuta la búsqueda guardada.
  - Navega a /mi-cuenta/datos y actualiza su nombre.
  - Ejecuta la supresión de cuenta y confirma redirección a home con sesión cerrada.

### Tarea 10: Verificación Integral y Apertura de PR
- Ejecución completa de suites:
  - 
pm run lint (0 warnings).
  - 
pm run test:unit.
  - 
pm run test:rls.
  - 
pm run build.
  - 
pm run verificar:render.
- Push a origin/sp2-panel-comprador y apertura de PR a main.
