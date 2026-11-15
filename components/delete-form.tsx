"use client";

import { useActionState } from "react";
import { deleteMyData, type ActionState } from "@/app/actions/viewer";
import { useAnonymousId } from "@/components/anon-sync";

export function DeleteForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteMyData, null);
  const anon = useAnonymousId();

  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <p className="text-sm text-[var(--muted)]">
        Your browser id on this device: <code>{anon || "not set yet"}</code>
      </p>
      <label className="field">
        Email you signed up with
        <input name="email" type="email" autoComplete="email" />
      </label>
      <label className="field">
        Or your browser id
        <input name="anonymous_id" defaultValue={anon} key={anon} />
      </label>
      <button className="btn w-fit" disabled={pending}>
        {pending ? "Deleting…" : "Delete my data"}
      </button>
      {state ? <p className="text-sm">{state.message}</p> : null}
    </form>
  );
}
