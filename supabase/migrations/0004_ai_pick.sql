-- Apply before the daily collector and picker. Not applied yet.

alter table public.topics add column source_config jsonb not null default '{}'::jsonb;

update public.topics
set source_config = '{"hn":false,"subreddits":["Starfield","starfieldmods"],"keywords":["starfield"]}'::jsonb
where slug = 'starfield';

update public.topics
set source_config = '{"hn":true,"subreddits":["aigamedev","gamedev"],"keywords":["AI game development","AI npc","generative game"]}'::jsonb
where slug = 'ai-game-dev';

alter table public.topic_videos add column picked_by text check (picked_by in ('ai','curator'));
alter table public.topic_videos add column pick_rationale text;

alter table public.recommendation_sources add column source_key text;
alter table public.recommendation_sources add column source_score int;
alter table public.recommendation_sources add column comment_count int;

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'feedback' and con.contype = 'c'
  loop
    execute format('alter table public.feedback drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.feedback add constraint feedback_value_check
  check (value in ('good','not_good','worth_it','bait','not_for_me'));

create unique index feedback_one_vote_per_pick
  on public.feedback (topic_id, video_id, anonymous_id);

create view public.source_good_rates with (security_invoker = true) as
with pick_votes as (
  select tv.topic_id, tv.video_id,
    count(*) filter (where f.value = 'good')::int as good,
    count(*) filter (where f.value in ('good','not_good'))::int as total
  from public.topic_videos tv
  left join public.feedback f
    on f.video_id = tv.video_id and f.topic_id = tv.topic_id
  where tv.status = 'approved' and tv.pick_date is not null
  group by tv.topic_id, tv.video_id
)
select pv.topic_id, rs.source_key,
  sum(pv.good)::int as good,
  sum(pv.total)::int as total
from pick_votes pv
join public.recommendation_sources rs
  on rs.video_id = pv.video_id and rs.topic_id = pv.topic_id
where rs.source_key is not null
group by pv.topic_id, rs.source_key;

create view public.channel_good_rates with (security_invoker = true) as
with pick_votes as (
  select tv.topic_id, tv.video_id,
    count(*) filter (where f.value = 'good')::int as good,
    count(*) filter (where f.value in ('good','not_good'))::int as total
  from public.topic_videos tv
  left join public.feedback f
    on f.video_id = tv.video_id and f.topic_id = tv.topic_id
  where tv.status = 'approved' and tv.pick_date is not null
  group by tv.topic_id, tv.video_id
)
select pv.topic_id, v.channel_id,
  sum(pv.good)::int as good,
  sum(pv.total)::int as total
from pick_votes pv
join public.videos v on v.id = pv.video_id
where v.channel_id is not null
group by pv.topic_id, v.channel_id;
