@AGENTS.md

# Reglas del proyecto

Estas reglas aplican al escribir código y al revisarlo (`/code-review`, `/security-review` y
cualquier revisión pedida). Un cambio que rompe una de ellas es un hallazgo, aunque compile y
pase las pruebas. El porqué de cada una está en `docs/ESTADO-Y-GUIA.md` (Partes 2, 4 y 5).

## Base de datos y Supabase

- **Nunca editar una migración ya aplicada.** Todo cambio va en una migración nueva en
  `supabase/migrations/` con marca de tiempo posterior a la última.
- **Toda tabla nueva** lleva RLS activada **y** su propio
  `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ... FROM authenticated`
  en la misma migración. `pg_default_acl` le da CRUD completo a `authenticated`, y RLS no lo quita.
- **Toda función nueva** lleva `REVOKE EXECUTE ON FUNCTION <firma exacta> FROM PUBLIC`.
  Revocar solo a `anon`/`authenticated` no quita lo heredado de `PUBLIC`. Las `SECURITY DEFINER`
  fijan `search_path`.
- **RLS no filtra por dueño en `propiedades`:** las dos políticas `SELECT` se combinan con `OR`.
  Toda consulta de "mis propiedades" filtra explícitamente por `vendedor_id`.
- **Un `UPDATE`/`DELETE` que no afecta filas devuelve `error` nulo.** Encadenar `.select()` y
  tratar cero filas como fallo. Nunca responder "guardado" sin comprobarlo.
- **`crearClienteAdmin()` salta RLS.** Solo para operaciones del sistema (auditoría, límites,
  limpieza) y siempre después de verificar sesión y rol en el servidor. Nunca para servir datos
  que pidió el usuario. Los módulos de `src/lib/` que lo importan llevan `import 'server-only'`.

## Autorización y datos

- **Toda server action y ruta verifica en el servidor** la sesión (`auth.getUser()`), el rol
  (`rolDesdeToken`) y que el recurso le pertenezca a quien lo pide. Un chequeo solo en el
  frontend no cuenta.
- **Validar toda entrada con zod** (`src/lib/validacion/esquemas.ts` o un esquema junto a la
  acción) antes de tocar la base.
- **Los errores al usuario salen de `src/lib/errores/mapear.ts`:** nunca el mensaje crudo de
  Postgres o de Supabase. No revelar si un correo existe.
- **El HTML servido no debe llevar datos que el usuario no puede ver:** lo que se pasa a un
  componente cliente viaja en el payload RSC aunque no se pinte. Seleccionar solo las columnas
  necesarias. El contacto del comprador solo es visible con el lead `'aceptado'`.
- **Nada de secretos en el código, en los logs ni en `NEXT_PUBLIC_*`.** No hacer `console.log` de
  tokens, cuerpos de peticiones ni datos personales.

## Next.js, CSP e imágenes

- **Ningún segmento puede volverse estático:** el nonce de la CSP exige render dinámico. No
  declarar `dynamic = 'force-static'`, `revalidate` ni `generateStaticParams` que lo pisen.
  `npm run verificar:render` debe pasar.
- **No usar `dangerouslySetInnerHTML`** con contenido que venga de usuarios o de la IA.
- **El bucket de Storage es privado:** toda imagen se sirve con URL firmada emitida en el servidor
  (`/imagen/[id]`). Nunca construir una URL pública.
- **Los cambios en `src/proxy.ts`, en `src/lib/seguridad/` y en las políticas RLS son
  transversales:** revisarlos con más cuidado y no mezclarlos con otro trabajo en el mismo PR.

## Pruebas

- **Toda prueba de denegación demuestra por qué se deniega:** asertar el código (`42501`,
  `23514`), no solo `error` no nulo, y fijar el caso positivo en la misma prueba.
- **Todo control de seguridad nuevo pasa por un ciclo de falsificación:** romperlo a propósito,
  ver que la prueba falla y revertir.
- **Las E2E que comprueban fugas de datos leen `page.content()`**, no `toBeVisible`.
- **Todo cambio de esquema o de RLS lleva sus pruebas en `tests/rls/`.** Toda lógica nueva lleva
  unitarias en `tests/unit/`.

## Convenciones

- **El código, los nombres, la interfaz y los comentarios van en español,** igual que el resto
  del repo (`crearClienteServidor`, `acciones.ts`, `componentes/`).
- **Los commits siguen Conventional Commits en español:** `tipo(alcance): descripción`, por
  ejemplo `fix(seguridad): ...` o `feat(citas): ...`.
- **Los primitivos de shadcn/ui viven en `src/components/ui/`.** Hay componentes duplicados entre
  `src/components/` y `src/componentes/`, como `BotonCancelarPosicionamiento`, que existe idéntico
  en las dos. Antes de crear un componente, buscarlo en ambas carpetas y no sumar otra copia.
- **Antes de dar algo por terminado:** `npm run lint`, `npx tsc --noEmit`, `npm run test:unit` y,
  si tocó base de datos, `npm run test:rls` con `npx supabase db reset` antes. En Windows, correr
  vitest, Playwright y Supabase desde PowerShell.
