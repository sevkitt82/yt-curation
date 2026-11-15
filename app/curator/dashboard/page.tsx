import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logPullSignal, normalizeRequest } from "@/app/actions/curator";
import { getCurator } from "@/lib/curator";
import { loadDashboard } from "@/lib/metrics";
import { listLiveTopics } from "@/lib/picks";
import { formatDate } from "@/lib/time";

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  return (
    <Suspense fallback={<p>Loading dashboard…</p>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

function percent(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

async function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const curator = await getCurator();
  if (curator.status !== "ok") redirect("/curator/login");
  if (curator.appUser.role !== "admin") redirect("/curator");

  const topics = await listLiveTopics();
  const data = await loadDashboard(topics);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        <Link href="/curator">Curator home</Link>
      </p>
      <h1 className="text-3xl">Demand test</h1>
      <p className="text-sm text-[var(--muted)]">
        Counts for the last 28 days, per topic. Targets are the suggested ones from the plan, not benchmarks.
      </p>
      {notice ? <p className="notice text-sm">{notice}</p> : null}
      {!data ? (
        <p>SUPABASE_SECRET_KEY is required to read signups and quota, which viewers cannot read.</p>
      ) : (
        <>
          <p className="text-sm">Window starts {formatDate(data.since)}.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.topics.map((row) => (
              <section key={row.topic.id} className="card p-4 text-sm">
                <h2 className="text-2xl">{row.topic.name}</h2>
                <ul className="mt-2 flex flex-col gap-1">
                  <li>Signups (target ≥ 200 in 4 weeks): {row.signups}</li>
                  <li>Confirmed signups: {row.confirmedSignups}</li>
                  <li>
                    Visitor-to-signup conversion (target ≥ 10%): {percent(row.conversion)} from {row.visitors} topic
                    visitors
                  </li>
                  <li>Email open rate (target ≥ 40%): —</li>
                  <li>Click-through of opens (target ≥ 15%): —</li>
                  <li>
                    Unsubscribes (target ≤ 10% of signups): {row.unsubscribes}
                    {row.signups ? ` (${percent(row.unsubscribes / row.signups)})` : ""}
                  </li>
                  <li>Pull signal, unprompted replies (part of target ≥ 20): {row.pullReplies}</li>
                  <li>Would tip or pay (part of target ≥ 5): {row.wouldPay}</li>
                  <li>
                    Good / Not good (private; not shown on the picks): {row.worthIt} / {row.notGood}
                  </li>
                </ul>
              </section>
            ))}
          </div>
          <p className="text-sm">{data.emailNote}</p>
          <section className="card p-4 text-sm">
            <h2 className="text-2xl">Topic requests</h2>
            <p className="mt-2">
              Total {data.requestsTotal} (target ≥ 30). In this window: {data.requestsInWindow}. A topic is notable at
              ≥ 10 requests.
            </p>
            <ul className="mt-2">
              {data.requestsByTopic.map((row) => (
                <li key={row.label}>
                  {row.label}: {row.count}
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-4 text-sm">
            <h2 className="text-2xl">Returning visitors</h2>
            <p className="mt-2">
              {data.returningVisitors} of {data.weekVisitors} visitors this week also showed up before this week.
            </p>
          </section>
          <section className="card p-4 text-sm">
            <h2 className="text-2xl">YouTube quota today</h2>
            <p className="mt-2">
              {data.quotaUnits} of {data.quotaLimit} units since midnight Pacific. Only videos.list is called, at 1
              unit per batch of up to 50 ids. search.list is not used.
            </p>
          </section>
          <section className="card p-4 text-sm">
            <h2 className="text-2xl">Log a pull signal</h2>
            <form action={logPullSignal} className="mt-2 grid gap-2">
              <label className="field">
                Kind
                <select name="kind" defaultValue="reply">
                  <option value="reply">Unprompted reply</option>
                  <option value="would_pay">Would tip or pay</option>
                </select>
              </label>
              <label className="field">
                Topic
                <select name="topic_id" defaultValue={topics[0]?.id ?? ""}>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Note
                <input name="note" />
              </label>
              <button className="btn w-fit">Log</button>
            </form>
          </section>
          <section className="card p-4 text-sm">
            <h2 className="text-2xl">Normalize a request</h2>
            <p className="mt-1 text-[var(--muted)]">
              Group the same ask under one label. Use the request id from the database if you are cleaning duplicates.
            </p>
            <form action={normalizeRequest} className="mt-2 grid gap-2">
              <label className="field">
                Request id
                <input name="id" required />
              </label>
              <label className="field">
                Normalized topic
                <input name="normalized_topic" />
              </label>
              <button className="btn w-fit">Save label</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
