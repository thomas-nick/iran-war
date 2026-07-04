import type { CurrentStatus } from "../types";

function toneClass(tone: string): string {
  if (tone === "caution") return "status-indicator caution";
  if (tone === "positive") return "status-indicator positive";
  return "status-indicator";
}

interface CurrentStatusPanelProps {
  status: CurrentStatus;
}

export function CurrentStatusPanel({ status }: CurrentStatusPanelProps) {
  return (
    <section className="current-status" aria-labelledby="current-status-heading">
      <div className="current-status-header">
        <div>
          <p className="current-status-eyebrow">Current status · as of {status.asOf}</p>
          <h2 id="current-status-heading">{status.headline}</h2>
          <p className="current-status-phase">{status.phase}</p>
        </div>
      </div>

      <p className="current-status-summary">{status.summary}</p>

      <div className="status-indicator-grid">
        {status.indicators.map((item) => (
          <div className={toneClass(item.tone)} key={item.label}>
            <div className="status-indicator-label">{item.label}</div>
            <div className="status-indicator-value">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="current-status-columns">
        <div>
          <h3>What to watch</h3>
          <ul className="status-watch-list">
            {status.watchItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Sources</h3>
          <ul className="status-source-list">
            {status.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
