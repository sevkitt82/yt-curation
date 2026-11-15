import "server-only";

import { YOUTUBE_DAILY_QUOTA } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysAgoIso, pacificDayStartIso } from "@/lib/time";
import type { Topic } from "@/lib/types";

const WINDOW_DAYS = 28;

export type TopicMetrics = {
  topic: Topic;
  signups: number;
  confirmedSignups: number;
  unsubscribes: number;
  visitors: number;
  conversion: number | null;
  worthIt: number;
  notGood: number;
  pullReplies: number;
  wouldPay: number;
};

export type DashboardData = {
  since: string;
  topics: TopicMetrics[];
  requestsTotal: number;
  requestsInWindow: number;
  requestsByTopic: { label: string; count: number }[];
  returningVisitors: number;
  weekVisitors: number;
  quotaUnits: number;
  quotaLimit: number;
  emailNote: string;
};

export async function loadDashboard(topics: Topic[]): Promise<DashboardData | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const since = daysAgoIso(WINDOW_DAYS);
  const weekStart = daysAgoIso(7);
  const quotaSince = pacificDayStartIso();

  const [signups, events, feedback, requests, quota, weekEvents, priorEvents] = await Promise.all([
    admin.from("signups").select("email, topics, confirmed_at, unsubscribed_at, created_at").gte("created_at", since),
    admin
      .from("analytics_events")
      .select("event_name, anonymous_id, topic_id, props")
      .gte("created_at", since),
    admin.from("feedback").select("topic_id, value").gte("created_at", since),
    admin.from("topic_requests").select("requested_topic_text, normalized_topic, created_at"),
    admin.from("quota_log").select("units").gte("created_at", quotaSince),
    admin.from("analytics_events").select("anonymous_id").gte("created_at", weekStart),
    admin.from("analytics_events").select("anonymous_id").lt("created_at", weekStart),
  ]);

  const signupRows = signups.data ?? [];
  const eventRows = events.data ?? [];
  const feedbackRows = feedback.data ?? [];
  const requestRows = requests.data ?? [];

  const topicMetrics: TopicMetrics[] = topics.map((topic) => {
    const topicSignups = signupRows.filter((row) => (row.topics as string[] | null)?.includes(topic.slug));
    const visitors = new Set(
      eventRows
        .filter((row) => row.event_name === "topic_view" && row.topic_id === topic.id && row.anonymous_id)
        .map((row) => row.anonymous_id as string),
    );
    const confirmed = topicSignups.filter((row) => row.confirmed_at).length;
    const unsubscribes = topicSignups.filter((row) => row.unsubscribed_at).length;
    const topicFeedback = feedbackRows.filter((row) => row.topic_id === topic.id);
    const pull = eventRows.filter((row) => row.event_name === "pull_signal" && row.topic_id === topic.id);
    return {
      topic,
      signups: topicSignups.length,
      confirmedSignups: confirmed,
      unsubscribes,
      visitors: visitors.size,
      conversion: visitors.size === 0 ? null : topicSignups.length / visitors.size,
      worthIt: topicFeedback.filter((row) => row.value === "good" || row.value === "worth_it").length,
      notGood: topicFeedback.filter((row) => row.value === "not_good" || row.value === "not_for_me" || row.value === "bait")
        .length,
      pullReplies: pull.filter((row) => (row.props as { kind?: string } | null)?.kind === "reply").length,
      wouldPay: pull.filter((row) => (row.props as { kind?: string } | null)?.kind === "would_pay").length,
    };
  });

  const counts = new Map<string, number>();
  for (const row of requestRows) {
    const label = (row.normalized_topic as string | null)?.trim() || (row.requested_topic_text as string);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const requestsByTopic = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const weekIds = new Set((weekEvents.data ?? []).map((row) => row.anonymous_id).filter(Boolean) as string[]);
  const priorIds = new Set((priorEvents.data ?? []).map((row) => row.anonymous_id).filter(Boolean) as string[]);
  let returningVisitors = 0;
  for (const id of weekIds) {
    if (priorIds.has(id)) returningVisitors += 1;
  }

  const quotaUnits = (quota.data ?? []).reduce((sum, row) => sum + (row.units as number), 0);

  return {
    since,
    topics: topicMetrics,
    requestsTotal: requestRows.length,
    requestsInWindow: requestRows.filter((row) => (row.created_at as string) >= since).length,
    requestsByTopic,
    returningVisitors,
    weekVisitors: weekIds.size,
    quotaUnits,
    quotaLimit: YOUTUBE_DAILY_QUOTA,
    emailNote:
      "Open rate and click-through are not measured yet. Email sending is not connected, so there is nothing to open.",
  };
}
