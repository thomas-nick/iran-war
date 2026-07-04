export interface EstimateBand {
  low: number;
  high: number;
  best: number;
  confidence?: string;
}

export function formatEstimateBand(est: EstimateBand): string {
  if (est.low === est.high) return est.best.toLocaleString();
  return `~${est.low.toLocaleString()}–${est.high.toLocaleString()}`;
}

export function formatEstimateRow(row: {
  low?: number;
  high?: number;
  best?: number;
  estimatedLow?: number;
  estimatedHigh?: number;
  estimatedBest?: number;
  totalLow?: number;
  totalHigh?: number;
  totalBest?: number;
}): string {
  const low = row.low ?? row.estimatedLow ?? row.totalLow ?? 0;
  const high = row.high ?? row.estimatedHigh ?? row.totalHigh ?? 0;
  const best = row.best ?? row.estimatedBest ?? row.totalBest ?? low;
  return formatEstimateBand({ low, high, best });
}

export function formatEstimateBest(est: EstimateBand): string {
  return `~${est.best.toLocaleString()}`;
}
