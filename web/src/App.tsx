import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { MunitionsEstimatePanel } from "./components/MunitionsEstimatePanel";
import { formatEstimateBand, formatEstimateRow } from "./lib/formatEstimate";
import { TimelinePanel } from "./components/TimelinePanel";
import { OsintWavesPanel } from "./components/OsintWavesPanel";
import { OperationsView } from "./components/OperationsView";
import { CurrentStatusPanel } from "./components/CurrentStatusPanel";
import type { CategorySummary, DashboardData, Missile } from "./types";

const COUNTRY_COLORS: Record<string, string> = {
  Iran: "#c0392b",
  Israel: "#2980b9",
};

const CATEGORY_COLORS: Record<string, string> = {
  Ballistic: "#e67e22",
  Cruise: "#9b59b6",
  "Air-to-Surface": "#1abc9c",
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function badgeClass(category: string): string {
  if (category === "Ballistic") return "badge badge-ballistic";
  if (category === "Cruise") return "badge badge-cruise";
  if (category === "Guided Bomb" || category === "Glide Bomb") return "badge badge-guided-bomb";
  if (category === "Penetration Bomb") return "badge badge-penetration";
  if (category === "Unguided Bomb") return "badge badge-unguided";
  return "badge badge-air";
}

function CrossReferencePanel({ summary }: { summary: CategorySummary[] }) {
  return (
    <div className="cross-ref-card">
      {summary.map((row) => (
        <div className="cross-ref-item" key={`${row.country}-${row.category}`}>
          <h3>
            <span className={row.country === "Iran" ? "country-iran" : "country-israel"}>
              {row.country}
            </span>
            {" · "}
            <span className={badgeClass(row.category)}>{row.category}</span>
          </h3>
          <div className="stat-row">
            <span>Known inventory (GlobalMilitary.net)</span>
            <span>{row.inventoryCount} systems</span>
          </div>
          <div className="stat-row">
            <span>Max range</span>
            <span>{row.maxRangeKm != null ? `${fmt(row.maxRangeKm)} km` : "—"}</span>
          </div>
          <div className="stat-row">
            <span>Reported missile attacks (Kaggle)</span>
            <span>{fmt(row.reportedMissileAttacks)}</span>
          </div>
          {row.systems.length > 0 ? (
            <ul className="system-list">
              {row.systems.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: "0.5rem" }}>
              No {row.category.toLowerCase()} systems listed for {row.country} in the reference database.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function MissileInventoryTable({ missiles, country }: { missiles: Missile[]; country: string }) {
  const filtered = missiles.filter((m) => m.countries.includes(country));
  if (filtered.length === 0) {
    return <p style={{ color: "var(--muted)" }}>No matching systems.</p>;
  }
  const withEst = filtered.filter((m) => m.estimatedUse);
  return (
    <>
      {withEst.length > 0 && (
        <p className="panel-note" style={{ marginBottom: "0.75rem" }}>
          {withEst.length} systems have guestimated use counts from OSINT/coalition cross-reference.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>System</th>
              <th>Category</th>
              <th>Est. use</th>
              <th>Range</th>
              <th>Max speed</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={`${m.name}-${m.category}`}>
                <td>{m.name}</td>
                <td><span className={badgeClass(m.category)}>{m.category}</span></td>
                <td className="estimate-cell">
                  {m.estimatedUse ? formatEstimateBand(m.estimatedUse) : "—"}
                </td>
                <td>{m.rangeText || "—"}</td>
                <td>{m.maxSpeedText || "—"}</td>
                <td>
                  <a href={m.sourceUrl} target="_blank" rel="noreferrer">GlobalMilitary</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "timeline" | "osint" | "operations" | "crossref" | "inventory">("operations");
  const [countryFilter, setCountryFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [timelineFilter, setTimelineFilter] = useState<string>("All");
  const [osintOpFilter, setOsintOpFilter] = useState<string>("All");
  const [osintUsOnly, setOsintUsOnly] = useState(false);

  useEffect(() => {
    fetch("/data/dashboard.json")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load dashboard data");
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const filteredConflict = useMemo(() => {
    if (!data) return [];
    return data.conflict.filter((r) => countryFilter === "All" || r.country === countryFilter);
  }, [data, countryFilter]);

  const filteredMissiles = useMemo(() => {
    if (!data) return [];
    return data.missiles.filter((m) => {
      const countryOk =
        countryFilter === "All" ||
        m.countries.includes(countryFilter) ||
        (countryFilter === "Iran" && m.countries.includes("Iran")) ||
        (countryFilter === "Israel" && m.countries.includes("Israel"));
      const catOk = categoryFilter === "All" || m.category === categoryFilter;
      const conflictCountry =
        countryFilter === "All" ? true : m.countries.includes(countryFilter);
      return countryOk && catOk && (countryFilter === "All" || conflictCountry);
    });
  }, [data, countryFilter, categoryFilter]);

  const trendData = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {};
    for (const row of filteredConflict) {
      byDate[row.date] ??= {};
      byDate[row.date][`${row.country}_missile`] = row.missileAttacks;
      byDate[row.date][`${row.country}_drone`] = row.droneAttacks ?? 0;
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }, [filteredConflict]);

  const casualtyTrendData = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {};
    for (const row of filteredConflict) {
      byDate[row.date] ??= {};
      byDate[row.date][`${row.country}_deaths`] = row.deaths;
      byDate[row.date][`${row.country}_injuries`] = row.injuries ?? 0;
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }, [filteredConflict]);

  const conflictRollups = useMemo(() => {
    const countries =
      countryFilter === "All" ? (["Iran", "Israel"] as const) : ([countryFilter] as const);
    const byCountry = countries.map((c) => {
      const rows = filteredConflict.filter((r) => r.country === c);
      const civilian = rows.reduce((s, r) => s + r.civilianDeaths, 0);
      const military = rows.reduce((s, r) => s + r.militaryDeaths, 0);
      const deaths = rows.reduce((s, r) => s + r.deaths, 0);
      const injuries = rows.reduce((s, r) => s + (r.injuries ?? 0), 0);
      return { country: c, civilian, military, deaths, injuries, dates: rows.length };
    });
    return byCountry;
  }, [filteredConflict, countryFilter]);

  const categoryChartData = useMemo(() => {
    if (!data) return [];
    const countries = countryFilter === "All" ? ["Iran", "Israel"] : [countryFilter];
    return data.crossReference.categorySummary.filter((s) => countries.includes(s.country));
  }, [data, countryFilter]);

  const rangeScatter = useMemo(() => {
    return filteredMissiles
      .filter((m) => m.rangeKm != null && (m.countries.includes("Iran") || m.countries.includes("Israel")))
      .map((m) => ({
        name: m.name,
        rangeKm: m.rangeKm,
        speedMach: m.maxSpeedMach ?? 0,
        category: m.category,
        country: m.countries.find((c) => c === "Iran" || c === "Israel") ?? m.countries[0],
      }));
  }, [filteredMissiles]);

  if (error) return <div className="error">Error: {error}</div>;
  if (!data) return <div className="loading">Loading dashboard…</div>;

  const totals = { missileAttacks: 0, droneAttacks: 0, deaths: 0, injuries: 0 };
  for (const row of filteredConflict) {
    totals.missileAttacks += row.missileAttacks;
    totals.droneAttacks += row.droneAttacks ?? 0;
    totals.deaths += row.deaths;
    totals.injuries += row.injuries ?? 0;
  }

  const iranInventory = data.crossReference.inventoryByCountry.Iran ?? [];
  const israelInventory = data.crossReference.inventoryByCountry.Israel ?? [];

  return (
    <div className="app">
      <header className="header">
        <h1>Iran–Israel Conflict Dashboard</h1>
        <p>
          Cross-referencing Kaggle conflict statistics and a 2023–2026 event timeline with missile and
          bomb inventories from{" "}
          <a href="https://www.globalmilitary.net/missiles/category/ballistic/" target="_blank" rel="noreferrer">
            GlobalMilitary.net missiles
          </a>{" "}
          and{" "}
          <a href="https://www.globalmilitary.net/bombs/" target="_blank" rel="noreferrer">
            bombs
          </a>
          .
        </p>
      </header>

      {data.currentStatus && <CurrentStatusPanel status={data.currentStatus} />}

      <div className="tabs">
        {(
          [
            ["operations", "Map & timeline"],
            ["overview", "Conflict overview"],
            ["timeline", "Timeline & context"],
            ["osint", "Attack waves (OSINT)"],
            ["crossref", "Cross-reference"],
            ["inventory", "Missile inventory"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "timeline" && tab !== "osint" && tab !== "operations" && (
      <div className="filters">
        <div className="filter-group">
          <label htmlFor="country">Country</label>
          <select id="country" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
            <option value="All">All</option>
            <option value="Iran">Iran</option>
            <option value="Israel">Israel</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="category">Category</label>
          <select id="category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="All">All</option>
            {data.meta.categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>
      )}

      {tab === "timeline" && (
        <TimelinePanel
          events={data.timeline}
          stats={data.timelineStats}
          filter={timelineFilter}
          onFilterChange={setTimelineFilter}
        />
      )}

      {tab === "osint" && (
        <OsintWavesPanel
          waves={data.osintWaves}
          summary={data.osintSummary}
          munitionsEstimates={data.munitionsEstimates}
          operationFilter={osintOpFilter}
          onOperationFilterChange={setOsintOpFilter}
          usOnly={osintUsOnly}
          onUsOnlyChange={setOsintUsOnly}
        />
      )}

      {tab === "operations" && (
        <OperationsView
          mapData={data.mapData}
          infographicEvents={data.infographicEvents}
          coalitionStrikes={data.coalitionStrikes}
          coalitionSummary={data.coalitionSummary}
          iswStrikes={data.iswStrikes}
          iswSummary={data.iswSummary}
          missiles={data.missiles}
          munitionsEstimates={data.munitionsEstimates}
          geojsonPath={data.meta.geojsonPath}
        />
      )}

      {tab === "overview" && (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Missile attacks</div>
              <div className="kpi-value">{fmt(totals.missileAttacks)}</div>
              <div className="kpi-sub">Kaggle dataset</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Drone attacks</div>
              <div className="kpi-value">{fmt(totals.droneAttacks)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Deaths</div>
              <div className="kpi-value">{fmt(totals.deaths)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Injuries</div>
              <div className="kpi-value">{fmt(totals.injuries)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Iran inventory</div>
              <div className="kpi-value">{iranInventory.length}</div>
              <div className="kpi-sub">GlobalMilitary.net systems</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Israel inventory</div>
              <div className="kpi-value">{israelInventory.length}</div>
              <div className="kpi-sub">GlobalMilitary.net systems</div>
            </div>
          </div>

          {data.munitionsEstimates && (
            <>
              <div className="kpi-grid" style={{ marginTop: "1rem" }}>
                <div className="kpi">
                  <div className="kpi-label">Est. Iran launches</div>
                  <div className="kpi-value">{formatEstimateRow(data.munitionsEstimates.iran)}</div>
                  <div className="kpi-sub">OSINT guestimate · best ~{data.munitionsEstimates.iran.totalBest.toLocaleString()}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Est. coalition ordnance</div>
                  <div className="kpi-value">{formatEstimateRow(data.munitionsEstimates.coalition)}</div>
                  <div className="kpi-sub">ISW + strike narratives</div>
                </div>
              </div>
              <MunitionsEstimatePanel estimates={data.munitionsEstimates} />
            </>
          )}

          <div className="chart-grid">
            <div className="panel">
              <h2>Attack trends over time</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                  <XAxis dataKey="date" stroke="#8b9ab5" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#8b9ab5" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#1c2433", border: "1px solid #2a3548" }} />
                  <Legend />
                  <Line type="monotone" dataKey="Iran_missile" name="Iran missiles" stroke={COUNTRY_COLORS.Iran} strokeWidth={2} dot />
                  <Line type="monotone" dataKey="Israel_missile" name="Israel missiles" stroke={COUNTRY_COLORS.Israel} strokeWidth={2} dot />
                  <Line type="monotone" dataKey="Iran_drone" name="Iran drones" stroke={COUNTRY_COLORS.Iran} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="Israel_drone" name="Israel drones" stroke={COUNTRY_COLORS.Israel} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="panel">
              <h2>Casualty trends over time</h2>
              <p className="panel-note">Per-date values — matches each row in the table below.</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={casualtyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                  <XAxis dataKey="date" stroke="#8b9ab5" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#8b9ab5" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#1c2433", border: "1px solid #2a3548" }} />
                  <Legend />
                  <Line type="monotone" dataKey="Iran_deaths" name="Iran deaths" stroke={COUNTRY_COLORS.Iran} strokeWidth={2} dot />
                  <Line type="monotone" dataKey="Israel_deaths" name="Israel deaths" stroke={COUNTRY_COLORS.Israel} strokeWidth={2} dot />
                  <Line type="monotone" dataKey="Iran_injuries" name="Iran injuries" stroke={COUNTRY_COLORS.Iran} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="Israel_injuries" name="Israel injuries" stroke={COUNTRY_COLORS.Israel} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel panel-wide">
            <h2>Period totals by country</h2>
            <p className="panel-note">
              Sum of all rows in the table ({conflictRollups[0]?.dates ?? 0} reporting dates).
              Iran: 350+420+480+520 = 1,770 deaths · 11,000 injuries.
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={conflictRollups}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                <XAxis dataKey="country" stroke="#8b9ab5" />
                <YAxis stroke="#8b9ab5" />
                <Tooltip contentStyle={{ background: "#1c2433", border: "1px solid #2a3548" }} />
                <Legend />
                <Bar dataKey="civilian" name="Civilian deaths (total)" fill="#e67e22" />
                <Bar dataKey="military" name="Military deaths (total)" fill="#8e44ad" />
                <Bar dataKey="injuries" name="Injuries (total)" fill="#16a085" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel panel-wide">
            <h2>Conflict data table</h2>
            <p className="panel-note">One row per reporting date. KPI cards and period totals above sum these rows.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Country</th>
                    <th>Missiles</th>
                    <th>Drones</th>
                    <th>Deaths</th>
                    <th>Injuries</th>
                    <th>Infra. damage</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConflict.map((r) => (
                    <tr key={`${r.country}-${r.date}`}>
                      <td>{r.date}</td>
                      <td className={r.country === "Iran" ? "country-iran" : "country-israel"}>{r.country}</td>
                      <td>{r.missileAttacks}</td>
                      <td>{fmt(r.droneAttacks)}</td>
                      <td>{r.deaths}</td>
                      <td>{fmt(r.injuries)}</td>
                      <td>{r.infrastructureDamage}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {conflictRollups.map((rollup) => (
                    <tr key={`total-${rollup.country}`} className="table-total-row">
                      <td colSpan={2}>
                        <strong>Total — {rollup.country}</strong>
                      </td>
                      <td>—</td>
                      <td>—</td>
                      <td>{rollup.deaths.toLocaleString()}</td>
                      <td>{rollup.injuries.toLocaleString()}</td>
                      <td>—</td>
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "crossref" && (
        <>
          <p style={{ color: "var(--muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
            Side-by-side comparison of reported attack volumes (Kaggle) against known missile inventories
            by category (GlobalMilitary.net). Attack counts are aggregate totals, not per-system attribution.
          </p>
          <CrossReferencePanel summary={data.crossReference.categorySummary} />

          <div className="chart-grid">
            <div className="panel">
              <h2>Inventory count vs reported attacks by category</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryChartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                  <XAxis type="number" stroke="#8b9ab5" />
                  <YAxis type="category" dataKey="category" stroke="#8b9ab5" width={100} />
                  <Tooltip contentStyle={{ background: "#1c2433", border: "1px solid #2a3548" }} />
                  <Legend />
                  <Bar dataKey="inventoryCount" name="Known systems" fill="#5dade2" />
                  <Bar dataKey="reportedMissileAttacks" name="Reported attacks" fill="#c0392b" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="panel">
              <h2>Range profile — Iran & Israel systems</h2>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                  <XAxis type="number" dataKey="rangeKm" name="Range" unit=" km" stroke="#8b9ab5" />
                  <YAxis type="number" dataKey="speedMach" name="Speed" unit=" Mach" stroke="#8b9ab5" />
                  <ZAxis range={[60, 200]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ background: "#1c2433", border: "1px solid #2a3548" }}
                    formatter={(v: number, name: string) => [v, name]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                  />
                  <Legend />
                  {(["Ballistic", "Cruise", "Air-to-Surface"] as const).map((cat) => (
                    <Scatter
                      key={cat}
                      name={cat}
                      data={rangeScatter.filter((d) => d.category === cat)}
                      fill={CATEGORY_COLORS[cat]}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {tab === "inventory" && (
        <>
          {data.munitionsEstimates && (
            <MunitionsEstimatePanel estimates={data.munitionsEstimates} />
          )}

          <div className="chart-grid">
            <div className="panel">
              <h2><span className="country-iran">Iran</span> — {iranInventory.length} systems</h2>
              <MissileInventoryTable missiles={data.missiles} country="Iran" />
            </div>
            <div className="panel">
              <h2><span className="country-israel">Israel</span> — {israelInventory.length} systems</h2>
              <MissileInventoryTable missiles={data.missiles} country="Israel" />
            </div>
          </div>

          <div className="panel panel-wide" style={{ marginTop: "1rem" }}>
            <h2>All filtered systems ({filteredMissiles.length})</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>System</th>
                    <th>Operators</th>
                    <th>Category</th>
                    <th>Est. use</th>
                    <th>Range</th>
                    <th>Max speed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMissiles.map((m) => (
                    <tr key={`${m.name}-${m.category}`}>
                      <td><a href={m.sourceUrl} target="_blank" rel="noreferrer">{m.name}</a></td>
                      <td>{m.countries.join(", ")}</td>
                      <td><span className={badgeClass(m.category)}>{m.category}</span></td>
                      <td className="estimate-cell">{m.estimatedUse ? formatEstimateBand(m.estimatedUse) : "—"}</td>
                      <td>{m.rangeText}</td>
                      <td>{m.maxSpeedText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <footer className="footer">
        Conflict stats: {data.meta.conflictSource} · Timeline: {data.meta.timelineSource} ·
        OSINT waves: {data.meta.osintSource} · ISW strikes:{" "}
        <a href={data.meta.iswStoryMapUrl} target="_blank" rel="noreferrer">
          {data.meta.iswSource}
        </a>{" "}
        · Ordnance: {data.meta.missileSource}
        {data.meta.bombCatalogUrl && (
          <>
            {" "}
            (<a href={data.meta.bombCatalogUrl} target="_blank" rel="noreferrer">bombs catalog</a>)
          </>
        )}
      </footer>
    </div>
  );
}
