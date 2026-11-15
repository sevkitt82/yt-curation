"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { submitFeedback, type ActionState } from "@/app/actions/viewer";
import { useAnonymousId } from "@/components/anon-sync";

const OPTIONS = [
  { value: "good", label: "Good" },
  { value: "not_good", label: "Not good" },
] as const;

function useSavedVote(key: string) {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => localStorage.getItem(key) ?? "",
    () => "",
  );
}

export function FeedbackForm({ topicId, videoId }: { topicId: string; videoId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitFeedback, null);
  const anon = useAnonymousId();
  const storageKey = `ytc_vote:${topicId}:${videoId}`;
  const stored = useSavedVote(storageKey);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? state?.value ?? stored;

  return (
    <form
      action={action}
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const value = submitter instanceof HTMLButtonElement ? submitter.value : "";
        if (!value) return;
        localStorage.setItem(storageKey, value);
        setPicked(value);
      }}
    >
      <input type="hidden" name="topic_id" value={topicId} />
      <input type="hidden" name="video_id" value={videoId} />
      <input type="hidden" name="anonymous_id" value={anon} />
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          className={selected === option.value ? "btn" : "btn-quiet"}
          name="value"
          value={option.value}
          disabled={pending}
        >
          {option.label}
        </button>
      ))}
      {state ? <p className="w-full text-sm">{state.message}</p> : null}
    </form>
  );
}
