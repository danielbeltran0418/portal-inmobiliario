# SP2: Panel del Comprador — Favoritos, Búsquedas Guardadas, Historial y Gestión de Datos Personales

**Fecha:** 2026-09-17  
**Estado:** Aprobado para implementación  
**Rama base:** `main` (con SP0 a SP7 completamente mergeados)  
**Rama de trabajo:** `sp2-panel-comprador`

---

## 1. Contexto y Objetivos

El Subproyecto 2 (SP2) completa la experiencia del usuario con rol `comprador` en el Portal Inmobiliario de Barranquilla. Hasta este momento, `/mi-cuenta` contenía únicamente la lista básica de solicitudes con el componente de chat de IA (incorporado en SP6).

SP2 proporciona una experiencia integral para compradores particulares e inversionistas, cubriendo cuatro pilares funcionales:

1. **Favoritos:** Marcado y desmarcado ágil de propiedades del catálogo público, con persistencia en base de datos y visor en panel.
2. **Búsquedas Guardadas:** Almacenamiento de combinaciones de filtros del catálogo (barrio, tipo de inmueble, rango de precio, habitaciones), con enlace dinámico de re-ejecución y preferencia de notificación.
3. **Historial Centralizado:** Vista unificada del comprador con sus solicitudes de contacto, citas agendadas/confirmadas (SP4/SP5) y estado de interacción con agentes inteligentes (SP6).
4. **Habeas Data y Gestión de Datos Personales (Obligación SP0):** Cumplimiento de la Ley 1581 de 2012 (Protección de Datos Personales en Colombia): consulta, actualización de datos de contacto (nombre y teléfono) y derecho a la **supresión** de la cuenta mediante anonimización estricta de PII (Personally Identifiable Information) sin romper el historial operativo ni la integridad referencial del vendedor.

---

## 2. Decisiones de Arquitectura y Negocio

### 2.1. Favoritos de Propiedades
- **Modelo:** Tabla `favoritos` con PK propia `id` (UUID) y restricción `unique (usuario_id, propiedad_id)` que impide duplicados.
- **Relaciones:** `usuario_id` referencia `auth.users(id) ON DELETE CASCADE` (no `perfiles`, para no depender del trigger de creación de perfil); `propiedad_id` referencia `propiedades(id) ON DELETE CASCADE`. Si una propiedad se elimina de la plataforma, desaparece de los favoritos automáticamente.
- **Acceso:** Un comprador autenticado solo puede consultar, insertar y eliminar sus propios favoritos (`auth.uid() = usuario_id`). Un usuario no puede alterar los favoritos de otro.
- **UI:** Botón interactivo (`BotonFavorito`) en la ficha pública del inmueble (`/[barrio]/[slug]`) y sección dedicada en `/mi-cuenta/favoritos` con tarjetas informativas y descarte rápido.

### 2.2. Búsquedas Guardadas
- **Modelo:** Tabla `busquedas_guardadas` con identificador UUID, `usuario_id` (referencia `auth.users(id)`), `nombre` personalizado por el usuario (`check` de 1 a 100 caracteres), `filtros` (`JSONB` con los parámetros canónicos de filtro: `barrio`, `operacion`, `tipo`, `precio_min`, `precio_max`, etc.) y `notificaciones_activas` (`BOOLEAN`).
- **Navegación:** Cada búsqueda guardada genera una URL canónica del catálogo (`construirQueryStringBusqueda`) con los query params correspondientes para que el comprador pueda relanzar su consulta en un clic.
- **Alcance de Alertas:** En este hito se implementa la persistencia de filtros, la ejecución instantánea y el flag de suscripción (`notificaciones_activas`). El motor periódico de envío de emails queda desacoplado utilizando la misma infraestructura cron establecida en SP6.

### 2.3. Organización de la UI en `/mi-cuenta`
- La interfaz de `/mi-cuenta` evoluciona de una página monolítica a una vista con navegación estructurada por pestañas o subpáginas:
  - **Solicitudes y Citas:** Historial de leads, estado de aprobación, citas confirmadas con cuenta regresiva para revelación de dirección y chat de IA (reutiliza los componentes probados de SP5 y SP6).
  - **Favoritos:** Cuadrícula de inmuebles guardados con fotos, precio, barrio y estado.
  - **Búsquedas Guardadas:** Lista de alertas con nombre, resumen de criterios, enlace directo al catálogo y opción de eliminación.
  - **Mis Datos y Privacidad:** Formulario de actualización de datos de contacto y zona de peligro para la supresión de la cuenta.

### 2.4. Política de Supresión de Datos Personales (Habeas Data)
La supresión no puede ser un simple `DELETE CASCADE` sobre `auth.users` porque destruiría el historial contable, comercial y de auditoría de los vendedores con quienes el comprador interactuó (leads recibidos, visitas atendidas). Tampoco puede retener datos personales contra la voluntad del usuario.

**Estrategia de Anonimización y Desvinculación Total** (implementada en `suprimirCuentaCompradorAction`, `src/lib/comprador/acciones-datos.ts`), en este orden y dentro de un único flujo con manejo de errores:
1. **Purga de Preferencias Privadas:** Se eliminan físicamente todas las filas en `favoritos` y `busquedas_guardadas` asociadas al usuario (`usuario_id`).
2. **Cierre de Conversaciones IA:** Se cierran todas las conversaciones abiertas en `conversaciones_ia` (`estado_conversacion = 'cerrada'`) donde el comprador figura como `comprador_id`.
3. **Gestión de Citas:** Citas en estado `confirmada` asociadas a los leads del comprador se marcan `cancelada` con nota `"Cancelada automáticamente por supresión de cuenta de usuario."`.
4. **Anonimización de Leads de Contacto:** En `leads_contacto`, para todos los leads del comprador, se sobreescribe `nombre = 'Usuario Anónimo'`, `telefono = NULL`, `email = 'anonimo@baja.portal.test'`. El vendedor conserva la métrica del lead pero pierde el acceso a la PII. (El campo `mensaje` original no se sobreescribe: no contiene PII estructurada y se conserva como contexto comercial del vendedor.)
5. **Anonimización del Perfil:**
   - `perfiles.nombre` se establece en `"Usuario dado de baja"`.
   - `perfiles.telefono` se establece en `NULL`.
   - Se marca `suprimido_en = now()`.
6. **Auditoría:** Se registra el evento vía `registrar_evento_auditoria` con acción `cuenta_suprimida`, entidad `perfiles` y metadato `{ motivo: "Habeas Data / Derecho al Olvido ejercido por el titular" }`, sin retener datos personales.
7. **Eliminación de Credenciales de Autenticación:** Se elimina la cuenta en `auth.users` mediante `admin.auth.admin.deleteUser(id)`, cerrando inmediatamente las sesiones activas en todos los dispositivos e impidiendo cualquier inicio de sesión futuro.
8. **Cierre de Sesión:** Se invoca `supabase.auth.signOut()` en el cliente que originó la solicitud.

**Confirmación explícita:** la acción exige que el comprador escriba literalmente `"ELIMINAR MI CUENTA"` antes de ejecutar el flujo, como salvaguarda contra la supresión accidental.

---

## 3. Modelo de Datos y Migración

Migración: `supabase/migrations/20260918000100_sp2_panel_comprador.sql`

```sql
-- 1. Soporte para fecha de supresión de cuenta (Habeas Data / Derecho al Olvido) en perfiles
alter table public.perfiles
  add column if not exists suprimido_en timestamptz default null;

-- 2. Tabla de favoritos
create table if not exists public.favoritos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,
  creado_en timestamptz not null default now(),
  constraint favoritos_usuario_propiedad_unique unique (usuario_id, propiedad_id)
);

create index if not exists idx_favoritos_usuario on public.favoritos(usuario_id);
create index if not exists idx_favoritos_propiedad on public.favoritos(propiedad_id);

alter table public.favoritos enable row level security;

create policy "Comprador puede ver sus propios favoritos"
  on public.favoritos for select
  to authenticated
  using (auth.uid() = usuario_id);

create policy "Comprador puede marcar favoritos"
  on public.favoritos for insert
  to authenticated
  with check (auth.uid() = usuario_id);

create policy "Comprador puede eliminar sus propios favoritos"
  on public.favoritos for delete
  to authenticated
  using (auth.uid() = usuario_id);

-- 3. Tabla de búsquedas guardadas
create table if not exists public.busquedas_guardadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null check (char_length(trim(nombre)) between 1 and 100),
  filtros jsonb not null default '{}'::jsonb,
  notificaciones_activas boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_busquedas_usuario on public.busquedas_guardadas(usuario_id);

alter table public.busquedas_guardadas enable row level security;

create policy "Comprador puede ver sus propias busquedas"
  on public.busquedas_guardadas for select
  to authenticated
  using (auth.uid() = usuario_id);

create policy "Comprador puede crear busquedas guardadas"
  on public.busquedas_guardadas for insert
  to authenticated
  with check (auth.uid() = usuario_id);

create policy "Comprador puede actualizar sus busquedas guardadas"
  on public.busquedas_guardadas for update
  to authenticated
  using (auth.uid() = usuario_id)
  with check (auth.uid() = usuario_id);

create policy "Comprador puede eliminar sus busquedas guardadas"
  on public.busquedas_guardadas for delete
  to authenticated
  using (auth.uid() = usuario_id);
```

Nota: `usuario_id` referencia `auth.users(id)` directamente (no `perfiles(id)`) para no depender del
trigger de creación de perfil; ambas tablas usan PK propia `id` con una restricción `unique`
adicional en `favoritos`, no PK compuesta.

---

## 4. Políticas de Seguridad RLS y Ciclo de Falsificación

Se crearán pruebas de autorización en `tests/rls/comprador.test.ts` cubriendo:
1. **Falsificación 1 (Usurpación de Favoritos):** El comprador A no puede ver, agregar ni eliminar favoritos en nombre del comprador B (código de error `42501` o 0 filas afectadas).
2. **Falsificación 2 (Usurpación de Búsquedas Guardadas):** El comprador A no puede leer ni mutar búsquedas guardadas del comprador B.
3. **Falsificación 3 (Acceso Anónimo):** Un usuario anónimo no tiene privilegios de lectura ni inserción en `favoritos` ni en `busquedas_guardadas` (`42501`).
4. **Falsificación 4 (Protección de PII tras Supresión):** Una vez suprimida la cuenta, el token anterior queda invalidado y `leads_contacto` no devuelve ningún dato personal del titular.

---

## 5. Servicios y Server Actions

Separación entre lectura (Server Components) y mutación (Server Actions con `'use server'`):

- `src/lib/comprador/favoritos.ts` (lectura):
  - `obtenerFavoritosUsuario(supabase, usuarioId)`: lista los inmuebles marcados con sus datos principales y fotos.
  - `esFavorito(supabase, usuarioId, propiedadId)`: consulta si una propiedad puntual ya está marcada.
- `src/lib/comprador/acciones-favoritos.ts` (mutación):
  - `conmutarFavoritoAction(propiedadId)`: añade o quita una propiedad de favoritos según su estado actual; revalida `/mi-cuenta/favoritos` y la ficha de la propiedad.
- `src/lib/comprador/busquedas.ts` (lectura):
  - `obtenerBusquedasGuardadas(supabase, usuarioId)`: consulta las búsquedas del usuario.
  - `construirQueryStringBusqueda(filtros)`: genera la URL canónica del catálogo a partir de los filtros guardados.
- `src/lib/comprador/acciones-busquedas.ts` (mutación):
  - `guardarBusquedaAction(nombre, filtros, notificaciones)`: valida con Zod y persiste la búsqueda.
  - `eliminarBusquedaAction(busquedaId)`: borra la búsqueda guardada del propio usuario.
- `src/lib/comprador/datos-personales.ts` (lectura):
  - `obtenerPerfilComprador(supabase, usuarioId)`: datos de perfil, incluido `suprimido_en`.
  - `obtenerHistorialComprador(supabase, usuarioId)`: leads y citas asociados, para la vista de historial.
- `src/lib/comprador/acciones-datos.ts` (mutación):
  - `actualizarPerfilCompradorAction(datos)`: valida con Zod y actualiza `nombre`/`telefono` del perfil propio.
  - `suprimirCuentaCompradorAction(confirmacion)`: exige la frase literal `"ELIMINAR MI CUENTA"` y ejecuta el flujo integral de anonimización, cancelación de citas, cierre de conversaciones IA y borrado en `auth.users` descrito en §2.4.

---

## 6. Verificación y Calidad

- **Pruebas Unitarias:** Validación de esquemas Zod para nombres de búsqueda y criterios, formato de parámetros de catálogo, transformaciones de anonimización.
- **Pruebas RLS:** Aislamiento de favoritos y búsquedas guardadas, verificación de código `42501` y prueba de supresión de datos.
- **Pruebas E2E:** Flujo completo de un comprador autenticado agregando un favorito en una ficha de catálogo, viéndolo reflejado en `/mi-cuenta`, guardando una búsqueda y ejecutando la actualización/supresión de cuenta.
- **Métricas de Cierre:** `npm run lint` (0 warnings), `npm run test:unit`, `npm run test:rls`, `npm run build` y `npm run verificar:render` 100% en verde.
