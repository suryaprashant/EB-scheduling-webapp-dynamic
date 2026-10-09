import { ChargeSession, AllocationRequest, AllocationResult, ChargerSnapshot } from '../types';

export function parseTimeToMinutes(timeStr: string): number | null {
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  // 24-hour match e.g. "20:00" or "8:30"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return h * 60 + m;
    }
  }

  // 12-hour match e.g. "8:00 PM"
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([APap][Mm])$/);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const ampm = match12[3].toUpperCase();
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    }
  }

  return null;
}

export function formatTime24(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function formatTime12(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const m = normalized % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function formatTimeDisplay(minute: number): string {
  return `${formatTime24(minute)} (${formatTime12(minute)})`;
}

/**
 * Exact translation of the Excel VBA Sub Electric_Bus_Charging_Schedule:
 */
export function allocate(
  request: AllocationRequest,
  sessions: ChargeSession[]
): AllocationResult {
  const busNo = request.busNumber;
  const arrivalMinute = parseTimeToMinutes(request.arrivalTime);

  if (arrivalMinute === null) {
    return {
      busNumber: busNo,
      arrivalMinute: 0,
      arrivalSoc: request.arrivalSoc,
      allocatedCharger: null,
      pluginMinute: null,
      plugoutMinute: null,
      expectedSoc: null,
      statusText: 'Enter valid arrival time (hh:mm)',
      chargingDurationMinutes: 0,
      isMissedAndReallocated: false,
      sessionFound: false,
      isEarlyWaiting: false,
    };
  }

  let sessionFound = false;
  let firstSessionMissed = false;
  let sessDuration = 0;
  let timeDiff = 0.0; // in hours

  let scheduledStart = 0;
  let scheduledEnd = 0;
  let charger = 0;
  let chargingTime = 0;
  let pluginTime = 0;
  let statusCaption = '';
  let isEarlyWait = false;

  const busSessions = sessions.filter(s => s.bus === busNo);

  for (const session of busSessions) {
    const sStart = session.startMinute;
    const sEnd = session.endMinute;

    if (arrivalMinute > sEnd) {
      firstSessionMissed = true;
      sessDuration = sEnd - sStart;
    } else {
      charger = session.charger;
      sessionFound = true;
      scheduledStart = sStart;
      scheduledEnd = sEnd;

      // Early wait condition <= 1 hour
      if (arrivalMinute < scheduledStart) {
        timeDiff = (scheduledStart - arrivalMinute) / 60.0;
        if (timeDiff <= 1.0) {
          chargingTime = scheduledEnd - scheduledStart;
          pluginTime = scheduledStart;
          statusCaption = 'Arrived early (<1 hr). Waiting for scheduled charger.';
          isEarlyWait = true;
          break;
        }
      }

      // Normal case
      if (arrivalMinute < scheduledStart) {
        chargingTime = scheduledEnd - scheduledStart;
        pluginTime = scheduledStart;
      } else {
        chargingTime = scheduledEnd - arrivalMinute;
        pluginTime = arrivalMinute;
      }
      statusCaption = 'Allocated to scheduled charger.';
      break;
    }
  }

  if (!sessionFound) {
    // Check if missed session can be reallocated to any free charger
    if (firstSessionMissed && sessDuration > 0) {
      const requiredEnd = arrivalMinute + sessDuration;
      for (let ch = 1; ch <= 20; ch++) {
        const isBusy = sessions.some(
          existing =>
            existing.charger === ch &&
            !(requiredEnd <= existing.startMinute || arrivalMinute >= existing.endMinute)
        );
        if (!isBusy) {
          const tchg = sessDuration;
          const socDep =
            Math.round(
              (request.arrivalSoc + 0.95 * (tchg / 60.0) * (240.0 / 360.0) * 100.0) * 100
            ) / 100;
          const expectedSoc = Math.min(100, socDep);
          return {
            busNumber: busNo,
            arrivalMinute,
            arrivalSoc: request.arrivalSoc,
            allocatedCharger: ch,
            pluginMinute: arrivalMinute,
            plugoutMinute: requiredEnd,
            expectedSoc,
            statusText: `Missed session. New charger allocated: ${ch}`,
            chargingDurationMinutes: tchg,
            isMissedAndReallocated: true,
            sessionFound: true,
            isEarlyWaiting: false,
          };
        }
      }
    }

    return {
      busNumber: busNo,
      arrivalMinute,
      arrivalSoc: request.arrivalSoc,
      allocatedCharger: null,
      pluginMinute: null,
      plugoutMinute: null,
      expectedSoc: null,
      statusText: 'Bus missed all scheduled sessions.',
      chargingDurationMinutes: 0,
      isMissedAndReallocated: false,
      sessionFound: false,
      isEarlyWaiting: false,
    };
  }

  // SOC calculation formula:
  const tchg = chargingTime;
  const socGain = 0.95 * (tchg / 60.0) * (240.0 / 360.0) * 100.0;
  const socDep = Math.round((request.arrivalSoc + socGain) * 100) / 100;
  const expectedSoc = Math.min(100, socDep);

  let finalPlugin = pluginTime;
  let finalPlugout = scheduledEnd;
  let finalCharger = charger;
  let isMissedReallocated = false;

  // SafeExit fallback logic: If firstSessionMissed and timeDiff > 1 hour
  if (firstSessionMissed && timeDiff > 1.0) {
    const requiredEnd = arrivalMinute + sessDuration;

    for (let ch = 1; ch <= 20; ch++) {
      let isBusy = false;
      for (const existing of sessions) {
        if (existing.charger === ch) {
          if (!(requiredEnd <= existing.startMinute || arrivalMinute >= existing.endMinute)) {
            isBusy = true;
            break;
          }
        }
      }

      if (!isBusy) {
        finalPlugin = arrivalMinute;
        finalPlugout = requiredEnd;
        finalCharger = ch;
        statusCaption = `Missed session. New charger allocated: ${ch}`;
        isMissedReallocated = true;
        break;
      }
    }
  }

  return {
    busNumber: busNo,
    arrivalMinute,
    arrivalSoc: request.arrivalSoc,
    allocatedCharger: finalCharger,
    pluginMinute: finalPlugin,
    plugoutMinute: finalPlugout,
    expectedSoc,
    statusText: statusCaption,
    chargingDurationMinutes: isMissedReallocated ? sessDuration : tchg,
    isMissedAndReallocated: isMissedReallocated,
    sessionFound: true,
    isEarlyWaiting: isEarlyWait,
  };
}

export function getChargerSnapshotsAtTime(
  minuteOfDay: number,
  sessions: ChargeSession[]
): ChargerSnapshot[] {
  return Array.from({ length: 20 }, (_, i) => {
    const chargerNumber = i + 1;
    const active =
      sessions.find(
        s =>
          s.charger === chargerNumber &&
          minuteOfDay >= s.startMinute &&
          minuteOfDay < s.endMinute
      ) || null;
    return {
      chargerNumber,
      isIdle: active === null,
      activeSession: active,
    };
  });
}
