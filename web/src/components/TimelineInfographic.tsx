import type { InfographicEvent } from "../types";
import { infographicKindLabel, xPercent } from "../lib/timelineUtils";

const LANES = [
  { id: 0, label: "Iran attack waves", color: "#c0392b" },
  { id: 1, label: "US / Israel strikes on Iran", color: "#3498db" },
  { id: 2, label: "Political & narrative events", color: "#8b9ab5" },
];

const YEARS = [2023, 2024, 2025, 2026];

function isVisible(sortKey: string, asOfDate?: string): boolean {
  if (!asOfDate) return true;
  return sortKey.slice(0, 10) <= asOfDate.slice(0, 10);
}

interface TimelineInfographicProps {
  events: InfographicEvent[];
  showWaves: boolean;
  showCoalition: boolean;
  showNarrative: boolean;
  asOfDate?: string;
  playheadPercent?: number;
  selectedEventId?: string | null;
  onSelectEvent?: (event: InfographicEvent | null) => void;
}

export function TimelineInfographic({
  events,
  showWaves,
  showCoalition,
  showNarrative,
  asOfDate,
  playheadPercent,
  selectedEventId,
  onSelectEvent,
}: TimelineInfographicProps) {
  const filtered = events.filter((e) => {
    if (e.kind === "iran_wave") return showWaves;
    if (e.kind === "coalition_strike") return showCoalition;
    return showNarrative;
  });

  return (
    <div className="infographic">
      <div className="infographic-header">
        <h2>Conflict timeline infographic</h2>
        <p>
          2023–2026 · {filtered.length} events
          {asOfDate ? ` · showing through ${asOfDate}` : " on timeline"}
          {onSelectEvent && " · click a dot for details"}
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
            {YEARS.map((y) => (
              <span key={y} style={{ left: `${xPercent(`${y}-01-01`)}%` }}>
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
                    const isSelected = selectedEventId === e.id;
                    return (
                      <button
                        type="button"
                        key={e.id}
                        className={`infographic-dot kind-${e.kind}${e.isUsStrike ? " us-strike" : ""}${e.usTargeted ? " us-target" : ""}${visible ? "" : " future"}${isCurrent ? " current" : ""}${isSelected ? " selected" : ""}`}
                        style={{
                          left: `${xPercent(e.sortKey)}%`,
                          borderColor: lane.color,
                          opacity: visible ? 1 : 0.12,
                        }}
                        title={`${e.dateLabel} — ${e.title}`}
                        aria-label={`${infographicKindLabel(e.kind)}: ${e.title}, ${e.dateLabel}`}
                        aria-pressed={isSelected}
                        onClick={() => onSelectEvent?.(isSelected ? null : e)}
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
                      </button>
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
