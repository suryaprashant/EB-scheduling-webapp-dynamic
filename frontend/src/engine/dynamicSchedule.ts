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
  finalSocByBus: Record<number, number>;
  objectiveValue: number;
  status: 'optimal' | 'feasible_time_limit';
  mipGap: number | null;
}

interface ScheduleJobResponse {
  status: 'running' | 'completed' | 'failed' | 'not_found';
  jobId?: string;
  result?: GamsSolution;
  error?: string;
}

const TIME_SLOTS = 288;
const SLOT_MINUTES = 5;
const SCHEDULE_START_MINUTES = 4 * 60;
const CHARGER_KW = 240;
const CHARGING_EFFICIENCY = 0.92;
const CHARGER_COUNT = 20;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

async function readApiError(response: Response): Promise<string> {
  const error = await response.json().catch(() => null) as { error?: string } | null;
  return error?.error ?? `Schedule optimization failed (HTTP ${response.status}).`;
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Schedule polling was cancelled.', 'AbortError'));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Schedule polling was cancelled.', 'AbortError'));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 2000);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchJobStatus(jobId: string, signal: AbortSignal): Promise<Response> {
  const retryDelays = [0, 2000, 4000, 8000, 12000];
  let lastError: unknown;

  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Schedule polling was cancelled.', 'AbortError'));
          return;
        }
        const timeout = window.setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, retryDelays[attempt]);
        const onAbort = () => {
          window.clearTimeout(timeout);
          reject(new DOMException('Schedule polling was cancelled.', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/schedule/${encodeURIComponent(jobId)}`,
        { signal },
      );
      if (![502, 503, 504].includes(response.status) || attempt === retryDelays.length - 1) {
        return response;
      }
      lastError = new Error(`The API temporarily returned HTTP ${response.status}.`);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw error;
      }
      lastError = error;
    }
  }

  throw new Error(
    `Could not reconnect to the optimization API to check job ${jobId}. ` +
    `The backend may have restarted; check its hosting logs and memory. ` +
    `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function solveGamsModel(
  buses: GamsBusRow[],
  signal: AbortSignal,
): Promise<GamsSolution> {
  const response = await fetch(`${API_BASE_URL}/api/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buses }),
    signal,
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  let job = await response.json() as ScheduleJobResponse;
  if (job.status === 'completed' && job.result) return job.result;
  if (!job.jobId || job.status !== 'running') {
    throw new Error(job.error ?? 'The optimization API returned an invalid job response.');
  }
  const jobId = job.jobId;

  while (true) {
    await waitForPoll(signal);
    const statusResponse = await fetchJobStatus(jobId, signal);
    if (!statusResponse.ok) {
      throw new Error(await readApiError(statusResponse));
    }
    job = await statusResponse.json() as ScheduleJobResponse;
    if (job.status === 'completed' && job.result) return job.result;
    if (job.status === 'failed' || job.status === 'not_found') {
      throw new Error(job.error ?? 'The optimization job is no longer available.');
    }
    if (job.status !== 'running') {
      throw new Error('The optimization API returned an invalid job status.');
    }
  }
}

export async function buildDynamicSchedule(
  inputBuses: GamsBusRow[],
  signal: AbortSignal,
): Promise<DynamicScheduleResult> {
  const solution = await solveGamsModel(inputBuses, signal);
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
          startMinute: SCHEDULE_START_MINUTES + (startSlot - 1) * SLOT_MINUTES,
          endMinute: SCHEDULE_START_MINUTES + previousSlot * SLOT_MINUTES,
        });
        startSlot = slot;
      }
      previousSlot = slot;
    }
    runs.push({
      bus,
      startMinute: SCHEDULE_START_MINUTES + (startSlot - 1) * SLOT_MINUTES,
      endMinute: SCHEDULE_START_MINUTES + previousSlot * SLOT_MINUTES,
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
      finalSoc: solution.finalSocByBus[run.bus],
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
