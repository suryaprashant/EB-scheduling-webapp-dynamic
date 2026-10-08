import type { ChargeSession } from '../types';

export interface BusTrip {
  bus: number;
  trips: Array<{
    departureMinute: number;
    arrivalMinute: number;
    distanceKm: number;
  }>;
}

export interface DynamicScheduleResult {
  sessions: ChargeSession[];
  warnings: string[];
  estimatedEnergyKwh: number;
  estimatedCost: number;
  optimizationStatus: 'optimal';
}

const BATTERY_KWH = 360;
const CHARGER_KW = 240;
const CHARGING_EFFICIENCY = 0.92;
const DRIVE_KWH_PER_KM = 1.3;
const MINIMUM_ARRIVAL_SOC = 20;
const INITIAL_DEPARTURE_SOC = 90;
const STARTUP_MINUTES = 5;
const CHARGE_STEP_MINUTES = 5;
const CHARGER_COUNT = 20;

interface ChargingJob {
  bus: number;
  tripNumber: number;
  windowStart: number;
  windowEnd: number;
  duration: number;
  targetSoc: number;
}

interface Candidate {
  index: number;
  jobIndex: number;
  startMinute: number;
  cost: number;
  occupiedSlots: number[];
}

function normalizeTripTimes(bus: BusTrip): BusTrip {
  let previousArrival = -1;

  return {
    ...bus,
    trips: bus.trips.map(trip => {
      let departureMinute = trip.departureMinute;
      while (departureMinute < previousArrival) departureMinute += 1440;

      let arrivalMinute = trip.arrivalMinute;
      while (arrivalMinute < departureMinute) arrivalMinute += 1440;

      previousArrival = arrivalMinute;
      return { ...trip, departureMinute, arrivalMinute };
    }),
  };
}

function priceAt(minute: number): number {
  const minuteOfDay = ((minute % 1440) + 1440) % 1440;
  if (minuteOfDay <= 360) return 4;
  if (minuteOfDay <= 600) return 5;
  if (minuteOfDay <= 780) return 6;
  if (minuteOfDay <= 1080) return 5;
  if (minuteOfDay <= 1260) return 6;
  return 5;
}

function chargeDurationForSocGain(socGain: number): number {
  const activeChargeMinutes =
    (socGain / 100 * BATTERY_KWH / (CHARGER_KW * CHARGING_EFFICIENCY)) * 60;
  const totalMinutes = activeChargeMinutes + STARTUP_MINUTES;
  return Math.max(
    CHARGE_STEP_MINUTES,
    Math.ceil(totalMinutes / CHARGE_STEP_MINUTES) * CHARGE_STEP_MINUTES,
  );
}

function createLpModel(
  jobs: ChargingJob[],
  candidates: Candidate[],
  objective: 'missed' | 'cost',
  skippedCount?: number | string,
): string {
  const lines = ['Minimize'];
  if (objective === 'missed') {
    lines.push(` objective: ${jobs.map((_, index) => `skip_${index}`).join(' + ') || '0'}`);
  } else {
    lines.push(
      ` objective: ${
        candidates
          .map(candidate => `${candidate.cost} x_${candidate.index}`)
          .join(' + ') || '0'
      }`,
    );
  }

  lines.push('Subject To');
  const previousJobByBus = new Map<number, number>();
  jobs.forEach((_, jobIndex) => {
    const jobCandidates = candidates
      .filter(candidate => candidate.jobIndex === jobIndex)
      .map(candidate => `x_${candidate.index}`);
    lines.push(` job_${jobIndex}: ${[...jobCandidates, `skip_${jobIndex}`].join(' + ')} = 1`);
    const previousJobIndex = previousJobByBus.get(jobs[jobIndex].bus);
    if (previousJobIndex !== undefined) {
      lines.push(` precedence_${jobIndex}: skip_${previousJobIndex} - skip_${jobIndex} <= 0`);
    }
    previousJobByBus.set(jobs[jobIndex].bus, jobIndex);
  });

  const candidatesBySlot = new Map<number, number[]>();
  for (const candidate of candidates) {
    for (const slot of candidate.occupiedSlots) {
      const slotCandidates = candidatesBySlot.get(slot) ?? [];
      slotCandidates.push(candidate.index);
      candidatesBySlot.set(slot, slotCandidates);
    }
  }
  for (const [slot, candidateIndices] of candidatesBySlot) {
    lines.push(` capacity_${slot}: ${candidateIndices.map(index => `x_${index}`).join(' + ')} <= ${CHARGER_COUNT}`);
  }

  if (objective === 'cost') {
    lines.push(
      ` missed_count: ${jobs.map((_, index) => `skip_${index}`).join(' + ') || '0'} = ${skippedCount ?? 0}`,
    );
  }

  lines.push('Binary');
  for (const candidate of candidates) lines.push(` x_${candidate.index}`);
  for (let index = 0; index < jobs.length; index += 1) lines.push(` skip_${index}`);
  lines.push('End');
  return lines.join('\n');
}

function solveScheduleModel(
  firstPassModel: string,
  secondPassModelTemplate: string,
  candidateCount: number,
  jobCount: number,
): Promise<{ scheduledCandidateIndices: number[]; skippedJobIndices: number[] }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./scheduleOptimizer.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const cleanup = () => worker.terminate();

    worker.onmessage = event => {
      cleanup();
      const result = event.data as
        | { scheduledCandidateIndices: number[]; skippedJobIndices: number[] }
        | { error: string };
      if ('error' in result) {
        reject(new Error(result.error));
      } else {
        resolve(result);
      }
    };
    worker.onerror = event => {
      cleanup();
      reject(new Error(event.message || 'The schedule optimizer worker failed.'));
    };
    worker.postMessage({
      firstPassModel,
      secondPassModelTemplate,
      candidateCount,
      jobCount,
    });
  });
}

export async function buildDynamicSchedule(buses: BusTrip[]): Promise<DynamicScheduleResult> {
  const jobs: ChargingJob[] = [];
  const warnings: string[] = [];

  for (const inputBus of buses) {
    if (inputBus.trips.length === 0) continue;
    const bus = normalizeTripTimes(inputBus);
    let departureSoc = INITIAL_DEPARTURE_SOC;

    for (let index = 0; index < bus.trips.length; index += 1) {
      const trip = bus.trips[index];
      const energyUsed = trip.distanceKm * DRIVE_KWH_PER_KM;
      const arrivalSoc = departureSoc - energyUsed / BATTERY_KWH * 100;

      if (arrivalSoc < MINIMUM_ARRIVAL_SOC) {
        warnings.push(
          `Bus ${bus.bus}: Trip ${index + 1} would arrive at ${arrivalSoc.toFixed(1)}% SOC, below the 20% minimum.`,
        );
        break;
      }

      const nextTrip = bus.trips[index + 1];
      let nextDeparture: number;
      let targetSoc: number;

      if (nextTrip) {
        nextDeparture = nextTrip.departureMinute;
        const nextTripSocUse = nextTrip.distanceKm * DRIVE_KWH_PER_KM / BATTERY_KWH * 100;
        targetSoc = MINIMUM_ARRIVAL_SOC + nextTripSocUse;
      } else {
        nextDeparture = bus.trips[0].departureMinute;
        while (nextDeparture <= trip.arrivalMinute) nextDeparture += 1440;
        targetSoc = INITIAL_DEPARTURE_SOC;
      }

      targetSoc = Math.min(100, targetSoc);
      const requiredGain = Math.max(0, targetSoc - arrivalSoc);
      if (requiredGain > 0) {
        const duration = chargeDurationForSocGain(requiredGain);
        jobs.push({
          bus: bus.bus,
          tripNumber: index + 1,
          windowStart: trip.arrivalMinute,
          windowEnd: nextDeparture,
          duration,
          targetSoc,
        });
      }

      departureSoc = targetSoc;
    }
  }

  const candidates: Candidate[] = [];
  const schedulableJobs: ChargingJob[] = [];
  const jobHasCandidates: boolean[] = [];
  for (const job of jobs) {
    const firstStart =
      Math.ceil(job.windowStart / CHARGE_STEP_MINUTES) * CHARGE_STEP_MINUTES;
    const jobCandidates: Candidate[] = [];
    for (
      let startMinute = firstStart;
      startMinute + job.duration <= job.windowEnd;
      startMinute += CHARGE_STEP_MINUTES
    ) {
      let cost = 0;
      for (
        let minute = startMinute + STARTUP_MINUTES;
        minute < startMinute + job.duration;
        minute += CHARGE_STEP_MINUTES
      ) {
        cost += priceAt(minute) * CHARGER_KW * CHARGE_STEP_MINUTES / 60;
      }
      const index = candidates.length + jobCandidates.length;
      jobCandidates.push({
        index,
        jobIndex: schedulableJobs.length,
        startMinute,
        cost,
        occupiedSlots: Array.from(
          { length: job.duration / CHARGE_STEP_MINUTES },
          (_, slotIndex) => startMinute / CHARGE_STEP_MINUTES + slotIndex,
        ),
      });
    }

    jobHasCandidates.push(jobCandidates.length > 0);
    schedulableJobs.push(job);
    candidates.push(...jobCandidates);
  }

  let selectedCandidateIndices: number[] = [];
  let skippedJobIndices: number[] = [];
  if (schedulableJobs.length > 0) {
    const firstPassModel = createLpModel(schedulableJobs, candidates, 'missed');
    const secondPassModelTemplate = createLpModel(
      schedulableJobs,
      candidates,
      'cost',
      '__SKIPPED_COUNT__',
    );
    const optimized = await solveScheduleModel(
      firstPassModel,
      secondPassModelTemplate,
      candidates.length,
      schedulableJobs.length,
    );
    selectedCandidateIndices = optimized.scheduledCandidateIndices;
    skippedJobIndices = optimized.skippedJobIndices;
  }

  const previouslySkippedBusJobs = new Set<number>();
  for (const jobIndex of skippedJobIndices) {
    const job = schedulableJobs[jobIndex];
    if (!jobHasCandidates[jobIndex]) {
      warnings.push(
        `Bus ${job.bus}: Not enough time to reach ${job.targetSoc.toFixed(1)}% SOC before its next departure.`,
      );
    } else if (previouslySkippedBusJobs.has(job.bus)) {
      warnings.push(
        `Bus ${job.bus}: This charge was skipped because an earlier charge for the bus could not be scheduled.`,
      );
    } else {
      warnings.push(
        `Bus ${job.bus}: No charger capacity is available for the ${job.duration}-minute charge window.`,
      );
    }
    previouslySkippedBusJobs.add(job.bus);
  }

  const chosenCandidates = new Map<number, Candidate>();
  for (const candidateIndex of selectedCandidateIndices) {
    const candidate = candidates[candidateIndex];
    chosenCandidates.set(candidate.jobIndex, candidate);
  }

  const selectedSessions = schedulableJobs.flatMap((job, jobIndex) => {
    const candidate = chosenCandidates.get(jobIndex);
    return candidate
      ? [{
          id: `dynamic-bus-${job.bus}-trip-${job.tripNumber}`,
          bus: job.bus,
          charger: 0,
          startMinute: candidate.startMinute,
          endMinute: candidate.startMinute + job.duration,
          durationMinutes: job.duration,
        }]
      : [];
  });
  selectedSessions.sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      a.endMinute - b.endMinute ||
      a.bus - b.bus,
  );

  const chargerAvailability = Array(CHARGER_COUNT).fill(Number.NEGATIVE_INFINITY) as number[];
  for (const session of selectedSessions) {
    const chargerIndex = chargerAvailability.findIndex(
      availableAt => availableAt <= session.startMinute,
    );
    if (chargerIndex === -1) {
      throw new Error('The optimizer returned a schedule exceeding charger capacity.');
    }
    session.charger = chargerIndex + 1;
    chargerAvailability[chargerIndex] = session.endMinute;
  }

  const sessions = selectedSessions
    .sort(
      (a, b) =>
        a.startMinute - b.startMinute ||
        a.charger - b.charger ||
        a.bus - b.bus,
    );
  const estimatedEnergyKwh = sessions.reduce(
    (total, session) =>
      total +
      Math.max(0, session.durationMinutes - STARTUP_MINUTES) *
        CHARGER_KW *
        CHARGING_EFFICIENCY /
        60,
    0,
  );
  const estimatedCost = sessions.reduce((total, session) => {
    let sessionCost = 0;
    for (
      let minute = session.startMinute + STARTUP_MINUTES;
      minute < session.endMinute;
      minute += CHARGE_STEP_MINUTES
    ) {
      sessionCost +=
        priceAt(minute) * CHARGER_KW * CHARGE_STEP_MINUTES / 60;
    }
    return total + sessionCost;
  }, 0);

  return {
    sessions,
    warnings,
    estimatedEnergyKwh,
    estimatedCost,
    optimizationStatus: 'optimal',
  };
}
