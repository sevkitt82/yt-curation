alter table public.topic_videos add column pick_slot smallint check (pick_slot between 1 and 3);
update public.topic_videos set pick_slot = 1, pick_date = current_date where pick_date is not null;
drop index if exists public.topic_videos_one_pick_per_day;
create unique index topic_videos_three_picks_per_day on public.topic_videos (topic_id, pick_date, pick_slot) where pick_date is not null;
alter table public.topic_videos add constraint pick_slot_with_date check ((pick_date is null) = (pick_slot is null));
