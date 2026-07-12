begin;

create index if not exists posts_author_id_idx on public.posts (author_id);
create index if not exists post_comments_author_id_idx on public.post_comments (author_id);
create index if not exists profiles_selected_house_id_idx on public.profiles (selected_house_id);
create index if not exists discussion_messages_author_id_idx on public.discussion_messages (author_id);
create index if not exists house_members_user_id_idx on public.house_members (user_id);
create index if not exists house_posts_author_id_idx on public.house_posts (author_id);
create index if not exists house_post_comments_author_id_idx on public.house_post_comments (author_id);
create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists moderation_actions_moderator_id_idx on public.moderation_actions (moderator_id);

drop policy if exists profile_media_public_read on storage.objects;
drop policy if exists profile_media_select_own_folder on storage.objects;

create policy profile_media_select_own_folder on storage.objects
  for select to authenticated using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
