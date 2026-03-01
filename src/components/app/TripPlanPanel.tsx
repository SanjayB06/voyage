import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, Building2, MapPin, ChevronDown, Clock, Star, Route, RefreshCw, AlertCircle, ExternalLink, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { searchFlights, type FlightOffer, type FlightRoute } from "@/services/flightService";
import { searchHotels, type HotelOffer } from "@/services/hotelService";
import { generateItinerary, type ActivityDay } from "@/services/activitiesService";
import { FlightDetailsDropdown } from "@/components/flights/FlightDetailsDropdown";
import { PassengerDetailsPanel } from "./PassengerDetailsPanel";
import type { BookingConfirmation } from "@/hooks/useVapi";

// FlightOffer type is imported from flightService

interface TripPlanPanelProps {
  isLoading?: boolean;
  onBook: (type: string, item: string, offerId?: string, flightOffer?: FlightOffer) => void;
  tripInfo?: {
    name: string;
    destination: string;
    dates: string;
    travelers: string;
    origin?: string;
    start?: string;
    end?: string;
    numpassengers?: number;
  } | null;
  vapiFlightOffers?: FlightOffer[];
  callId?: string | null;
  pipelinePhase?: 1 | 2 | 3 | 4;
  passengerInfo?: Record<string, string | null> | null;
  isPassengerInfoComplete?: boolean;
  travelInfo?: Record<string, string | null> | null;
  selectedOfferId?: string | null;
  bookingConfirmation?: BookingConfirmation | null;
  duffelPassengerId?: string | null;
  onBookingConfirmed?: (ref: string, orderId: string) => void;
  onItineraryReady?: (days: ActivityDay[]) => void;
}

// Helper functions
const formatTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const formatCurrency = (amount: string, currency: string): string => {
  const num = parseFloat(amount);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num);
};



const SkeletonCard = () => (
  <div className="skeleton-shimmer h-24 rounded-xl" />
);

export const TripPlanPanel = ({ isLoading, onBook, tripInfo, vapiFlightOffers, callId, pipelinePhase, passengerInfo, isPassengerInfoComplete, travelInfo, selectedOfferId, bookingConfirmation, duffelPassengerId, onBookingConfirmed, onItineraryReady }: TripPlanPanelProps) => {
  const [expandedSection, setExpandedSection] = useState<string | null>("flights");
  const [flightOffers, setFlightOffers] = useState<FlightOffer[]>([]);
  const [flightRoute, setFlightRoute] = useState<FlightRoute | null>(null);
  const [flightsLoading, setFlightsLoading] = useState(true);
  const [flightsError, setFlightsError] = useState<string | null>(null);
  const [expandedFlightId, setExpandedFlightId] = useState<string | null>(null);
  const [returnFlightOffers, setReturnFlightOffers] = useState<FlightOffer[]>([]);
  const [returnFlightsLoading, setReturnFlightsLoading] = useState(true);
  const [returnFlightsError, setReturnFlightsError] = useState<string | null>(null);
  const [hotelOffers, setHotelOffers] = useState<HotelOffer[]>([]);
  const [hotelsLoading, setHotelsLoading] = useState(true);
  const [hotelsError, setHotelsError] = useState<string | null>(null);
  const [itineraryDays, setItineraryDays] = useState<ActivityDay[]>([]);
  const [itineraryLoading, setItineraryLoading] = useState(true);
  const [itineraryError, setItineraryError] = useState<string | null>(null);

  // Track whether SSE has delivered flights so we don't overwrite them
  const sseFlightsDeliveredRef = useRef(false);

  // SSE pipeline active when callId is present — server sends flights via SSE
  const isSSEMode = !!callId;

  const fetchFlights = async () => {
    // Never overwrite SSE-delivered flights with a direct fetch
    if (sseFlightsDeliveredRef.current) return;
    setFlightsLoading(true);
    setFlightsError(null);
    try {
      const result = await searchFlights({
        origin:         tripInfo?.origin      || "SAN",
        destination:    tripInfo?.destination || "SJU",
        departure_date: tripInfo?.start       || "2026-04-01",
        passengers:     tripInfo?.numpassengers || 1,
      });
      // Double-check SSE hasn't arrived while we were fetching
      if (!sseFlightsDeliveredRef.current) {
        setFlightOffers(result.offers);
        setFlightRoute(result.route);
      }
    } catch (err) {
      console.error("Error fetching flights:", err);
      if (!sseFlightsDeliveredRef.current) {
        setFlightsError(err instanceof Error ? err.message : "Failed to load flights");
      }
    } finally {
      setFlightsLoading(false);
    }
  };

  const fetchReturnFlights = async () => {
    setReturnFlightsLoading(true);
    setReturnFlightsError(null);
    try {
      const result = await searchFlights({
        origin:         tripInfo?.destination || "SJU",
        destination:    tripInfo?.origin      || "SAN",
        departure_date: tripInfo?.end         || "2026-04-08",
        passengers:     tripInfo?.numpassengers || 1,
      });
      setReturnFlightOffers(result.offers);
    } catch (err) {
      console.error("Error fetching return flights:", err);
      setReturnFlightsError(err instanceof Error ? err.message : "Failed to load return flights");
    } finally {
      setReturnFlightsLoading(false);
    }
  };

  // When SSE flight offers arrive, use them directly and lock them in
  useEffect(() => {
    if (vapiFlightOffers && vapiFlightOffers.length > 0) {
      sseFlightsDeliveredRef.current = true;
      setFlightOffers(vapiFlightOffers);
      setFlightsLoading(false);
      setFlightsError(null);
    }
  }, [vapiFlightOffers]);

  // Fetch flights only in non-SSE mode. In SSE mode, just show loading until SSE delivers.
  useEffect(() => {
    // Always fetch return flights (SSE only covers outbound)
    fetchReturnFlights();

    if (!isSSEMode) {
      sseFlightsDeliveredRef.current = false;
      fetchFlights();
      return;
    }

    // In SSE mode, only show loading if SSE hasn't already delivered
    if (!sseFlightsDeliveredRef.current) {
      setFlightsLoading(true);
    }

    // Fallback: if SSE hasn't delivered offers within 20s, fetch directly
    const fallbackTimer = setTimeout(() => {
      if (!sseFlightsDeliveredRef.current && flightOffers.length === 0) {
        console.log('[TripPlanPanel] SSE fallback: 20s elapsed with no offers, fetching directly');
        fetchFlights();
      }
    }, 20_000);

    return () => clearTimeout(fallbackTimer);
    // Only run on initial mount / SSE mode change — NOT on tripInfo changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSSEMode]);

  // Fetch hotels from Duffel Stays API (via edge function)
  // In SSE mode, use travelInfo (from voice agent) for params; otherwise use tripInfo (from landing page)
  const fetchHotels = async () => {
    const dest = travelInfo?.destination || tripInfo?.destination;
    const checkIn = travelInfo?.departure_date || tripInfo?.start;
    const checkOut = travelInfo?.return_date || tripInfo?.end;
    const pax = travelInfo?.num_passengers
      ? parseInt(travelInfo.num_passengers, 10)
      : (tripInfo?.numpassengers ?? 1);

    // Don't fetch without a destination
    if (!dest) {
      setHotelsLoading(false);
      return;
    }

    setHotelsLoading(true);
    setHotelsError(null);
    try {
      const rooms = Math.ceil(pax / 2);
      const guests = Array.from(
        { length: pax },
        () => ({ type: "adult" as const })
      );
      const result = await searchHotels({
        destination:    dest,
        check_in_date:  checkIn || "2026-04-01",
        check_out_date: checkOut || "2026-04-08",
        rooms,
        guests,
      });
      setHotelOffers(result.hotels);
    } catch (err) {
      console.error("Error fetching hotels:", err);
      setHotelsError(err instanceof Error ? err.message : "Failed to load hotels");
    } finally {
      setHotelsLoading(false);
    }
  };

  // Fetch hotels when we have destination info (from landing page OR voice agent)
  useEffect(() => {
    const dest = travelInfo?.destination || tripInfo?.destination;
    if (dest) {
      fetchHotels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripInfo?.destination, travelInfo?.destination]);

  // Fetch AI-generated itinerary from Gemini
  const fetchItinerary = async () => {
    setItineraryLoading(true);
    setItineraryError(null);
    try {
      const start = tripInfo?.start || "2026-04-01";
      const end   = tripInfo?.end   || "2026-04-08";
      const numDays = Math.max(
        1,
        Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
      );
      const dest = tripInfo?.destination || "Paris";
      const days = await generateItinerary(dest, start, end, numDays);
      setItineraryDays(days);
      onItineraryReady?.(days);
    } catch (err) {
      console.error("Error generating itinerary:", err);
      setItineraryError(err instanceof Error ? err.message : "Failed to generate itinerary");
    } finally {
      setItineraryLoading(false);
    }
  };

  useEffect(() => {
    fetchItinerary();
  }, [tripInfo?.destination, tripInfo?.start, tripInfo?.end]);

  // Determine cheapest and fastest flights
  const cheapestOffer = flightOffers.length > 0 
    ? flightOffers.reduce((min, offer) => parseFloat(offer.total_amount) < parseFloat(min.total_amount) ? offer : min)
    : null;
  const fastestOffer = flightOffers.length > 0
    ? flightOffers.reduce((min, offer) => offer.duration_minutes < min.duration_minutes ? offer : min)
    : null;

  const cheapestReturnOffer = returnFlightOffers.length > 0
    ? returnFlightOffers.reduce((min, offer) => parseFloat(offer.total_amount) < parseFloat(min.total_amount) ? offer : min)
    : null;
  const fastestReturnOffer = returnFlightOffers.length > 0
    ? returnFlightOffers.reduce((min, offer) => offer.duration_minutes < min.duration_minutes ? offer : min)
    : null;

  // Format date for display
  const formatRouteDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  // Find the selected flight offer for price display.
  // Use a ref to preserve the selected offer even if flightOffers gets re-fetched with different IDs.
  const selectedFlightOfferRef = useRef<FlightOffer | null>(null);
  const selectedFlightOffer = (() => {
    if (!selectedOfferId) return null;
    const found = flightOffers.find((o) => o.offer_id === selectedOfferId) || null;
    if (found) {
      selectedFlightOfferRef.current = found;
      return found;
    }
    // Fallback: return the previously matched offer so payment section stays visible
    return selectedFlightOfferRef.current;
  })();

  const sections = [
    { id: "flights", title: "Flights", subtitle: flightsLoading ? "Searching flights..." : `${flightOffers.length} option${flightOffers.length !== 1 ? "s" : ""} found`, icon: Plane },
    {
      id: "return-flights",
      title: "Return Flights",
      subtitle: returnFlightsLoading
        ? "Searching return flights..."
        : `${returnFlightOffers.length} option${returnFlightOffers.length !== 1 ? "s" : ""} found`,
      icon: Plane,
    },
    {
      id: "stays",
      title: "Stays",
      subtitle: hotelsLoading
        ? "Searching hotels..."
        : hotelOffers.length > 0
          ? `${hotelOffers.length} hotel${hotelOffers.length > 1 ? "s" : ""} found`
          : "No hotels found",
      icon: Building2,
    },
    {
      id: "activities",
      title: "Day-by-Day",
      subtitle: itineraryLoading
        ? "Generating itinerary..."
        : itineraryDays.length > 0
          ? `${itineraryDays.length}-day itinerary`
          : "No itinerary yet",
      icon: Route,
    },
    ...(pipelinePhase && pipelinePhase >= 3
      ? [{
          id: "booking",
          title: "Complete Booking",
          subtitle: bookingConfirmation
            ? "Booking confirmed!"
            : isPassengerInfoComplete
              ? "Ready for payment"
              : "Collecting passenger details...",
          icon: CreditCard,
        }]
      : []),
  ];

  // Auto-expand booking section when Phase 3 starts
  useEffect(() => {
    if (pipelinePhase && pipelinePhase >= 3) {
      setExpandedSection("booking");
    }
  }, [pipelinePhase]);

  // Use route data from API, fallback to tripInfo props
  const destinationName = flightRoute?.destination_name || tripInfo?.destination || "Tokyo";
  const routeSubtitle = flightRoute 
    ? `${flightRoute.origin_code} → ${flightRoute.destination_code} • ${formatRouteDate(flightRoute.departure_date)}`
    : tripInfo?.dates || "March 15-22, 2024";

  return (
    <motion.div
      className="h-full flex flex-col overflow-hidden glass-card"
      style={{ fontSize: '1rem' }} // Lock font size to prevent resizing
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header with decorative elements */}
      <div className="p-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-ocean-light/5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold text-foreground">
              Your {destinationName} Adventure
            </h2>
            <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2">
              <MapPin size={14} className="text-primary" />
              {routeSubtitle}
            </p>
          </div>
          {/* Decorative flight path */}
          <div className="hidden md:block">
            <svg width="120" height="40" viewBox="0 0 120 40" className="text-primary/20">
              <path 
                d="M10 30 Q40 5 60 20 T110 10" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeDasharray="4 4"
                className="flight-path"
              />
              <circle cx="10" cy="30" r="3" fill="currentColor" />
              <circle cx="110" cy="10" r="3" fill="currentColor" />
            </svg>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-visible">
        {sections.map((section, sectionIndex) => (
          <motion.div
            key={section.id}
            className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-soft"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sectionIndex * 0.1 }}
          >
            {/* Section Header */}
            <button
              onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
              className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-ocean-light/10 border border-primary/20 flex items-center justify-center">
                  <section.icon size={20} className="text-primary" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">{section.title}</h3>
                  <p className="text-xs text-muted-foreground">{section.subtitle}</p>
                </div>
              </div>
              <motion.div
                animate={{ rotate: expandedSection === section.id ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={20} className="text-muted-foreground" />
              </motion.div>
            </button>

            {/* Section Content */}
            <AnimatePresence>
              {expandedSection === section.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 pt-0 space-y-3">
                      <>
                        {/* Flights */}
                        {section.id === "flights" && (
                          <>
                            {flightsLoading ? (
                              <>
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                              </>
                            ) : flightsError ? (
                              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center">
                                <AlertCircle size={24} className="mx-auto text-destructive mb-2" />
                                <p className="text-sm text-destructive mb-3">{flightsError}</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={fetchFlights}
                                  className="gap-2"
                                >
                                  <RefreshCw size={14} />
                                  Retry
                                </Button>
                              </div>
                            ) : flightOffers.length === 0 ? (
                              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-center">
                                <p className="text-sm text-muted-foreground">No flights found</p>
                              </div>
                            ) : (
                              flightOffers.map((flight, idx) => {
                                const isCheapest = cheapestOffer?.offer_id === flight.offer_id;
                                const isFastest = fastestOffer?.offer_id === flight.offer_id && !isCheapest;
                                
                                return (
                                  <motion.div
                                    key={flight.offer_id}
                                    className={cn(
                                      "p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 hover:shadow-soft transition-all",
                                      isCheapest && "ring-2 ring-green-500/30 border-green-500/50",
                                      isFastest && "ring-2 ring-blue-500/30 border-blue-500/50"
                                    )}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="font-semibold text-foreground">{flight.airline_name}</span>
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                            {flight.stops_count === 0 ? "Nonstop" : `${flight.stops_count} stop${flight.stops_count > 1 ? 's' : ''}`}
                                          </span>
                                          {isCheapest && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 border border-green-500/30">
                                              Cheapest
                                            </span>
                                          )}
                                          {isFastest && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 border border-blue-500/30">
                                              Fastest
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-4 text-sm">
                                          <span className="text-foreground font-medium">{formatTime(flight.depart_time)}</span>
                                          <div className="flex items-center gap-1 text-muted-foreground">
                                            <div className="w-2 h-2 rounded-full border border-primary" />
                                            <div className="w-12 h-px bg-primary/30" />
                                            <Clock size={12} className="text-primary" />
                                            <span className="text-xs">{flight.duration_formatted}</span>
                                            <div className="w-12 h-px bg-primary/30" />
                                            <Plane size={12} className="text-primary" />
                                          </div>
                                          <span className="text-foreground font-medium">{formatTime(flight.arrive_time)}</span>
                                        </div>
                                      </div>
                                      <div className="text-right ml-4">
                                        <p className="text-lg font-bold text-gradient-primary">
                                          {formatCurrency(flight.total_amount, flight.total_currency)}
                                        </p>
                                        <Button
                                          size="sm"
                                          className="mt-2 bg-gradient-to-r from-primary to-ocean-light text-white text-xs shadow-soft"
                                          onClick={() => {
                                            if (callId) {
                                              // SSE mode: notify server of selection → triggers Phase 3
                                              fetch('/api/select-flight', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ callId, offerId: flight.offer_id }),
                                              }).then(res => {
                                                if (!res.ok) {
                                                  onBook("flight", flight.airline_name, flight.offer_id, flight);
                                                }
                                              }).catch(() => {
                                                onBook("flight", flight.airline_name, flight.offer_id, flight);
                                              });
                                            } else {
                                              onBook("flight", flight.airline_name, flight.offer_id, flight);
                                            }
                                          }}
                                        >
                                          Book
                                        </Button>
                                      </div>
                                    </div>

                                    <FlightDetailsDropdown
                                      segments={flight.segments}
                                      totalEmissionsKg={flight.total_emissions_kg}
                                      open={expandedFlightId === flight.offer_id}
                                      onOpenChange={(open) => setExpandedFlightId(open ? flight.offer_id : null)}
                                    />
                                  </motion.div>
                                );
                              })
                            )}
                          </>
                        )}

                        {/* Return Flights */}
                        {section.id === "return-flights" && (
                          <>
                            {returnFlightsLoading ? (
                              <>
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                              </>
                            ) : returnFlightsError ? (
                              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center">
                                <AlertCircle size={24} className="mx-auto text-destructive mb-2" />
                                <p className="text-sm text-destructive mb-3">{returnFlightsError}</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={fetchReturnFlights}
                                  className="gap-2"
                                >
                                  <RefreshCw size={14} />
                                  Retry
                                </Button>
                              </div>
                            ) : returnFlightOffers.length === 0 ? (
                              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-center">
                                <p className="text-sm text-muted-foreground">No return flights found</p>
                              </div>
                            ) : (
                              returnFlightOffers.map((flight, idx) => {
                                const isCheapest = cheapestReturnOffer?.offer_id === flight.offer_id;
                                const isFastest = fastestReturnOffer?.offer_id === flight.offer_id && !isCheapest;

                                return (
                                  <motion.div
                                    key={flight.offer_id}
                                    className={cn(
                                      "p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 hover:shadow-soft transition-all",
                                      isCheapest && "ring-2 ring-green-500/30 border-green-500/50",
                                      isFastest && "ring-2 ring-blue-500/30 border-blue-500/50"
                                    )}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="font-semibold text-foreground">{flight.airline_name}</span>
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                            {flight.stops_count === 0 ? "Nonstop" : `${flight.stops_count} stop${flight.stops_count > 1 ? 's' : ''}`}
                                          </span>
                                          {isCheapest && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 border border-green-500/30">
                                              Cheapest
                                            </span>
                                          )}
                                          {isFastest && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 border border-blue-500/30">
                                              Fastest
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-4 text-sm">
                                          <span className="text-foreground font-medium">{formatTime(flight.depart_time)}</span>
                                          <div className="flex items-center gap-1 text-muted-foreground">
                                            <div className="w-2 h-2 rounded-full border border-primary" />
                                            <div className="w-12 h-px bg-primary/30" />
                                            <Clock size={12} className="text-primary" />
                                            <span className="text-xs">{flight.duration_formatted}</span>
                                            <div className="w-12 h-px bg-primary/30" />
                                            <Plane size={12} className="text-primary" />
                                          </div>
                                          <span className="text-foreground font-medium">{formatTime(flight.arrive_time)}</span>
                                        </div>
                                      </div>
                                      <div className="text-right ml-4">
                                        <p className="text-lg font-bold text-gradient-primary">
                                          {formatCurrency(flight.total_amount, flight.total_currency)}
                                        </p>
                                        <Button
                                          size="sm"
                                          className="mt-2 bg-gradient-to-r from-primary to-ocean-light text-white text-xs shadow-soft"
                                          onClick={() => onBook("flight", flight.airline_name, flight.offer_id, flight)}
                                        >
                                          Book
                                        </Button>
                                      </div>
                                    </div>

                                    <FlightDetailsDropdown
                                      segments={flight.segments}
                                      totalEmissionsKg={flight.total_emissions_kg}
                                      open={expandedFlightId === flight.offer_id}
                                      onOpenChange={(open) => setExpandedFlightId(open ? flight.offer_id : null)}
                                    />
                                  </motion.div>
                                );
                              })
                            )}
                          </>
                        )}

                        {/* Hotels */}
                        {section.id === "stays" && (
                          <>
                            {hotelsLoading ? (
                              <>
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                              </>
                            ) : hotelsError ? (
                              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center">
                                <AlertCircle size={24} className="mx-auto text-destructive mb-2" />
                                <p className="text-sm text-destructive mb-3">{hotelsError}</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={fetchHotels}
                                  className="gap-2"
                                >
                                  <RefreshCw size={14} />
                                  Retry
                                </Button>
                              </div>
                            ) : hotelOffers.length === 0 ? (
                              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-center">
                                <p className="text-sm text-muted-foreground">No hotels found</p>
                              </div>
                            ) : (
                              hotelOffers.map((hotel, idx) => (
                                <motion.div
                                  key={hotel.property_id}
                                  className="p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 hover:shadow-soft transition-all"
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.1 }}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <h4 className="font-semibold text-foreground mb-1">{hotel.name}</h4>
                                      <div className="flex items-center gap-2 mb-2">
                                        {hotel.star_rating !== null && (
                                          <div className="flex items-center gap-1">
                                            <Star size={14} className="text-accent fill-accent" />
                                            <span className="text-sm font-medium text-foreground">
                                              {hotel.star_rating}
                                            </span>
                                          </div>
                                        )}
                                        {hotel.review_score !== null && (
                                          <>
                                            <span className="text-muted-foreground text-xs">•</span>
                                            <span className="text-xs text-muted-foreground">
                                              {hotel.review_score.toFixed(1)} / 10
                                              {hotel.review_count !== null &&
                                                ` (${hotel.review_count} reviews)`}
                                            </span>
                                          </>
                                        )}
                                        {hotel.city && (
                                          <>
                                            <span className="text-muted-foreground text-xs">•</span>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                              <MapPin size={10} />
                                              {hotel.city}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                      {hotel.description && (
                                        <p className="text-sm text-muted-foreground line-clamp-2">
                                          {hotel.description}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right ml-4">
                                      <p className="text-lg font-bold text-gradient-primary">
                                        {formatCurrency(hotel.nightly_rate, hotel.currency)}
                                      </p>
                                      <p className="text-xs text-muted-foreground mb-2">/night</p>
                                      <Button
                                        size="sm"
                                        className="bg-gradient-to-r from-primary to-ocean-light text-white text-xs shadow-soft"
                                        onClick={() => onBook("hotel", hotel.name, hotel.search_result_id)}
                                      >
                                        Book
                                      </Button>
                                    </div>
                                  </div>
                                </motion.div>
                              ))
                            )}
                          </>
                        )}

                        {/* Booking / Passenger Details */}
                        {section.id === "booking" && callId && (
                          <PassengerDetailsPanel
                            callId={callId}
                            passengerInfo={passengerInfo || null}
                            isPassengerInfoComplete={isPassengerInfoComplete || false}
                            travelInfo={travelInfo || null}
                            selectedOfferId={selectedOfferId || null}
                            selectedFlightOffer={selectedFlightOffer}
                            duffelPassengerId={duffelPassengerId}
                            onBookingConfirmed={onBookingConfirmed}
                          />
                        )}

                        {/* Itinerary */}
                        {section.id === "activities" && (
                          <>
                            {itineraryLoading ? (
                              <>
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                              </>
                            ) : itineraryError ? (
                              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center">
                                <AlertCircle size={24} className="mx-auto text-destructive mb-2" />
                                <p className="text-sm text-destructive mb-3">{itineraryError}</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={fetchItinerary}
                                  className="gap-2"
                                >
                                  <RefreshCw size={14} />
                                  Retry
                                </Button>
                              </div>
                            ) : itineraryDays.length === 0 ? (
                              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-center">
                                <p className="text-sm text-muted-foreground">No itinerary generated</p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {itineraryDays.map((day, dayIdx) => (
                                  <motion.div
                                    key={day.day}
                                    className="relative"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: dayIdx * 0.1 }}
                                  >
                                    {/* Timeline connector */}
                                    {dayIdx < itineraryDays.length - 1 && (
                                      <div className="absolute left-5 top-12 bottom-0 w-px bg-gradient-to-b from-primary/50 to-transparent" />
                                    )}

                                    <div className="flex gap-4">
                                      {/* Day marker */}
                                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-ocean-light flex items-center justify-center text-white font-bold text-sm shadow-soft">
                                        {day.day}
                                      </div>

                                      {/* Content */}
                                      <div className="flex-1 pb-4">
                                        <h4 className="font-semibold text-foreground mb-3">{day.title}</h4>
                                        <div className="space-y-2">
                                          {day.activities.map((activity, actIdx) =>
                                            activity.is_free ? (
                                              <div
                                                key={actIdx}
                                                className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/30 hover:bg-muted/40 transition-colors"
                                              >
                                                <span className="text-xs text-primary font-medium w-16 flex-shrink-0 bg-primary/10 px-2 py-1 rounded-full text-center">
                                                  {activity.time}
                                                </span>
                                                <div className="flex items-center gap-2 flex-1">
                                                  <MapPin size={14} className="text-primary flex-shrink-0" />
                                                  <span className="text-sm text-foreground">{activity.activity}</span>
                                                </div>
                                              </div>
                                            ) : (
                                              <a
                                                key={actIdx}
                                                href={activity.booking_link ?? "#"}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/40 transition-colors"
                                              >
                                                <span className="text-xs text-primary font-medium w-16 flex-shrink-0 bg-primary/10 px-2 py-1 rounded-full text-center">
                                                  {activity.time}
                                                </span>
                                                <div className="flex items-center gap-2 flex-1">
                                                  <ExternalLink size={14} className="text-amber-500 flex-shrink-0" />
                                                  <span className="text-sm text-foreground">{activity.activity}</span>
                                                </div>
                                                <span className="text-xs text-amber-500 font-medium flex-shrink-0">Book →</span>
                                              </a>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
