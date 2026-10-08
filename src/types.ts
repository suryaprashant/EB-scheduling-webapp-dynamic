export interface ChargeSession {
  id: string;
  bus: number;
  charger: number;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
}

export interface AllocationRequest {
  busNumber: number;
  arrivalTime: string; // "HH:mm" or "8:00 PM"
  arrivalSoc: number;  // 0 to 100
}

export interface AllocationResult {
  busNumber: number;
  arrivalMinute: number;
  arrivalSoc: number;
  allocatedCharger: number | null;
  pluginMinute: number | null;
  plugoutMinute: number | null;
  expectedSoc: number | null;
  statusText: string;
  chargingDurationMinutes: number;
  isMissedAndReallocated: boolean;
  sessionFound: boolean;
  isEarlyWaiting: boolean;
}

export interface ChargerSnapshot {
  chargerNumber: number;
  isIdle: boolean;
  activeSession: ChargeSession | null;
}
