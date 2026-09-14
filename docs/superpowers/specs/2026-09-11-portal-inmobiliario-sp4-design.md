# SP4 — Leads y contacto

Fecha: 2026-09-11
Sub-proyecto: SP4 del portal inmobiliario de Barranquilla
Depende de: SP0 (fundación), SP3 (panel del vendedor) y SP1 (catálogo público), los tres mergeados
Mapa: `2026-08-31-portal-inmobiliario-descomposicion.md`
Spec de SP1: `2026-09-08-portal-inmobiliario-sp1-design.md`
Spec de SP3: `2026-09-04-portal-inmobiliario-sp3-design.md`

## 1. Qué es y por qué ahora

SP3 dejó al vendedor publicar y SP1 puso esas publicaciones delante de desconocidos. Hoy el
recorrido **termina ahí**: alguien encuentra una casa que le interesa y no tiene forma de
decirlo. SP4 cierra ese hueco.

Es además el siguiente eslabón del camino crítico del diferenciador — `SP0 → SP3 → SP4 → SP5
→ SP6` — y el primero que **produce** un hecho de negocio: `lead_capturado`.

Consume `propiedad_publicada`. Produce `lead_capturado`.

## 2. Lo que ya existe y condiciona el diseño

- **`perfiles`** con `nombre` (NOT NULL) y `telefono` (nullable). Su política de lectura es
  estrictamente `id = auth.uid()`: hoy nadie puede leer el perfil de otro salvo el
  `super_admin`.
- **El correo NO está en `perfiles`.** Vive en `auth.users`, que `authenticated` no puede
  leer. Cualquier diseño que muestre el correo del comprador al vendedor tiene que traerlo de
  algún sitio; esto decide la §5.
- **`propiedades`** con `estado = 'publicada'` como única fila visible a `anon`, y `slug`
  único global y estable.
- **`intentos_login`** con `login_bloqueado(correo, ip)` y `registrar_intento_login(correo,
  ip, exitoso)`, las dos `SECURITY DEFINER`, revocadas de `PUBLIC`, `anon` y `authenticated`,
  concedidas solo a `service_role`. Cuentan **fallos**, no éxitos.
- **`ipDeConfianza()`** en `src/lib/http/ip-cliente.ts`, con una política documentada que
  importa citar: *«se degrada a un límite más ESTRICTO y no falsificable, nunca a sin
  límite»*. La §9 choca con esto.
- **Turnstile YA ESTÁ CONSTRUIDO, y está inerte.** `src/lib/seguridad/turnstile.ts`
  (verificación contra siteverify, con timeout y fallando cerrado),
  `src/app/(auth)/guion-turnstile.tsx` y `widget-turnstile.tsx`, y la llamada ya puesta en
  `src/app/(auth)/registro/acciones.ts`. La CSP **ya lo cubre**: `connect-src` y `frame-src`
  llevan `challenges.cloudflare.com`, y `script-src` no hace falta tocarlo porque bajo
  `strict-dynamic` el navegador ignora la lista de orígenes y la autorización va por nonce.
  Sin las variables de entorno, `verificarTurnstile()` devuelve `true` sin mirar nada.
  **Encenderlo son dos variables, cero código.**
- **`registro_auditoria`** con cuatro escritores reales, todos en la base (triggers y
  funciones), y lectura solo para `super_admin`.
- **`limpieza_almacenamiento`**: el patrón del proyecto para «un trigger anota, un consumidor
  con `service_role` drena». Precedente de la §6.
- **No hay tabla de leads, ni mecanismo de emisión de hechos.** SP3 produce
  `propiedad_publicada` poniendo `estado = 'publicada'` y nada más: la costura de la
  descomposición nunca se construyó como infraestructura.
- **Base de pruebas a superar:** 317 unitarias, 130 RLS, 14 E2E.

## 3. Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Quién puede enviar un lead | **Solo comprador con cuenta** | Mata el spam anónimo y da al lead un perfil con correo ya verificado al que colgarse. Cuesta embudo, y se acepta |
| Qué ve el vendedor | **Mensaje ya, contacto al aceptar** | Privacidad real: sin esto el correo personal del comprador queda expuesto a todo vendedor al que escriba. Ley 1581 de habeas data |
| Cómo se hace el revelado | **Dos tablas** | Una política por tabla, una expresión cada una, y falsificable. Ver §5 |
| Emisión de `lead_capturado` | **La fila ES el hecho** | Un bus sin consumidor es infraestructura especulativa. Ver §6 |
| Anti-spam | **Límite por IP en registro** | Segunda capa, independiente de Turnstile. No depende de que nadie consiga claves, y se puede falsificar en la suite. Ver §9 |
| Contacto en el lead | **Instantánea al capturar** | Si el comprador cambia de teléfono, el lead debe seguir mostrando el que dio |

## 4. Modelo de datos

```sql
CREATE TYPE public.estado_lead AS ENUM ('nuevo','aceptado','descartado');
```

**`leads`** — el hecho, y lo que el vendedor ve antes de aceptar:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `propiedad_id` | `uuid` NOT NULL | `REFERENCES propiedades ON DELETE CASCADE` |
| `comprador_id` | `uuid` NOT NULL | `REFERENCES perfiles ON DELETE CASCADE` |
| `vendedor_id` | `uuid` NOT NULL | Desnormalizado a propósito. Ver abajo |
| `nombre_mostrado` | `text` NOT NULL | Instantánea del nombre al capturar |
| `mensaje` | `text` NOT NULL | 10 a 1000 caracteres |
| `estado` | `estado_lead` NOT NULL | `DEFAULT 'nuevo'` |
| `creado_en` | `timestamptz` NOT NULL | `DEFAULT now()` |
| `respondido_en` | `timestamptz` | Se fija al salir de `nuevo` |

`vendedor_id` está desnormalizado **porque la política de RLS lo necesita**. Con solo
`propiedad_id`, toda política de `leads` tendría que subir a `propiedades` con un `EXISTS`, y
`propiedades` tiene dos políticas permisivas de SELECT que Postgres combina con OR — una de
ellas `estado = 'publicada'`. Ese es exactamente el fallo de la Task 11 de SP0: apoyarse en
«RLS ya filtra por dueño» cuando no lo hace.

El cliente **no puede** mandarlo, y la forma de conseguirlo decide también cómo se escribe el
lead. Ver §4.1.

**`leads_contacto`** — lo que aparece al aceptar:

| Columna | Tipo | Notas |
|---|---|---|
| `lead_id` | `uuid` PK | `REFERENCES leads ON DELETE CASCADE` |
| `correo` | `text` NOT NULL | Instantánea, traída de `auth.users` por `crear_lead()` |
| `telefono` | `text` NOT NULL | Instantánea |

Sobre **`leads`** va `UNIQUE (propiedad_id, comprador_id)`: un comprador no abre dos
conversaciones sobre la misma propiedad. Reintentar devuelve un error legible, no un 23505
crudo.

### Tres cosas que la base impide, no la interfaz

Las tres viven en `crear_lead()` (§4.1), que es el **único** camino de escritura: ni `anon` ni
`authenticated` tienen `INSERT` sobre `leads` ni sobre `leads_contacto`. No son comprobaciones
del server action, y esa es la diferencia — el server action no es el único camino, la función
sí.

1. **Un vendedor no se deja un lead en su propia propiedad.** La función compara el
   `auth.uid()` con el `vendedor_id` que ella misma leyó de la propiedad.
2. **No se capturan leads sobre propiedades que no están publicadas.** La función lee el estado
   de la propiedad, no se lo cree al cliente.
3. **`telefono` es obligatorio** aunque siga siendo nullable en `perfiles`: un lead sin
   teléfono no le sirve de nada al vendedor. Lo exigen el esquema de validación del formulario
   y el `NOT NULL` de `leads_contacto`.

Las dos primeras levantan excepciones con **mensajes distintos**: mapear a ciegas un mismo
código cuando dos comprobaciones lo lanzan es un defecto que este proyecto ya cometió.

Las transiciones de estado (`nuevo → aceptado | descartado`, y nunca la vuelta) sí van en un
trigger `BEFORE UPDATE`, porque ahí el vendedor **sí** escribe directo: tiene `UPDATE (estado)`
sobre sus propios leads por RLS.

### 4.1 · El camino de escritura: una función, no dos `INSERT`

El lead nace en dos tablas a la vez, y el cliente no puede escribir en ninguna de ellas:

- En `leads_contacto` no puede porque el contacto no es editable por nadie salvo
  `service_role` (§5).
- En `leads` tampoco debería: tendría que mandar `propiedad_id`, `telefono` y `mensaje`, pero
  el teléfono **no va en esa tabla**, así que no hay forma de que un solo `INSERT` del cliente
  coloque las dos filas.

Así que el camino de escritura es **una función**, `crear_lead(p_propiedad_id uuid, p_telefono
text, p_mensaje text)`, y `authenticated` **no tiene `INSERT` sobre ninguna de las dos
tablas**. La función:

1. Resuelve `comprador_id` de `auth.uid()`, y `vendedor_id` y el estado de la propiedad
   leyéndolos de `propiedades` — nada de eso lo manda el cliente, así que no hay nada que
   falsificar.
2. Rechaza si la propiedad no está publicada, o si el comprador es el vendedor.
3. Inserta las dos filas **en la misma transacción**. Un lead no puede existir sin su
   contacto.

Esto no contradice lo que la §5 rechaza. Allí el problema de una función `SECURITY DEFINER`
era de **lectura**: el vendedor conservaba `SELECT` sobre la tabla y podía saltarse la función
leyendo directo. Aquí es de **escritura**, y sin `INSERT` concedido no hay camino alternativo:
la base lo hace cumplir, no el código de la aplicación.

Es `SECURITY DEFINER` por necesidad — tiene que leer el correo de `auth.users`, a la que
`authenticated` no tiene acceso. Lleva `SET search_path = ''`, y su `EXECUTE` se revoca de
`PUBLIC` y se concede a `authenticated` de forma explícita: es la única función de SP4 que
invoca el usuario final. El `REVOKE ... FROM PUBLIC` va nombrado, porque Postgres concede
`EXECUTE` a `PUBLIC` por defecto en toda función nueva y un `REVOKE` que solo mencione a `anon`
no quita nada — ese fue el crítico de SP0.

## 5. El revelado del contacto, y por qué en dos tablas

Se descartaron dos formas antes de llegar a esta.

**Una política de RLS sobre `perfiles`** que deje al vendedor leer el perfil del comprador
cuando exista un lead aceptado sobre una propiedad suya. Falla por dos motivos
independientes: el `nombre` también vive en `perfiles` y hay que mostrarlo **antes** de
aceptar, y **RLS es por fila, no por columna** — una sola política no puede ocultar el
teléfono y mostrar el nombre. Y el correo no está en `perfiles` en absoluto.

**Una tabla y un RPC `SECURITY DEFINER`** que devuelva el contacto solo si el lead está
aceptado. El problema no es el RPC: es que **la base no lo hace cumplir**. El vendedor
seguiría teniendo `SELECT` sobre la tabla y podría leerla directo por PostgREST. Para cerrarlo
habría que revocarle el `SELECT` y canalizar toda lectura por el RPC — y las funciones
`SECURITY DEFINER` son justo donde este proyecto ya se cortó una vez, con el `EXECUTE` que
Postgres concede a `PUBLIC` por defecto.

**Dos tablas.** La política de `leads_contacto` es una expresión:

```sql
CREATE POLICY contacto_lectura_vendedor ON public.leads_contacto
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = leads_contacto.lead_id
      AND l.vendedor_id = (SELECT auth.uid())
      AND l.estado <> 'nuevo'
  ));
```

Y es **falsificable**: se pone un lead en `nuevo`, se intenta leer su contacto como el
vendedor dueño, y la prueba exige cero filas. Quitar el `AND l.estado <> 'nuevo'` la pone
roja. El comprador lee su propio contacto por una segunda política (`l.comprador_id =
auth.uid()`), sin condición de estado.

Ningún rol salvo `service_role` tiene `INSERT`, `UPDATE` ni `DELETE` sobre `leads_contacto`:
la instantánea la escribe el trigger, nadie la edita después.

## 6. La costura de `lead_capturado`: por qué no hay cola de eventos

La regla que SP4 hereda de la descomposición es que **SP6 pueda reaccionar al hecho sin tocar
el código de SP4**. La lectura natural es «hace falta un bus». No hace falta, y construirlo
ahora sería peor.

**El hecho es una fila.** Un lead con `estado = 'nuevo'` es observable por cualquier
consumidor — un agente, un cron, un panel — sin que SP4 sepa que ese consumidor existe. El
índice `leads_nuevos_idx (creado_en) WHERE estado = 'nuevo'` lo sirve directo.

Lo que se gana esperando: si SP6 necesita empuje en vez de sondeo, añade un trigger
`AFTER INSERT ON leads` que escriba en su propia cola, **sin modificar una línea de SP4**. La
costura está cortada donde debe; lo que no está es rellena de infraestructura que nadie usa
todavía. El precedente del proyecto (`limpieza_almacenamiento`) existe y está a mano el día
que haga falta — incluido el aviso de su ticket aparcado: su columna `intentos` nunca se
incrementa, y una cola nueva no debe heredar ese defecto.

## 7. El formulario en la ficha

Vive en `/[barrio]/[slug]`, la ficha pública de SP1.

**Sin sesión** — un enlace, no un formulario: «Entra o crea cuenta para contactar», que lleva
a `/login?volver=<ruta de la ficha>`. El parámetro `volver` se valida contra una ruta interna
(empieza por `/`, no por `//`, sin `\`), igual que `urlPublica()` valida la suya en SP1. Un
`volver` externo es un redirect abierto.

**Con sesión de comprador** — nombre precargado de `perfiles` y no editable en el formulario
(se cambia en `/mi-cuenta`), teléfono precargado si lo tiene, y mensaje. Un `<form>` con
server action, sin componentes de cliente: la CSP lleva `strict-dynamic` sin `unsafe-inline`
y aquí no hace falta nada interactivo.

**Con sesión de vendedor sobre su propia propiedad** — no se muestra el formulario. El trigger
de la §4 lo impediría igual; esto evita ofrecer algo que va a fallar.

**Tras enviar** — la ficha muestra «Ya contactaste sobre esta propiedad» en vez del
formulario, leído del `UNIQUE`. No se revela nada del vendedor.

## 8. La bandeja del vendedor

`/panel/leads`, dentro del grupo `(vendedor)` que ya existe.

Lista los leads de las propiedades del vendedor, los `nuevo` primero y luego por fecha
descendente. Cada fila: nombre mostrado, título de la propiedad, mensaje, fecha y estado.

Dos acciones, las dos server actions: **Aceptar** (`nuevo → aceptado`, fija `respondido_en`,
revela el contacto) y **Descartar** (`nuevo → descartado`). Un lead que ya salió de `nuevo` no
vuelve: la transición la valida un trigger, no solo la interfaz.

El contacto del lead aceptado se muestra en la propia fila. No hay vista de detalle: un lead
es un mensaje y un contacto, no cabe una página.

**El panel de SP3 gana un contador** de leads nuevos. Es la única modificación a código de SP3.

## 9. El límite de registro, y el agujero que abre

`/registro` pasa a ser la puerta del spam. Tiene **una** barrera construida —Turnstile— y está
apagada por falta de claves, así que hoy en la práctica no hay ninguna.

Las dos capas son independientes y no se sustituyen:

- **Turnstile** distingue humano de bot, y está a dos variables de entorno de funcionar.
  Encenderlo no es trabajo de SP4: no hay código que escribir.
- **El límite por IP** acota el volumen aunque quien registre sea humano, o aunque alguien
  resuelva el desafío. Es lo que SP4 construye.

Un atacante que rompa el captcha sigue topándose con el límite; un humano con un guion sigue
topándose con el límite. Por eso la capa nueva vale la pena aunque se enciendan las claves
mañana.

### La regla no es la misma que la del login

El limitador de SP0 cuenta **fallos**: cinco intentos fallidos sobre un correo en quince
minutos. Para el registro eso no sirve de nada — el spam de altas son registros **exitosos**,
y cada uno con un correo distinto. Un limitador que cuente fallos de registro no bloquea a
nadie.

Así que la generalización no es «añadir una columna `accion`» y reusar el predicado: es la
misma tabla y la misma forma, con **otro predicado**. `intentos_login` se generaliza a
`intentos_accion (accion, clave, ip, exitoso, creado_en)`, y:

- `login`: ≥ 5 **fallidos** por `clave` (el correo) en 15 minutos.
- `registro`: ≥ 3 **exitosos** por `ip` en 60 minutos.

Las dos funciones mantienen su forma (`SECURITY DEFINER`, revocadas de `PUBLIC`, `anon` y
`authenticated`, concedidas solo a `service_role`) porque esa forma ya está probada y
falsificada en `tests/rls/limite-intentos.test.ts`. La migración renombra y amplía; **no se
edita ninguna migración ya aplicada**.

Consecuencia que hay que aceptar: renombrar la tabla y las funciones **toca código de SP0**, y
más de lo que parece. Medido, no estimado:

| Fichero | Referencias |
|---|---|
| `tests/rls/limite-intentos.test.ts` | 40 |
| `tests/rls/auditoria.test.ts` | 6 |
| `tests/unit/limite-intentos.test.ts` | 2 |
| `tests/rls/privilegios-anon.test.ts` | 1 |
| `tests/unit/accion-registro.test.ts` | 1 |
| `src/lib/auth/limite-intentos.ts` | el único de producción |
| `src/app/(auth)/registro/acciones.ts` | solo un comentario, que queda obsoleto |

El server action del login **no** aparece: pasa por `src/lib/auth/limite-intentos.ts`, que es
la única frontera real. Eso es una buena noticia para el plan — hay un solo punto de cambio en
producción y cinco ficheros de prueba que arrastrar.

Por eso el rename es **su propia tarea, y va primero**: las cinco suites deben quedar en verde
con el nombre nuevo y **sin ninguna regla nueva**, antes de tocar el predicado de registro. Si
se hacen juntos y algo se pone rojo, no se sabe cuál de los dos cambios fue.

### El agujero: sin IP de confianza no hay límite de registro

`ipDeConfianza()` devuelve `null` cuando no puede determinar una IP fiable, y su política
documentada es degradar a un límite **más estricto**: para el login, contar por correo sin
discriminar IP.

**Para el registro esa degradación no existe.** Cada alta de spam usa un correo distinto, así
que «contar por correo» cuenta uno y no bloquea nada. Con `ip = NULL`, un limitador de
registro por IP degrada a *sin límite* — exactamente el modo de fallo que `ip-cliente.ts` se
escribió para evitar.

**Decisión: falla cerrado.** Si no hay IP de confianza, el registro se **rechaza** con un
mensaje que dice que el servicio no está configurado, y se registra el aviso. Consecuencia
que hay que aceptar con los ojos abiertos: **un despliegue de producción sin
`IP_CABECERA_CONFIABLE` no permite registrar a nadie.** Es ruidoso y se arregla en un minuto;
la alternativa es un agujero silencioso, y este proyecto ya decidió por escrito cómo se
resuelve esa disyuntiva. En desarrollo `ipDeConfianza()` devuelve `127.0.0.1` y el límite es
observable en local.

`docs/DESPLIEGUE.md` gana esta variable en su lista, que hoy solo tiene cuatro.

## 10. Auditoría

Tres eventos nuevos en `registro_auditoria`: `lead_capturado`, `lead_aceptado` y
`lead_descartado`, con `entidad = 'lead'` y `entidad_id` del lead.

Se escriben **desde la base** — `lead_capturado` dentro de `crear_lead()`, los otros dos en el
trigger de transición — por el mismo motivo que documenta la migración `20260831000700`:
*«la auditoría tiene que cubrir el evento, no el formulario»*. Escribirlos en el server action
los dejaría fuera de cualquier camino que no pase por la interfaz.

El `actor_id` del `lead_capturado` es el comprador; el de los otros dos, el vendedor.

## 11. Errores

- **Lead duplicado** (23505 sobre el `UNIQUE`) → «Ya contactaste sobre esta propiedad».
- **Propiedad no publicada o propia** → el trigger levanta una excepción con mensaje propio,
  mapeado a un aviso legible. Se distinguen entre sí: el mapeo a ciegas de un 23514 con dos
  triggers que lo lanzan es un defecto que este proyecto ya cometió.
- **Registro bloqueado por límite** → mismo mensaje que el login bloqueado, sin revelar si el
  correo existe.
- **Registro sin IP de confianza** → error de configuración, no de usuario.
- **Aceptar un lead que ya no está en `nuevo`** → el `UPDATE` afecta cero filas. Se encadena
  `.select()`: un `UPDATE` de PostgREST que no toca nada devuelve `error` **null**, y sin el
  `.select()` el fallo pasaría por éxito.

## 12. Pruebas

**Denegación con código, mensaje y caso positivo, siempre en la misma prueba.** Las ocho
pruebas que en este proyecto pasaron por el motivo equivocado no se repiten.

RLS, con falsificación obligatoria de cada control:

1. El vendedor dueño **no** lee `leads_contacto` de un lead en `nuevo`; sí lo lee tras
   aceptar. Falsificación: quitar `AND l.estado <> 'nuevo'` de la política.
2. Un vendedor **ajeno** no lee ni el lead ni el contacto en ningún estado.
3. `anon` no lee nada de ninguna de las dos tablas; no puede insertar en ninguna → `42501`.
4. `authenticated` no puede `INSERT`/`UPDATE`/`DELETE` en `leads_contacto` → `42501`.
5. Un comprador **no tiene `INSERT`** sobre `leads` ni sobre `leads_contacto` → `42501` en las
   dos, con su caso positivo (el mismo lead sí se crea llamando a `crear_lead()`). Sin el caso
   positivo, esta prueba pasaría aunque las tablas no existieran.
6. `crear_lead()` deriva el `vendedor_id` de la propiedad y **no** de lo que le pasen: se la
   llama sobre la propiedad de otro vendedor y se comprueba que el lead queda colgado del
   vendedor real.
7. Las funciones del limitador no son invocables por `anon` ni `authenticated` → `42501`, con
   el `PUBLIC` nombrado explícitamente en el `REVOKE`. `crear_lead()` sí es invocable por
   `authenticated` y **no** por `anon`.

Unitarias: validación del mensaje (10–1000), del teléfono, del `volver` (rechaza `//`, `\` y
absolutas externas), el predicado de cada límite, y el mapeo de errores.

E2E: un comprador con cuenta encuentra una ficha, envía el lead, y el vendedor lo ve en su
bandeja **sin contacto**; acepta, y aparece. Se asserta contra el HTML servido que el correo
del comprador **no** está en la página antes de aceptar — no contra la interfaz.

## 13. Fuera de alcance

- **Citas y agenda.** Es SP5. De un lead aceptado nace una cita, y ahí se para SP4.
- **Turnstile.** No porque sea trabajo futuro, sino porque **ya está construido** (§2). Sacarlo
  de la inercia es pegar dos variables de entorno, y eso no es una tarea de implementación.
- **Notificar al vendedor por correo o WhatsApp.** Necesita SMTP propio (hoy el de cortesía de
  Supabase tiene un límite muy bajo) y es una decisión de canal que no está tomada.
- **Que el comprador vea sus leads enviados.** Es SP2. El modelo lo soporta.
- **Respuesta del vendedor dentro del portal.** Hoy responde por fuera, con el contacto
  revelado. Un hilo de mensajería es otro sub-proyecto.
- **Cualquier cosa con agentes.** Es SP6, y la §6 explica por qué no hace falta prepararle
  nada.

## 14. Criterios de aceptación

1. Un visitante sin sesión ve en la ficha un enlace para entrar o crear cuenta, no un
   formulario, y al volver del login aterriza en la misma ficha.
2. Un `volver` que apunte fuera del sitio no redirige fuera.
3. Un comprador con sesión envía un lead y lo ve confirmado; al recargar la ficha ya no puede
   enviar otro.
4. El vendedor ve el lead en `/panel/leads` con nombre y mensaje, y **sin correo ni teléfono**,
   verificado contra el HTML servido.
5. Tras aceptar, el correo y el teléfono aparecen. Tras descartar, no.
6. Un lead que ya salió de `nuevo` no se puede volver a aceptar ni descartar, y el intento no
   se reporta como éxito.
7. Un vendedor no puede dejarse un lead en su propia propiedad, y la base lo impide.
8. No se puede capturar un lead sobre una propiedad que no está publicada, y la base lo
   impide.
9. Un vendedor ajeno no ve ni el lead ni el contacto, en ningún estado, con falsificación
   demostrada de la política.
10. Un comprador no puede falsificar el `vendedor_id` de su lead.
11. El cuarto registro desde la misma IP en una hora se rechaza; el tercero pasa. Con
    falsificación del predicado.
12. Sin `IP_CABECERA_CONFIABLE` en producción, el registro se rechaza con error de
    configuración — no se permite en silencio.
13. Los tres eventos de lead quedan en `registro_auditoria` con su actor correcto, escritos
    desde la base y no desde el server action.
14. Las suites siguen en verde sobre la base actual (317 unitarias, 130 RLS, 14 E2E), `tsc`
    limpio, `lint` sin avisos, y el guard `verificar:render` sigue pasando.
