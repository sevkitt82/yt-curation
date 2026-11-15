-- Claims check + correction requests (spec 10.4 update, 15 Nov 2026)
create table public.claim_checks (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  label text not null check (label in ('claims_checked','speculation_unconfirmed','misleading_excluded')),
  claims text[] not null default '{}',
  evidence_links jsonb not null default '[]', -- [{url, publisher, date}]
  curator_note text,
  checked_by uuid references auth.users(id),
  checked_at timestamptz not null default now(),
  ai_suggestions_used boolean not null default false,
  version int not null default 1,
  unique (video_id, topic_id, version)
);

create table public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  requester_email text,
  message text not null,
  status text not null default 'open' check (status in ('open','reviewing','resolved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.claim_checks enable row level security;
alter table public.correction_requests enable row level security;

create policy cc_read on public.claim_checks for select using (true);
create policy cc_curate on public.claim_checks for all using (public.can_curate(topic_id)) with check (public.can_curate(topic_id));

create policy cr_insert on public.correction_requests for insert with check (true);
create policy cr_read on public.correction_requests for select using (exists (select 1 from public.app_users where id = auth.uid()));
create policy cr_update on public.correction_requests for update using (exists (select 1 from public.app_users where id = auth.uid()));

-- curators set bait verdicts by hand now
create policy bs_curate on public.bait_scores for all
  using (exists (select 1 from public.app_users where id = auth.uid()))
  with check (exists (select 1 from public.app_users where id = auth.uid()));
