import type { LineId } from './config';

// ---- TfL wire types (subset of fields we use) ----

export interface TflPrediction {
  id: string;
  vehicleId: string;
  naptanId: string;
  stationName: string;
  lineId: LineId;
  platformName: string;
  direction: 'inbound' | 'outbound' | '';
  destinationName?: string;
  timeToStation: number;
  currentLocation: string;
  towards: string;
  expectedArrival: string;
}

export interface TflStopPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface TflStopPointSequence {
  branchId: number;
  direction: string;
  stopPoint: TflStopPoint[];
}

export interface TflRouteSequence {
  lineId: LineId;
  direction: 'inbound' | 'outbound';
  stopPointSequences: TflStopPointSequence[];
}

export interface TflLineStatus {
  id: LineId;
  name: string;
  lineStatuses: {
    statusSeverity: number;
    statusSeverityDescription: string;
    reason?: string;
  }[];
}

// ---- Domain types ----

export type Direction = 'inbound' | 'outbound';

export interface Stop {
  naptanId: string;
  name: string;
  lngLat: [number, number];
}

export interface Branch {
  stops: Stop[];
  /** naptanId → position in stops */
  index: Map<string, number>;
  /** Estimated travel seconds for segment i → i+1. */
  segSeconds: number[];
}

export interface LineModel {
  id: LineId;
  color: string;
  directions: Record<Direction, Branch[]>;
  /** Normalised station name → naptanId, for matching currentLocation text. */
  nameToNaptan: Map<string, string>;
}

export interface NetworkModel {
  lines: Map<LineId, LineModel>;
  stations: Map<string, Stop>;
}

/** Where the estimator believes a train is, at poll time. */
export interface TrainTarget {
  key: string; // `${lineId}:${vehicleId}`
  lineId: LineId;
  from: [number, number];
  to: [number, number];
  fromName: string;
  toName: string;
  /** 0..1 along from→to at poll time. */
  progress: number;
  /** Estimated seconds to traverse the whole segment. */
  segSeconds: number;
  meta: {
    destination: string;
    currentLocation: string;
    timeToStation: number;
    towards: string;
  };
}

export type TrainState = 'entering' | 'live' | 'leaving';

/** A rendered train, tweened between polls. */
export interface Train {
  key: string;
  lineId: LineId;
  pos: [number, number];
  target: TrainTarget;
  /** Dead-reckoned progress, advances every frame up to 1. */
  progress: number;
  opacity: number;
  state: TrainState;
  missedPolls: number;
}

export interface EstimateResult {
  targets: TrainTarget[];
  /** Predictions with placeholder vehicle ids we can't track stably. */
  untracked: number;
  /** Live train count per line. */
  countsByLine: Map<LineId, number>;
}
