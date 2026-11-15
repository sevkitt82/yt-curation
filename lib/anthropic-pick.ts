import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { anthropicModelId } from "@/lib/config";
import type { PickModel } from "@/lib/pick-logic";

const choiceSchema = z.object({
  picks: z
    .array(
      z.object({
        videoId: z.string(),
        whyLine: z.string().min(1).max(400),
        rationale: z.string().min(1).max(800),
      }),
    )
    .min(1)
    .max(3),
});

/** Direct Anthropic call. Returns null when ANTHROPIC_API_KEY is missing. */
export function anthropicPicker(): PickModel | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const anthropic = createAnthropic({ apiKey });
  const modelId = anthropicModelId();
  return async (prompt: string) => {
    const { output } = await generateText({
      model: anthropic(modelId),
      output: Output.object({ schema: choiceSchema }),
      prompt,
    });
    if (!output) throw new Error("The model returned no pick.");
    return output.picks;
  };
}
