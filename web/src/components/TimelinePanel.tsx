import { useMemo } from "react";
import type { ConflictRow, TimelineEvent, TimelineStats } from "../types";

function eventBadgeClass(category: string): string {
  if (category.includes("US Military")) return "badge badge-us-strike";
  if (category.includes("Israel")) return "badge badge-israel-event";
  if (category.includes("Iran")) return "badge badge-iran-event";
  if (category === "Proxy Warfare") return "badge badge-proxy";
  if (category === "Diplomacy") return "badge badge-diplomacy";
  return "badge badge-event";
}

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
  const filtered = events.filter((e) => {
    if (filter === "All") return true;
    if (filter === "US strikes") return e.isUsStrike;
    if (filter === "US actions") return e.isUsAction;
    if (filter === "Iran") return e.involvesIran;
    if (filter === "Israel") return e.involvesIsrael;
    return e.category === filter;
  });

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.sortKey - a.sortKey || b.id - a.id),
    [filtered],
  );

  const usStrikes = useMemo(
    () => [...events].filter((e) => e.isUsStrike).sort((a, b) => b.sortKey - a.sortKey || b.id - a.id),
    [events],
  );

  return (
    <>
      <div className="timeline-intro">
        <p>
          Narrative context for attacks from{" "}
          <a
            href="https://www.kaggle.com/datasets/muhammadshayan5839/iran-usa-conflict-2023-2026"
            target="_blank"
            rel="noreferrer"
          >
            Kaggle — iran-usa-conflict-2023-2026
          </a>
          . This dataset describes <strong>{stats.totalEvents} events</strong> from Oct 2023–Apr 2026,
          including <strong>{stats.usStrikeEvents} documented US military strikes</strong>.
          It adds context and descriptions but does not include per-strike numeric counts — those
          come from the separate Iran–Israel statistics dataset on the Overview tab.
        </p>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Timeline events</div>
          <div className="kpi-value">{stats.totalEvents}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">US military strikes</div>
          <div className="kpi-value">{stats.usStrikeEvents}</div>
          <div className="kpi-sub">In this dataset</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Categories</div>
          <div className="kpi-value">{Object.keys(stats.byCategory).length}</div>
        </div>
      </div>

      {usStrikes.length > 0 && (
        <div className="panel panel-wide us-strikes-panel">
          <h2>US strike events in this dataset</h2>
          <p className="panel-note">
            Good news: you do not need a separate source for basic US strike coverage — this Kaggle
            dataset already includes major US military actions. What it lacks is granular data
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
        </div>
      )}

      <div className="filters">
        <div className="filter-group">
          <label htmlFor="timeline-filter">Show</label>
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
        <span className="filter-count">{filtered.length} events · newest first</span>
      </div>

      <div className="timeline">
        {sorted.map((event) => (
          <article className="timeline-event" key={event.id}>
            <div className="timeline-marker" />
            <div className="timeline-content">
              <div className="timeline-meta">
                <time>{event.date}</time>
                <span className={eventBadgeClass(event.category)}>{event.category}</span>
                {event.isUsStrike && <span className="badge badge-us-strike">US strike</span>}
              </div>
              <h3>{event.event}</h3>
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
          </article>
        ))}
      </div>
    </>
  );
}
