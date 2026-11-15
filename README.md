# Worth Your Time

One video a day for AI game development and Starfield. Viewers do not sign in. Curators sign in with an email magic link.

## Scripts

- `npm run dev` — local app
- `npm run build` — production build
- `npm run lint` / `npm run typecheck`
- `npm test` — picker unit tests (the model call is mocked)
- `npm run seed` — insert `data/candidates.json` as candidates. Needs `YOUTUBE_API_KEY` and `SUPABASE_SECRET_KEY`.

## Environment

Copy `.env.example` to `.env.local`.

| Name | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser and server |
| `SUPABASE_SECRET_KEY` | server only: daily job, quota log, refresh, confirm, delete, seed |
| `YOUTUBE_API_KEY` | server only: `videos.list` |
| `ANTHROPIC_API_KEY` | server only: the daily picker. Never `NEXT_PUBLIC_` |
| `ANTHROPIC_MODEL` | optional. Defaults to `claude-haiku-5-5` |
| `CRON_SECRET` | Vercel Cron calls `/api/cron/daily` and `/api/cron/refresh-youtube` |
| `CHANNEL_WEIGHTING_ENABLED` | off unless `1`, `true`, or `yes` |

The picker calls Anthropic directly. It does not use the Vercel AI Gateway. If `ANTHROPIC_API_KEY` is missing, that topic's day is left empty and the admin page shows the gap. Email sending is not implemented.

Apply `supabase/migrations/0004_ai_pick.sql` before the daily job. `0003_daily_pick.sql` and `0003b_drop_claim_checks.sql` are already applied.

## Curators

Create the person in Supabase Auth, then insert a row in `app_users` (`admin` or `curator`, plus `topic_ids`). Magic-link sign-in does not create new accounts. Add the site URL and `/auth/callback` to the Supabase redirect allow list. For links opened on another device, point the magic-link email template at `/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
