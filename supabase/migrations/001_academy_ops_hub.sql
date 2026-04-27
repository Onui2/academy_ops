create type public.user_role as enum (
  'general',
  'academy_admin',
  'executive',
  'super_admin',
  'nas_admin'
);

create type public.request_status as enum (
  'received',
  'reviewing',
  'approval_pending',
  'in_progress',
  'completed',
  'blocked'
);

create type public.request_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.user_role not null default 'general',
  campus text,
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ops_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  module text not null,
  title text not null,
  description text not null default '',
  requester_id uuid not null references public.profiles(id),
  owner_id uuid references public.profiles(id),
  status public.request_status not null default 'received',
  priority public.request_priority not null default 'normal',
  budget_amount numeric(12, 2),
  amount_text text,
  vendor text,
  audit_note text,
  due_date date,
  campus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ops_requests(id) on delete cascade,
  step_order int not null,
  approver_role public.user_role not null,
  approver_id uuid references public.profiles(id),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, step_order)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.ops_requests(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_label text not null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.nas_permissions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  resource_name text not null,
  permission_level text not null check (permission_level in ('read', 'write', 'admin')),
  requested_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  status public.request_status not null default 'received',
  created_at timestamptz not null default now()
);

create table public.as_faqs (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  category text not null,
  answer text not null,
  escalation_required boolean not null default false,
  created_at timestamptz not null default now()
);

create index ops_requests_status_idx on public.ops_requests(status);
create index ops_requests_module_idx on public.ops_requests(module);
create index audit_logs_request_idx on public.audit_logs(request_id, created_at desc);
create index nas_permissions_email_idx on public.nas_permissions(user_email);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ops_requests_touch_updated_at
before update on public.ops_requests
for each row execute function public.touch_updated_at();

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_ops_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('academy_admin', 'executive', 'super_admin', 'nas_admin'), false)
$$;

alter table public.profiles enable row level security;
alter table public.ops_requests enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_logs enable row level security;
alter table public.nas_permissions enable row level security;
alter table public.as_faqs enable row level security;

create policy "profiles read own or admin"
on public.profiles for select
using (id = auth.uid() or public.is_ops_admin());

create policy "profiles insert self"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles update own basic fields"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "requests read own or admin"
on public.ops_requests for select
using (requester_id = auth.uid() or owner_id = auth.uid() or public.is_ops_admin());

create policy "requests create authenticated"
on public.ops_requests for insert
with check (requester_id = auth.uid());

create policy "requests update admins and owners"
on public.ops_requests for update
using (owner_id = auth.uid() or public.is_ops_admin())
with check (owner_id = auth.uid() or public.is_ops_admin());

create policy "approvals read linked request"
on public.approvals for select
using (
  exists (
    select 1 from public.ops_requests r
    where r.id = request_id
      and (r.requester_id = auth.uid() or r.owner_id = auth.uid() or public.is_ops_admin())
  )
);

create policy "approvals update approver roles"
on public.approvals for update
using (public.current_role() = approver_role or public.current_role() = 'super_admin')
with check (public.current_role() = approver_role or public.current_role() = 'super_admin');

create policy "audit read own request or admin"
on public.audit_logs for select
using (
  public.is_ops_admin()
  or exists (
    select 1 from public.ops_requests r
    where r.id = request_id and r.requester_id = auth.uid()
  )
);

create policy "audit insert admin"
on public.audit_logs for insert
with check (public.is_ops_admin() or actor_id = auth.uid());

create policy "nas read admin or requester"
on public.nas_permissions for select
using (public.current_role() in ('nas_admin', 'super_admin') or requested_by = auth.uid());

create policy "nas create authenticated"
on public.nas_permissions for insert
with check (requested_by = auth.uid());

create policy "nas update nas admin"
on public.nas_permissions for update
using (public.current_role() in ('nas_admin', 'super_admin'))
with check (public.current_role() in ('nas_admin', 'super_admin'));

create policy "faqs readable authenticated"
on public.as_faqs for select
using (auth.uid() is not null);

create policy "faqs admin write"
on public.as_faqs for all
using (public.is_ops_admin())
with check (public.is_ops_admin());

insert into public.as_faqs (keyword, category, answer, escalation_required) values
  ('인터넷', 'network', '공유기 전원, IP 충돌, 회선 상태를 순서대로 확인합니다.', true),
  ('빔프로젝터', 'device', '입력 소스, HDMI 케이블, 램프 시간을 확인합니다.', true),
  ('RaiDrive', 'nas', 'MFA, NAS 그룹 권한, 접속 주소를 확인합니다.', false);
