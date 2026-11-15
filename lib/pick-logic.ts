export type SourceSignal = {
  key: string;
  url: string | null;
  platform: string;
  excerpt: string | null;
  sourceScore: number | null;
  commentCount: number | null;
};

export type CandidateInput = {
  id: string;
  sources: SourceSignal[];
  channelId?: string | null;
};

export type RateStat = { good: number; total: number; rate: number };

export type ModelChoice = { videoId: string; whyLine: string; rationale: string };

export type PickModel = (prompt: string) => Promise<ModelChoice[]>;

export function smoothedRate(good: number, total: number): number {
  return (good + 1) / (total + 2);
}

export function isLowData(stat: RateStat | undefined): boolean {
  return (stat?.total ?? 0) < 5;
}

export function ratesFromPicks(
  picks: { keys: string[]; good: number; total: number }[],
): Map<string, RateStat> {
  const totals = new Map<string, { good: number; total: number }>();
  for (const pick of picks) {
    for (const key of new Set(pick.keys)) {
      const current = totals.get(key) ?? { good: 0, total: 0 };
      current.good += pick.good;
      current.total += pick.total;
      totals.set(key, current);
    }
  }
  const rates = new Map<string, RateStat>();
  for (const [key, value] of totals) {
    rates.set(key, { ...value, rate: smoothedRate(value.good, value.total) });
  }
  return rates;
}

export function candidateIsLowData(candidate: CandidateInput, rates: Map<string, RateStat>): boolean {
  const keys = candidate.sources.map((source) => source.key).filter(Boolean);
  if (keys.length === 0) return true;
  return keys.every((key) => isLowData(rates.get(key)));
}

/** After four picks from well-known sources, the next choice is limited to a low-data source when one exists. */
export function poolForExploration(
  candidates: CandidateInput[],
  recentKeys: string[],
  rates: Map<string, RateStat>,
): CandidateInput[] {
  const lastFour = recentKeys.slice(0, 4);
  if (lastFour.length < 4) return candidates;
  if (lastFour.some((key) => isLowData(rates.get(key)))) return candidates;
  const low = candidates.filter((candidate) => candidateIsLowData(candidate, rates));
  return low.length > 0 ? low : candidates;
}

export function buildPickPrompt(
  candidates: CandidateInput[],
  rates: Map<string, RateStat>,
  channelRates: Map<string, RateStat> | null,
  count: number,
): string {
  const lines = candidates.map((candidate) => {
    const sources = candidate.sources
      .map((source) => {
        const stat = rates.get(source.key);
        const rate = stat ? stat.rate.toFixed(2) : smoothedRate(0, 0).toFixed(2);
        const votes = stat ? `${stat.good} good of ${stat.total}` : "no votes yet";
        return [
          `source ${source.key}`,
          `rate ${rate} (${votes})`,
          source.url ? `url ${source.url}` : "",
          source.excerpt ? `excerpt ${source.excerpt}` : "",
          source.sourceScore != null ? `post score ${source.sourceScore}` : "",
          source.commentCount != null ? `post comments ${source.commentCount}` : "",
        ]
          .filter(Boolean)
          .join("; ");
      })
      .join(" | ");
    const channel =
      channelRates && candidate.channelId
        ? ` channel ${candidate.channelId} rate ${(channelRates.get(candidate.channelId)?.rate ?? smoothedRate(0, 0)).toFixed(2)}`
        : "";
    return `id ${candidate.id}${channel}: ${sources}`;
  });

  return [
    `Choose ${count} different video ids from the list. You are given only recommendation posts from outside YouTube, plus an opaque id.`,
    "Do not use or invent YouTube titles, descriptions, thumbnails, comments, view counts, or like counts. They are not inputs.",
    "Prefer sources with a higher good-rate. Still explore: when a source has little vote data, it can be the right pick.",
    "A post score of 3 is an independent share. A post score of 1 is the channel's own upload or the owner posting it. Prefer independent shares.",
    "Write a why-line of one or two sentences that cites the recommendation. Write a short rationale for the curator.",
    "",
    ...lines,
  ].join("\n");
}

export const MISSING_KEY_MESSAGE = "ANTHROPIC_API_KEY is not set. No pick was published.";

export function explainMissingKey(): string {
  console.error(MISSING_KEY_MESSAGE);
  return MISSING_KEY_MESSAGE;
}

export async function chooseFromPool(args: {
  candidates: CandidateInput[];
  rates: Map<string, RateStat>;
  recentSourceKeys: string[];
  channelRates: Map<string, RateStat> | null;
  model: PickModel | null;
  count: number;
}): Promise<{ ok: true; choices: ModelChoice[]; prompt: string } | { ok: false; gap: string }> {
  const count = Math.min(3, Math.max(1, args.count));
  if (args.candidates.length === 0) return { ok: false, gap: "No candidates left to pick." };
  if (!args.model) return { ok: false, gap: explainMissingKey() };

  const pool = poolForExploration(args.candidates, args.recentSourceKeys, args.rates);
  const prompt = buildPickPrompt(pool, args.rates, args.channelRates, count);
  try {
    const returned = await args.model(prompt);
    const used = new Set<string>();
    const choices: ModelChoice[] = [];
    for (const choice of returned) {
      if (choices.length >= count) break;
      const whyLine = choice.whyLine.trim();
      if (!whyLine || used.has(choice.videoId) || !pool.some((candidate) => candidate.id === choice.videoId)) continue;
      used.add(choice.videoId);
      choices.push({ videoId: choice.videoId, whyLine, rationale: choice.rationale.trim() });
    }
    if (choices.length === 0) {
      const gap = "The model did not return a pick from the pool.";
      console.error("Daily pick failed:", gap);
      return { ok: false, gap };
    }
    return { ok: true, choices, prompt };
  } catch (error) {
    const gap = error instanceof Error ? error.message : "The model call failed.";
    console.error("Daily pick failed:", gap);
    return { ok: false, gap };
  }
}
