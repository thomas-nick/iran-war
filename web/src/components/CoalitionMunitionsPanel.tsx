import type { Missile } from "../types";

const COALITION_MUNITIONS_PRIORITY = [
  "GBU-31 JDAM",
  "GBU-38 JDAM",
  "GBU-39 SDB",
  "GBU-57 MOP",
  "BLU-109",
  "AGM-158 JASSM",
  "AGM-158B JASSM-ER",
  "AGM-88 HARM",
  "AGM-154 JSOW",
  "SPICE-2000",
  "Delilah",
  "Rampage",
  "BGM-109 TLAM Tomahawk",
  "AGM-84 SLAM-ER",
];

const COALITION_CATEGORIES = new Set([
  "Air-to-Surface",
  "Guided Bomb",
  "Glide Bomb",
  "Penetration Bomb",
]);

interface CoalitionMunitionsPanelProps {
  missiles: Missile[];
}

function munitionMeta(m: Missile): string {
  if (m.rangeKm != null) return `${m.rangeKm.toLocaleString()} km`;
  if (m.rangeText && m.rangeText !== "—") return m.rangeText;
  return m.category;
}

export function CoalitionMunitionsPanel({ missiles }: CoalitionMunitionsPanelProps) {
  const coalition = missiles.filter((m) => COALITION_CATEGORIES.has(m.category));
  const byName = new Map(coalition.map((m) => [m.name, m]));
  const featured = COALITION_MUNITIONS_PRIORITY.map((name) => byName.get(name)).filter(Boolean) as Missile[];
  const rest = coalition.filter((m) => !COALITION_MUNITIONS_PRIORITY.includes(m.name));
  const bombCount = coalition.filter((m) => m.inventoryKind === "bomb").length;

  return (
    <div className="panel panel-wide coalition-munitions-panel">
      <h2>Coalition air-to-surface munitions</h2>
      <p className="panel-note">
        GBU guided bombs, JASSM standoff missiles, and Israeli SPICE/Delilah/Rampage — cross-referenced
        from{" "}
        <a href="https://www.globalmilitary.net/missiles/" target="_blank" rel="noreferrer">
          GlobalMilitary.net missiles
        </a>{" "}
        and{" "}
        <a href="https://www.globalmilitary.net/bombs/" target="_blank" rel="noreferrer">
          bombs
        </a>
        . {bombCount} entries link to the bombs catalog; matched on coalition strike cards below.
      </p>
      <div className="munitions-grid">
        {featured.map((m) => (
          <a className="munition-card" key={m.name} href={m.sourceUrl} target="_blank" rel="noreferrer">
            <span className="munition-name">{m.name}</span>
            <span className="munition-meta">{m.countries.join(" · ")}</span>
            <span className="munition-range">
              {munitionMeta(m)}
              {m.maxSpeedText && m.maxSpeedText !== "—" ? ` · ${m.maxSpeedText}` : ""}
            </span>
            {m.inventoryKind === "bomb" && <span className="munition-kind">Bomb catalog</span>}
          </a>
        ))}
      </div>
      {rest.length > 0 && (
        <details className="munitions-more">
          <summary>{rest.length} more coalition munitions in inventory</summary>
          <ul className="system-list">
            {rest.map((m) => (
              <li key={m.name}>
                <a href={m.sourceUrl} target="_blank" rel="noreferrer">
                  {m.name}
                </a>{" "}
                ({m.countries.join(", ")})
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
