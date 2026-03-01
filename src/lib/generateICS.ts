import { formatICSDate } from "./calendarUtils";
import type { SegmentDetail } from "@/services/flightService";
import type { ActivityDay } from "@/services/activitiesService";

interface GenerateICSParams {
  segments: SegmentDetail[];
  airlineName: string;
  bookingReference: string;
  activities?: ActivityDay[];
}

function getActivityTimes(slot: "Morning" | "Afternoon" | "Evening", dayIndex: number): { startHour: number; endHour: number } {
  const variant = dayIndex % 3;
  switch (slot) {
    case "Morning":
      return [
        { startHour: 9, endHour: 11 },
        { startHour: 8, endHour: 11 },
        { startHour: 10, endHour: 12 },
      ][variant];
    case "Afternoon":
      return [
        { startHour: 13, endHour: 16 },
        { startHour: 14, endHour: 17 },
        { startHour: 13, endHour: 15 },
      ][variant];
    case "Evening":
      return [
        { startHour: 18, endHour: 21 },
        { startHour: 19, endHour: 22 },
        { startHour: 18, endHour: 20 },
      ][variant];
  }
}

function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  let isFirst = true;

  while (start < line.length) {
    const maxLen = isFirst ? 75 : 74; // subsequent lines have a leading space
    let end = start + maxLen;
    // Make sure we don't cut in the middle of a multi-byte char
    while (end < line.length && new TextEncoder().encode(line.slice(start, end)).length > maxLen) {
      end--;
    }
    if (end >= line.length) end = line.length;
    parts.push((isFirst ? "" : " ") + line.slice(start, end));
    start = end;
    isFirst = false;
  }

  return parts.join("\r\n");
}

function icsLine(key: string, value: string): string {
  return foldLine(`${key}:${value}`);
}

export function generateICS({ segments, airlineName, bookingReference, activities }: GenerateICSParams): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Voyage AI//Voyage App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const seg of segments) {
    const summary = `${seg.marketing_carrier_code}${seg.flight_number} ${seg.origin_code}-${seg.destination_code}`;
    const description = [
      `Airline: ${seg.marketing_carrier_name}`,
      seg.operating_carrier_name ? `Operated by: ${seg.operating_carrier_name}` : null,
      seg.aircraft_name ? `Aircraft: ${seg.aircraft_name}` : null,
      seg.origin_terminal ? `Departure terminal: ${seg.origin_terminal}` : null,
      seg.destination_terminal ? `Arrival terminal: ${seg.destination_terminal}` : null,
      `Booking ref: ${bookingReference}`,
    ]
      .filter(Boolean)
      .join("\\n");

    lines.push("BEGIN:VEVENT");
    lines.push(icsLine("UID", `${seg.segment_id}@voyage-app`));
    lines.push(icsLine("DTSTAMP", formatICSDate(new Date().toISOString())));
    lines.push(icsLine("DTSTART", formatICSDate(seg.departing_at)));
    lines.push(icsLine("DTEND", formatICSDate(seg.arriving_at)));
    lines.push(icsLine("SUMMARY", summary));
    lines.push(icsLine("LOCATION", `${seg.origin_name} (${seg.origin_code})`));
    lines.push(icsLine("DESCRIPTION", description));
    lines.push("END:VEVENT");
  }

  if (activities) {
    for (const day of activities) {
      for (const slot of day.activities) {
        const times = getActivityTimes(slot.time, day.day);
        const startISO = `${day.date}T${String(times.startHour).padStart(2, "0")}:00:00`;
        const endISO = `${day.date}T${String(times.endHour).padStart(2, "0")}:00:00`;
        const uid = `activity-${day.day}-${slot.time}@voyage-app`;

        lines.push("BEGIN:VEVENT");
        lines.push(icsLine("UID", uid));
        lines.push(icsLine("DTSTAMP", formatICSDate(new Date().toISOString())));
        lines.push(icsLine("DTSTART", formatICSDate(startISO)));
        lines.push(icsLine("DTEND", formatICSDate(endISO)));
        lines.push(icsLine("SUMMARY", `${slot.time}: ${slot.activity}`));
        if (slot.booking_link) {
          lines.push(icsLine("DESCRIPTION", `Booking: ${slot.booking_link}`));
        }
        lines.push("END:VEVENT");
      }
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function downloadICS(icsContent: string, filename: string = "voyage-flight.ics") {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
