create table public.webhook_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references public.webhook_configs(id) on delete set null,
  event text not null,
  request_no text,
  url_masked text,
  status_code int,
  success boolean not null default false,
  error_message text,
  delivered_at timestamptz not null default now()
);

alter table public.webhook_delivery_logs enable row level security;

create policy "super_admin can read delivery logs" on public.webhook_delivery_logs
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'super_admin'
    )
  );

create index webhook_delivery_logs_delivered_idx on public.webhook_delivery_logs(delivered_at desc);
create index webhook_delivery_logs_config_idx on public.webhook_delivery_logs(config_id, delivered_at desc);
