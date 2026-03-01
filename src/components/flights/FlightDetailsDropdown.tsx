import { ChevronDown, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { SegmentDetail } from "@/services/flightService";

function formatTime(isoString: string) {
  if (!isoString) return "--:--";
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function calculateLayover(prevArrive: string, nextDepart: string): string {
  const arrive = new Date(prevArrive);
  const depart = new Date(nextDepart);
  const diffMs = depart.getTime() - arrive.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours === 0) return `${mins}m layover`;
  if (mins === 0) return `${hours}h layover`;
  return `${hours}h ${mins}m layover`;
}

function SegmentRow({ segment }: { segment: SegmentDetail }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/60 p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold text-foreground">{formatTime(segment.departing_at)}</span>
            <span className="text-muted-foreground">•</span>
            <span className="font-medium text-foreground">{segment.origin_code}</span>
            <span className="text-muted-foreground">{segment.origin_name}</span>
            {segment.origin_terminal && (
              <span className="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                Terminal {segment.origin_terminal}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {segment.duration_formatted}
            </span>
            <span className="text-border">|</span>
            <span>
              {segment.marketing_carrier_name} {segment.flight_number}
            </span>
            {segment.operating_carrier_name &&
              segment.operating_carrier_name !== segment.marketing_carrier_name && (
                <>
                  <span className="text-border">|</span>
                  <span>Operated by {segment.operating_carrier_name}</span>
                </>
              )}
            {segment.aircraft_name && (
              <>
                <span className="text-border">|</span>
                <span>{segment.aircraft_name}</span>
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold text-foreground">{formatTime(segment.arriving_at)}</span>
            <span className="text-muted-foreground">•</span>
            <span className="font-medium text-foreground">{segment.destination_code}</span>
            <span className="text-muted-foreground">{segment.destination_name}</span>
            {segment.destination_terminal && (
              <span className="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                Terminal {segment.destination_terminal}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FlightDetailsDropdown({
  segments,
  totalEmissionsKg,
  open,
  onOpenChange,
}: {
  segments: SegmentDetail[];
  totalEmissionsKg?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!segments || segments.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="mt-3 w-full border-t border-border/40 pt-3 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
        >
          <span>{open ? "Hide flight details" : "Show flight details"}</span>
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={16} />
          </motion.div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-3 rounded-xl border border-border/50 bg-muted/30 p-3">
          <div className="space-y-2">
            {segments.map((segment, idx) => (
              <div key={segment.segment_id}>
                {idx > 0 && (
                  <div className="mb-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                    {calculateLayover(segments[idx - 1].arriving_at, segment.departing_at)} in {segments[idx - 1].destination_code}
                  </div>
                )}
                <SegmentRow segment={segment} />
              </div>
            ))}
          </div>

          {totalEmissionsKg && (
            <div className="mt-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
              Estimated CO₂ emissions: <span className="font-medium text-foreground">{totalEmissionsKg} kg</span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
