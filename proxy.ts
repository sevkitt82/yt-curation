import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE, SOURCE_COOKIE } from "@/lib/config";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
          for (const [header, value] of Object.entries(headers)) {
            supabaseResponse.headers.set(header, value);
          }
        },
      },
    });
    await supabase.auth.getClaims();
  }

  if (!request.cookies.get(ANON_COOKIE)?.value) {
    supabaseResponse.cookies.set(ANON_COOKIE, crypto.randomUUID(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
    });
  }

  const src = request.nextUrl.searchParams.get("src");
  const utmSource = request.nextUrl.searchParams.get("utm_source");
  const utmCampaign = request.nextUrl.searchParams.get("utm_campaign");
  const tag = src || [utmSource, utmCampaign].filter(Boolean).join("/");
  if (tag) {
    supabaseResponse.cookies.set(SOURCE_COOKIE, tag.slice(0, 200), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      httpOnly: false,
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
