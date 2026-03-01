import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Compass, PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { VoiceAgentPanel } from "./VoiceAgentPanel";
import { TripPlanPanel } from "./TripPlanPanel";
import { CalendarPanel } from "./CalendarPanel";
import { SyncAnimationPanel } from "./SyncAnimationPanel";
import { BookingModal } from "./BookingModal";
import { Button } from "../ui/button";
import type { VapiState } from "@/hooks/useVapi";
import type { FlightOffer, SegmentDetail } from "@/services/flightService";
import type { ActivityDay } from "@/services/activitiesService";
import { iataToCity } from "@/lib/iataToCity";

interface MainLayoutProps {
  onReset: () => void;
  tripInfo?: {
    name: string;
    destination: string;
    dates: string;
    travelers: string;
    origin?: string;
    start?: string;
    end?: string;
    numpassengers?: number;
    email?: string;
  } | null;
  vapi: VapiState;
}

export const MainLayout = ({ onReset, tripInfo, vapi }: MainLayoutProps) => {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [isPlanLoading, setIsPlanLoading] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [bookingModal, setBookingModal] = useState<{
    isOpen: boolean;
    type: string;
    item: string;
    offerId?: string;
  }>({ isOpen: false, type: "", item: "" });
  const [pendingFlightOffer, setPendingFlightOffer] = useState<FlightOffer | null>(null);
  const [itineraryDays, setItineraryDays] = useState<ActivityDay[]>([]);
  const [bookedFlights, setBookedFlights] = useState<Array<{
    departureDate: string;
    arrivalDate: string;
    segments: SegmentDetail[];
    airline: string;
    bookingReference: string;
  }>>([]);

  // Auto-complete onboarding since questions were answered on landing
  useEffect(() => {
    setIsOnboardingComplete(true);
    // Simulate loading delay
    setTimeout(() => setIsPlanLoading(false), 3000);
  }, []);

  const handleOnboardingComplete = () => {
    setIsOnboardingComplete(true);
    setIsPlanLoading(true);
    setTimeout(() => setIsPlanLoading(false), 4000);
  };

  const handleBook = (type: string, item: string, offerId?: string, flightOffer?: FlightOffer) => {
    setBookingModal({ isOpen: true, type, item, offerId });
    if (type === "flight" && flightOffer) {
      setPendingFlightOffer(flightOffer);
    }
  };

  const handleBookingSuccess = (ref: string) => {
    if (pendingFlightOffer) {
      setBookedFlights(prev => [...prev, {
        departureDate: pendingFlightOffer.depart_time,
        arrivalDate: pendingFlightOffer.arrive_time,
        segments: pendingFlightOffer.segments,
        airline: pendingFlightOffer.airline_name,
        bookingReference: ref,
      }]);
      setPendingFlightOffer(null);
    }
  };

  // Calculate grid columns based on panel states - use fixed widths to prevent content resizing
  const getGridColumns = () => {
    if (isLeftPanelOpen && isRightPanelOpen) return '380px minmax(500px, 1fr) 320px';
    if (isLeftPanelOpen && !isRightPanelOpen) return '380px minmax(500px, 1fr)';
    if (!isLeftPanelOpen && isRightPanelOpen) return 'minmax(500px, 1fr) 320px';
    return 'minmax(500px, 1fr)';
  };

  return (
    <div className="min-h-screen bg-gradient-sky">
      {/* Noise overlay */}
      <div className="noise-overlay" />
      
      {/* Background pattern */}
      <div className="fixed inset-0 map-pattern opacity-50" />
      
      {/* Top navigation bar */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-40 h-16 bg-white/80 backdrop-blur-lg border-b border-border/50 flex items-center px-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-ocean-light flex items-center justify-center">
            <Compass size={18} className="text-white" />
          </div>
          <h1 className="font-display text-xl font-semibold text-gradient-primary">
            Voyage
          </h1>
        </div>
        
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 text-sm">
            <motion.div
              className="w-2 h-2 rounded-full bg-green-500"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-muted-foreground">Voice agent ready</span>
            {tripInfo?.destination && (
              <span className="text-foreground ml-2">
                • Planning trip to <span className="font-medium">{iataToCity(tripInfo.destination)}</span>
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Left panel toggle */}
          <Button
            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            {isLeftPanelOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </Button>
          
          {/* Right panel toggle */}
          <Button
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            {isRightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </Button>
          
          <Button
            onClick={onReset}
            variant="outline"
            size="sm"
            className="rounded-full border-border hover:border-primary/50 hover:bg-primary/5"
          >
            <Plus size={16} className="mr-2" />
            New Trip
          </Button>
        </div>
      </motion.header>

      {/* Main content area */}
      <main className="lg:fixed lg:top-16 lg:bottom-0 lg:left-0 lg:right-0 lg:overflow-hidden pt-20 lg:pt-4 pb-6 lg:pb-4 px-4 lg:px-6">
        <div className="max-w-[1800px] mx-auto h-full">
          {/* Desktop: Multi-panel layout */}
          <div className="hidden lg:grid gap-4 h-full grid-rows-1" style={{
            gridTemplateColumns: getGridColumns()
          }}>
            {/* Left: Voice Agent Panel (collapsible) */}
            <AnimatePresence mode="popLayout">
              {isLeftPanelOpen && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  style={{ width: 380 }}
                  className="flex-shrink-0 h-full min-h-0 overflow-hidden"
                >
                  <VoiceAgentPanel
                    onComplete={handleOnboardingComplete}
                    isActive={true}
                    tripInfo={tripInfo}
                    vapi={vapi}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Center: Trip Plan Panel */}
            <motion.div
              className="h-full min-h-0"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <TripPlanPanel
                isLoading={isPlanLoading || !isOnboardingComplete}
                onBook={handleBook}
                tripInfo={tripInfo}
                vapiFlightOffers={vapi.flightOffers}
                callId={vapi.callId}
                pipelinePhase={vapi.pipelinePhase}
                passengerInfo={vapi.passengerInfo}
                isPassengerInfoComplete={vapi.isPassengerInfoComplete}
                travelInfo={vapi.travelInfo}
                selectedOfferId={vapi.selectedOfferId}
                bookingConfirmation={vapi.bookingConfirmation}
                duffelPassengerId={vapi.duffelPassengerId}
                onItineraryReady={setItineraryDays}
              />
            </motion.div>

            {/* Right: Calendar + Sync panels stacked (collapsible) */}
            <AnimatePresence mode="popLayout">
              {isRightPanelOpen && (
                <motion.div
                  className="flex flex-col gap-4 h-full min-h-0 flex-shrink-0"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  style={{ width: 320 }}
                >
                  <motion.div
                    className="flex-[3] min-h-0 overflow-hidden"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <CalendarPanel
                      previewStart={tripInfo?.start}
                      previewEnd={tripInfo?.end}
                      bookedFlights={bookedFlights}
                      userEmail={tripInfo?.email}
                      itineraryDays={itineraryDays}
                    />
                  </motion.div>
                  <motion.div
                    className="flex-[1] min-h-0 overflow-hidden"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                  >
                    <SyncAnimationPanel
                      isLoading={isPlanLoading}
                    />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile/Tablet: Stacked layout */}
          <div className="lg:hidden flex flex-col gap-4">
            {/* Voice Agent Panel */}
            <div className="min-h-[400px]">
              <VoiceAgentPanel
                onComplete={handleOnboardingComplete}
                isActive={true}
                tripInfo={tripInfo}
                vapi={vapi}
              />
            </div>

            {/* Trip Plan Panel */}
            <div className="min-h-[500px]">
              <TripPlanPanel
                isLoading={isPlanLoading || !isOnboardingComplete}
                onBook={handleBook}
                tripInfo={tripInfo}
                vapiFlightOffers={vapi.flightOffers}
                callId={vapi.callId}
                pipelinePhase={vapi.pipelinePhase}
                passengerInfo={vapi.passengerInfo}
                isPassengerInfoComplete={vapi.isPassengerInfoComplete}
                travelInfo={vapi.travelInfo}
                selectedOfferId={vapi.selectedOfferId}
                bookingConfirmation={vapi.bookingConfirmation}
                duffelPassengerId={vapi.duffelPassengerId}
                onItineraryReady={setItineraryDays}
              />
            </div>

            {/* Calendar Panel */}
            <div className="min-h-[300px]">
              <CalendarPanel
                previewStart={tripInfo?.start}
                previewEnd={tripInfo?.end}
                bookedFlights={bookedFlights}
                userEmail={tripInfo?.email}
              />
            </div>
            
            {/* Sync Animation Panel */}
            <div className="min-h-[200px]">
              <SyncAnimationPanel 
                isLoading={isPlanLoading}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Booking Modal */}
      <BookingModal
        isOpen={bookingModal.isOpen}
        onClose={() => setBookingModal({ isOpen: false, type: "", item: "" })}
        bookingType={bookingModal.type}
        bookingItem={bookingModal.item}
        offerId={bookingModal.offerId}
        passengerName={tripInfo?.name}
        passengerEmail={tripInfo?.email}
        onBookingSuccess={handleBookingSuccess}
      />
    </div>
  );
};
