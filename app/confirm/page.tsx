import { Suspense } from "react";
import Link from "next/link";
import { recordEvent } from "@/lib/analytics";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTopicBySlug } from "@/lib/picks";

export default function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <Suspense fallback={<p>Confirming…</p>}>
      <ConfirmContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ConfirmContent({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div>
        <h1 className="text-3xl">Missing confirmation link</h1>
        <p className="mt-2 text-sm">Open the link from the confirmation email.</p>
      </div>
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return (
      <div>
        <h1 className="text-3xl">Confirmation is not available yet</h1>
        <p className="mt-2 text-sm">
          The server is missing SUPABASE_SECRET_KEY, which is required to mark a signup confirmed.
        </p>
      </div>
    );
  }

  const { data } = await admin
    .from("signups")
    .select("id, topics, confirmed_at")
    .eq("confirm_token", token)
    .maybeSingle();

  if (!data) {
    return (
      <div>
        <h1 className="text-3xl">That link does not match a signup</h1>
        <p className="mt-2">
          <Link href="/">Back home</Link>
        </p>
      </div>
    );
  }

  if (!data.confirmed_at) {
    await admin.from("signups").update({ confirmed_at: new Date().toISOString() }).eq("id", data.id);
    const slugs = (data.topics as string[]) ?? [];
    for (const slug of slugs) {
      const topic = await getTopicBySlug(slug);
      await recordEvent({
        eventName: "signup_confirmed",
        topicId: topic?.id,
        props: { signup_id: data.id as string },
      });
    }
  }

  return (
    <div>
      <h1 className="text-3xl">You&apos;re confirmed</h1>
      <p className="mt-2 text-sm">Weekly picks are not being emailed yet. Your signup is marked confirmed.</p>
      <p className="mt-4">
        <Link href="/">Back home</Link>
      </p>
    </div>
  );
}
