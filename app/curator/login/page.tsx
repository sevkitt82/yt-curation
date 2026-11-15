import { Suspense } from "react";
import Link from "next/link";
import { requestMagicLink } from "@/app/actions/curator";

export default function CuratorLoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return (
    <div className="max-w-md">
      <h1 className="text-3xl">Curator sign-in</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Email magic link. Only for curator and admin accounts that already exist. Viewers do not sign in.
      </p>
      {notice ? <p className="notice mt-4 text-sm">{notice}</p> : null}
      <form action={requestMagicLink} className="mt-4 flex flex-col gap-3">
        <label className="field">
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <button className="btn w-fit">Email me a link</button>
      </form>
      <p className="mt-6 text-sm">
        <Link href="/">Back to the catalogue</Link>
      </p>
    </div>
  );
}
