import { cronAuthorized } from "@/lib/cron-auth";
import { runDaily } from "@/lib/daily";
import { createAdminClient } from "@/lib/supabase/admin";
import { laToday } from "@/lib/time";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return Response.json({ ok: false, error: "SUPABASE_SECRET_KEY is not set." }, { status: 500 });
  }
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim();
    const today = url.searchParams.get("today") === "1";
    const topics = await runDaily(admin, slug && /^[a-z0-9-]+$/.test(slug) ? slug : undefined, today ? laToday() : undefined);
    return Response.json({ ok: true, topics });
  } catch (error) {
    console.error("daily job failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ ok: false }, { status: 500 });
  }
}
