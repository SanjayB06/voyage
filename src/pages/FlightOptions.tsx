import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, Clock, RefreshCw, AlertCircle, Sparkles, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchFlights, FlightOffer, FlightRoute } from "@/services/flightService";
import { FlightDetailsDropdown } from "@/components/flights/FlightDetailsDropdown";

const FlightSkeleton = () => (
  <div className="bg-card border border-border rounded-2xl p-6 animate-pulse">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-32 bg-muted rounded" />
          <div className="h-4 w-24 bg-muted rounded" />
        </div>
      </div>
      <div className="flex-1 mx-8">
        <div className="flex items-center justify-center gap-4">
          <div className="text-center space-y-1">
            <div className="h-6 w-16 bg-muted rounded mx-auto" />
            <div className="h-4 w-10 bg-muted rounded mx-auto" />
          </div>
          <div className="h-0.5 w-24 bg-muted rounded" />
          <div className="text-center space-y-1">
            <div className="h-6 w-16 bg-muted rounded mx-auto" />
            <div className="h-4 w-10 bg-muted rounded mx-auto" />
          </div>
        </div>
      </div>
      <div className="text-right space-y-2">
        <div className="h-8 w-24 bg-muted rounded ml-auto" />
        <div className="h-10 w-32 bg-muted rounded ml-auto" />
      </div>
    </div>
  </div>
);

const formatTime = (isoString: string) => {
  if (!isoString) return "--:--";
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
};

const formatCurrency = (amount: string, currency: string) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(parseFloat(amount));
};

const formatDate = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function FlightOptions() {
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [route, setRoute] = useState<FlightRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  const fetchFlights = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await searchFlights({
        origin: "DEL",
        destination: "ZRH",
        departure_date: "2026-03-15"
      });
      setOffers(result.offers);
      setRoute(result.route);
    } catch (err: unknown) {
      console.error("Error fetching flights:", err);
      setError(err instanceof Error ? err.message : "Failed to load flight options");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlights();
  }, []);

  const handleSelectFlight = (offerId: string) => {
    setSelectedOfferId(offerId);
    console.log("Selected flight offer:", offerId);
  };

  // Determine badges
  const cheapestId = offers.length > 0 ? offers[0].offer_id : null;
  const fastestOffer = offers.length > 0 
    ? offers.reduce((min, o) => o.duration_minutes < min.duration_minutes ? o : min, offers[0])
    : null;
  const fastestId = fastestOffer?.offer_id !== cheapestId ? fastestOffer?.offer_id : null;

  // Get origin/destination from first offer (all offers have same route)
  const originCode = offers.length > 0 && offers[0].segments.length > 0 
    ? offers[0].segments[0].origin_code 
    : "---";
  const destinationCode = offers.length > 0 && offers[0].segments.length > 0
    ? offers[0].segments[offers[0].segments.length - 1].destination_code
    : "---";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">
                {route ? `${route.origin_name} to ${route.destination_name}` : "Top Flight Options"}
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Plane size={16} className="text-primary" />
                {/* CHANGED: Now uses dynamic airport codes */}
                {loading ? "Loading..." : `${originCode} → ${destinationCode} • Feb 24, 2026 • 1 Adult • Economy`}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={fetchFlights}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Error State */}
        <AnimatePresence mode="wait">
          {error && !loading && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3"
            >
              <AlertCircle className="text-destructive" size={20} />
              <div className="flex-1">
                <p className="font-medium text-destructive">Error loading flights</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchFlights}>
                Retry
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            <FlightSkeleton />
            <FlightSkeleton />
            <FlightSkeleton />
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && offers.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Plane size={32} className="text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No flights found</h3>
            <p className="text-muted-foreground mb-6">
              We couldn't find any flights for this route and date.
            </p>
            <Button onClick={fetchFlights} className="gap-2">
              <RefreshCw size={16} />
              Try Again
            </Button>
          </motion.div>
        )}

        {/* Flight Cards */}
        {!loading && offers.length > 0 && (
          <div className="space-y-4">
            {offers.map((offer, index) => {
              const isCheapest = offer.offer_id === cheapestId;
              const isFastest = offer.offer_id === fastestId;
              const isSelected = offer.offer_id === selectedOfferId;

              // Get origin/destination for THIS specific offer
              const offerOrigin = offer.segments[0]?.origin_code || "---";
              const offerDestination = offer.segments[offer.segments.length - 1]?.destination_code || "---";

              return (
                <motion.div
                  key={offer.offer_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`
                    bg-card border rounded-2xl p-6 transition-all duration-200
                    hover:shadow-lg hover:border-primary/30
                    ${isSelected ? "ring-2 ring-primary border-primary" : "border-border"}
                  `}
                >
                  {/* Badges Row */}
                  {(isCheapest || isFastest) && (
                    <div className="flex gap-2 mb-4">
                      {isCheapest && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 border border-green-500/20">
                          <Sparkles size={12} />
                          Cheapest
                        </span>
                      )}
                      {isFastest && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                          <Zap size={12} />
                          Fastest
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-4">
                    {/* Airline Info */}
                    <div className="flex items-center gap-4 min-w-[180px]">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-primary">{offer.airline_code}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{offer.airline_name}</p>
                        <p className="text-sm text-muted-foreground">{offer.segments_summary}</p>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex-1 flex items-center justify-center gap-3 min-w-[240px]">
                      <div className="text-center">
                        <p className="text-xl font-bold text-foreground">{formatTime(offer.depart_time)}</p>
                        {/* CHANGED: Now uses dynamic airport code */}
                        <p className="text-sm text-muted-foreground">{offerOrigin}</p>
                      </div>
                      
                      <div className="flex-1 max-w-[140px] relative">
                        <div className="h-0.5 bg-gradient-to-r from-primary/50 via-primary to-primary/50 rounded-full" />
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-background px-2">
                          <ArrowRight size={16} className="text-primary" />
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <p className="text-xl font-bold text-foreground">{formatTime(offer.arrive_time)}</p>
                        {/* CHANGED: Now uses dynamic airport code */}
                        <p className="text-sm text-muted-foreground">{offerDestination}</p>
                      </div>
                    </div>

                    {/* Meta Badges */}
                    <div className="flex flex-wrap gap-2 min-w-[160px] justify-center">
                      <span className={`
                        inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                        ${offer.stops_count === 0 
                          ? "bg-primary/10 text-primary border border-primary/20" 
                          : "bg-muted text-muted-foreground border border-border"}
                      `}>
                        {offer.stops_count === 0 ? "Nonstop" : `${offer.stops_count} stop${offer.stops_count > 1 ? "s" : ""}`}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                        <Clock size={12} />
                        {offer.duration_formatted}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                        {route?.cabin_class ? route.cabin_class.charAt(0).toUpperCase() + route.cabin_class.slice(1) : "Economy"}
                      </span>
                    </div>

                    {/* Price & CTA */}
                    <div className="text-right min-w-[140px]">
                      <p className="text-2xl font-bold text-foreground">
                        {formatCurrency(offer.total_amount, offer.total_currency)}
                      </p>
                      <Button
                        className="mt-2 w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                        onClick={() => handleSelectFlight(offer.offer_id)}
                      >
                        {isSelected ? "Selected" : "Select this flight"}
                      </Button>
                    </div>
                  </div>

                  <FlightDetailsDropdown
                    segments={offer.segments}
                    totalEmissionsKg={offer.total_emissions_kg}
                    open={expandedOfferId === offer.offer_id}
                    onOpenChange={(open) => setExpandedOfferId(open ? offer.offer_id : null)}
                  />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}