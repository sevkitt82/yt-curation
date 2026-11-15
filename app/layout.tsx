import type { Metadata } from "next";
import Link from "next/link";
import { AnonSync } from "@/components/anon-sync";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "One video a day from what people recommend, with a short note on why it's here.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <AnonSync />
        <header className="border-b border-[var(--line)]">
          <div className="shell flex items-center justify-between gap-4 py-4">
            <Link href="/" className="text-lg text-[var(--ink)] no-underline">
              {APP_NAME}
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm">
              <Link href="/how-we-pick">How we pick</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/curator">Curators</Link>
            </nav>
          </div>
        </header>
        <main className="shell flex-1 py-8">{children}</main>
        <footer className="border-t border-[var(--line)]">
          <div className="shell flex flex-col gap-2 py-6 text-sm text-[var(--muted)]">
            <p>Not affiliated with YouTube or Bethesda. Videos play on YouTube.</p>
            <p className="flex flex-wrap gap-4">
              <Link href="/privacy">Privacy policy</Link>
              <Link href="/delete-my-data">Delete my data</Link>
              <Link href="/how-we-pick">How we pick</Link>
              <Link href="/#request">Contact / request a topic</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
