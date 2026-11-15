import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <article className="max-w-2xl flex flex-col gap-4 text-[0.98rem] leading-relaxed">
      <h1 className="text-4xl">Privacy policy</h1>
      <p>This note describes the working app called Worth Your Time. It was last updated on 15 November 2026.</p>

      <h2 className="text-2xl">What we collect</h2>
      <ul className="list-disc pl-5">
        <li>
          An anonymous browser id, stored in a cookie named <code>ytc_anon</code> and copied to local storage on this
          device. It is a random id, not your name.
        </li>
        <li>
          A source tag cookie (<code>ytc_source</code>) when you arrive from a link with <code>src</code>,{" "}
          <code>utm_source</code>, or <code>utm_campaign</code>. It lasts 30 days.
        </li>
        <li>Feedback: Good or Not good, tied to the browser id. Counts are not shown on the site.</li>
        <li>
          An optional email signup: your email, the topics you tick, the consent text version, a confirmation token,
          and whether you confirm or unsubscribe.
        </li>
        <li>Topic requests: the topic text, an optional reason, an optional email, and the browser id.</li>
        <li>
          Analytics events in our own database: event name, browser id, topic, video, source tag, and the time. We do
          not use a third-party analytics product in this version.
        </li>
        <li>
          YouTube API data for videos a curator adds: title, channel, description, duration, publish time, thumbnail
          URL, embeddable flag, and privacy status. We do not store view counts or like counts. We do not download
          video files.
        </li>
        <li>
          A correction report: a message and an optional email, tied to a video.
        </li>
        <li>Curator accounts: email and role, for the people who edit the catalogue. Viewers do not have accounts.</li>
      </ul>

      <h2 className="text-2xl">Why</h2>
      <p>
        We use this to show the catalogue, remember your feedback, send picks later if you asked for them, count
        demand for each topic, and keep YouTube metadata current. Daily picks are chosen from recommendation posts,
        not from YouTube view or like counts.
      </p>

      <h2 className="text-2xl">YouTube API Services</h2>
      <p>
        This app uses YouTube API Services to read video metadata and to play videos in YouTube&apos;s embedded
        player. By using the app you are agreeing to be bound by the{" "}
        <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>. Google&apos;s privacy policy is at{" "}
        <a href="https://policies.google.com/privacy">https://policies.google.com/privacy</a>.
      </p>

      <h2 className="text-2xl">Retention</h2>
      <p>
        YouTube API data is refreshed or hidden within 30 days of the last fetch. Signups, topic requests, and
        feedback stay until you delete them or, for email, until you unsubscribe. Analytics events are kept so the
        four-week demand test can be counted. They are not linked to your email.
      </p>

      <h2 className="text-2xl">Cookies</h2>
      <p>
        Viewers get the anonymous id cookie and, sometimes, the source tag cookie. Curators also get Supabase
        authentication cookies after they sign in with an email link. There is no advertising cookie.
      </p>

      <h2 className="text-2xl">Delete your data</h2>
      <p>
        Use the <Link href="/delete-my-data">delete my data</Link> form with the email you signed up with, or with
        your browser id. That deletes matching signups, topic requests, and feedback.
      </p>

      <h2 className="text-2xl">Contact</h2>
      <p>
        Use the topic request form on the home page. There is no separate mailbox for this first build.
      </p>
    </article>
  );
}
