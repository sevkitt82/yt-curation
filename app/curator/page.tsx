import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutCurator } from "@/app/actions/curator";
import { getCurator, topicsForCurator } from "@/lib/curator";

export default function CuratorHomePage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CuratorHome />
    </Suspense>
  );
}

async function CuratorHome() {
  const curator = await getCurator();
  if (curator.status === "signed_out") redirect("/curator/login");
  if (curator.status === "no_role") {
    return (
      <div className="max-w-xl">
        <h1 className="text-3xl">No curator access</h1>
        <p className="mt-2 text-sm">
          You are signed in{curator.email ? ` as ${curator.email}` : ""}, but there is no matching row in{" "}
          <code>app_users</code>. An admin has to add your user id, role, and topic ids.
        </p>
        <form action={signOutCurator} className="mt-4">
          <button className="btn-quiet">Sign out</button>
        </form>
      </div>
    );
  }

  const topics = await topicsForCurator(curator.appUser);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl">Curator</h1>
        <form action={signOutCurator}>
          <button className="btn-quiet">Sign out</button>
        </form>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Signed in as {curator.email} ({curator.appUser.role}). You can only edit topics assigned to you.
      </p>
      <ul className="flex flex-col gap-2">
        {topics.map((topic) => (
          <li key={topic.id}>
            <Link href={`/curator/topics/${topic.slug}`}>{topic.name}</Link>
          </li>
        ))}
      </ul>
      {curator.appUser.role === "admin" ? (
        <p>
          <Link href="/curator/dashboard">Test dashboard and quota</Link>
        </p>
      ) : null}
    </div>
  );
}
