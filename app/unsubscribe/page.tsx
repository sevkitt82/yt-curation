import { Suspense } from "react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export default function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <Suspense fallback={<p>Updating…</p>}>
      <UnsubscribeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function UnsubscribeContent({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const admin = createAdminClient();
  if (!token || !admin) {
    return (
      <div>
        <h1 className="text-3xl">Unsubscribe link missing</h1>
        <p className="mt-2 text-sm">
          Email delivery is not connected yet, so unsubscribe links are not being sent. You can also{" "}
          <Link href="/delete-my-data">delete your data</Link>.
        </p>
      </div>
    );
  }

  const { data } = await admin.from("signups").select("id, unsubscribed_at").eq("confirm_token", token).maybeSingle();
  if (!data) {
    return <h1 className="text-3xl">That link does not match a signup</h1>;
  }
  if (!data.unsubscribed_at) {
    await admin.from("signups").update({ unsubscribed_at: new Date().toISOString() }).eq("id", data.id);
  }
  return (
    <div>
      <h1 className="text-3xl">You&apos;re unsubscribed</h1>
      <p className="mt-2 text-sm">We won&apos;t count this signup as active.</p>
    </div>
  );
}
