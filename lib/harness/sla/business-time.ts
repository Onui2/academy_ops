export function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function addBusinessDays(baseDate: Date, businessDays: number) {
  const cursor = new Date(baseDate);
  let remaining = businessDays;

  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor)) {
      remaining -= 1;
    }
  }

  return cursor;
}
