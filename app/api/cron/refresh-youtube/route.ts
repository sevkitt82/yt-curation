import { refreshStaleYoutubeVideos } from "@/lib/refresh";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await refreshStaleYoutubeVideos();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("youtube refresh failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ ok: false }, { status: 500 });
  }
}
