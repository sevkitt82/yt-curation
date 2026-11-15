import type { Metadata } from "next";
import { DeleteForm } from "@/components/delete-form";

export const metadata: Metadata = { title: "Delete my data" };

export default function DeleteMyDataPage() {
  return (
    <div className="max-w-xl flex flex-col gap-4">
      <h1 className="text-4xl">Delete my data</h1>
      <p className="text-sm text-[var(--muted)]">
        Enter the email on a signup or topic request, the anonymous browser id on feedback and topic requests, or
        both. This removes those rows. It does not delete analytics events, which have no email on them.
      </p>
      <DeleteForm />
    </div>
  );
}
