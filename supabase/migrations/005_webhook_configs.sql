create table public.webhook_configs (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  url text not null,
  secret text,
  enabled boolean not null default true,
  events text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.webhook_configs enable row level security;

create policy "super_admin can manage webhook configs" on public.webhook_configs
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'super_admin'
    )
  );

create index webhook_configs_enabled_idx on public.webhook_configs(enabled);
