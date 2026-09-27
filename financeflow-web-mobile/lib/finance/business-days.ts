// Cópia fiel de lib/business-days.ts do app desktop (os projetos são isolados). Mantenha as duas versões iguais;
// os testes em financeflow-web-mobile/tests/ espelham os do desktop.
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getBrazilNationalHolidayKeys(year: number): Set<string> {
  const easter = getEasterDate(year);
  const goodFriday = addDays(easter, -2);

  return new Set([
    dateKey(year, 1, 1),
    dateKey(goodFriday.getFullYear(), goodFriday.getMonth() + 1, goodFriday.getDate()),
    dateKey(year, 4, 21),
    dateKey(year, 5, 1),
    dateKey(year, 9, 7),
    dateKey(year, 10, 12),
    dateKey(year, 11, 2),
    dateKey(year, 11, 15),
    dateKey(year, 11, 20),
    dateKey(year, 12, 25),
  ]);
}

export function isBusinessDay(date: Date): boolean {
  const weekDay = date.getDay();
  if (weekDay === 0 || weekDay === 6) return false;

  const year = date.getFullYear();
  const key = dateKey(year, date.getMonth() + 1, date.getDate());
  return !getBrazilNationalHolidayKeys(year).has(key);
}

export function countBusinessDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (isBusinessDay(new Date(year, month - 1, day))) count += 1;
  }
  return count;
}

export function countBusinessDaysElapsedInMonth(
  year: number,
  month: number,
  dayLimit: number,
): number {
  const maxDay = Math.min(dayLimit, new Date(year, month, 0).getDate());
  let count = 0;
  for (let day = 1; day <= maxDay; day += 1) {
    if (isBusinessDay(new Date(year, month - 1, day))) count += 1;
  }
  return count;
}

export function previousBusinessDay(date: Date): Date {
  let cursor = addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -1);
  while (!isBusinessDay(cursor)) {
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

// Conta dias úteis no intervalo (startExclusive, endInclusive].
export function countBusinessDaysBetween(startExclusive: Date, endInclusive: Date): number {
  let cursor = addDays(
    new Date(startExclusive.getFullYear(), startExclusive.getMonth(), startExclusive.getDate()),
    1,
  );
  const end = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate());
  let count = 0;
  while (cursor <= end) {
    if (isBusinessDay(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}
