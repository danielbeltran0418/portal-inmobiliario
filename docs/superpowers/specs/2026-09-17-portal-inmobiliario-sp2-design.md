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
- **Modelo:** Tabla `favoritos` con clave primaria compuesta `(comprador_id, propiedad_id)`.
- **Relaciones:** Claves foráneas con `ON DELETE CASCADE` hacia `perfiles(id)` y `propiedades(id)`. Si una propiedad se elimina de la plataforma, desaparece de los favoritos automáticamente.
- **Acceso:** Un comprador autenticado solo puede consultar, insertar y eliminar sus propios favoritos. Un usuario no puede alterar los favoritos de otro.
- **UI:** Botón interactivo (`BotonFavorito`) en la ficha pública del inmueble (`/[barrio]/[slug]`) y sección dedicada en `/mi-cuenta/favoritos` (o pestaña de favoritos) con tarjetas informativas y descarte rápido.

### 2.2. Búsquedas Guardadas
- **Modelo:** Tabla `busquedas_guardadas` con identificador UUID, `comprador_id`, `nombre` personalizado por el usuario, `criterios` (`JSONB` con los parámetros canónicos de filtro: `barrio`, `operacion`, `tipo`, `precio_min`, `precio_max`, etc.) y `notificar_email` (`BOOLEAN`).
- **Navegación:** Cada búsqueda guardada genera una URL canónica del catálogo con los query params correspondientes para que el comprador pueda relanzar su consulta en un clic.
- **Alcance de Alertas:** En este hito se implementa la persistencia de filtros, la ejecución instantánea y el flag de suscripción. El motor periódico de envío de emails queda desacoplado utilizando la misma infraestructura cron establecida en SP6.

### 2.3. Organización de la UI en `/mi-cuenta`
- La interfaz de `/mi-cuenta` evoluciona de una página monolítica a una vista con navegación estructurada por pestañas o subpáginas:
  - **Solicitudes y Citas:** Historial de leads, estado de aprobación, citas confirmadas con cuenta regresiva para revelación de dirección y chat de IA (reutiliza los componentes probados de SP5 y SP6).
  - **Favoritos:** Cuadrícula de inmuebles guardados con fotos, precio, barrio y estado.
  - **Búsquedas Guardadas:** Lista de alertas con nombre, resumen de criterios, enlace directo al catálogo y opción de eliminación.
  - **Mis Datos y Privacidad:** Formulario de actualización de datos de contacto y zona de peligro para la supresión de la cuenta.

### 2.4. Política de Supresión de Datos Personales (Habeas Data)
La supresión no puede ser un simple `DELETE CASCADE` sobre `auth.users` porque destruiría el historial contable, comercial y de auditoría de los vendedores con quienes el comprador interactuó (leads recibidos, visitas atendidas). Tampoco puede retener datos personales contra la voluntad del usuario.

**Estrategia de Anonimización y Desvinculación Total:**
1. **Purga de Preferencias Privadas:** Se eliminan físicamente todas las filas en `favoritos` y `busquedas_guardadas` asociadas al usuario.
2. **Anonimización del Perfil:**
   - `perfiles.nombre` se establece en `"Usuario dado de baja"`.
   - `perfiles.telefono` se establece en `NULL`.
   - Se marca un timestamp `suprimido_en = now()`.
3. **Anonimización de Leads de Contacto:**
   - En `leads_contacto`, para todos los leads originados por el comprador, se sobreescribe `nombre = 'Titular Anónimo'`, `correo = 'suprimido@anonimo.local'`, `telefono = '0000000000'`, `mensaje = '[Datos personales suprimidos a solicitud del titular]'`. El vendedor conserva la métrica del lead pero pierde el acceso a la PII.
4. **Gestión de Citas:**
   - Citas en estado `confirmada` con fecha futura (`inicio > now()`) se cancelan automáticamente con motivo `"Visita cancelada: cuenta de comprador suprimida"`.
   - Citas pasadas se conservan para el registro histórico del vendedor, pero vinculadas al perfil anonimizado.
5. **Cierre de Conversaciones IA:**
   - Se cierran todas las conversaciones abiertas en `conversaciones_ia` (`estado_conversacion = 'cerrada'`).
6. **Eliminación de Credenciales de Autenticación:**
   - Se elimina la cuenta en `auth.users` mediante `admin.auth.admin.deleteUser(id)`, cerrando inmediatamente las sesiones activas en todos los dispositivos e impidiendo cualquier inicio de sesión futuro.
7. **Auditoría:**
   - Se registra el evento en `registro_auditoria` con acción `comprador_cuenta_suprimida`, registrando únicamente el identificador anónimo y la fecha, sin retener datos personales.

---

## 3. Modelo de Datos y Migración

Migración: `supabase/migrations/20260918000100_sp2_panel_comprador.sql`

```sql
-- 1. Tabla de Favoritos
CREATE TABLE IF NOT EXISTS public.favoritos (
  comprador_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  propiedad_id UUID NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comprador_id, propiedad_id)
);

CREATE INDEX IF NOT EXISTS idx_favoritos_comprador ON public.favoritos(comprador_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_propiedad ON public.favoritos(propiedad_id);

-- 2. Tabla de Búsquedas Guardadas
CREATE TABLE IF NOT EXISTS public.busquedas_guardadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  criterios JSONB NOT NULL DEFAULT '{}'::jsonb,
  notificar_email BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_busquedas_guardadas_comprador ON public.busquedas_guardadas(comprador_id);

-- 3. Campo suprimido_en en perfiles
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS suprimido_en TIMESTAMPTZ;

-- 4. Habilitar RLS
ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busquedas_guardadas ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS para Favoritos
CREATE POLICY favoritos_select_propio ON public.favoritos
  FOR SELECT TO authenticated
  USING (comprador_id = auth.uid());

CREATE POLICY favoritos_insert_propio ON public.favoritos
  FOR INSERT TO authenticated
  WITH CHECK (comprador_id = auth.uid());

CREATE POLICY favoritos_delete_propio ON public.favoritos
  FOR DELETE TO authenticated
  USING (comprador_id = auth.uid());

-- 6. Políticas RLS para Búsquedas Guardadas
CREATE POLICY busquedas_select_propio ON public.busquedas_guardadas
  FOR SELECT TO authenticated
  USING (comprador_id = auth.uid());

CREATE POLICY busquedas_insert_propio ON public.busquedas_guardadas
  FOR INSERT TO authenticated
  WITH CHECK (comprador_id = auth.uid());

CREATE POLICY busquedas_update_propio ON public.busquedas_guardadas
  FOR UPDATE TO authenticated
  USING (comprador_id = auth.uid())
  WITH CHECK (comprador_id = auth.uid());

CREATE POLICY busquedas_delete_propio ON public.busquedas_guardadas
  FOR DELETE TO authenticated
  USING (comprador_id = auth.uid());
```

---

## 4. Políticas de Seguridad RLS y Ciclo de Falsificación

Se crearán pruebas de autorización en `tests/rls/comprador.test.ts` cubriendo:
1. **Falsificación 1 (Usurpación de Favoritos):** El comprador A no puede ver, agregar ni eliminar favoritos en nombre del comprador B (código de error `42501` o 0 filas afectadas).
2. **Falsificación 2 (Usurpación de Búsquedas Guardadas):** El comprador A no puede leer ni mutar búsquedas guardadas del comprador B.
3. **Falsificación 3 (Acceso Anónimo):** Un usuario anónimo no tiene privilegios de lectura ni inserción en `favoritos` ni en `busquedas_guardadas` (`42501`).
4. **Falsificación 4 (Protección de PII tras Supresión):** Una vez suprimida la cuenta, el token anterior queda invalidado y `leads_contacto` no devuelve ningún dato personal del titular.

---

## 5. Servicios y Server Actions

- `src/lib/comprador/favoritos.ts`:
  - `alternarFavorito(propiedadId)`: añade o quita una propiedad de favoritos según su estado actual.
  - `consultarFavoritosComprador(supabase, compradorId)`: lista los inmuebles marcados con sus datos principales y fotos firmadas.
- `src/lib/comprador/busquedas.ts`:
  - `guardarBusqueda(nombre, criterios, notificarEmail)`: persiste la búsqueda.
  - `eliminarBusqueda(id)`: borra la búsqueda guardada.
  - `listarBusquedasGuardadas(supabase, compradorId)`: consulta las búsquedas del usuario.
- `src/lib/comprador/datos-personales.ts`:
  - `actualizarDatosContacto(nombre, telefono)`: valida y actualiza los campos permitidos del perfil.
  - `suprimirCuentaComprador()`: ejecuta el flujo integral de anonimización, cancelación de citas futuras y borrado en auth.

---

## 6. Verificación y Calidad

- **Pruebas Unitarias:** Validación de esquemas Zod para nombres de búsqueda y criterios, formato de parámetros de catálogo, transformaciones de anonimización.
- **Pruebas RLS:** Aislamiento de favoritos y búsquedas guardadas, verificación de código `42501` y prueba de supresión de datos.
- **Pruebas E2E:** Flujo completo de un comprador autenticado agregando un favorito en una ficha de catálogo, viéndolo reflejado en `/mi-cuenta`, guardando una búsqueda y ejecutando la actualización/supresión de cuenta.
- **Métricas de Cierre:** `npm run lint` (0 warnings), `npm run test:unit`, `npm run test:rls`, `npm run build` y `npm run verificar:render` 100% en verde.
