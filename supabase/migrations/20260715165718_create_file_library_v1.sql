create table if not exists public.file_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid null,
  name text not null,
  parent_id uuid null references public.file_folders(id) on delete cascade,
  client_id uuid null references public.clientes(id) on delete set null,
  project_id uuid null references public.projetos(id) on delete set null,
  color text not null default 'gold',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.file_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid null,
  name text not null,
  original_name text not null,
  storage_path text not null unique,
  bucket text not null default 'studioflow-files',
  mime_type text not null default 'application/octet-stream',
  extension text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  folder_id uuid null references public.file_folders(id) on delete set null,
  client_id uuid null references public.clientes(id) on delete set null,
  project_id uuid null references public.projetos(id) on delete set null,
  favorite boolean not null default false,
  portal_visible boolean not null default false,
  status text not null default 'active' check (status in ('active','trash')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create or replace function public.set_file_library_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists file_folders_set_updated_at on public.file_folders;
create trigger file_folders_set_updated_at
before update on public.file_folders
for each row execute function public.set_file_library_updated_at();

drop trigger if exists file_assets_set_updated_at on public.file_assets;
create trigger file_assets_set_updated_at
before update on public.file_assets
for each row execute function public.set_file_library_updated_at();

create index if not exists file_folders_user_id_idx on public.file_folders(user_id);
create index if not exists file_folders_parent_id_idx on public.file_folders(parent_id);
create index if not exists file_folders_client_id_idx on public.file_folders(client_id);
create index if not exists file_folders_project_id_idx on public.file_folders(project_id);

create index if not exists file_assets_user_id_idx on public.file_assets(user_id);
create index if not exists file_assets_folder_id_idx on public.file_assets(folder_id);
create index if not exists file_assets_client_id_idx on public.file_assets(client_id);
create index if not exists file_assets_project_id_idx on public.file_assets(project_id);
create index if not exists file_assets_status_idx on public.file_assets(status);
create index if not exists file_assets_portal_visible_idx on public.file_assets(portal_visible) where portal_visible = true;
create index if not exists file_assets_created_at_idx on public.file_assets(created_at desc);

alter table public.file_folders enable row level security;
alter table public.file_assets enable row level security;

drop policy if exists file_folders_select_owner on public.file_folders;
create policy file_folders_select_owner on public.file_folders
for select to authenticated using (auth.uid() = user_id);

drop policy if exists file_folders_insert_owner on public.file_folders;
create policy file_folders_insert_owner on public.file_folders
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists file_folders_update_owner on public.file_folders;
create policy file_folders_update_owner on public.file_folders
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists file_folders_delete_owner on public.file_folders;
create policy file_folders_delete_owner on public.file_folders
for delete to authenticated using (auth.uid() = user_id);

drop policy if exists file_assets_select_owner on public.file_assets;
create policy file_assets_select_owner on public.file_assets
for select to authenticated using (auth.uid() = user_id);

drop policy if exists file_assets_insert_owner on public.file_assets;
create policy file_assets_insert_owner on public.file_assets
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists file_assets_update_owner on public.file_assets;
create policy file_assets_update_owner on public.file_assets
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists file_assets_delete_owner on public.file_assets;
create policy file_assets_delete_owner on public.file_assets
for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('studioflow-files', 'studioflow-files', false, 2147483648)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists studioflow_files_select_owner on storage.objects;
create policy studioflow_files_select_owner on storage.objects
for select to authenticated
using (
  bucket_id = 'studioflow-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists studioflow_files_insert_owner on storage.objects;
create policy studioflow_files_insert_owner on storage.objects
for insert to authenticated
with check (
  bucket_id = 'studioflow-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists studioflow_files_update_owner on storage.objects;
create policy studioflow_files_update_owner on storage.objects
for update to authenticated
using (
  bucket_id = 'studioflow-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'studioflow-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists studioflow_files_delete_owner on storage.objects;
create policy studioflow_files_delete_owner on storage.objects
for delete to authenticated
using (
  bucket_id = 'studioflow-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);;
