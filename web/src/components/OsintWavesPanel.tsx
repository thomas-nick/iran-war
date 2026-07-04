import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OsintSummary, OsintWave, MunitionsEstimates } from "../types";
import { formatEstimateBand, formatEstimateRow } from "../lib/formatEstimate";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

interface OsintWavesPanelProps {
  waves: OsintWave[];
  summary: OsintSummary;
  munitionsEstimates?: MunitionsEstimates;
  operationFilter: string;
  onOperationFilterChange: (value: string) => void;
  usOnly: boolean;
  onUsOnlyChange: (value: boolean) => void;
}

export function OsintWavesPanel({
  waves,
  summary,
  munitionsEstimates,
  operationFilter,
  onOperationFilterChange,
  usOnly,
  onUsOnlyChange,
}: OsintWavesPanelProps) {
  const filtered = waves.filter((w) => {
    if (operationFilter !== "All" && w.operation !== operationFilter) return false;
    if (usOnly && !w.usBasesTargeted) return false;
    return true;
  });

  const weaponChartData = Object.entries(summary.weaponTypeCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const munitionsChart = filtered
    .filter((w) => w.munitionsCount != null)
    .map((w) => ({
      label: `${w.operation?.toUpperCase()} W${w.waveNumber}`,
      count: w.munitionsCount as number,
    }));

  return (
    <>
      <div className="timeline-intro">
        <p>
          Wave-level OSINT from{" "}
          <a
            href="https://github.com/danielrosehill/Iran-Israel-War-2026-OSINT-Data"
            target="_blank"
            rel="noreferrer"
          >
            Daniel Rosehill&apos;s Iran-Israel-War-2026 dataset
          </a>
          . Each record is one attack wave with weapon types (Emad, Ghadr, Fattah, Shahed…),
          targets, interception details, and casualties — cross-linked to GlobalMilitary.net
          inventory where names match.
        </p>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Attack waves</div>
          <div className="kpi-value">{summary.totalWaves}</div>
          <div className="kpi-sub">TP1–TP4 (2024–2026)</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">US bases targeted</div>
          <div className="kpi-value">{summary.usBaseTargetedWaves}</div>
          <div className="kpi-sub">Waves with US base strikes</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">OSINT fatalities</div>
          <div className="kpi-value">{fmt(summary.totalFatalities)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">OSINT injuries</div>
          <div className="kpi-value">{fmt(summary.totalInjuries)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Est. munitions launched</div>
          <div className="kpi-value">
            {munitionsEstimates ? formatEstimateRow(munitionsEstimates.iran) : "—"}
          </div>
          <div className="kpi-sub">Guestimate from wave data</div>
        </div>
      </div>

      {summary.interceptAnalytics && (
        <div className="panel panel-wide intercept-panel">
          <h2>Interceptor rate estimates</h2>
          <p className="panel-note">{summary.interceptAnalytics.methodologyNote}</p>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Waves w/ explicit %</div>
              <div className="kpi-value">{summary.interceptAnalytics.wavesWithExplicitRate}</div>
              <div className="kpi-sub">of {summary.totalWaves} waves</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Mean explicit rate</div>
              <div className="kpi-value">
                {summary.interceptAnalytics.meanExplicitRate != null
                  ? `${summary.interceptAnalytics.meanExplicitRate}%`
                  : "—"}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Munitions-weighted</div>
              <div className="kpi-value">
                {summary.interceptAnalytics.munitionsWeightedRate != null
                  ? `${summary.interceptAnalytics.munitionsWeightedRate}%`
                  : "—"}
              </div>
              <div className="kpi-sub">Where rate + munitions both reported</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">IDF statement avg</div>
              <div className="kpi-value">
                {summary.interceptAnalytics.meanIdfStatementRate != null
                  ? `${summary.interceptAnalytics.meanIdfStatementRate}%`
                  : "—"}
              </div>
              <div className="kpi-sub">Parsed from official claims (TP1)</div>
            </div>
            <div className="kpi kpi-highlight">
              <div className="kpi-label">OSINT-adjusted overall</div>
              <div className="kpi-value">{summary.interceptAnalytics.contestedOverallRate}%</div>
              <div className="kpi-sub">Low-teens blend by threat class</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Threat class</th>
                  <th>Waves</th>
                  <th>Official avg</th>
                  <th>Parsed / OSINT</th>
                  <th>Contested est.</th>
                </tr>
              </thead>
              <tbody>
                {summary.interceptAnalytics.byThreatClass.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    <td>{row.waves}</td>
                    <td>{row.officialRateAvg != null ? `${row.officialRateAvg}%` : "—"}</td>
                    <td>{row.parsedRateAvg != null ? `${row.parsedRateAvg}%` : "—"}</td>
                    <td><strong>{row.contestedRateEst}%</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Waves</th>
                  <th>Intercepted (known)</th>
                  <th>Mean explicit %</th>
                  <th>Munitions reported</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.interceptAnalytics.byOperation).map(([op, row]) => (
                  <tr key={op}>
                    <td>{row.label}</td>
                    <td>{row.waves}</td>
                    <td>
                      {row.interceptedKnown
                        ? `${row.interceptedTrue}/${row.interceptedKnown}`
                        : "—"}
                    </td>
                    <td>{row.meanExplicitRate != null ? `${row.meanExplicitRate}%` : "—"}</td>
                    <td>{row.munitionsReported ? row.munitionsReported.toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="chart-grid">
        <div className="panel">
          <h2>Weapon systems used (wave count)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weaponChartData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
              <XAxis type="number" stroke="#8b9ab5" />
              <YAxis type="category" dataKey="name" stroke="#8b9ab5" width={110} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1c2433", border: "1px solid #2a3548" }} />
              <Bar dataKey="count" name="Waves" fill="#e67e22" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {munitionsChart.length > 0 && (
          <div className="panel">
            <h2>Estimated munitions per wave (where reported)</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={munitionsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                <XAxis dataKey="label" stroke="#8b9ab5" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
                <YAxis stroke="#8b9ab5" />
                <Tooltip contentStyle={{ background: "#1c2433", border: "1px solid #2a3548" }} />
                <Bar dataKey="count" name="Munitions" fill="#9b59b6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="filters">
        <div className="filter-group">
          <label htmlFor="osint-op">Operation</label>
          <select
            id="osint-op"
            value={operationFilter}
            onChange={(e) => onOperationFilterChange(e.target.value)}
          >
            <option value="All">All operations</option>
            {Object.entries(summary.byOperation).map(([op, count]) => (
              <option key={op} value={op}>
                {op.toUpperCase()} ({count} waves)
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>
            <input
              type="checkbox"
              checked={usOnly}
              onChange={(e) => onUsOnlyChange(e.target.checked)}
            />{" "}
            US bases targeted only
          </label>
        </div>
        <span className="filter-count">{filtered.length} waves · newest first</span>
      </div>

      <div className="osint-waves-list">
        {filtered.map((wave) => (
          <article className="osint-wave-card" key={wave.id}>
            <div className="osint-wave-header">
              <div>
                <span className="badge badge-event">{wave.operationLabel}</span>
                <span className="osint-wave-num">Wave {wave.waveNumber ?? wave.sequence}</span>
                {wave.codenameEnglish && (
                  <span className="osint-codename">{wave.codenameEnglish}</span>
                )}
                {wave.threatClasses && wave.threatClasses.length > 0 && (
                  <span className="badge badge-threat">{wave.threatClasses.join(" · ")}</span>
                )}
              </div>
              <time>{fmtDate(wave.launchTimeUtc)}</time>
            </div>

            {wave.description && <p className="timeline-desc">{wave.description}</p>}
            {wave.payload && (
              <p className="osint-payload">
                <strong>Payload:</strong> {wave.payload}
              </p>
            )}

            <div className="osint-tags">
              {wave.ballisticUsed && <span className="badge badge-ballistic">Ballistic</span>}
              {wave.cruiseUsed && <span className="badge badge-cruise">Cruise</span>}
              {wave.dronesUsed && <span className="badge badge-proxy">Drones</span>}
              {wave.clusterWarhead && <span className="badge badge-iran-event">Cluster warhead</span>}
              {wave.israelTargeted && <span className="badge badge-israel-event">Israel targeted</span>}
              {wave.usBasesTargeted && <span className="badge badge-us-strike">US bases targeted</span>}
              {wave.interceptedByUs && <span className="badge badge-us-strike">US intercepted</span>}
            </div>

            {wave.weaponTypes.length > 0 && (
              <div className="osint-weapons">
                <strong>Systems:</strong> {wave.weaponTypes.join(", ")}
                {wave.inventoryMatches.length > 0 && (
                  <ul className="system-list">
                    {wave.inventoryMatches.map((m) => (
                      <li key={m.name}>
                        {m.label} →{" "}
                        <a href={m.sourceUrl} target="_blank" rel="noreferrer">
                          {m.name}
                        </a>{" "}
                        (GlobalMilitary.net)
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {wave.targets && (
              <p className="timeline-actors">
                <strong>Targets:</strong> {wave.targets}
              </p>
            )}

            <div className="osint-stats-row">
              {wave.munitionsCount != null && (
                <span>Munitions (reported): {fmt(wave.munitionsCount)}</span>
              )}
              {wave.estimatedMunitions && (
                <span className="estimate-tag">
                  Est: {formatEstimateBand(wave.estimatedMunitions)} ({wave.estimatedMunitions.confidence})
                </span>
              )}
              {wave.munitionsTargetingUsBases != null && wave.munitionsTargetingUsBases > 0 && (
                <span>→ US bases: {fmt(wave.munitionsTargetingUsBases)}</span>
              )}
              {wave.interceptionSystems.length > 0 && (
                <span>Intercept: {wave.interceptionSystems.join(", ")}</span>
              )}
              {wave.interceptRate != null && <span>Rate: {wave.interceptRate}%</span>}
              {wave.interceptCount != null && <span>Intercept count: {fmt(wave.interceptCount)}</span>}
              {wave.fatalities != null && <span>Fatalities: {wave.fatalities}</span>}
              {wave.injuries != null && <span>Injuries: {wave.injuries}</span>}
            </div>

            {wave.damage && (
              <p className="timeline-impact">
                <strong>Damage:</strong> {wave.damage}
              </p>
            )}
            {wave.idfStatement && (
              <p className="timeline-impact">
                <strong>IDF:</strong> {wave.idfStatement}
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
