alter table public.projetos
  add column if not exists cliente_nome_importado text,
  add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null,
  add column if not exists external_id text,
  add column if not exists import_fingerprint text;

create index if not exists projetos_import_fingerprint_idx
  on public.projetos(import_fingerprint)
  where import_fingerprint is not null;;
