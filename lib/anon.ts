import "server-only";

import { cookies } from "next/headers";
import { ANON_COOKIE, SOURCE_COOKIE } from "@/lib/config";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAnonymousId(value: string): boolean {
  return UUID.test(value);
}

export async function readAnonymousId(submitted?: string | null): Promise<string | null> {
  if (submitted && isAnonymousId(submitted.trim())) return submitted.trim();
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(ANON_COOKIE)?.value;
  if (fromCookie && isAnonymousId(fromCookie)) return fromCookie;
  return null;
}

export async function readSourceTag(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SOURCE_COOKIE)?.value?.trim();
  if (!value) return null;
  return value.slice(0, 200);
}
