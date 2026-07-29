create table if not exists public.document_templates (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid null,
  document_type text not null default 'proposal',
  name text not null default '',
  slug text not null default '',
  category text not null default '',
  version integer not null default 1 check (version > 0),
  status text not null default 'draft',
  is_published boolean not null default false,
  is_latest boolean not null default false,
  base_template_id text null,
  pages jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_templates_document_type_check
    check (document_type in ('proposal', 'contract', 'pdf', 'form', 'document', 'certificate', 'report', 'receipt', 'presentation', 'internal'))
);

create table if not exists public.document_instances (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid null,
  document_type text not null default 'proposal',
  template_id text null references public.document_templates(id) on delete set null,
  template_version integer null,
  status text not null default 'draft',
  lead_id text null,
  client_id uuid null references public.clientes(id) on delete set null,
  project_id uuid null references public.projetos(id) on delete set null,
  proposal_id text null,
  package_options jsonb not null default '[]'::jsonb,
  packages jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  asset_overrides jsonb not null default '{}'::jsonb,
  text_overrides jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  generated_at timestamptz null,
  sent_at timestamptz null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_instances_document_type_check
    check (document_type in ('proposal', 'contract', 'pdf', 'form', 'document', 'certificate', 'report', 'receipt', 'presentation', 'internal'))
);

create index if not exists idx_document_templates_user_id
  on public.document_templates(user_id);
create index if not exists idx_document_templates_org_id
  on public.document_templates(organization_id);
create index if not exists idx_document_templates_type_category
  on public.document_templates(document_type, category);
create index if not exists idx_document_templates_base_version
  on public.document_templates(base_template_id, version desc);
create index if not exists idx_document_templates_latest
  on public.document_templates(user_id, is_latest)
  where is_latest = true;
create index if not exists idx_document_templates_updated_at
  on public.document_templates(updated_at desc);

create index if not exists idx_document_instances_user_id
  on public.document_instances(user_id);
create index if not exists idx_document_instances_org_id
  on public.document_instances(organization_id);
create index if not exists idx_document_instances_template_id
  on public.document_instances(template_id);
create index if not exists idx_document_instances_client_id
  on public.document_instances(client_id);
create index if not exists idx_document_instances_project_id
  on public.document_instances(project_id);
create index if not exists idx_document_instances_status
  on public.document_instances(status);
create index if not exists idx_document_instances_updated_at
  on public.document_instances(updated_at desc);

alter table public.document_templates enable row level security;
alter table public.document_instances enable row level security;

drop policy if exists document_templates_select_owner on public.document_templates;
create policy document_templates_select_owner
  on public.document_templates
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists document_templates_insert_owner on public.document_templates;
create policy document_templates_insert_owner
  on public.document_templates
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists document_templates_update_owner on public.document_templates;
create policy document_templates_update_owner
  on public.document_templates
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists document_templates_delete_owner on public.document_templates;
create policy document_templates_delete_owner
  on public.document_templates
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists document_instances_select_owner on public.document_instances;
create policy document_instances_select_owner
  on public.document_instances
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists document_instances_insert_owner on public.document_instances;
create policy document_instances_insert_owner
  on public.document_instances
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists document_instances_update_owner on public.document_instances;
create policy document_instances_update_owner
  on public.document_instances
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists document_instances_delete_owner on public.document_instances;
create policy document_instances_delete_owner
  on public.document_instances
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_document_templates_updated_at on public.document_templates;
create trigger trg_document_templates_updated_at
before update on public.document_templates
for each row execute function public.set_updated_at();

drop trigger if exists trg_document_instances_updated_at on public.document_instances;
create trigger trg_document_instances_updated_at
before update on public.document_instances
for each row execute function public.set_updated_at();;
