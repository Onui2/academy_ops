alter table public.ops_requests
  add column if not exists request_category text,
  add column if not exists sub_category text,
  add column if not exists requester_name text,
  add column if not exists branch_id text,
  add column if not exists branch_name text,
  add column if not exists assigned_department text,
  add column if not exists assigned_user_id text,
  add column if not exists assigned_user_name text,
  add column if not exists workflow_status text,
  add column if not exists sla_due_at timestamptz,
  add column if not exists sla_paused_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists request_metadata jsonb not null default '{}'::jsonb;

update public.ops_requests
set workflow_status = case
  when status = 'received' then 'SUBMITTED'
  when status = 'reviewing' then 'TRIAGED'
  when status = 'approval_pending' then 'APPROVAL_PENDING'
  when status = 'in_progress' then 'IN_PROGRESS'
  when status = 'completed' then 'COMPLETED'
  when status = 'blocked' then 'REJECTED'
  else 'SUBMITTED'
end
where workflow_status is null;

alter table public.ops_requests
  add constraint ops_requests_workflow_status_check
  check (
    workflow_status is null
    or workflow_status in (
      'DRAFT',
      'SUBMITTED',
      'TRIAGED',
      'APPROVAL_PENDING',
      'APPROVED',
      'REJECTED',
      'ASSIGNED',
      'IN_PROGRESS',
      'WAITING_USER',
      'WAITING_VENDOR',
      'COMPLETED',
      'CANCELED'
    )
  );

create table if not exists public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ops_requests(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  comment text not null,
  visibility text not null default 'public' check (visibility in ('public', 'internal')),
  created_at timestamptz not null default now()
);

create index if not exists request_comments_request_idx on public.request_comments(request_id, created_at desc);

alter table public.audit_logs
  add column if not exists actor_user_id text,
  add column if not exists actor_name text,
  add column if not exists action_type text,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists before_value jsonb,
  add column if not exists after_value jsonb,
  add column if not exists ip_address text,
  add column if not exists user_agent text;

update public.audit_logs
set actor_name = coalesce(actor_name, actor_label),
    action_type = coalesce(action_type, 'REQUEST_UPDATED'),
    target_type = coalesce(target_type, 'request'),
    target_id = coalesce(target_id, request_id::text)
where actor_name is null
   or action_type is null
   or target_type is null
   or target_id is null;

alter table public.request_comments enable row level security;

create policy "request comments read linked request"
on public.request_comments for select
using (
  exists (
    select 1 from public.ops_requests r
    where r.id = request_id
      and (r.requester_id = auth.uid() or r.owner_id = auth.uid() or public.is_ops_admin())
  )
);

create policy "request comments insert linked request"
on public.request_comments for insert
with check (
  exists (
    select 1 from public.ops_requests r
    where r.id = request_id
      and (r.requester_id = auth.uid() or r.owner_id = auth.uid() or public.is_ops_admin())
  )
);
