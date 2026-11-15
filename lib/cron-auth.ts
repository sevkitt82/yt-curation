const SCHEDULES = new Set(["0 14 * * *", "0 16 * * *"]);

/** CRON_SECRET when it is set. Otherwise the headers Vercel adds to a cron invocation. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (secret) return auth === `Bearer ${secret}`;

  const schedule = request.headers.get("x-vercel-cron-schedule");
  const userAgent = request.headers.get("user-agent") ?? "";
  return userAgent === "vercel-cron/1.0" && schedule !== null && SCHEDULES.has(schedule);
}
