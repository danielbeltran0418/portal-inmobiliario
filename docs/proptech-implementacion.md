# Experiencia PropTech y configuración

## Entregado

Buscador por ciudad, barrio o código postal; tipos; venta, arriendo y temporal. Filtros móviles en diálogo accesible, precio con dos tiradores y decimales, metraje, habitaciones, baños, parqueaderos, estrato y comodidades. URL y búsquedas guardadas conservan filtros. Recomendaciones separadas del resultado principal, en la misma ciudad, con rango de precio ampliado un 20%.

Tarjetas con zoom, favoritos animados respetando movimiento reducido y skeleton durante la carga de fotografías. Galería ampliable con teclado y swipe. Se conservan respuestas 404/410, sin loading de página que convierta rutas inexistentes en respuestas 200.

Acceso por roles; Google, Apple, Magic Link y SMS preparados. Pedir código/enlace devuelve la misma respuesta para cuentas existentes y desconocidas; CAPTCHA y límites fallan cerrado. Se conserva la sesión y recuperación existentes.

Planes Básico, Destacado y Pro, periodos mensual/anual, checkout Wompi y webhook firmado que contrasta referencia y estado con el API del proveedor. Órdenes privadas, confirmación idempotente y comprobante descargable. Sandbox nunca concede derechos de producción. Pago único por periodo; no hay renovación automática ni almacenamiento de tarjetas. El comprobante es un recibo, no factura electrónica.

Al activar comercialmente, Básico permite un anuncio durante 30 días y ocho fotos, incluso después de publicar; Destacado cinco; Pro ilimitados. Los planes pagados dan prioridad y tour 360 de Matterport/Kuula. Verificación de identidad independiente del pago.

Pro muestra cargas de ficha y solicitudes de 30 días, no visitantes únicos. Equipos: invitaciones para un correo confirmado, caducidad de 48 horas y revocación. Resumen de publicaciones activas; cada agente conserva la edición y contactos de sus propios inmuebles. No se comparten borradores, direcciones privadas ni contactos de compradores.

Mapa Google con precios y selección por tarjeta; solo zonas aproximadas, nunca coordenadas exactas ni dirección. WhatsApp directo usa el número expresamente publicado por el vendedor y prellena ID, título y URL. La agenda y disponibilidad existentes continúan mediante contacto y chat.

Avisos de leads y bajadas de precio con opt-in, cola privada y reintentos. WhatsApp automático al agente preparado con Twilio, plantilla y teléfono de Auth confirmado; no usa el teléfono sin verificar de perfiles.

## Configuración pendiente del propietario

Todas las integraciones nuevas se entregan desactivadas en .env.example. No se aplicaron cambios ni cobros en producción.

1. Revisar y aplicar migraciones nuevas 20261015000100 a 20261015001200, comprobando el historial destino. Nunca resetear producción.
2. Definir cuatro precios COP enteros: PLAN_DESTACADO_MENSUAL_COP, PLAN_DESTACADO_ANUAL_COP, PLAN_PRO_MENSUAL_COP, PLAN_PRO_ANUAL_COP. Vacío significa no disponible.
3. NEXT_PUBLIC_APP_URL debe ser el origen real, HTTPS en producción.
4. Wompi: comenzar en test con clave pública, secretos de integridad y eventos del mismo entorno. Registrar /api/pagos/wompi; probar aprobación, rechazo, repetición y retorno. Activar WOMPI_ENABLED y configuracion_comercial.planes_activos solo después de configurar y probar. Los límites aplican a nuevas publicaciones; las existentes conservan vigencia histórica hasta renovación o nueva publicación. Producción requiere claves prod y prueba real autorizada.
5. Supabase: habilitar proveedores deseados, registrar callbacks y URLs permitidas /confirmar, configurar plantilla Magic Link token_hash o PKCE, CAPTCHA y límites. Activar AUTH_GOOGLE_ENABLED, AUTH_APPLE_ENABLED, AUTH_MAGIC_LINK_ENABLED o AUTH_SMS_ENABLED por separado. SMS requiere proveedor y teléfono confirmado en Auth. Magic Link/SMS no crean cuentas automáticamente.
6. Google: configurar Maps JavaScript API y Map ID, restringir clave del navegador por dominio y API, revisar cuotas; activar MAPS_INTERACTIVE_ENABLED. Usar clave distinta de GOOGLE_MAPS_API_KEY exclusiva del servidor. Sin configuración no carga SDK ni solicita zonas para el mapa interactivo.
7. Resend: clave y remitente verificado, NOTIFICACIONES_PORTAL_ENABLED. Despacho después de respuesta y cron diario /api/cron/avisos-portal con CRON_SECRET. Preferencias falsas por defecto y revalidadas antes de enviar.
8. WhatsApp automático: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_LEAD_CONTENT_SID y WHATSAPP_AVISOS_ENABLED. Plantilla aprobada con variable 1 título y 2 enlace al panel. Opt-in del agente y celular confirmado en Auth. Canal desactivado queda pendiente sin consumir intentos y no bloquea correo. Un timeout tras aceptar el mensaje puede provocar envío repetido en reintento: no se promete exactamente una entrega.
9. METRICAS_PORTAL_ENABLED y EQUIPOS_PRO_ENABLED solo después de configurar planes. Las invitaciones validan rol del JWT emitido por el hook, no los metadatos no modificados de getUser.

No colocar claves en el chat, Git ni variables NEXT_PUBLIC. Solo la clave restringida de Maps se publica deliberadamente al navegador.

## Conciliación y límites de alcance

Cambiar de plan mientras otro esté vigente se bloquea antes del checkout y en la base. Destacado se bloquea antes del pago si hay más de cinco anuncios activos. Un segundo pago aprobado fuera de orden para un plan distinto se registra con requiere_revision=true, conserva el plan actual y muestra revisión pendiente. El operador debe conciliar activación o devolución con Wompi; no hay reembolso automático.

Wompi es la primera pasarela elegida. Stripe, cobro recurrente automático, facturación electrónica y edición delegada de inmuebles no están implementados en esta entrega.

Pruebas externas de OAuth, SMS, Maps, Resend y Twilio esperan configuración de proveedores. Verificación local no equivale a entrega o cobro real en producción.

## Validación

Lint, TypeScript, build y render dinámico; unitarias de firmas, API autoritativo, métodos opcionales, CAPTCHA/límites, tarifas, filtros y WhatsApp. RLS real: sandbox, renovación, pagos fuera de orden, límites de anuncios/fotos, canales e invitaciones. Navegador: acceso/sesión, catálogo, 404/410, galería y filtros móviles.

Falsificación deliberada: aceptar todas las firmas hizo fallar dos pruebas; desactivar el trigger de fotos dentro de una transacción hizo fallar la prueba de la novena. Código restaurado, transacción revertida y pruebas verdes.

Revisión anterior: corrección CSP #74 en 8146194. #80 de aal2 sigue pendiente de integración/aplicación en producción.

npm informa cinco alertas altas en dependencias de desarrollo alrededor de braces/micromatch/eslint-config-next. El registro consultado solo ofreció braces 3.0.3; no se ejecutó la degradación mayor propuesta por audit fix --force.

## Referencias

[Wompi checkout](https://docs.wompi.co/docs/colombia/widget-checkout-web/) y [eventos](https://docs.wompi.co/docs/colombia/eventos/).
[Supabase Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple), [Magic Link](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMS](https://supabase.com/docs/guides/auth/phone-login).
[Google Maps CSP](https://developers.google.com/maps/documentation/javascript/content-security-policy).
[Twilio WhatsApp](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).