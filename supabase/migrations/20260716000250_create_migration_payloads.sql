create table if not exists public.migration_payloads (
  payload_key text not null,
  seq integer not null,
  payload text not null,
  created_at timestamptz not null default now(),
  primary key (payload_key, seq)
);
alter table public.migration_payloads enable row level security;;
