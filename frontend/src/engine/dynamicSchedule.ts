import type { ChargeSession } from '../types';

export interface GamsBusRow {
  bus: number;
  departure1: number;
  arrival1: number;
  departure2: number;
  arrival2: number;
  distance1: number;
  distance2: number;
}

export interface DynamicScheduleResult {
  sessions: ChargeSession[];
  warnings: string[];
  estimatedEnergyKwh: number;
  estimatedCost: number;
  optimizationStatus: 'optimal' | 'feasible_time_limit';
  mipGap: number | null;
}

interface GamsSolution {
  activeSlots: number[];
  objectiveValue: number;
  status: 'optimal' | 'feasible_time_limit';
  mipGap: number | null;
}

const TIME_SLOTS = 288;
const SLOT_MINUTES = 5;
const CHARGER_KW = 240;
const CHARGING_EFFICIENCY = 0.92;
const CHARGER_COUNT = 16;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

async function solveGamsModel(buses: GamsBusRow[]): Promise<GamsSolution> {
  const response = await fetch(`${API_BASE_URL}/api/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buses }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error ?? `Schedule optimization failed (HTTP ${response.status}).`);
  }
  return response.json() as Promise<GamsSolution>;
}

export async function buildDynamicSchedule(
  inputBuses: GamsBusRow[],
): Promise<DynamicScheduleResult> {
  const solution = await solveGamsModel(inputBuses);
  const slotsByBus = new Map<number, number[]>();
  for (const activeIndex of solution.activeSlots) {
    const bus = Math.floor(activeIndex / TIME_SLOTS) + 1;
    const slot = activeIndex % TIME_SLOTS + 1;
    const activeSlots = slotsByBus.get(bus) ?? [];
    activeSlots.push(slot);
    slotsByBus.set(bus, activeSlots);
  }

  const runs: Array<{ bus: number; startMinute: number; endMinute: number }> = [];
  for (const [bus, slots] of slotsByBus) {
    slots.sort((a, b) => a - b);
    let startSlot = slots[0];
    let previousSlot = slots[0];
    for (const slot of slots.slice(1)) {
      if (slot !== previousSlot + 1) {
        runs.push({
          bus,
          startMinute: (startSlot - 1) * SLOT_MINUTES,
          endMinute: previousSlot * SLOT_MINUTES,
        });
        startSlot = slot;
      }
      previousSlot = slot;
    }
    runs.push({
      bus,
      startMinute: (startSlot - 1) * SLOT_MINUTES,
      endMinute: previousSlot * SLOT_MINUTES,
    });
  }

  runs.sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      a.endMinute - b.endMinute ||
      a.bus - b.bus,
  );

  const chargerAvailableAt = Array<number>(CHARGER_COUNT).fill(0);
  const sessions: ChargeSession[] = runs.map(run => {
    const chargerIndex = chargerAvailableAt.findIndex(
      availableAt => availableAt <= run.startMinute,
    );
    if (chargerIndex === -1) {
      throw new Error(
        `Cannot assign a physical charger to Bus ${run.bus} at minute ${run.startMinute}: ` +
        `the optimized schedule exceeds the ${CHARGER_COUNT}-charger limit.`,
      );
    }
    const charger = chargerIndex + 1;
    chargerAvailableAt[chargerIndex] = run.endMinute;
    return {
      id: `gams-bus-${run.bus}-charger-${charger}-start-${run.startMinute}`,
      bus: run.bus,
      charger,
      startMinute: run.startMinute,
      endMinute: run.endMinute,
      durationMinutes: run.endMinute - run.startMinute,
    };
  });

  sessions.sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      a.charger - b.charger ||
      a.bus - b.bus,
  );

  return {
    sessions,
    warnings: [],
    estimatedEnergyKwh:
      solution.activeSlots.length * CHARGER_KW * SLOT_MINUTES * CHARGING_EFFICIENCY / 60,
    estimatedCost: solution.objectiveValue,
    optimizationStatus: solution.status,
    mipGap: solution.mipGap,
  };
}
