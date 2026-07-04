import type { InfographicEvent, TimelineEvent } from "../types";

export const TIMELINE_START = new Date("2023-10-01T00:00:00Z").getTime();
export const TIMELINE_END = new Date("2026-07-04T00:00:00Z").getTime();
export const INFOGRAPHIC_END = new Date("2026-07-31T00:00:00Z").getTime();
export const DAY_MS = 86_400_000;

export const TIMELINE_PHASES = [
  { id: "all", label: "All" },
  { id: "2023", label: "2023 · Gaza spillover" },
  { id: "2024", label: "2024 · Direct strikes" },
  { id: "2025", label: "2025 · Twelve-day war" },
  { id: "2026-war", label: "2026 · Epic Fury" },
  { id: "2026-diplo", label: "2026 · Diplomacy" },
] as const;

export type TimelinePhaseId = (typeof TIMELINE_PHASES)[number]["id"];

export const PLAYBACK_JUMPS = [
  { label: "Oct 2023", ms: new Date("2023-10-07T00:00:00Z").getTime() },
  { label: "Apr 2024", ms: new Date("2024-04-13T00:00:00Z").getTime() },
  { label: "Jun 2025", ms: new Date("2025-06-13T00:00:00Z").getTime() },
  { label: "Epic Fury", ms: new Date("2026-02-28T00:00:00Z").getTime() },
  { label: "Islamabad MOU", ms: new Date("2026-06-17T00:00:00Z").getTime() },
  { label: "Today", ms: TIMELINE_END },
] as const;

/** Parse infographic / timeline sort keys (ISO date or timestamp) to epoch ms. */
export function sortKeyToMs(sortKey: string): number {
  const iso = sortKey.length >= 10 ? sortKey.slice(0, 10) : sortKey;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? TIMELINE_START : t;
}

export function timelineEventMs(event: TimelineEvent): number {
  const y = event.sortKey // YYYYMMDD integer from build script
    ? Math.floor(event.sortKey / 10000)
    : event.year;
  const m = event.sortKey ? Math.floor((event.sortKey % 10000) / 100) : 1;
  const d = event.sortKey ? event.sortKey % 100 : 1;
  const t = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`).getTime();
  return Number.isNaN(t) ? new Date(`${event.year}-01-01`).getTime() : t;
}

export function matchesTimelinePhase(event: TimelineEvent, phase: TimelinePhaseId): boolean {
  if (phase === "all") return true;
  if (phase === "2023") return event.year === 2023;
  if (phase === "2024") return event.year === 2024;
  if (phase === "2025") return event.year === 2025;
  if (phase === "2026-war") return event.year === 2026 && (event.sortKey ?? 0) < 20260401;
  if (phase === "2026-diplo") return event.year === 2026 && (event.sortKey ?? 0) >= 20260401;
  return true;
}

export function xPercent(sortKey: string, endMs = INFOGRAPHIC_END): number {
  const span = endMs - TIMELINE_START;
  const t = sortKeyToMs(sortKey);
  return Math.min(98, Math.max(1, ((t - TIMELINE_START) / span) * 100));
}

export function formatTimelineDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function eventBadgeClass(category: string): string {
  if (category.includes("US Military")) return "badge badge-us-strike";
  if (category.includes("Israel")) return "badge badge-israel-event";
  if (category.includes("Iran")) return "badge badge-iran-event";
  if (category === "Proxy Warfare") return "badge badge-proxy";
  if (category === "Diplomacy") return "badge badge-diplomacy";
  if (category === "Political Transition") return "badge badge-diplomacy";
  if (category === "Economic Warfare") return "badge badge-proxy";
  return "badge badge-event";
}

export function infographicKindLabel(kind: InfographicEvent["kind"]): string {
  if (kind === "iran_wave") return "Iran attack wave";
  if (kind === "coalition_strike") return "Coalition strike";
  return "Narrative event";
}
