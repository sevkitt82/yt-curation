"use client";

import { useActionState } from "react";
import { submitSignup, submitTopicRequest, type ActionState } from "@/app/actions/viewer";
import { useAnonymousId } from "@/components/anon-sync";
import { CONSENT_TEXT } from "@/lib/config";
import type { Topic } from "@/lib/types";

function useAnonField() {
  return useAnonymousId();
}

export function SignupForm({ topics, preselect }: { topics: Topic[]; preselect?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitSignup, null);
  const anon = useAnonField();

  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <h2 className="text-2xl">Get this week&apos;s picks</h2>
      <p className="text-sm text-[var(--muted)]">Free. Choose your topics. No account.</p>
      <input type="hidden" name="anonymous_id" value={anon} />
      <label className="field">
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">Topics</legend>
        {topics.map((topic) => (
          <label key={topic.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="topics" value={topic.slug} defaultChecked={preselect === topic.slug} />
            {topic.name}
          </label>
        ))}
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" value="yes" required className="mt-1" />
        <span>
          {CONSENT_TEXT}{" "}
          <a href="/privacy">Privacy policy</a>
        </span>
      </label>
      <button className="btn w-fit" disabled={pending}>
        {pending ? "Saving…" : "Get this week's picks"}
      </button>
      {state ? <p className="text-sm">{state.message}</p> : null}
    </form>
  );
}

export function RequestForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitTopicRequest, null);
  const anon = useAnonField();

  return (
    <form id="request" action={action} className="card flex flex-col gap-3 p-4">
      <h2 className="text-2xl">Request a topic</h2>
      <p className="text-sm text-[var(--muted)]">
        Don&apos;t see your topic? Tell us what you want curated next. The most-requested topics get added first.
      </p>
      <input type="hidden" name="anonymous_id" value={anon} />
      <label className="field">
        Topic
        <input name="requested_topic" required maxLength={200} />
      </label>
      <label className="field">
        Why (optional)
        <textarea name="reason" rows={3} maxLength={1000} />
      </label>
      <label className="field">
        Email if you want to know when it&apos;s added (optional)
        <input name="email" type="email" autoComplete="email" />
      </label>
      <button className="btn w-fit" disabled={pending}>
        {pending ? "Saving…" : "Send request"}
      </button>
      {state ? <p className="text-sm">{state.message}</p> : null}
    </form>
  );
}
