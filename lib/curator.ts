import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { AppUser, Topic } from "@/lib/types";

export type CuratorContext =
  | { status: "signed_out" }
  | { status: "no_role"; userId: string; email: string | null }
  | { status: "ok"; userId: string; email: string | null; appUser: AppUser };

export async function getCurator(): Promise<CuratorContext> {
  const supabase = await createServerSupabase();
  if (!supabase) return { status: "signed_out" };

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return { status: "signed_out" };

  const { data: row } = await supabase
    .from("app_users")
    .select("id, email, role, topic_ids")
    .eq("id", userId)
    .maybeSingle();

  if (!row) {
    return { status: "no_role", userId, email: (data.claims.email as string | undefined) ?? null };
  }

  return {
    status: "ok",
    userId,
    email: row.email as string,
    appUser: row as AppUser,
  };
}

export function curatorCanEdit(appUser: AppUser, topicId: string): boolean {
  return appUser.role === "admin" || appUser.topic_ids.includes(topicId);
}

export async function topicsForCurator(appUser: AppUser): Promise<Topic[]> {
  const supabase = await createServerSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("topics")
    .select("id, slug, name, description, status, created_at")
    .order("name");
  const topics = (data ?? []) as Topic[];
  if (appUser.role === "admin") return topics;
  return topics.filter((topic) => appUser.topic_ids.includes(topic.id));
}
