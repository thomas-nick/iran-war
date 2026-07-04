import { useMemo, useState } from "react";
import type { IswStrike, IswSummary } from "../types";

const CONFIDENCE_LABELS: Record<string, string> = {
  confirmed: "Confirmed airstrike",
  reported: "Reported airstrike",
  partial: "Explosion w/ footage",
  unverified: "Explosion (no footage)",
  ad_activity: "Air defense activity",
  unknown: "Unknown",
};

interface IswStrikesPanelProps {
  strikes: IswStrike[];
  summary: IswSummary;
}

export function IswStrikesPanel({ strikes, summary }: IswStrikesPanelProps) {
  const [eventFilter, setEventFilter] = useState<string>("All");
  const [siteFilter, setSiteFilter] = useState<string>("All");
  const [showCount, setShowCount] = useState(40);

  const filtered = useMemo(() => {
    return strikes.filter((s) => {
      if (eventFilter !== "All" && s.eventType !== eventFilter) return false;
      if (siteFilter !== "All" && s.siteType !== siteFilter) return false;
      return true;
    });
  }, [strikes, eventFilter, siteFilter]);

  const visible = filtered.slice(0, showCount);

  const siteTypes = useMemo(
    () =>
      Object.entries(summary.bySiteType)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k),
    [summary.bySiteType],
  );

  return (
    <div className="isw-panel">
      <h2>ISW / CTP strike map cross-reference</h2>
      <p className="timeline-intro">
        Geolocated US & Israeli strikes on Iran from the{" "}
        <a href={summary.storyMapUrl} target="_blank" rel="noreferrer">
          ISW–CTP ArcGIS story map
        </a>{" "}
        ({summary.dateRange}). The underlying layer is a public ArcGIS FeatureServer — not listed on
        the story page, but discoverable from the web map metadata. {summary.sourceNote}
      </p>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">ISW strike points</div>
          <div className="kpi-value">{summary.totalPoints.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Confirmed</div>
          <div className="kpi-value">{summary.confirmedStrikes.toLocaleString()}</div>
          <div className="kpi-sub">Satellite / verified</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Reported</div>
          <div className="kpi-value">{summary.reportedStrikes.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Explosion w/ footage</div>
          <div className="kpi-value">{summary.explosionWithFootage.toLocaleString()}</div>
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label htmlFor="isw-event">Event type</label>
          <select id="isw-event" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            <option value="All">All ({summary.totalPoints})</option>
            {Object.entries(summary.byEventType).map(([type, count]) => (
              <option key={type} value={type}>
                {type ?? "Unknown"} ({count})
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="isw-site">Site type</label>
          <select id="isw-site" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="All">All sites</option>
            {siteTypes.map((st) => (
              <option key={st} value={st}>
                {st} ({summary.bySiteType[st]})
              </option>
            ))}
          </select>
        </div>
        <span className="filter-count">{filtered.length} points · newest first</span>
      </div>

      <div className="isw-strikes-list">
        {visible.map((strike) => (
          <article className="isw-strike-card" key={strike.id}>
            <div className="coalition-strike-header">
              <time>{strike.date ?? "—"} {strike.timeLocal && `· ${strike.timeLocal}`}</time>
              <span className={`badge confidence-${strike.confidence}`}>{strike.confidence}</span>
              {strike.siteType && <span className="badge badge-event">{strike.siteType}</span>}
            </div>
            <h3>{strike.targetSite ?? "Unnamed site"}</h3>
            <p className="timeline-actors">
              {strike.location}
              {strike.eventType && <> · {CONFIDENCE_LABELS[strike.confidence] ?? strike.eventType}</>}
            </p>
            {strike.description && <p className="timeline-desc">{strike.description}</p>}
          </article>
        ))}
      </div>

      {showCount < filtered.length && (
        <button type="button" className="export-btn" onClick={() => setShowCount((n) => n + 40)}>
          Load more ({filtered.length - showCount} remaining)
        </button>
      )}
    </div>
  );
}
