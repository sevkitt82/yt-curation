import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1 className="text-3xl">Not found</h1>
      <p className="mt-2 text-sm">
        That page is not in the catalogue. <Link href="/">Go home</Link>
      </p>
    </div>
  );
}
