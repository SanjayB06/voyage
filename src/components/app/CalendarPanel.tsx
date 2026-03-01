import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Download, ExternalLink } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  parseDateInfo,
  getMonthName,
  getDaysInMonth,
  getMonthStartDayOfWeek,
  formatDisplayDate,
  buildGoogleCalendarUrl,
} from "@/lib/calendarUtils";
import { generateICS, downloadICS } from "@/lib/generateICS";
import type { SegmentDetail } from "@/services/flightService";
import type { ActivityDay } from "@/services/activitiesService";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface CalendarPanelProps {
  previewStart?: string;
  previewEnd?: string;
  bookedFlights?: Array<{
    departureDate: string;
    arrivalDate: string;
    segments: SegmentDetail[];
    airline: string;
    bookingReference: string;
  }>;
  userEmail?: string;
  itineraryDays?: ActivityDay[];
}

export const CalendarPanel = ({
  previewStart,
  previewEnd,
  bookedFlights = [],
  userEmail,
  itineraryDays,
}: CalendarPanelProps) => {
  // Determine initial month to display
  const initialMonth = useMemo(() => {
    if (bookedFlights.length > 0) {
      const info = parseDateInfo(bookedFlights[0].departureDate);
      return { year: info.year, month: info.month };
    }
    if (previewStart) {
      const info = parseDateInfo(previewStart);
      return { year: info.year, month: info.month };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, []); // only on mount

  const [displayMonth, setDisplayMonth] = useState(initialMonth);

  // Auto-navigate when bookedFlights changes
  useEffect(() => {
    if (bookedFlights.length > 0) {
      const info = parseDateInfo(bookedFlights[0].departureDate);
      setDisplayMonth({ year: info.year, month: info.month });
    }
  }, [bookedFlights]);

  // Also react to previewStart changes if no booked flights
  useEffect(() => {
    if (bookedFlights.length === 0 && previewStart) {
      const info = parseDateInfo(previewStart);
      setDisplayMonth({ year: info.year, month: info.month });
    }
  }, [previewStart, bookedFlights]);

  const totalDays = getDaysInMonth(displayMonth.year, displayMonth.month);
  const startPadding = getMonthStartDayOfWeek(displayMonth.year, displayMonth.month);

  // Compute highlighted range — always prefer the full trip range (previewStart/End)
  // since bookedFlight only has one-way departure/arrival times
  const highlightRange = useMemo(() => {
    if (previewStart && previewEnd) {
      return {
        startDate: parseDateInfo(previewStart),
        endDate: parseDateInfo(previewEnd),
      };
    }
    if (bookedFlights.length > 0) {
      const dep = parseDateInfo(bookedFlights[0].departureDate);
      const arr = parseDateInfo(bookedFlights[bookedFlights.length - 1].arrivalDate);
      return { startDate: dep, endDate: arr };
    }
    return null;
  }, [bookedFlights, previewStart, previewEnd]);

  // Generate calendar grid
  const days = useMemo(() => {
    const result: {
      day: number | null;
      isSelected: boolean;
      isInRange: boolean;
      isStart: boolean;
      isEnd: boolean;
    }[] = [];

    for (let i = 0; i < startPadding; i++) {
      result.push({ day: null, isSelected: false, isInRange: false, isStart: false, isEnd: false });
    }

    for (let d = 1; d <= totalDays; d++) {
      let isStart = false;
      let isEnd = false;
      let isInRange = false;

      if (highlightRange) {
        const { startDate, endDate } = highlightRange;
        const currentDate = new Date(displayMonth.year, displayMonth.month, d);
        const rangeStart = new Date(startDate.year, startDate.month, startDate.day);
        const rangeEnd = new Date(endDate.year, endDate.month, endDate.day);

        isStart = currentDate.getTime() === rangeStart.getTime();
        isEnd = currentDate.getTime() === rangeEnd.getTime();
        isInRange = currentDate > rangeStart && currentDate < rangeEnd;
      }

      result.push({
        day: d,
        isSelected: isStart || isEnd,
        isInRange,
        isStart,
        isEnd,
      });
    }
    return result;
  }, [displayMonth, highlightRange, startPadding, totalDays]);

  const prevMonth = () => {
    setDisplayMonth((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { ...prev, month: prev.month - 1 };
    });
  };

  const nextMonth = () => {
    setDisplayMonth((prev) => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { ...prev, month: prev.month + 1 };
    });
  };

  // Footer info
  const footerInfo = useMemo(() => {
    if (bookedFlights.length > 0) {
      const dep = new Date(bookedFlights[0].departureDate);
      const lastFlight = bookedFlights[bookedFlights.length - 1];
      const arr = new Date(lastFlight.arrivalDate);
      const nights = Math.max(1, Math.round((arr.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24)));
      return {
        duration: `${nights} night${nights !== 1 ? "s" : ""}`,
        dates: `${formatDisplayDate(bookedFlights[0].departureDate)} - ${formatDisplayDate(lastFlight.arrivalDate)}`,
      };
    }
    if (previewStart && previewEnd) {
      const s = new Date(previewStart);
      const e = new Date(previewEnd);
      const nights = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
      return {
        duration: `${nights} night${nights !== 1 ? "s" : ""}`,
        dates: `${formatDisplayDate(previewStart)} - ${formatDisplayDate(previewEnd)}`,
      };
    }
    return { duration: "--", dates: "--" };
  }, [bookedFlights, previewStart, previewEnd]);

  // ICS download handler — combines all booked flights + activities into a single .ics
  const handleDownloadICS = () => {
    if (bookedFlights.length === 0 && (!itineraryDays || itineraryDays.length === 0)) return;
    const allSegments = bookedFlights.flatMap(f => f.segments);
    const allRefs = bookedFlights.map(f => f.bookingReference).join(", ");
    const airlines = [...new Set(bookedFlights.map(f => f.airline))].join(", ");
    const ics = generateICS({
      segments: allSegments,
      airlineName: airlines,
      bookingReference: allRefs,
      activities: itineraryDays,
    });
    const filename = bookedFlights.length > 0
      ? `voyage-${bookedFlights[0].bookingReference}.ics`
      : `voyage-itinerary.ics`;
    downloadICS(ics, filename);
  };

  // Google Calendar URLs — one per booked flight
  const googleCalUrls = useMemo(() => {
    return bookedFlights
      .filter(f => f.segments.length > 0)
      .map(f => {
        const seg = f.segments[0];
        return {
          label: `${seg.origin_code} → ${seg.destination_code}`,
          url: buildGoogleCalendarUrl({
            title: `Flight ${seg.marketing_carrier_code}${seg.flight_number} ${seg.origin_code}-${seg.destination_code}`,
            startISO: seg.departing_at,
            endISO: seg.arriving_at,
            location: `${seg.origin_name} (${seg.origin_code})`,
            details: `Airline: ${seg.marketing_carrier_name}\nBooking ref: ${f.bookingReference}`,
          }),
        };
      });
  }, [bookedFlights]);

  const isGmail = userEmail?.toLowerCase().endsWith("@gmail.com");

  return (
    <motion.div
      className="glass-card h-full flex flex-col overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 bg-gradient-to-r from-primary/5 to-ocean-light/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} className="text-primary" />
            <span className="font-semibold text-foreground">Trip Dates</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-foreground px-2">
              {getMonthName(displayMonth.month)} {displayMonth.year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="px-4 py-3 flex-1 min-h-0 overflow-y-auto">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAYS.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((item, index) => (
            <motion.div
              key={index}
              className={cn(
                "relative h-9 flex items-center justify-center text-sm",
                item.day === null && "invisible"
              )}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.01 }}
            >
              {item.day && (
                <>
                  {/* Range background */}
                  {item.isInRange && (
                    <div className="absolute inset-0 bg-primary/10" />
                  )}
                  {/* Start date rounded left */}
                  {item.isStart && (
                    <div className="absolute inset-0 bg-primary/10 rounded-l-full" />
                  )}
                  {/* End date rounded right */}
                  {item.isEnd && (
                    <div className="absolute inset-0 bg-primary/10 rounded-r-full" />
                  )}

                  {/* Day number */}
                  <span
                    className={cn(
                      "relative z-10 w-8 h-8 flex items-center justify-center rounded-full text-xs transition-all",
                      item.isSelected && "bg-gradient-to-br from-primary to-ocean-light text-white font-semibold shadow-soft",
                      item.isInRange && "text-primary font-medium",
                      !item.isSelected && !item.isInRange && "text-foreground hover:bg-muted"
                    )}
                  >
                    {item.day}
                  </span>
                </>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Trip summary + export buttons */}
      <div className="px-4 py-3 border-t border-border/30 bg-muted/20">
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-semibold text-foreground">{footerInfo.duration}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">Dates</p>
            <p className="font-semibold text-foreground">{footerInfo.dates}</p>
          </div>
        </div>

        {/* Export buttons — visible after booking or when itinerary is ready */}
        {(bookedFlights.length > 0 || (itineraryDays && itineraryDays.length > 0)) && (
          <div className="flex flex-col gap-2 mt-3">
            <button
              onClick={handleDownloadICS}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <Download size={14} />
              Download .ics
            </button>
            {googleCalUrls.map((cal, idx) => (
              <a
                key={idx}
                href={cal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
              >
                <ExternalLink size={14} />
                Add {cal.label} to Google Calendar
              </a>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
