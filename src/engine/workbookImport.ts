import type { GamsBusRow } from './dynamicSchedule';

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

export async function parseSheet3Workbook(data: ArrayBuffer): Promise<GamsBusRow[]> {
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
  const buses: GamsBusRow[] = [];

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
      departure1: departure1 / 5,
      arrival1: arrival1 / 5,
      departure2: departure2 === null ? 0 : departure2 / 5,
      arrival2: arrival2 === null ? 0 : arrival2 / 5,
      distance1,
      distance2: distance2 ?? 0,
    });
  }

  if (buses.length === 0) {
    throw new Error('Sheet3 contains no bus trip records.');
  }

  return validateBusRows(buses);
}

export async function parseSheet3File(file: File): Promise<GamsBusRow[]> {
  return parseSheet3Workbook(await file.arrayBuffer());
}

export function parseGamsInclude(source: string): GamsBusRow[] {
  const buses: GamsBusRow[] = [];
  const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('*')) continue;

    const fields = trimmed.split(/\s+/);
    if (!/^\d+$/.test(fields[0])) continue;
    if (
      fields.length === 6 &&
      fields.every((value, fieldIndex) => Number(value) === fieldIndex + 1)
    ) {
      continue;
    }
    if (fields.length !== 7 || fields.slice(1).some(value => !numberPattern.test(value))) {
      throw new Error(`Include file line ${index + 1}: expected a bus index and six numeric columns.`);
    }

    const [departure1, arrival1, departure2, arrival2, distance1, distance2] =
      fields.slice(1).map(Number);
    buses.push({
      bus: Number(fields[0]),
      departure1,
      arrival1,
      departure2,
      arrival2,
      distance1,
      distance2,
    });
  }

  if (buses.length === 0) {
    throw new Error('The include file contains no indexed bus rows.');
  }

  return validateBusRows(buses);
}

function validateBusRows(rows: GamsBusRow[]): GamsBusRow[] {
  const buses = new Set<number>();
  for (const row of rows) {
    if (!Number.isInteger(row.bus) || row.bus < 1 || row.bus > 101) {
      throw new Error(`Bus index ${row.bus} is outside the GAMS model range 1-101.`);
    }
    if (buses.has(row.bus)) {
      throw new Error(`Bus ${row.bus} appears more than once in the schedule input.`);
    }
    buses.add(row.bus);
    if (
      [row.departure1, row.arrival1, row.departure2, row.arrival2].some(
        time => !Number.isFinite(time) || time < 0 || time > 288,
      ) ||
      !Number.isFinite(row.distance1) ||
      !Number.isFinite(row.distance2) ||
      row.distance1 < 0 ||
      row.distance2 < 0
    ) {
      throw new Error(`Bus ${row.bus} has a time or distance outside the GAMS model limits.`);
    }
  }
  return rows.sort((a, b) => a.bus - b.bus);
}

export async function parseScheduleFile(file: File): Promise<GamsBusRow[]> {
  if (file.name.toLowerCase().endsWith('.inc')) {
    return parseGamsInclude(await file.text());
  }
  return parseSheet3File(file);
}
