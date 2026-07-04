import type { CoalitionStrike, CoalitionSummary } from "../types";

interface CoalitionStrikesPanelProps {
  strikes: CoalitionStrike[];
  summary: CoalitionSummary;
}

export function CoalitionStrikesPanel({ strikes, summary }: CoalitionStrikesPanelProps) {
  const usStrikes = strikes.filter((s) => s.actor.includes("United States"));

  return (
    <div className="coalition-panel">
      <h2>US & coalition strikes on Iran</h2>

      <div className="data-gap-banner">
        <strong>Data coverage gap:</strong> {summary.iranAttackWaves} documented Iranian attack waves vs{" "}
        {summary.executedStrikes} coalition strike records on Iran ({summary.ratioWavesToCoalition}:1 ratio).
        {" "}{summary.dataGapNote}
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Coalition records</div>
          <div className="kpi-value">{summary.totalRecords}</div>
          <div className="kpi-sub">{summary.executedStrikes} executed · {summary.totalRecords - summary.executedStrikes} threat</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">US-involved</div>
          <div className="kpi-value">{summary.usInvolvedStrikes}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Israel-involved</div>
          <div className="kpi-value">{summary.israelStrikes}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">ISW geolocated</div>
          <div className="kpi-value">{summary.iswStrikePoints.toLocaleString()}</div>
          <div className="kpi-sub">{summary.iswConfirmedStrikes} confirmed</div>
        </div>
      </div>

      <div className="coalition-strikes-list">
        {strikes.map((strike) => (
          <article className="coalition-strike-card" key={strike.id}>
            <div className="coalition-strike-header">
              <time>{strike.dateLabel}</time>
              <span className={`badge confidence-${strike.confidence}`}>{strike.confidence}</span>
              <span className="badge badge-us-strike">{strike.actor}</span>
            </div>
            <h3>{strike.operation}</h3>
            <p className="timeline-actors">{strike.location} · {strike.category}</p>
            <p className="timeline-desc">{strike.description}</p>
            <p className="timeline-actors"><strong>Targets:</strong> {strike.targets}</p>

            <div className="coalition-weapons-grid">
              <div>
                <strong>Weapons reported</strong>
                <ul className="system-list">
                  {strike.weaponsReported.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Platforms reported</strong>
                <ul className="system-list">
                  {strike.platformsReported.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>

            {strike.aircraftMatches.length > 0 && (
              <div className="aircraft-matches">
                <strong>OSINT aircraft reference</strong>
                <div className="aircraft-grid">
                  {strike.aircraftMatches.map((a) => (
                    <div className="aircraft-card" key={a.id}>
                      <div className="aircraft-card-header">
                        <span className="aircraft-name">{a.systemName}</span>
                        <span className="aircraft-op">{a.operator}</span>
                      </div>
                      {a.combatRadiusKm != null && (
                        <div className="aircraft-stat">Combat radius: {a.combatRadiusKm.toLocaleString()} km</div>
                      )}
                      {a.airToGround.length > 0 && (
                        <div className="aircraft-stat">
                          Air-to-ground: {a.airToGround.slice(0, 5).join(", ")}
                        </div>
                      )}
                      {a.roleInOperations && (
                        <p className="aircraft-role">{a.roleInOperations}</p>
                      )}
                      {a.sourceUrl && (
                        <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="aircraft-link">
                          Source
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {strike.inventoryMatches.length > 0 && (
              <div className="osint-weapons">
                <strong>GlobalMilitary.net missile matches:</strong>
                <ul className="system-list">
                  {strike.inventoryMatches.map((m) => (
                    <li key={m.name}>
                      {m.reported} →{" "}
                      <a href={m.sourceUrl} target="_blank" rel="noreferrer">{m.name}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {strike.sourceNote && (
              <p className="timeline-impact"><em>{strike.sourceNote}</em></p>
            )}
          </article>
        ))}
      </div>

      <p className="panel-note" style={{ marginTop: "1rem" }}>
        {usStrikes.length} records involve the United States. Platforms like B-2 are not yet in the OSINT{" "}
        <code>coalition_aircraft.json</code> — only reported as text until added upstream.
      </p>
    </div>
  );
}
