import type { Metadata } from "next";

export const metadata: Metadata = { title: "How we pick" };

export default function HowWePickPage() {
  return (
    <article className="max-w-2xl flex flex-col gap-4">
      <h1 className="text-4xl">How we pick</h1>
      <p>
        Each topic gets three videos a day. The pool is videos from trusted YouTube channels, plus links people share on
        Mastodon, Lemmy, and Hacker News. A share from someone other than the channel owner counts for more.
      </p>
      <p>
        The why-line cites that recommendation. It is not a YouTube statistic. View counts and like counts are not
        collected and are not used.
      </p>
      <p>
        Good and Not good votes are private. They change which sources are preferred next time. A source with almost
        no votes is still tried, so one pick in five can come from somewhere new. A curator can veto a scheduled pick;
        the day is then filled from the remaining pool.
      </p>
      <p>
        The player is YouTube&apos;s own embed. We don&apos;t put anything on top of it. If a video becomes private,
        deleted, or non-embeddable, it drops off the page.
      </p>
    </article>
  );
}
