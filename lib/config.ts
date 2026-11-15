export const APP_NAME = "Worth Your Time";

export const CONSENT_VERSION = "2026-11-15";

export const CONSENT_TEXT =
  "I agree to get a weekly email of picks for the topics I selected. I can unsubscribe at any time. See the privacy policy.";

/**
 * Claude API id for Haiku 5.5, from Anthropic's models overview
 * (Claude API ID column): https://docs.anthropic.com/en/docs/about-claude/models
 * Override with ANTHROPIC_MODEL.
 */
export const HAIKU_MODEL_ID = "claude-haiku-5-5";

export function anthropicModelId(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || HAIKU_MODEL_ID;
}

/** Off unless set to 1, true, or yes. Uses YouTube channel ids in selection. */
export function channelWeightingEnabled(): boolean {
  const value = process.env.CHANNEL_WEIGHTING_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export const YOUTUBE_REFRESH_AFTER_DAYS = 25;
export const YOUTUBE_MAX_DISPLAY_AGE_DAYS = 30;
export const YOUTUBE_DAILY_QUOTA = 10_000;

/** short < 10 min, medium 10–30 min, long over 30 min. */
export const LENGTH_SHORT_MAX_SECONDS = 10 * 60;
export const LENGTH_MEDIUM_MAX_SECONDS = 30 * 60;

export const ANON_COOKIE = "ytc_anon";
export const SOURCE_COOKIE = "ytc_source";

export const COLLECTOR_USER_AGENT = "WorthYourTime/1.0 (daily topic collector)";
