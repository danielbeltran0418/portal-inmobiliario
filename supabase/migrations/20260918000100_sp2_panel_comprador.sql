-- Migración SP2: Panel del Comprador (Favoritos, Búsquedas Guardadas y Habeas Data)

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
