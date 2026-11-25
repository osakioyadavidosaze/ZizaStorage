alter table public.files
  drop constraint if exists files_storage_path_matches_owner;

alter table public.files
  add constraint files_storage_path_matches_owner
  check (
    split_part(storage_path, '/', 1) = user_id::text
    and split_part(storage_path, '/', 2) <> ''
    and length(storage_path) - length(replace(storage_path, '/', '')) = 1
  );
