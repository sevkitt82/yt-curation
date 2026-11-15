alter table public.topic_videos add column pick_date date;
create unique index topic_videos_one_pick_per_day on public.topic_videos (topic_id, pick_date) where pick_date is not null;
