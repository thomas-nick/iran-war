import { useState } from "react";
import type { CoalitionStrike, CoalitionSummary, InfographicEvent, IswStrike, IswSummary, MapData, Missile, MunitionsEstimates } from "../types";
import { MunitionsEstimatePanel } from "./MunitionsEstimatePanel";
import { CoalitionMunitionsPanel } from "./CoalitionMunitionsPanel";
import { CoalitionStrikesPanel } from "./CoalitionStrikesPanel";
import { ConflictPlayback } from "./ConflictPlayback";
import { IswStrikesPanel } from "./IswStrikesPanel";

interface OperationsViewProps {
  mapData: MapData;
  infographicEvents: InfographicEvent[];
  coalitionStrikes: CoalitionStrike[];
  coalitionSummary: CoalitionSummary;
  iswStrikes: IswStrike[];
  iswSummary: IswSummary;
  missiles: Missile[];
  munitionsEstimates?: MunitionsEstimates;
  geojsonPath?: string;
}

export function OperationsView({
  mapData,
  infographicEvents,
  coalitionStrikes,
  coalitionSummary,
  iswStrikes,
  iswSummary,
  missiles,
  munitionsEstimates,
  geojsonPath = "/data/conflict.geojson",
}: OperationsViewProps) {
  const [showWaves, setShowWaves] = useState(true);
  const [showCoalition, setShowCoalition] = useState(true);
  const [showNarrative, setShowNarrative] = useState(true);

  return (
    <>
      <div className="timeline-intro">
        <p>
          Geographic view of Iranian attack arcs (OSINT launch → target coordinates), US base locations,
          and coalition strike points in Iran. Hit <strong>Play</strong> for a moving infographic — map
          arcs and timeline dots accumulate as the conflict unfolds.
        </p>
      </div>

      <div className="export-bar">
        <a className="export-btn" href={geojsonPath} download="conflict.geojson">
          Download GeoJSON ({mapData.arcCount} arcs + {mapData.markerCount} points)
        </a>
        <span className="export-hint">Use in QGIS, Mapbox, or kepler.gl</span>
      </div>

      {munitionsEstimates && <MunitionsEstimatePanel estimates={munitionsEstimates} compact />}

      <div className="infographic-controls filters">
        <span className="filter-group">Timeline layers:</span>
        <label><input type="checkbox" checked={showWaves} onChange={(e) => setShowWaves(e.target.checked)} /> Iran waves</label>
        <label><input type="checkbox" checked={showCoalition} onChange={(e) => setShowCoalition(e.target.checked)} /> Coalition strikes</label>
        <label><input type="checkbox" checked={showNarrative} onChange={(e) => setShowNarrative(e.target.checked)} /> Narrative events</label>
      </div>

      <ConflictPlayback
        mapData={mapData}
        events={infographicEvents}
        showWaves={showWaves}
        showCoalition={showCoalition}
        showNarrative={showNarrative}
      />

      <CoalitionMunitionsPanel missiles={missiles} />

      <IswStrikesPanel strikes={iswStrikes} summary={iswSummary} />

      <CoalitionStrikesPanel strikes={coalitionStrikes} summary={coalitionSummary} />
    </>
  );
}
