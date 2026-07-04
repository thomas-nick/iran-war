export interface ConflictRow {
  country: string;
  date: string;
  missileAttacks: number;
  droneAttacks: number | null;
  deaths: number;
  injuries: number | null;
  civilianDeaths: number;
  militaryDeaths: number;
  infrastructureDamage: number;
}

export interface TimelineEvent {
  id: number;
  date: string;
  year: number;
  event: string;
  category: string;
  keyActors: string;
  location: string;
  description: string;
  impactOutcome: string;
  sortKey: number;
  isUsAction: boolean;
  isUsStrike: boolean;
  involvesIran: boolean;
  involvesIsrael: boolean;
  involvesUs: boolean;
  relatedStats?: ConflictRow[];
}

export interface TimelineStats {
  totalEvents: number;
  usStrikeEvents: number;
  usStrikeNames: string[];
  byCategory: Record<string, number>;
}

export interface OsintWave {
  id: string;
  operation: string;
  operationLabel: string;
  waveNumber: number | null;
  sequence: number | null;
  codenameEnglish: string | null;
  description: string | null;
  launchTimeUtc: string | null;
  conflictDay: number | null;
  launchLat?: number | null;
  launchLon?: number | null;
  launchSiteDesc?: string | null;
  targetLat?: number | null;
  targetLon?: number | null;
  payload: string | null;
  weaponTypes: string[];
  ballisticUsed: boolean | null;
  cruiseUsed: boolean | null;
  dronesUsed: boolean | null;
  clusterWarhead: boolean | null;
  munitionsCount: number | null;
  munitionsTargetingIsrael: number | null;
  munitionsTargetingUsBases: number | null;
  israelTargeted: boolean | null;
  usBasesTargeted: boolean | null;
  targets: string | null;
  landingsCountries: string[];
  usBases: string[];
  intercepted: boolean | null;
  interceptionSystems: string[];
  interceptRate: number | null;
  interceptCount: number | null;
  interceptionReport?: string | null;
  threatClasses?: string[];
  primaryThreatClass?: string;
  interceptedByUs: boolean | null;
  fatalities: number | null;
  injuries: number | null;
  damage: string | null;
  idfStatement: string | null;
  sourceUrls: string[];
  inventoryMatches: { label: string; name: string; sourceUrl: string }[];
  estimatedMunitions?: {
    low: number;
    high: number;
    best: number;
    confidence: string;
    source: string;
  };
}

export interface ThreatClassIntercept {
  id: string;
  label: string;
  waves: number;
  munitionsLaunched: number | null;
  officialRateAvg: number | null;
  parsedRateAvg: number | null;
  contestedRateEst: number;
  notes: string[];
}

export interface InterceptAnalytics {
  wavesWithExplicitRate: number;
  wavesWithMunitionsCount: number;
  wavesWithInterceptCount: number;
  interceptedWaveCount: number;
  notInterceptedWaveCount: number;
  unknownInterceptStatus: number;
  waveInterceptSuccessRate: number | null;
  meanExplicitRate: number | null;
  munitionsWeightedRate: number | null;
  idfStatementRates: number[];
  meanIdfStatementRate: number | null;
  contestedOverallRate: number;
  byThreatClass: ThreatClassIntercept[];
  totalMunitionsReported: number;
  totalInterceptCountReported: number;
  byOperation: Record<
    string,
    {
      label: string;
      waves: number;
      interceptedTrue: number;
      interceptedKnown: number;
      waveSuccessRate: number | null;
      meanExplicitRate: number | null;
      munitionsReported: number;
    }
  >;
  methodologyNote: string;
}

export interface OsintSummary {
  totalWaves: number;
  usBaseTargetedWaves: number;
  israelTargetedWaves: number;
  byOperation: Record<string, number>;
  weaponTypeCounts: Record<string, number>;
  totalFatalities: number;
  totalInjuries: number;
  interceptAnalytics: InterceptAnalytics;
}

export interface CoalitionStrike {
  id: string;
  date: string;
  dateLabel: string;
  operation: string;
  actor: string;
  category: string;
  location: string;
  lat: number;
  lon: number;
  targets: string;
  description: string;
  weaponsReported: string[];
  platformsReported: string[];
  platformIds?: string[];
  confidence: string;
  sources?: string[];
  sourceNote?: string;
  inventoryMatches: { reported: string; name: string; sourceUrl: string }[];
  aircraftMatches: AircraftMatch[];
}

export interface AircraftMatch {
  id: string;
  systemName: string;
  operator?: string;
  type?: string;
  combatRadiusKm?: number;
  maxSpeedMach?: number;
  airToGround: string[];
  roleInOperations?: string;
  keyFeatures?: string[];
  sourceUrl?: string | null;
}

export interface CoalitionSummary {
  totalRecords: number;
  executedStrikes: number;
  usInvolvedStrikes: number;
  israelStrikes: number;
  iranAttackWaves: number;
  ratioWavesToCoalition: number;
  iswStrikePoints: number;
  iswConfirmedStrikes: number;
  dataGapNote: string;
}

export interface IswStrike {
  id: string;
  objectId: number;
  date: string | null;
  timeLocal: string | null;
  actor: string;
  targetSite: string | null;
  eventType: string | null;
  confidence: string;
  siteType: string;
  city: string;
  province: string;
  neighborhood: string | null;
  location: string;
  description: string | null;
  lat: number;
  lon: number;
  source: string;
  sourceUrl: string;
}

export interface IswSummary {
  totalPoints: number;
  confirmedStrikes: number;
  reportedStrikes: number;
  explosionWithFootage: number;
  byEventType: Record<string, number>;
  bySiteType: Record<string, number>;
  dateRange: string;
  sourceNote: string;
  storyMapUrl: string;
}

export interface MapMarker {
  id: string;
  type: "us_base" | "israeli_target" | "coalition_strike" | "isw_strike";
  name: string;
  lat: number;
  lon: number;
  label: string;
  actor?: string;
  date?: string;
  weapons?: string[];
  confidence?: string;
  eventType?: string;
  siteType?: string;
  description?: string;
}

export interface MapArc {
  id: string;
  type: string;
  operation: string;
  waveNumber: number;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  usBasesTargeted: boolean;
  payload?: string;
  launchTimeUtc?: string;
}

export interface MapData {
  markers: MapMarker[];
  arcs: MapArc[];
  arcCount: number;
  markerCount: number;
}

export interface GeoJsonCollection {
  type: "FeatureCollection";
  metadata: { generated: string; featureCount: number; layers: string[] };
  features: unknown[];
}

export interface InfographicEvent {
  id: string;
  kind: "narrative" | "iran_wave" | "coalition_strike";
  sortKey: string;
  dateLabel: string;
  year: number;
  title: string;
  subtitle: string;
  lane: number;
  isUsStrike?: boolean;
  usTargeted?: boolean;
  weapons?: string[];
  confidence?: string;
}

export interface EstimateBand {
  low: number;
  high: number;
  best: number;
  confidence?: string;
}

export interface MunitionsEstimates {
  methodologyNote: string;
  iran: {
    totalLow: number;
    totalHigh: number;
    totalBest: number;
    explicitWaveCount: number;
    parsedWaveCount: number;
    imputedWaveCount: number;
    kaggleMissileAttackEvents: number;
    byOperation: Array<{
      operation: string;
      label: string;
      waves: number;
      low: number;
      high: number;
      best: number;
      explicitWaves: number;
    }>;
    byThreatClass: Array<{
      id: string;
      label: string;
      low: number;
      high: number;
      best: number;
    }>;
    byWeaponType: Array<{
      name: string;
      inventoryName: string | null;
      side: string;
      waveAppearances: number;
      estimatedLow: number;
      estimatedHigh: number;
      estimatedBest: number;
      confidence: string;
      sourceUrl?: string;
      notes?: string;
    }>;
  };
  coalition: {
    totalLow: number;
    totalHigh: number;
    totalBest: number;
    kaggleMissileAttackEvents: number;
    anchors: Array<{
      label: string;
      date?: string;
      low: number;
      high: number;
      best: number;
      source: string;
    }>;
    byWeaponSystem: Array<{
      name: string;
      mentionWeight: number;
      estimatedLow: number;
      estimatedHigh: number;
      estimatedBest: number;
      confidence: string;
      sourceUrl?: string;
      notes?: string;
    }>;
  };
  byInventorySystem: Array<{
    name: string;
    side: "iran" | "coalition";
    estimatedLow: number;
    estimatedHigh: number;
    estimatedBest: number;
    confidence: string;
    sourceUrl?: string;
    notes?: string[];
  }>;
}

export interface Missile {
  name: string;
  countries: string[];
  category:
    | "Ballistic"
    | "Cruise"
    | "Air-to-Surface"
    | "Guided Bomb"
    | "Glide Bomb"
    | "Penetration Bomb"
    | "Unguided Bomb";
  rangeKm: number | null;
  rangeText: string;
  maxSpeedMach: number | null;
  maxSpeedText: string;
  sourceUrl: string;
  sourceSite: string;
  inventoryKind?: "missile" | "bomb";
  estimatedUse?: EstimateBand;
}

export interface CategorySummary {
  country: string;
  category: string;
  inventoryCount: number;
  maxRangeKm: number | null;
  avgRangeKm: number | null;
  reportedMissileAttacks: number;
  systems: string[];
}

export interface DashboardData {
  meta: {
    conflictSource: string;
    timelineSource: string;
    osintSource: string;
    coalitionStrikesSource?: string;
    iswSource?: string;
    iswStoryMapUrl?: string;
    geojsonPath?: string;
    missileSource: string;
    bombCatalogUrl?: string;
    missileSeedDate: string;
    categories: string[];
  };
  conflict: ConflictRow[];
  timeline: TimelineEvent[];
  timelineStats: TimelineStats;
  osintWaves: OsintWave[];
  osintSummary: OsintSummary;
  coalitionStrikes: CoalitionStrike[];
  coalitionSummary: CoalitionSummary;
  iswStrikes: IswStrike[];
  iswSummary: IswSummary;
  mapData: MapData;
  geojson?: GeoJsonCollection;
  infographicEvents: InfographicEvent[];
  missiles: Missile[];
  munitionsEstimates?: MunitionsEstimates;
  crossReference: {
    inventoryByCountry: Record<string, Missile[]>;
    conflictTotals: Record<string, {
      missileAttacks: number;
      droneAttacks: number;
      deaths: number;
      injuries: number;
    }>;
    categorySummary: CategorySummary[];
  };
}
