create table if not exists public.saved_rulebooks (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  rulebook jsonb not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  unique (device_id, sha256)
);

create table if not exists public.cohort_rule_aggregates (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  rule jsonb not null,
  rule_type text not null,
  breaks integer not null,
  cost_delta numeric,
  interval_lo numeric,
  interval_hi numeric,
  history_label text not null,
  created_at timestamptz not null default now()
);

alter table public.saved_rulebooks enable row level security;
alter table public.cohort_rule_aggregates enable row level security;

create or replace function public.request_device_id() returns text
language sql stable as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-device-id', '')
$$;

drop policy if exists saved_rulebooks_owner on public.saved_rulebooks;
create policy saved_rulebooks_owner on public.saved_rulebooks
  for all to anon
  using (device_id = public.request_device_id())
  with check (device_id = public.request_device_id());

drop policy if exists cohort_rule_aggregates_insert on public.cohort_rule_aggregates;
create policy cohort_rule_aggregates_insert on public.cohort_rule_aggregates
  for insert to anon
  with check (device_id = public.request_device_id());

drop policy if exists cohort_rule_aggregates_read_own on public.cohort_rule_aggregates;
create policy cohort_rule_aggregates_read_own on public.cohort_rule_aggregates
  for select to anon
  using (device_id = public.request_device_id());
