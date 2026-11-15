import {
  LENGTH_MEDIUM_MAX_SECONDS,
  LENGTH_SHORT_MAX_SECONDS,
  YOUTUBE_MAX_DISPLAY_AGE_DAYS,
} from "@/lib/config";
import type { LengthBucket } from "@/lib/types";

export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if (hours === 0 && minutes === 0 && seconds === 0 && iso !== "PT0S") return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function lengthBucket(seconds: number | null): LengthBucket | null {
  if (seconds == null) return null;
  if (seconds < LENGTH_SHORT_MAX_SECONDS) return "short";
  if (seconds <= LENGTH_MEDIUM_MAX_SECONDS) return "medium";
  return "long";
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "Length unknown";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown date";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function youtubeDataIsFresh(fetchedAt: string | null, now = Date.now()): boolean {
  if (!fetchedAt) return false;
  const age = now - new Date(fetchedAt).getTime();
  return age >= 0 && age < YOUTUBE_MAX_DISPLAY_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/** Start of the current day in America/Los_Angeles, as a UTC ISO string. Quota resets then. */
export function pacificDayStartIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = wallAsUtc - now.getTime();
  const midnightWallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), 0, 0, 0);
  return new Date(midnightWallAsUtc - offsetMs).toISOString();
}

export function daysAgoIso(days: number, now = Date.now()): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export function laToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addIsoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Midnight at the start of this calendar date in America/Los_Angeles. */
export function laMidnightUtc(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, 8, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = wallAsUtc - guess.getTime();
  const midnightWallAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  return new Date(midnightWallAsUtc - offsetMs);
}

/** First pick date whose local midnight is at least 12 hours from now. */
export function earliestPickDate(now = new Date()): string {
  const threshold = now.getTime() + 12 * 60 * 60 * 1000;
  let cursor = laToday(now);
  for (let i = 0; i < 6; i++) {
    if (laMidnightUtc(cursor).getTime() >= threshold) return cursor;
    cursor = addIsoDays(cursor, 1);
  }
  return cursor;
}

