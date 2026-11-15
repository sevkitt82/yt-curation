const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (ID.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && ID.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "m.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && ID.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      const head = parts[0];
      if ((head === "embed" || head === "shorts" || head === "live") && parts[1] && ID.test(parts[1])) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeIdsInText(text: string): string[] {
  const ids: string[] = [];
  const pattern =
    /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^&\s]*&)*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})\b/g;
  for (const match of text.matchAll(pattern)) {
    const id = match[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function parseYouTubeIds(blob: string): string[] {
  const ids: string[] = [];
  for (const chunk of blob.split(/[\s,]+/)) {
    const id = parseYouTubeId(chunk);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
