"use client";

import { useActionState } from "react";
import { submitCorrection, type ActionState } from "@/app/actions/viewer";

export function CorrectionForm({ videoId }: { videoId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitCorrection, null);
  if (state?.ok) return <p className="text-sm">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="video_id" value={videoId} />
      <label className="field">
        What should we correct?
        <textarea name="message" rows={3} required minLength={8} />
      </label>
      <label className="field">
        Email (optional)
        <input name="email" type="email" autoComplete="email" />
      </label>
      <button className="btn-quiet w-fit" disabled={pending}>
        {pending ? "Sending…" : "Send report"}
      </button>
      {state ? <p className="text-sm">{state.message}</p> : null}
    </form>
  );
}
