export interface SchedulePreset {
  label: string;
  minutes: number;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { label: "5 min", minutes: 5 },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "12 hours", minutes: 720 },
  { label: "Daily", minutes: 1440 },
];

const LEGACY_MAP: Record<string, number> = {
  "every 5m": 5,
  "every 15m": 15,
  "every 30m": 30,
  "every 1h": 60,
  "every 6h": 360,
  "every 12h": 720,
  "0 */6 * * *": 360,
  "0 0 * * *": 1440,
};

const DEFAULT_INTERVAL_MINUTES = 60;

export function cronPresetToIntervalMinutes(input: unknown): number {
  if (typeof input === "number" && input > 0) return input;
  if (typeof input === "string" && LEGACY_MAP[input]) return LEGACY_MAP[input];
  return DEFAULT_INTERVAL_MINUTES;
}

export function formatInterval(minutes: number): string {
  const preset = SCHEDULE_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  return `${minutes} min`;
}
