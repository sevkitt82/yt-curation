"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ANON_COOKIE } from "@/lib/config";

function readCookie(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${ANON_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1] ?? "") : "";
}

export function AnonSync() {
  useEffect(() => {
    const cookieId = readCookie();
    const stored = localStorage.getItem(ANON_COOKIE) ?? "";
    const id = stored || cookieId;
    if (!id) return;
    localStorage.setItem(ANON_COOKIE, id);
    if (cookieId !== id) {
      document.cookie = `${ANON_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);
  return null;
}

export function anonymousIdFromBrowser(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ANON_COOKIE) || readCookie();
}

export function useAnonymousId(): string {
  return useSyncExternalStore(
    () => () => {},
    anonymousIdFromBrowser,
    () => "",
  );
}
