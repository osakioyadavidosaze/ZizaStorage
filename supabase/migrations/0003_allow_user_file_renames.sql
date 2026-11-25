create policy "Users can move their vault objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
