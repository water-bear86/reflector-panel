/* ── Fee-collection check interval ────────────────────────────────────
   Three fixed presets the creator picks from at creation time — not a
   continuous slider, not adaptive. Naming mirrors the existing holder
   reach-mode presets (Bless/@Here/Spam) elsewhere in this form. */

export type PollIntervalKey = "spam" | "medium" | "low";

export interface PollIntervalPreset {
  key: PollIntervalKey;
  label: string;
  minutes: number;
  hint: string;
}

export const POLL_INTERVAL_PRESETS: PollIntervalPreset[] = [
  { key: "spam", label: "Spam", minutes: 3, hint: "Checks every 3 min — fastest" },
  { key: "medium", label: "Middle Bun", minutes: 5, hint: "Checks every 5 min — balanced" },
  { key: "low", label: "Low", minutes: 10, hint: "Checks every 10 min — lowest overhead" },
];

export const DEFAULT_POLL_INTERVAL_KEY: PollIntervalKey = "medium";

export function isPollIntervalKey(k: unknown): k is PollIntervalKey {
  return POLL_INTERVAL_PRESETS.some((p) => p.key === k);
}

export function minutesForPollIntervalKey(key: PollIntervalKey): number {
  return POLL_INTERVAL_PRESETS.find((p) => p.key === key)!.minutes;
}
