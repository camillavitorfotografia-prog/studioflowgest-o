create policy studioflow_files_insert_by_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'studioflow-files'
  and owner_id = auth.uid()::text
);

create policy studioflow_files_select_by_owner
on storage.objects
for select
to authenticated
using (
  bucket_id = 'studioflow-files'
  and owner_id = auth.uid()::text
);

create policy studioflow_files_update_by_owner
on storage.objects
for update
to authenticated
using (
  bucket_id = 'studioflow-files'
  and owner_id = auth.uid()::text
)
with check (
  bucket_id = 'studioflow-files'
  and owner_id = auth.uid()::text
);

create policy studioflow_files_delete_by_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'studioflow-files'
  and owner_id = auth.uid()::text
);;
