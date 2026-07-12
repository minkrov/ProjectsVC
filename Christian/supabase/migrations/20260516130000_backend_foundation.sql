begin;

create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated;

create table if not exists public.houses (
  id text primary key,
  name text not null unique,
  accent text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

insert into public.houses (id, name, accent, description)
values
  ('orthodox', 'Orthodox', '#3f8297', 'Ancient worship, holy mystery, and patient prayer.'),
  ('catholic', 'Catholic', '#c39436', 'Sacrament, unity, tradition, and works of mercy.'),
  ('protestant', 'Protestant', '#6d8f58', 'Scripture, grace, discipleship, and everyday faith.')
on conflict (id) do update
set
  name = excluded.name,
  accent = excluded.accent,
  description = excluded.description;

alter table public.profiles
  add column if not exists username text,
  add column if not exists display_name text,
  add column if not exists bio text not null default 'Learning how to build a community marked by truth, humility, and love.',
  add column if not exists tradition text not null default 'Exploring',
  add column if not exists favorite_verse text not null default 'Ephesians 4:2',
  add column if not exists avatar_url text,
  add column if not exists banner_url text,
  add column if not exists banner_scale numeric not null default 1,
  add column if not exists avatar_border_color text not null default '#2e8b86',
  add column if not exists selected_house_id text references public.houses(id) on delete set null,
  add column if not exists role text not null default 'member';

update public.profiles
set
  display_name = coalesce(nullif(display_name, ''), 'Stand in Christ Tester'),
  username = coalesce(nullif(username, ''), 'user_' || substring(replace(id::text, '-', '') from 1 for 12))
where display_name is null or username is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_length
      check (username is null or username ~ '^[a-zA-Z0-9_]{3,30}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_bio_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_bio_length check (char_length(bio) <= 280);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_tradition_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_tradition_valid
      check (tradition in ('Catholic', 'Orthodox', 'Protestant', 'Non-denominational', 'Exploring'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_banner_scale_range'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_banner_scale_range check (banner_scale >= 1 and banner_scale <= 1.8);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_border_color_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_border_color_valid
      check (avatar_border_color in ('#2e8b86', '#c39436', '#7b5137', '#cf7067', '#6d8f58', '#3f8297'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_valid check (role in ('member', 'moderator', 'admin'));
  end if;
end $$;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('admin', 'moderator')
  );
$$;

grant execute on function app_private.is_admin() to anon, authenticated;

create or replace function app_private.protect_profile_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.role := 'member';
    return new;
  end if;

  if new.id <> old.id then
    raise exception 'profile id cannot be changed';
  end if;

  if new.email is distinct from old.email then
    new.email := old.email;
  end if;

  if new.role is distinct from old.role and not app_private.is_admin() then
    new.role := old.role;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_write on public.profiles;
create trigger protect_profile_write
before insert or update on public.profiles
for each row execute function app_private.protect_profile_write();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function app_private.set_updated_at();

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, username, display_name)
  values (
    new.id,
    new.email,
    'user_' || substring(replace(new.id::text, '-', '') from 1 for 12),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'Stand in Christ Member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.prayers (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(trim(body)) between 1 and 220),
  is_anonymous boolean not null default false,
  is_urgent boolean not null default false,
  is_answered boolean not null default false,
  prayed_count int not null default 0 check (prayed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.prayer_owners (
  prayer_id uuid primary key references public.prayers(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.prayer_prayed (
  prayer_id uuid not null references public.prayers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prayer_id, user_id)
);

create table if not exists public.discussion_topics (
  id text primary key,
  title text not null,
  category text not null,
  description text not null default '',
  based_on text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.discussion_topics (id, title, category, description, based_on, sort_order)
values
  ('disagree-love', 'How should Christians disagree with love?', 'Unity', 'Start by naming what you respect in the other person before explaining where you differ.', 'Ephesians 4:2 and the call to patience, humility, and love.', 1),
  ('baptism-traditions', 'What does baptism mean across traditions?', 'Bible Interpretation', 'A guided place to compare convictions without turning the conversation into a fight.', 'Matthew 28:19 and the shared desire to follow Jesus faithfully.', 2),
  ('judging-rightly', 'What does Jesus mean by judging rightly?', 'Hard Questions', 'Truth and humility belong together. This thread asks how we practice both.', 'John 7:24 and Jesus'' warning against shallow judgment.', 3)
on conflict (id) do update
set
  title = excluded.title,
  category = excluded.category,
  description = excluded.description,
  based_on = excluded.based_on,
  sort_order = excluded.sort_order,
  is_active = true;

create table if not exists public.discussion_messages (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null references public.discussion_topics(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 360),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.house_members (
  house_id text not null references public.houses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (house_id, user_id)
);

create table if not exists public.house_posts (
  id uuid primary key default gen_random_uuid(),
  house_id text not null references public.houses(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.house_post_comments (
  id uuid primary key default gen_random_uuid(),
  house_post_id uuid not null references public.house_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.bible_study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  verse_reference text not null,
  verse_text text not null,
  translation text not null default 'WEB',
  thought text not null check (char_length(trim(thought)) between 1 and 520),
  created_at timestamptz not null default now()
);

create table if not exists public.common_ground_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_date date not null default current_date,
  step_id text not null,
  title text not null,
  rating text not null check (rating in ('Excellent', 'Good', 'Okay', 'Bad', 'Terrible')),
  note text not null default '' check (char_length(note) <= 260),
  created_at timestamptz not null default now(),
  unique (user_id, review_date, step_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'post_comment', 'prayer', 'discussion_message', 'house_post', 'house_post_comment', 'profile')),
  target_id text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.profiles(id) on delete restrict,
  target_type text not null,
  target_id text not null,
  action text not null check (action in ('hide', 'delete', 'warn', 'ban', 'unban', 'resolve_report', 'dismiss_report')),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists posts_feed_idx on public.posts (created_at desc) where deleted_at is null;
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at) where deleted_at is null;
create index if not exists prayer_feed_idx on public.prayers (created_at desc) where deleted_at is null;
create index if not exists prayer_owners_author_idx on public.prayer_owners (author_id, prayer_id);
create index if not exists prayer_prayed_user_idx on public.prayer_prayed (user_id, created_at desc);
create index if not exists discussion_messages_topic_idx on public.discussion_messages (topic_id, created_at) where deleted_at is null;
create index if not exists house_posts_feed_idx on public.house_posts (house_id, created_at desc) where deleted_at is null;
create index if not exists house_post_comments_post_idx on public.house_post_comments (house_post_id, created_at) where deleted_at is null;
create index if not exists bible_study_logs_user_idx on public.bible_study_logs (user_id, created_at desc);
create index if not exists common_ground_reviews_user_date_idx on public.common_ground_reviews (user_id, review_date desc);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

create or replace function app_private.attach_prayer_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.prayer_owners (prayer_id, author_id)
  values (new.id, (select auth.uid()));
  return new;
end;
$$;

drop trigger if exists attach_prayer_owner on public.prayers;
create trigger attach_prayer_owner
after insert on public.prayers
for each row execute function app_private.attach_prayer_owner();

create or replace function app_private.increment_prayed_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.prayers
  set prayed_count = prayed_count + 1
  where id = new.prayer_id;
  return new;
end;
$$;

create or replace function app_private.decrement_prayed_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.prayers
  set prayed_count = greatest(prayed_count - 1, 0)
  where id = old.prayer_id;
  return old;
end;
$$;

drop trigger if exists increment_prayed_count on public.prayer_prayed;
create trigger increment_prayed_count
after insert on public.prayer_prayed
for each row execute function app_private.increment_prayed_count();

drop trigger if exists decrement_prayed_count on public.prayer_prayed;
create trigger decrement_prayed_count
after delete on public.prayer_prayed
for each row execute function app_private.decrement_prayed_count();

update public.prayers p
set prayed_count = counts.total
from (
  select prayer_id, count(*)::int as total
  from public.prayer_prayed
  group by prayer_id
) counts
where counts.prayer_id = p.id;

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at before update on public.posts
for each row execute function app_private.set_updated_at();

drop trigger if exists set_post_comments_updated_at on public.post_comments;
create trigger set_post_comments_updated_at before update on public.post_comments
for each row execute function app_private.set_updated_at();

drop trigger if exists set_prayers_updated_at on public.prayers;
create trigger set_prayers_updated_at before update on public.prayers
for each row execute function app_private.set_updated_at();

drop trigger if exists set_discussion_messages_updated_at on public.discussion_messages;
create trigger set_discussion_messages_updated_at before update on public.discussion_messages
for each row execute function app_private.set_updated_at();

drop trigger if exists set_house_posts_updated_at on public.house_posts;
create trigger set_house_posts_updated_at before update on public.house_posts
for each row execute function app_private.set_updated_at();

drop trigger if exists set_house_post_comments_updated_at on public.house_post_comments;
create trigger set_house_post_comments_updated_at before update on public.house_post_comments
for each row execute function app_private.set_updated_at();

drop trigger if exists set_reports_updated_at on public.reports;
create trigger set_reports_updated_at before update on public.reports
for each row execute function app_private.set_updated_at();

create or replace view public.prayer_feed
with (security_invoker = true)
as
select
  p.id,
  case
    when p.is_anonymous
      and po.author_id is distinct from (select auth.uid())
      and not app_private.is_admin()
    then null
    else po.author_id
  end as author_id,
  p.body,
  p.is_anonymous,
  p.is_urgent,
  p.is_answered,
  p.created_at,
  p.updated_at,
  p.prayed_count
from public.prayers p
left join public.prayer_owners po on po.prayer_id = p.id
where p.deleted_at is null
group by p.id, po.author_id;

alter table public.profiles enable row level security;
alter table public.houses enable row level security;
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.prayers enable row level security;
alter table public.prayer_owners enable row level security;
alter table public.prayer_prayed enable row level security;
alter table public.discussion_topics enable row level security;
alter table public.discussion_messages enable row level security;
alter table public.house_members enable row level security;
alter table public.house_posts enable row level security;
alter table public.house_post_comments enable row level security;
alter table public.bible_study_logs enable row level security;
alter table public.common_ground_reviews enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'houses', 'posts', 'post_comments', 'prayers', 'prayer_owners',
        'prayer_prayed', 'discussion_topics', 'discussion_messages', 'house_members',
        'house_posts', 'house_post_comments', 'bible_study_logs', 'common_ground_reviews',
        'user_blocks', 'reports', 'moderation_actions'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end $$;

create policy profiles_public_read on public.profiles
  for select using (true);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id or app_private.is_admin())
  with check ((select auth.uid()) = id or app_private.is_admin());

create policy houses_public_read on public.houses
  for select using (true);

create policy posts_public_read on public.posts
  for select using (deleted_at is null);
create policy posts_insert_own on public.posts
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy posts_update_own_or_admin on public.posts
  for update to authenticated
  using ((select auth.uid()) = author_id or app_private.is_admin())
  with check ((select auth.uid()) = author_id or app_private.is_admin());
create policy posts_delete_own_or_admin on public.posts
  for delete to authenticated using ((select auth.uid()) = author_id or app_private.is_admin());

create policy post_comments_public_read on public.post_comments
  for select using (deleted_at is null);
create policy post_comments_insert_own on public.post_comments
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy post_comments_update_own_or_admin on public.post_comments
  for update to authenticated
  using ((select auth.uid()) = author_id or app_private.is_admin())
  with check ((select auth.uid()) = author_id or app_private.is_admin());
create policy post_comments_delete_own_or_admin on public.post_comments
  for delete to authenticated using ((select auth.uid()) = author_id or app_private.is_admin());

create policy prayers_public_read on public.prayers
  for select using (deleted_at is null);
create policy prayers_insert_authenticated on public.prayers
  for insert to authenticated with check ((select auth.uid()) is not null);
create policy prayers_update_owner_or_admin on public.prayers
  for update to authenticated
  using (
    exists (
      select 1 from public.prayer_owners po
      where po.prayer_id = id and po.author_id = (select auth.uid())
    ) or app_private.is_admin()
  )
  with check (
    exists (
      select 1 from public.prayer_owners po
      where po.prayer_id = id and po.author_id = (select auth.uid())
    ) or app_private.is_admin()
  );
create policy prayers_delete_owner_or_admin on public.prayers
  for delete to authenticated using (
    exists (
      select 1 from public.prayer_owners po
      where po.prayer_id = id and po.author_id = (select auth.uid())
    ) or app_private.is_admin()
  );

create policy prayer_owners_select_visible_author on public.prayer_owners
  for select using (
    author_id = (select auth.uid())
    or app_private.is_admin()
    or exists (
      select 1
      from public.prayers p
      where p.id = prayer_owners.prayer_id
        and p.deleted_at is null
        and not p.is_anonymous
    )
  );

create policy prayer_prayed_select_own_or_admin on public.prayer_prayed
  for select to authenticated using (user_id = (select auth.uid()) or app_private.is_admin());
create policy prayer_prayed_insert_own on public.prayer_prayed
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy prayer_prayed_delete_own on public.prayer_prayed
  for delete to authenticated using (user_id = (select auth.uid()));

create policy discussion_topics_public_read on public.discussion_topics
  for select using (is_active);

create policy discussion_messages_public_read on public.discussion_messages
  for select using (deleted_at is null);
create policy discussion_messages_insert_own on public.discussion_messages
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy discussion_messages_update_own_or_admin on public.discussion_messages
  for update to authenticated
  using ((select auth.uid()) = author_id or app_private.is_admin())
  with check ((select auth.uid()) = author_id or app_private.is_admin());
create policy discussion_messages_delete_own_or_admin on public.discussion_messages
  for delete to authenticated using ((select auth.uid()) = author_id or app_private.is_admin());

create policy house_members_public_read on public.house_members
  for select using (true);
create policy house_members_insert_own on public.house_members
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy house_members_delete_own on public.house_members
  for delete to authenticated using (user_id = (select auth.uid()));

create policy house_posts_public_read on public.house_posts
  for select using (deleted_at is null);
create policy house_posts_insert_member on public.house_posts
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.house_members hm
      where hm.house_id = house_posts.house_id and hm.user_id = (select auth.uid())
    )
  );
create policy house_posts_update_own_or_admin on public.house_posts
  for update to authenticated
  using ((select auth.uid()) = author_id or app_private.is_admin())
  with check ((select auth.uid()) = author_id or app_private.is_admin());
create policy house_posts_delete_own_or_admin on public.house_posts
  for delete to authenticated using ((select auth.uid()) = author_id or app_private.is_admin());

create policy house_post_comments_public_read on public.house_post_comments
  for select using (deleted_at is null);
create policy house_post_comments_insert_member on public.house_post_comments
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.house_posts hp
      join public.house_members hm on hm.house_id = hp.house_id
      where hp.id = house_post_comments.house_post_id
        and hm.user_id = (select auth.uid())
    )
  );
create policy house_post_comments_update_own_or_admin on public.house_post_comments
  for update to authenticated
  using ((select auth.uid()) = author_id or app_private.is_admin())
  with check ((select auth.uid()) = author_id or app_private.is_admin());
create policy house_post_comments_delete_own_or_admin on public.house_post_comments
  for delete to authenticated using ((select auth.uid()) = author_id or app_private.is_admin());

create policy bible_study_logs_select_own on public.bible_study_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy bible_study_logs_insert_own on public.bible_study_logs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy bible_study_logs_update_own on public.bible_study_logs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy bible_study_logs_delete_own on public.bible_study_logs
  for delete to authenticated using (user_id = (select auth.uid()));

create policy common_ground_reviews_select_own on public.common_ground_reviews
  for select to authenticated using (user_id = (select auth.uid()));
create policy common_ground_reviews_insert_own on public.common_ground_reviews
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy common_ground_reviews_update_own on public.common_ground_reviews
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy common_ground_reviews_delete_own on public.common_ground_reviews
  for delete to authenticated using (user_id = (select auth.uid()));

create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

create policy reports_select_own_or_admin on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or app_private.is_admin());
create policy reports_insert_own on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy reports_update_admin on public.reports
  for update to authenticated using (app_private.is_admin()) with check (app_private.is_admin());

create policy moderation_actions_select_admin on public.moderation_actions
  for select to authenticated using (app_private.is_admin());
create policy moderation_actions_insert_admin on public.moderation_actions
  for insert to authenticated with check (app_private.is_admin() and moderator_id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select (
  id,
  username,
  display_name,
  bio,
  tradition,
  favorite_verse,
  avatar_url,
  banner_url,
  banner_scale,
  avatar_border_color,
  selected_house_id,
  created_at,
  updated_at
) on public.profiles to anon, authenticated;
grant insert (
  id,
  username,
  display_name,
  bio,
  tradition,
  favorite_verse,
  avatar_url,
  banner_url,
  banner_scale,
  avatar_border_color,
  selected_house_id
) on public.profiles to authenticated;
grant update (
  username,
  display_name,
  bio,
  tradition,
  favorite_verse,
  avatar_url,
  banner_url,
  banner_scale,
  avatar_border_color,
  selected_house_id
) on public.profiles to authenticated;

grant select on public.houses, public.posts, public.post_comments, public.prayers, public.prayer_owners,
  public.discussion_topics, public.discussion_messages, public.house_members, public.house_posts, public.house_post_comments
  to anon, authenticated;
grant select on public.prayer_feed to anon, authenticated;
grant select, insert, update, delete on public.posts, public.post_comments, public.prayers, public.prayer_prayed,
  public.discussion_messages, public.house_members, public.house_posts, public.house_post_comments,
  public.bible_study_logs, public.common_ground_reviews, public.user_blocks, public.reports, public.moderation_actions
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists profile_media_public_read on storage.objects;
drop policy if exists profile_media_insert_own_folder on storage.objects;
drop policy if exists profile_media_update_own_folder on storage.objects;
drop policy if exists profile_media_delete_own_folder on storage.objects;

create policy profile_media_public_read on storage.objects
  for select using (bucket_id = 'profile-media');
create policy profile_media_insert_own_folder on storage.objects
  for insert to authenticated with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy profile_media_update_own_folder on storage.objects
  for update to authenticated using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy profile_media_delete_own_folder on storage.objects
  for delete to authenticated using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
