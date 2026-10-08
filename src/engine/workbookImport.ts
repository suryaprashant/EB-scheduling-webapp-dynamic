import type { BusTrip } from './dynamicSchedule';

function numericCell(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function minuteOfDay(value: unknown, rowNumber: number, columnName: string): number | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'string') {
    const timeMatch = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      if (hours > 23 || minutes > 59) {
        throw new Error(`Sheet3 row ${rowNumber}: ${columnName} is not a valid time.`);
      }
      return hours * 60 + minutes;
    }
  }

  const number = numericCell(value);
  if (number === null || number < 0) {
    throw new Error(`Sheet3 row ${rowNumber}: ${columnName} must contain an Excel time.`);
  }

  if (number <= 1) return Math.round(number * 1440) % 1440;
  return Math.round(number) % 1440;
}

export async function parseSheet3Workbook(data: ArrayBuffer): Promise<BusTrip[]> {
  const XLSX = await import('@e965/xlsx');
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets.Sheet3;
  if (!sheet) {
    throw new Error('The workbook does not contain a worksheet named "Sheet3".');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const buses: BusTrip[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const bus = numericCell(row[1]);
    if (bus === null) continue;

    const departure1 = minuteOfDay(row[2], index + 1, 'Departure1');
    const arrival1 = minuteOfDay(row[3], index + 1, 'Arrival1');
    const distance1 = numericCell(row[6]);
    if (departure1 === null || arrival1 === null || distance1 === null || distance1 <= 0) {
      throw new Error(
        `Sheet3 row ${index + 1}: Bus ${bus} needs Departure1, Arrival1, and a positive nTrips1 distance.`,
      );
    }

    const departure2 = minuteOfDay(row[4], index + 1, 'Departure2');
    const arrival2 = minuteOfDay(row[5], index + 1, 'Arrival2');
    const distance2 = numericCell(row[7]);
    const hasAnySecondTrip =
      departure2 !== null || arrival2 !== null || (distance2 !== null && distance2 > 0);

    if (
      hasAnySecondTrip &&
      (departure2 === null || arrival2 === null || distance2 === null || distance2 <= 0)
    ) {
      throw new Error(
        `Sheet3 row ${index + 1}: Bus ${bus} has an incomplete second trip; provide Departure2, Arrival2, and nTrips2 together.`,
      );
    }

    buses.push({
      bus,
      trips: [
        { departureMinute: departure1, arrivalMinute: arrival1, distanceKm: distance1 },
        ...(departure2 !== null && arrival2 !== null && distance2 !== null
          ? [{ departureMinute: departure2, arrivalMinute: arrival2, distanceKm: distance2 }]
          : []),
      ],
    });
  }

  if (buses.length === 0) {
    throw new Error('Sheet3 contains no bus trip records.');
  }

  return buses;
}

export async function parseSheet3File(file: File): Promise<BusTrip[]> {
  return parseSheet3Workbook(await file.arrayBuffer());
}

export function parseGamsInclude(source: string): BusTrip[] {
  const buses = new Map<number, BusTrip>();
  const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('*')) continue;

    const fields = trimmed.split(/\s+/);
    if (!/^\d+$/.test(fields[0]) || fields.length < 7) continue;
    if (fields.length !== 7 || fields.slice(1).some(value => !numberPattern.test(value))) {
      throw new Error(`Include file line ${index + 1}: expected a bus index and six numeric columns.`);
    }

    const bus = Number(fields[0]);
    if (buses.has(bus)) {
      throw new Error(`Include file line ${index + 1}: bus ${bus} appears more than once.`);
    }

    const [departure1, arrival1, departure2, arrival2, distance1, distance2] =
      fields.slice(1).map(Number);
    if (
      [departure1, arrival1, departure2, arrival2].some(
        minute => minute < 0 || minute >= 1440,
      ) ||
      distance1 <= 0 ||
      distance2 < 0
    ) {
      throw new Error(`Include file line ${index + 1}: times or trip distances are out of range.`);
    }

    const hasSecondTrip = departure2 !== 0 || arrival2 !== 0 || distance2 !== 0;
    if (
      hasSecondTrip &&
      (departure2 === 0 || arrival2 === 0 || distance2 <= 0)
    ) {
      throw new Error(`Include file line ${index + 1}: second-trip values must all be provided.`);
    }

    buses.set(bus, {
      bus,
      trips: [
        {
          departureMinute: Math.round(departure1),
          arrivalMinute: Math.round(arrival1),
          distanceKm: distance1,
        },
        ...(hasSecondTrip
          ? [{
              departureMinute: Math.round(departure2),
              arrivalMinute: Math.round(arrival2),
              distanceKm: distance2,
            }]
          : []),
      ],
    });
  }

  if (buses.size === 0) {
    throw new Error('The include file contains no indexed bus rows.');
  }

  return [...buses.values()].sort((a, b) => a.bus - b.bus);
}

export async function parseScheduleFile(file: File): Promise<BusTrip[]> {
  if (file.name.toLowerCase().endsWith('.inc')) {
    return parseGamsInclude(await file.text());
  }
  return parseSheet3File(file);
}
