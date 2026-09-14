# SP5 — Citas y agenda

Estado: diseño aprobado. Pendiente de plan.
Depende de: SP4 (leads), SP3 (propiedades) y el arreglo `fix/ubicacion-privada` (tabla `propiedades_ubicacion`).
Descomposición: `docs/superpowers/specs/2026-08-31-portal-inmobiliario-descomposicion.md`

---

## 1. Qué es y por qué ahora

SP5 cierra el ciclo que la descomposición pone en el centro del negocio: **atender → calificar → agendar**. Un comprador cuyo lead ha sido aceptado reserva una visita en una franja libre del vendedor. Los dos pueden moverla o cancelarla, y la dirección exacta de la propiedad aparece dos horas antes de la visita.

Es el último eslabón del camino crítico antes de SP6. La descomposición exige que SP6 pueda recorrer ese ciclo **solo**, sin intervención humana y sin modificar SP5. Varias decisiones de este documento existen para eso.

## 2. Lo que ya existe y condiciona el diseño

**De SP4:**
- `leads` con `estado_lead` (`nuevo`, `aceptado`, `descartado`) y `leads_contacto`. El contacto solo se revela al aceptar.
- `crear_lead()` es el patrón de escritura: función `SECURITY DEFINER`, sin `INSERT` directo para nadie, y el vendedor se deriva de la propiedad.
- Códigos de error propios de clase `LD` (`LD001`–`LD004`), distinguidos siempre por `error.code` y nunca por el texto.
- `sincronizar_vendedor_lead()` mueve al nuevo dueño **solo** los leads en `nuevo` cuando cambia el dueño de una propiedad.
- `public.registrar_evento_auditoria()` es el único escritor de `registro_auditoria`.

**Del arreglo `fix/ubicacion-privada`, que tiene que estar mergeado antes:**
- `direccion`, `latitud` y `longitud` salen de `propiedades` y viven en `propiedades_ubicacion`, con RLS por fila. Hoy solo leen el dueño y el super admin. SP5 añade la política del comprador.

**Del entorno, verificado contra la base local:**
- `btree_gist` 1.7 está **disponible pero no instalada**.
- La base corre con `TimeZone = UTC`. `America/Bogota` está en `pg_timezone_names`.
- No hay librería de fechas, ni infraestructura de notificaciones, ni planificador de tareas. Ninguna fecha se muestra hoy a un humano.
- `/mi-cuenta` es un cascarón de SP0 y la única ruta del comprador. El middleware ya la protege: `RUTAS_PROTEGIDAS` exige rol `comprador`, y deja pasar a `super_admin`.

**Trampas conocidas que aplican aquí:**
- En Supabase, `pg_default_acl` concede **CRUD completo** a `anon` y `authenticated` en toda tabla nueva. Toda tabla nueva lleva `REVOKE ALL` explícito.
- Postgres concede `EXECUTE` a `PUBLIC` en toda función nueva. Todo `REVOKE EXECUTE` nombra `PUBLIC`.
- Con RLS activa y sin política aplicable, un `UPDATE` o `DELETE` por PostgREST devuelve **0 filas y error nulo**, no `42501`. Toda aserción de escritura cuenta filas.
- `propiedades` y `leads` tienen varias políticas permisivas de `SELECT` combinadas con `OR`. Toda subconsulta dentro de una política filtra por usuario **explícitamente**.
- El HTML servido puede llevar un dato que la pantalla no muestra, dentro del payload RSC. Las aserciones de ocultamiento van contra `page.content()`.

## 3. Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Cómo se entera el comprador | En su panel, `/mi-cuenta`. Sin notificaciones | No hay infraestructura de avisos, y SP6 ya tiene abierta la decisión del canal. Elegir correo ahora arriesga construir el canal equivocado |
| Disponibilidad | Horario semanal del vendedor | Es lo que permite a SP6 agendar solo |
| Confirmación | Al reservar, sin paso extra | La cita solo nace de un lead que el vendedor ya aceptó, sobre una franja que él mismo publicó |
| Cambios | Comprador y vendedor mueven y cancelan | Simétrico |
| Excepciones | El vendedor bloquea fechas concretas | Sin eso, un vendedor de vacaciones sigue recibiendo reservas |
| Dirección | Visible desde `inicio − 2 h` hasta el fin de la visita | Mínima exposición. Cancelar o mover arrastra la ventana |
| Arquitectura | Franjas calculadas, con restricción de exclusión | La base impide la doble reserva incluso con peticiones simultáneas, y no hace falta planificador |
| Origen de la cita | Solo un lead `aceptado` | Ir a una visita exige el contacto, que solo se revela al aceptar |
| Visitas por lead | Una confirmada a la vez | |
| Ámbito de la disponibilidad | Por vendedor, no por propiedad | Un vendedor no puede estar en dos visitas a la vez, aunque sean casas distintas |
| Duración | Franjas de 60 minutos que empiezan en punto | |
| Horizonte | Desde `now() + 2 h` hasta `now() + 14 días` | El mínimo de 2 horas hace que la dirección nunca se revele en el mismo acto de reservar, y da margen al vendedor |

## 4. Zona horaria

La base corre en UTC y así se queda. Todo instante se guarda como `timestamptz`.

**Toda conversión a hora de pared ocurre dentro de Postgres, con la zona nombrada `'America/Bogota'`.** Nunca con un desfase fijo como `-05`, y nunca dependiendo de la zona de la sesión. Colombia no cambia de hora, pero la zona nombrada deja el código correcto aunque eso cambie, y deja claro que la conversión es deliberada.

La dirección de `AT TIME ZONE` es la trampa clásica y hay que escribirla bien:

| Expresión | Resultado |
|---|---|
| `(fecha + hora)::timestamp AT TIME ZONE 'America/Bogota'` | `timestamptz`: interpreta la hora como hora de Bogotá. **Esta es la que genera franjas** |
| `instante_tz AT TIME ZONE 'America/Bogota'` | `timestamp`: convierte un instante a hora de Bogotá |

Invertirlas da las 10:00 UTC donde deberían ser las 20:00. La prueba de la §12 lo detecta.

**En JavaScript la única operación con fechas es mostrarlas**, y va en un solo ayudante: `Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', ... })`. `Intl` es nativo, así que no hace falta ninguna librería. Pasar `timeZone` es **obligatorio**: Vercel corre en UTC y sin él la hora saldría desplazada cinco horas.

Hay una trampa en la prueba de ese ayudante: **en una máquina de desarrollo en Colombia, quitar `timeZone` no cambia la salida**, porque la zona del sistema ya es Bogotá. La falsificación seguiría en verde en local y solo fallaría en CI. La prueba tiene que ponerse roja en cualquier máquina.

## 5. Modelo de datos

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TYPE public.estado_cita AS ENUM ('confirmada', 'cancelada');

CREATE TABLE public.disponibilidad_semanal (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  dia_semana  smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),  -- ISO: 1 = lunes
  hora_inicio time NOT NULL,
  hora_fin    time NOT NULL,
  CHECK (hora_fin > hora_inicio),
  -- Las franjas empiezan en punto: sin minutos ni segundos.
  CHECK (date_trunc('hour', hora_inicio) = hora_inicio),
  CHECK (date_trunc('hour', hora_fin) = hora_fin)
);

CREATE TABLE public.fechas_bloqueadas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  desde       date NOT NULL,   -- fechas de calendario de Bogotá
  hasta       date NOT NULL,
  CHECK (hasta >= desde)
);

CREATE TABLE public.citas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Desnormalizados a proposito, derivados del lead dentro de las funciones.
  propiedad_id   uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  comprador_id   uuid NOT NULL REFERENCES public.perfiles(id)    ON DELETE CASCADE,
  vendedor_id    uuid NOT NULL REFERENCES public.perfiles(id)    ON DELETE CASCADE,
  rango          tstzrange NOT NULL,
  estado         public.estado_cita NOT NULL DEFAULT 'confirmada',
  cancelada_por  uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (lower_inc(rango) AND NOT upper_inc(rango)),
  CHECK (upper(rango) - lower(rango) = interval '60 minutes'),
  CONSTRAINT citas_sin_solape_por_vendedor
    EXCLUDE USING gist (vendedor_id WITH =, rango WITH &&)
    WHERE (estado = 'confirmada')
);

CREATE UNIQUE INDEX citas_una_confirmada_por_lead
  ON public.citas (lead_id) WHERE estado = 'confirmada';

-- La costura hacia SP6: un consumidor observa las reservas nuevas por aqui.
CREATE INDEX citas_confirmadas_recientes_idx
  ON public.citas (creado_en) WHERE estado = 'confirmada';
```

**Los solapes en `disponibilidad_semanal` son inofensivos.** Un vendedor puede tener dos filas el mismo día, por ejemplo mañana y tarde. Si se solapan, `franjas_libres` deduplica. No hace falta restricción.

**Riesgo técnico para el plan:** la restricción de exclusión necesita la clase de operadores `gist` para `uuid` que aporta `btree_gist`. Si al instalar la extensión en el esquema `extensions` la migración no resuelve la clase, hay que calificarla. Se comprueba al aplicar la migración, no se da por supuesto.

## 6. Franjas libres

```
public.franjas_libres(p_vendedor_id uuid, p_desde timestamptz, p_hasta timestamptz)
  RETURNS TABLE (inicio timestamptz, fin timestamptz)
```

Para cada fecha de Bogotá entre `p_desde` y `p_hasta`, y para cada fila de disponibilidad cuyo `dia_semana` coincida con `extract(isodow ...)`, genera una franja por hora dentro de `[hora_inicio, hora_fin)` y la convierte a instante con `AT TIME ZONE 'America/Bogota'`. Luego descarta:

- las fechas que caen dentro de una `fechas_bloqueadas` del vendedor,
- las franjas que se solapan con una cita **confirmada** del vendedor,
- las que empiezan antes de `now() + 2 h`,
- las que empiezan después de `now() + 14 días`.

Devuelve franjas únicas y ordenadas.

**Quién puede llamarla:** el propio vendedor, o un comprador que tenga un lead **aceptado** sobre una propiedad de ese vendedor. Cualquier otro recibe un conjunto vacío.

**Por qué es `SECURITY DEFINER`, y por qué eso no contradice a SP4.** Para excluir las franjas ocupadas tiene que leer las citas de **otros** compradores, que quien llama no puede ver. SP4 rechazó un RPC de lectura porque protegía un dato, el contacto, que el vendedor seguía pudiendo leer por la tabla. Aquí es al revés: la función devuelve un dato **derivado y no protegido**, las horas libres, y nunca expone quién ocupa las demás.

## 7. Escritura: funciones

**Nadie tiene `INSERT`, `UPDATE` ni `DELETE` directo sobre `citas`.** Toda escritura pasa por funciones, igual que `crear_lead()`.

Cada operación tiene dos niveles:

| Función | Quién la ejecuta | Qué hace |
|---|---|---|
| `reservar_cita_como(p_lead_id, p_inicio, p_actor)` | **solo `service_role`** | La lógica completa, con el actor explícito |
| `reservar_cita(p_lead_id, p_inicio)` | `authenticated` | Llama a la anterior con `auth.uid()` como actor |
| `mover_cita_como(p_cita_id, p_nuevo_inicio, p_actor)` | **solo `service_role`** | |
| `mover_cita(p_cita_id, p_nuevo_inicio)` | `authenticated` | |
| `cancelar_cita_como(p_cita_id, p_actor)` | **solo `service_role`** | |
| `cancelar_cita(p_cita_id)` | `authenticated` | |

**Esta separación es la costura con SP6.** Un agente que agende en nombre de un comprador llamará a las variantes `_como` con `service_role`, sin modificar SP5. Y es también **el mayor riesgo de seguridad de SP5**: si `authenticated` pudiera ejecutar una variante `_como`, cualquiera podría reservar, mover o cancelar en nombre de cualquiera, pasando otro `p_actor`. Su privilegio tiene prueba y falsificación propias en la §12.

Todas llevan `SECURITY DEFINER`, `SET search_path = ''` y `REVOKE EXECUTE ... FROM PUBLIC, anon` con la firma exacta. Las `_como` además `FROM authenticated`.

### `reservar_cita`

1. Sin actor → `42501`.
2. El lead no existe → `VS001`.
3. El actor no es el comprador del lead → `VS002`.
4. El lead no está `aceptado` → `VS003`.
5. La franja no es válida: no está en la disponibilidad, cae en fecha bloqueada, está fuera del horizonte o no empieza en punto → `VS004`.
6. Inserta la cita, derivando `propiedad_id`, `comprador_id` y `vendedor_id` del lead. **Nunca son parámetros.**
7. Si la restricción de exclusión salta (`23P01`) porque otra reserva simultánea ganó la franja → se captura y se relanza como `VS004`.
8. Si el índice único salta (`23505`) porque ya hay una visita confirmada para ese lead → `VS005`.
9. Audita `cita_reservada`.

### `mover_cita`

1. Sin actor → `42501`.
2. La cita no existe → `VS006`.
3. El actor no es ni el comprador ni el vendedor de la cita → `VS002`.
4. La cita no está `confirmada` → `VS007`.
5. La visita ya empezó → `VS008`.
6. La nueva franja no es válida → `VS004`.
7. **Un solo `UPDATE` del `rango`.** Así nunca hay un instante con las dos franjas ocupadas ni con ninguna. Una fila no entra en conflicto consigo misma en la restricción de exclusión.
8. `23P01` → `VS004`.
9. Audita `cita_movida`, con el rango viejo y el nuevo.

### `cancelar_cita`

1. Sin actor → `42501`.
2. La cita no existe → `VS006`.
3. El actor no es ni el comprador ni el vendedor → `VS002`.
4. Ya cancelada → `VS007`.
5. Ya empezó → `VS008`.
6. `estado = 'cancelada'`, `cancelada_por = actor`.
7. Audita `cita_cancelada`.

La validación de franja se comparte en un ayudante interno, `franja_valida(p_vendedor_id, p_inicio)`, sin permiso para nadie más que el dueño de las funciones.

## 8. Lectura y RLS

Las tres tablas nuevas llevan `ENABLE ROW LEVEL SECURITY` y `REVOKE ALL ... FROM anon, authenticated` antes de conceder nada.

**`citas`:** `GRANT SELECT TO authenticated`. Sin permisos de escritura. Políticas de lectura: el comprador, el vendedor y el super admin.

**`disponibilidad_semanal` y `fechas_bloqueadas`:** `GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated`. El dueño gestiona sus filas: `USING` y `WITH CHECK` con `vendedor_id = auth.uid()` **y** rol `vendedor`. El super admin lee. Los compradores no leen estas tablas: ven franjas a través de `franjas_libres`.

**`propiedades_ubicacion`, política nueva del comprador:**

```sql
CREATE POLICY ubicacion_lectura_comprador_en_ventana ON public.propiedades_ubicacion
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.citas c
    WHERE c.propiedad_id = propiedades_ubicacion.propiedad_id
      AND c.comprador_id = (SELECT auth.uid())   -- explicito, no se confia en RLS
      AND c.estado = 'confirmada'
      AND now() >= lower(c.rango) - interval '2 hours'
      AND now() <  upper(c.rango)
  ));
```

El filtro por comprador va escrito aunque `citas` ya tenga política de comprador, porque `citas` también tiene políticas de vendedor y de super admin combinadas con `OR`.

## 9. Interfaz

**Vendedor**, bajo `/panel`, que el middleware ya protege para el rol vendedor:
- **`/panel/disponibilidad`**: editor del horario semanal, con filas por día, y de las fechas bloqueadas.
- **`/panel/citas`**: sus visitas próximas y las canceladas, con Mover y Cancelar. Mover abre el mismo selector de franjas.
- Enlaces a las dos desde `/panel`.

**Comprador**, bajo `/mi-cuenta`, protegido para el rol comprador:
- **`/mi-cuenta`** deja de ser un cascarón y lista sus solicitudes, con propiedad y estado.
- En un lead **aceptado** sin visita confirmada: «Reservar visita», que lleva al selector de franjas de los próximos 14 días, agrupadas por día.
- En una visita confirmada: fecha y hora en Bogotá, Mover y Cancelar. Dentro de la ventana, la dirección exacta. Fuera: «La dirección aparecerá 2 horas antes de la visita».

**Reglas que se heredan de SP4:**
- Los botones con resultado van en componentes de cliente con `useActionState`. Un `<form action={fn}>` a secas descarta el valor devuelto y el error nunca llega a la pantalla.
- Los errores se traducen por `error.code`, nunca por el texto.
- Ningún `<script>` propio: la CSP lleva nonce y `strict-dynamic`.
- Las páginas privadas llevan `robots: { index: false, follow: false }`.

## 10. La costura con SP6

`cita_solicitada` es **una fila**: una cita con `estado = 'confirmada'`, observable por `citas_confirmadas_recientes_idx`. Un consumidor futuro reacciona sin que SP5 sepa que existe, igual que con `lead_capturado`.

Y SP6 tiene ya las piezas para **agendar solo**: `franjas_libres` para saber qué hay libre, y `reservar_cita_como` para reservar en nombre del comprador con `service_role`. Nada de eso exige tocar SP5.

## 11. Errores

Clase `VS`, dentro del rango que el estándar SQL deja a la implementación: las clases que empiezan por I–Z. Postgres no ocupa ninguna que empiece por `V`.

La clase no puede empezar por A–H, que el estándar se reserva. Por eso no sirve, por ejemplo, `CT`.

| Código | Causa | Mensaje para el usuario |
|---|---|---|
| `VS001` | El lead no existe | No encontramos esa solicitud. |
| `VS002` | El actor no participa en el lead o la visita | No puedes gestionar esta visita. |
| `VS003` | El lead no está aceptado | Solo puedes reservar cuando el vendedor haya aceptado tu solicitud. |
| `VS004` | Franja no válida u ocupada | Esa franja ya no está disponible. Elige otra. |
| `VS005` | Ya hay una visita confirmada para ese lead | Ya tienes una visita reservada para esta propiedad. |
| `VS006` | La visita no existe | No encontramos esa visita. |
| `VS007` | La visita ya está cancelada | Esta visita ya estaba cancelada. |
| `VS008` | La visita ya empezó | No se puede cambiar una visita que ya empezó. |

**`VS004` agrupa varias causas a propósito.** El comprador solo elige entre franjas que `franjas_libres` le ofreció, así que un `VS004` significa que la lista quedó vieja o que otro reservó antes. La interfaz no necesita distinguir por qué, y a quien intenta tantear cómo saltarse las reglas no le conviene decírselo.

## 12. Pruebas

**Todo control de seguridad se falsifica**: se rompe a propósito, se ve la prueba ponerse roja y se restaura.

### RLS

| Qué se prueba | Falsificación |
|---|---|
| **Doble reserva simultánea.** Dos compradores con leads aceptados del mismo vendedor reservan la misma franja a la vez con `Promise.all`: gana **exactamente una**, la otra recibe `VS004` | Quitar el `EXCLUDE` → las dos pasan |
| **Mover es atómico.** Mover a una franja ocupada falla con `VS004`, y la franja original **sigue ocupada** | |
| **Zona horaria.** Disponibilidad «jueves 15:00–16:00» → `franjas_libres` devuelve `20:00 UTC` | Quitar el `AT TIME ZONE` → otra hora. Invertir su dirección → `10:00 UTC` |
| **Horizonte.** No se ofrece una franja a `now() + 1 h` ni a `now() + 14 días + 1 h` | Quitar la condición |
| **Fecha bloqueada.** No se ofrece ninguna franja ese día | Quitar el filtro de bloqueadas |
| **Ventana de la dirección.** Con la visita a `inicio − 1:59` el comprador ve la dirección; a `inicio − 2:01` no; tras el fin no; cancelada no; otro comprador no | Quitar la condición de tiempo. Quitar el filtro `comprador_id = auth.uid()` |
| **Variantes `_como`.** `anon` y `authenticated` no pueden ejecutarlas; `service_role` sí | `GRANT EXECUTE` de una `_como` a `authenticated` → rojo |
| **Escritura directa.** `anon` y `authenticated` no insertan, actualizan ni borran `citas`. Se cuentan filas | Quitar el `REVOKE ALL` → rojo |
| **Participantes.** Un comprador ajeno no reserva sobre un lead que no es suyo (`VS002`), ni mueve o cancela una visita ajena. Un vendedor ajeno tampoco | Quitar la comprobación de actor |
| **Estado del lead.** No se reserva sobre un lead `nuevo` ni `descartado` (`VS003`) | |
| **Disponibilidad privada.** Un comprador no lee `disponibilidad_semanal` ni `fechas_bloqueadas` de nadie; un vendedor no escribe las de otro | Quitar el filtro por dueño |

**Para la ventana de la dirección hay que crear visitas cercanas o pasadas**, y `reservar_cita` no lo permite por el horizonte de 2 horas. Esas visitas de prueba se insertan con `clienteAdmin()`, que es `service_role`, saltándose las funciones. Es la única excepción, y va comentada en la prueba.

### Unitarias

- El ayudante de formato muestra `15:00` en Bogotá para un instante `20:00 UTC`. **La prueba tiene que fallar al quitar `timeZone` en cualquier máquina**, también en una de Colombia, donde la salida no cambiaría (§4).
- Los server actions traducen cada `VS00x` a su mensaje por `error.code`.
- Un `UPDATE` que devuelve cero filas **no** se reporta como éxito.

### E2E

- Recorrido completo: el vendedor define su horario; el comprador, con un lead aceptado, reserva; ve la visita confirmada en `/mi-cuenta`; el vendedor la ve en `/panel/citas`; el comprador la mueve y luego la cancela.
- **Ocultamiento de la dirección contra el HTML servido**, con `page.content()`: con la visita a más de 2 horas, la dirección **no aparece**; con una visita insertada a `now() + 1 h`, sí.
- Cuentas efímeras con `randomUUID()`, nunca las del seed.

## 13. Fuera de alcance

- **Notificaciones y recordatorios.** Son de SP6, que ya tiene abierta la decisión del canal.
- **Calendario externo.**
- **Duraciones de franja variables.**
- **Visitas propuestas por el vendedor.** El vendedor mueve o cancela, pero no inicia la reserva.
- **Historial de visitas realizadas.** Una visita pasada sigue `confirmada`; su momento la distingue.
- **Reasignar una propiedad con visitas futuras.** Queda para SP7, y lo dejo documentado porque es la costura que la revisión de SP4 enseñó a buscar: la visita se quedaría con el vendedor original, que ya no es dueño, y el nuevo dueño no se enteraría. Además, `UNIQUE (propiedad_id, comprador_id)` en `leads` impediría al comprador abrir un lead nuevo con el nuevo dueño.

## 14. Orden y dependencias

1. Se mergea `fix/ubicacion-privada`.
2. SP5 se ramifica desde `main`.
3. Las migraciones de SP5 van después de las del arreglo.

## 15. Criterios de aceptación

1. Un vendedor define su horario semanal y bloquea fechas desde `/panel/disponibilidad`.
2. Un comprador con un lead aceptado ve las franjas libres de los próximos 14 días, en hora de Bogotá, desde 2 horas vista.
3. Reserva una franja y queda confirmada al instante.
4. Dos reservas simultáneas de la misma franja: gana exactamente una.
5. No se puede reservar sobre un lead `nuevo`, `descartado` o ajeno.
6. Comprador y vendedor mueven una visita de forma atómica y la cancelan.
7. No se puede mover ni cancelar una visita que ya empezó.
8. La dirección exacta solo es legible por el comprador entre `inicio − 2 h` y el fin, comprobado contra la base y contra el HTML servido.
9. `anon` y `authenticated` no pueden ejecutar las variantes `_como`; `service_role` sí.
10. Nadie escribe `citas` directamente.
11. «Jueves 15:00» de un vendedor de Barranquilla es `20:00 UTC`, y se muestra como `3:00 p. m.`
12. Todos los errores se distinguen por SQLSTATE `VS00x`.
13. Cada reserva, movimiento y cancelación queda en `registro_auditoria`.
14. Suites en verde, `tsc` limpio, lint sin problemas, y la verificación de render dinámico pasando.
