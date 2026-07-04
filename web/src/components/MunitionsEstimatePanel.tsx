import type { MunitionsEstimates } from "../types";
import { formatEstimateRow } from "../lib/formatEstimate";

interface MunitionsEstimatePanelProps {
  estimates: MunitionsEstimates;
  compact?: boolean;
}

export function MunitionsEstimatePanel({ estimates, compact = false }: MunitionsEstimatePanelProps) {
  const { iran, coalition } = estimates;

  if (compact) {
    return (
      <div className="estimate-banner">
        <strong>Estimated munitions expended (guestimate):</strong>{" "}
        Iran launches {formatEstimateRow(iran)} · Coalition ordnance{" "}
        {formatEstimateRow(coalition)} ·{" "}
        <span className="estimate-note">Not official expenditure data</span>
      </div>
    );
  }

  return (
    <div className="panel panel-wide munitions-estimate-panel">
      <h2>Estimated munitions expended</h2>
      <p className="panel-note">{estimates.methodologyNote}</p>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Iran launches (OSINT)</div>
          <div className="kpi-value">{formatEstimateRow(iran)}</div>
          <div className="kpi-sub">
            best ~{iran.totalBest.toLocaleString()} · {iran.explicitWaveCount} waves w/ counts ·{" "}
            {iran.imputedWaveCount} imputed
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Coalition ordnance</div>
          <div className="kpi-value">{formatEstimateRow(coalition)}</div>
          <div className="kpi-sub">best ~{coalition.totalBest.toLocaleString()} · ISW + narratives</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Kaggle Iran events</div>
          <div className="kpi-value">{iran.kaggleMissileAttackEvents.toLocaleString()}</div>
          <div className="kpi-sub">Daily attack rows — not rounds fired</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Systems w/ estimates</div>
          <div className="kpi-value">{estimates.byInventorySystem.length}</div>
          <div className="kpi-sub">Cross-linked inventory matches</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="panel">
          <h3>Iran by operation</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Waves</th>
                  <th>Est. munitions</th>
                </tr>
              </thead>
              <tbody>
                {iran.byOperation.map((op) => (
                  <tr key={op.operation}>
                    <td>{op.label}</td>
                    <td>{op.waves}</td>
                    <td>{formatEstimateRow(op)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h3>By threat class (Iran)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Est. launched</th>
                </tr>
              </thead>
              <tbody>
                {iran.byThreatClass.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    <td>{formatEstimateRow(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "1rem" }}>
        <h3>Per inventory system (top matches)</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>System</th>
                <th>Side</th>
                <th>Est. use</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {estimates.byInventorySystem.slice(0, 20).map((row) => (
                <tr key={row.name}>
                  <td>
                    {row.sourceUrl ? (
                      <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                        {row.name}
                      </a>
                    ) : (
                      row.name
                    )}
                  </td>
                  <td>{row.side === "iran" ? "Iran" : "Coalition"}</td>
                  <td>{formatEstimateRow(row)}</td>
                  <td>{row.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
