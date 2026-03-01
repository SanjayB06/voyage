export function parseDateInfo(isoString: string): { year: number; month: number; day: number } {
  // Date-only strings like "2026-04-01" are parsed as UTC by new Date(),
  // which shifts to the previous day in western timezones. Parse manually.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(isoString);
  if (dateOnly) {
    const [y, m, d] = isoString.split("-").map(Number);
    return { year: y, month: m - 1, day: d };
  }
  const date = new Date(isoString);
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

export function getMonthName(monthIndex: number): string {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return names[monthIndex] ?? "";
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getMonthStartDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function formatICSDate(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function formatDisplayDate(isoString: string): string {
  const info = parseDateInfo(isoString);
  const monthShort = getMonthName(info.month).slice(0, 3);
  return `${monthShort} ${info.day}`;
}

export function buildGoogleCalendarUrl({
  title,
  startISO,
  endISO,
  location,
  details,
}: {
  title: string;
  startISO: string;
  endISO: string;
  location?: string;
  details?: string;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatICSDate(startISO)}/${formatICSDate(endISO)}`,
  });
  if (location) params.set("location", location);
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
