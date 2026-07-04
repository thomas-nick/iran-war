import type { InfographicEvent } from "../types";

const LANES = [
  { id: 0, label: "Iran attack waves", color: "#c0392b" },
  { id: 1, label: "US / Israel strikes on Iran", color: "#3498db" },
  { id: 2, label: "Political & narrative events", color: "#8b9ab5" },
];

const START = new Date("2023-10-01").getTime();
const END = new Date("2026-07-31").getTime();
const SPAN = END - START;

function xPercent(sortKey: string): number {
  const d = new Date(sortKey.length === 10 ? sortKey : sortKey.slice(0, 10));
  const t = d.getTime();
  if (Number.isNaN(t)) return 0;
  return Math.min(98, Math.max(1, ((t - START) / SPAN) * 100));
}

function isVisible(sortKey: string, asOfDate?: string): boolean {
  if (!asOfDate) return true;
  const eventDate = sortKey.slice(0, 10);
  return eventDate <= asOfDate.slice(0, 10);
}

interface TimelineInfographicProps {
  events: InfographicEvent[];
  showWaves: boolean;
  showCoalition: boolean;
  showNarrative: boolean;
  asOfDate?: string;
  playheadPercent?: number;
}

export function TimelineInfographic({
  events,
  showWaves,
  showCoalition,
  showNarrative,
  asOfDate,
  playheadPercent,
}: TimelineInfographicProps) {
  const filtered = events.filter((e) => {
    if (e.kind === "iran_wave") return showWaves;
    if (e.kind === "coalition_strike") return showCoalition;
    return showNarrative;
  });

  const years = [2023, 2024, 2025, 2026];

  return (
    <div className="infographic">
      <div className="infographic-header">
        <h2>Conflict timeline infographic</h2>
        <p>
          2023–2026 · {filtered.length} events
          {asOfDate ? ` · showing through ${asOfDate}` : " on timeline"}
        </p>
      </div>
      <div className="infographic-scroll">
        <div className="infographic-canvas">
          {playheadPercent != null && (
            <div
              className="infographic-playhead"
              style={{ left: `${Math.min(99, Math.max(0, playheadPercent))}%` }}
              aria-hidden
            />
          )}
          <div className="infographic-years">
            {years.map((y) => (
              <span key={y} style={{ left: `${((new Date(`${y}-01-01`).getTime() - START) / SPAN) * 100}%` }}>
                {y}
              </span>
            ))}
          </div>
          {LANES.map((lane) => (
            <div className="infographic-lane" key={lane.id}>
              <div className="infographic-lane-label" style={{ borderColor: lane.color }}>
                {lane.label}
              </div>
              <div className="infographic-lane-track">
                {filtered
                  .filter((e) => e.lane === lane.id)
                  .map((e) => {
                    const visible = isVisible(e.sortKey, asOfDate);
                    const isCurrent =
                      asOfDate && visible && e.sortKey.slice(0, 10) === asOfDate.slice(0, 10);
                    return (
                      <div
                        key={e.id}
                        className={`infographic-dot kind-${e.kind}${e.isUsStrike ? " us-strike" : ""}${e.usTargeted ? " us-target" : ""}${visible ? "" : " future"}${isCurrent ? " current" : ""}`}
                        style={{
                          left: `${xPercent(e.sortKey)}%`,
                          borderColor: lane.color,
                          opacity: visible ? 1 : 0.12,
                        }}
                        title={`${e.dateLabel}\n${e.title}\n${e.subtitle}`}
                      >
                        <div className="infographic-tooltip">
                          <time>{e.dateLabel}</time>
                          <strong>{e.title}</strong>
                          <span>{e.subtitle}</span>
                          {e.weapons && e.weapons.length > 0 && (
                            <em>{e.weapons.slice(0, 2).join(" · ")}</em>
                          )}
                          {e.confidence && <span className="confidence">Confidence: {e.confidence}</span>}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
