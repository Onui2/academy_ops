alter table public.ops_requests
  add column if not exists rejection_note text;
