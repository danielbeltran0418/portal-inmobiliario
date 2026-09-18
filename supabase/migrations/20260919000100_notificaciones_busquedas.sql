-- Migración: columnas de notificación en busquedas_guardadas
alter table public.busquedas_guardadas
  add column if not exists ultima_notificacion_en timestamptz not null default now(),
  add column if not exists token_baja uuid not null default gen_random_uuid();

create unique index if not exists idx_busquedas_token_baja on public.busquedas_guardadas(token_baja);
