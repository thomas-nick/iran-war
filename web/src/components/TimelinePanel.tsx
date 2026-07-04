import { useMemo, useState } from "react";
import type { ConflictRow, TimelineEvent, TimelineStats } from "../types";
import {
  TIMELINE_PHASES,
  eventBadgeClass,
  matchesTimelinePhase,
  timelineEventMs,
  type TimelinePhaseId,
} from "../lib/timelineUtils";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

interface TimelinePanelProps {
  events: TimelineEvent[];
  stats: TimelineStats;
  filter: string;
  onFilterChange: (value: string) => void;
}

export function TimelinePanel({ events, stats, filter, onFilterChange }: TimelinePanelProps) {
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState<TimelinePhaseId>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (filter === "US strikes" && !e.isUsStrike) return false;
      if (filter === "US actions" && !e.isUsAction) return false;
      if (filter === "Iran" && !e.involvesIran) return false;
      if (filter === "Israel" && !e.involvesIsrael) return false;
      if (
        filter !== "All" &&
        filter !== "US strikes" &&
        filter !== "US actions" &&
        filter !== "Iran" &&
        filter !== "Israel" &&
        e.category !== filter
      ) {
        return false;
      }
      if (!matchesTimelinePhase(e, phase)) return false;
      if (!q) return true;
      const haystack = [
        e.event,
        e.category,
        e.keyActors,
        e.location,
        e.description,
        e.impactOutcome,
        String(e.year),
        e.date,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [events, filter, phase, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const diff = timelineEventMs(a) - timelineEventMs(b);
      return sortOrder === "oldest" ? diff : -diff;
    });
    return list;
  }, [filtered, sortOrder]);

  const usStrikes = useMemo(
    () => [...events].filter((e) => e.isUsStrike).sort((a, b) => timelineEventMs(b) - timelineEventMs(a)),
    [events],
  );

  return (
    <>
      <div className="timeline-intro">
        <p>
          Narrative context from{" "}
          <a
            href="https://www.kaggle.com/datasets/muhammadshayan5839/iran-usa-conflict-2023-2026"
            target="_blank"
            rel="noreferrer"
          >
            Kaggle — iran-usa-conflict-2023-2026
          </a>
          . <strong>{stats.totalEvents} events</strong> from Oct 2023–Jul 2026 — search, filter by phase,
          or expand any card for full detail.
        </p>
      </div>

      <div className="timeline-toolbar">
        <div className="timeline-search-wrap">
          <label className="sr-only" htmlFor="timeline-search">
            Search timeline
          </label>
          <input
            id="timeline-search"
            type="search"
            className="timeline-search"
            placeholder="Search events, actors, locations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="timeline-phase-chips" role="tablist" aria-label="Conflict phase">
          {TIMELINE_PHASES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={phase === p.id}
              className={`phase-chip${phase === p.id ? " active" : ""}`}
              onClick={() => setPhase(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="filters timeline-filters-row">
          <div className="filter-group">
            <label htmlFor="timeline-filter">Category</label>
            <select
              id="timeline-filter"
              value={filter}
              onChange={(ev) => onFilterChange(ev.target.value)}
            >
              <option value="All">All events</option>
              <option value="US strikes">US military strikes only</option>
              <option value="US actions">All US actions (incl. policy/threats)</option>
              <option value="Iran">Involving Iran</option>
              <option value="Israel">Involving Israel</option>
              <optgroup label="By category">
                {Object.keys(stats.byCategory)
                  .sort()
                  .map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="timeline-sort">Order</label>
            <select
              id="timeline-sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first (story order)</option>
            </select>
          </div>

          <span className="filter-count">
            {sorted.length} of {stats.totalEvents} events
          </span>
        </div>
      </div>

      {usStrikes.length > 0 && (
        <details className="panel panel-wide us-strikes-panel timeline-collapsible-panel">
          <summary>
            <h2>US strike events ({usStrikes.length})</h2>
            <span className="panel-summary-hint">Major US military actions in this dataset</span>
          </summary>
          <p className="panel-note">
            This Kaggle dataset includes major US military actions. What it lacks is granular data
            (exact sortie counts, munitions types, battle damage assessment).
          </p>
          <div className="us-strike-list">
            {usStrikes.map((e) => (
              <div className="us-strike-item" key={e.id}>
                <div className="us-strike-date">{e.date}</div>
                <div className="us-strike-title">{e.event}</div>
                <div className="us-strike-loc">{e.location}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {sorted.length === 0 ? (
        <div className="timeline-empty">
          No events match your search or filters. Try clearing the search or choosing &ldquo;All&rdquo;.
        </div>
      ) : (
        <div className="timeline">
          {sorted.map((event, index) => {
            const showYearHeader =
              index === 0 || sorted[index - 1].year !== event.year;
            return (
              <div key={event.id}>
                {showYearHeader && (
                  <div className="timeline-year-header" id={`year-${event.year}`}>
                    {event.year}
                  </div>
                )}
                <details className="timeline-event-details">
                  <summary className="timeline-event-summary">
                    <span className="timeline-marker" aria-hidden />
                    <span className="timeline-summary-main">
                      <span className="timeline-summary-meta">
                        <time>{event.date}</time>
                        <span className={eventBadgeClass(event.category)}>{event.category}</span>
                        {event.isUsStrike && <span className="badge badge-us-strike">US strike</span>}
                      </span>
                      <span className="timeline-summary-title">{event.event}</span>
                      <span className="timeline-summary-actors">{event.keyActors}</span>
                    </span>
                  </summary>
                  <div className="timeline-content">
                    <div className="timeline-actors">
                      <strong>Actors:</strong> {event.keyActors} · <strong>Location:</strong>{" "}
                      {event.location}
                    </div>
                    <p className="timeline-desc">{event.description}</p>
                    <p className="timeline-impact">
                      <strong>Impact:</strong> {event.impactOutcome}
                    </p>

                    {event.relatedStats && event.relatedStats.length > 0 && (
                      <div className="timeline-linked-stats">
                        <strong>Linked quantitative data (Feb–Mar 2026):</strong>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Country</th>
                                <th>Missiles</th>
                                <th>Drones</th>
                                <th>Deaths</th>
                              </tr>
                            </thead>
                            <tbody>
                              {event.relatedStats.map((r: ConflictRow) => (
                                <tr key={`${r.country}-${r.date}`}>
                                  <td>{r.date}</td>
                                  <td className={r.country === "Iran" ? "country-iran" : "country-israel"}>
                                    {r.country}
                                  </td>
                                  <td>{r.missileAttacks}</td>
                                  <td>{fmt(r.droneAttacks)}</td>
                                  <td>{r.deaths}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
