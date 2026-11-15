-- Initial schema for yt-curation (spec section 10.4 of the Appo plan)
create extension if not exists pgcrypto;

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  status text not null default 'live' check (status in ('live','requested','planned')),
  created_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','curator')),
  topic_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text unique not null,
  title text, channel_id text, channel_title text,
  duration_seconds int, published_at timestamptz, thumbnail_url text, description text,
  embeddable boolean, privacy_status text,
  youtube_data_fetched_at timestamptz,
  is_unavailable boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.topic_videos (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  status text not null default 'candidate' check (status in ('candidate','approved','rejected','unpublished')),
  why_line text, curator_note text,
  level text check (level in ('beginner','intermediate','advanced')),
  length_bucket text check (length_bucket in ('short','medium','long')),
  approved_by uuid references auth.users(id), approved_at timestamptz,
  position int, is_pick_of_week boolean not null default false,
  score_override int check (score_override between 0 and 10), score_override_note text,
  created_at timestamptz not null default now(),
  unique (topic_id, video_id)
);

create table public.recommendation_sources (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  platform text not null check (platform in ('reddit','hacker_news','x','forum','curator','other')),
  source_url text, quote_or_summary text, recommended_at date,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.bait_scores (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  score int not null check (score between 0 and 10),
  reason text not null,
  flags text[] not null default '{}',
  inputs_used text[] not null,
  model_or_method text not null,
  version text not null,
  scored_at timestamptz not null default now(),
  unique (video_id, version)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  anonymous_id text not null,
  value text not null check (value in ('worth_it','bait','not_for_me')),
  note text,
  created_at timestamptz not null default now()
);

create table public.signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  topics text[] not null default '{}',
  consent_text_version text not null,
  confirm_token text unique default encode(gen_random_bytes(16),'hex'),
  confirmed_at timestamptz, source_tag text, unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.topic_requests (
  id uuid primary key default gen_random_uuid(),
  requested_topic_text text not null,
  normalized_topic text, reason text, email text,
  anonymous_id text, source_tag text,
  created_at timestamptz not null default now()
);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  anonymous_id text,
  topic_id uuid references public.topics(id) on delete set null,
  video_id uuid references public.videos(id) on delete set null,
  source_tag text, props jsonb,
  created_at timestamptz not null default now()
);

create table public.quota_log (
  id bigint generated always as identity primary key,
  endpoint text not null, units int not null,
  created_at timestamptz not null default now()
);

create index on public.topic_videos (topic_id, status);
create index on public.feedback (video_id);
create index on public.analytics_events (event_name, created_at);
create index on public.videos (youtube_data_fetched_at);

-- Helpers
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from app_users where id = auth.uid() and role = 'admin') $$;
create or replace function public.can_curate(t uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from app_users where id = auth.uid() and (role = 'admin' or t = any(topic_ids))) $$;

-- RLS: everything on; server jobs use the secret key (bypasses RLS)
alter table public.topics enable row level security;
alter table public.app_users enable row level security;
alter table public.videos enable row level security;
alter table public.topic_videos enable row level security;
alter table public.recommendation_sources enable row level security;
alter table public.bait_scores enable row level security;
alter table public.feedback enable row level security;
alter table public.signups enable row level security;
alter table public.topic_requests enable row level security;
alter table public.analytics_events enable row level security;
alter table public.quota_log enable row level security;

create policy topics_read on public.topics for select using (true);
create policy topics_admin on public.topics for all using (public.is_admin()) with check (public.is_admin());

create policy app_users_self on public.app_users for select using (id = auth.uid() or public.is_admin());
create policy app_users_admin on public.app_users for all using (public.is_admin()) with check (public.is_admin());

create policy videos_read on public.videos for select using (true);
create policy videos_curator_write on public.videos for insert with check (exists (select 1 from public.app_users where id = auth.uid()));
create policy videos_curator_update on public.videos for update using (exists (select 1 from public.app_users where id = auth.uid()));

create policy tv_public_read on public.topic_videos for select using (status = 'approved' or public.can_curate(topic_id));
create policy tv_curate on public.topic_videos for all using (public.can_curate(topic_id)) with check (public.can_curate(topic_id));

create policy rs_read on public.recommendation_sources for select using (true);
create policy rs_curate on public.recommendation_sources for all using (public.can_curate(topic_id)) with check (public.can_curate(topic_id));

create policy bs_read on public.bait_scores for select using (true);

create policy fb_insert on public.feedback for insert with check (true);
create policy fb_read on public.feedback for select using (public.can_curate(topic_id));

create policy su_insert on public.signups for insert with check (true);
create policy su_read on public.signups for select using (public.is_admin());

create policy tr_insert on public.topic_requests for insert with check (true);
create policy tr_read on public.topic_requests for select using (exists (select 1 from public.app_users where id = auth.uid()));
create policy tr_admin on public.topic_requests for update using (public.is_admin());

create policy ae_insert on public.analytics_events for insert with check (true);
create policy ae_read on public.analytics_events for select using (exists (select 1 from public.app_users where id = auth.uid()));

create policy ql_read on public.quota_log for select using (public.is_admin());

insert into public.topics (slug, name, description) values
 ('ai-game-dev','AI game development','Talks, tutorials and postmortems on building games with AI tools.'),
 ('starfield','Starfield','Guides, deep dives, update explainers and mod showcases for Bethesda''s Starfield.');
