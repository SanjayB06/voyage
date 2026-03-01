import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LandingView } from "@/components/landing/LandingView";
import { MainLayout } from "@/components/app/MainLayout";
import { useVapi } from "@/hooks/useVapi";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface OnboardingAnswers {
  name: string;
  destination: string;
  dates: string;
  travelers: string;
  origin?: string;
  start?: string;
  end?: string;
  numpassengers?: number;
  email?: string;
}

const Index = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [tripInfo, setTripInfo] = useState<OnboardingAnswers | null>(null);

  const vapi = useVapi();

  // Auto-transition when all 6 fields are collected and travelInfo is available
  useEffect(() => {
    if (vapi.travelInfo && vapi.filledFields === 8 && !hasStarted) {
      const info = vapi.travelInfo;
      const answers: OnboardingAnswers = {
        name: `${info.first_name || ""} ${info.last_name || ""}`.trim(),
        destination: info.destination || "",
        dates: `${info.departure_date || ""} - ${info.return_date || ""}`,
        travelers: info.num_passengers || "1",
        origin: info.origin || undefined,
        start: info.departure_date || undefined,
        end: info.return_date || undefined,
        numpassengers: info.num_passengers ? parseInt(info.num_passengers, 10) : undefined,
      };
      setTripInfo(answers);
      // Short delay so the user sees the "generating" message
      setTimeout(() => setHasStarted(true), 2000);
    }
  }, [vapi.travelInfo, vapi.filledFields, hasStarted]);

  const handleStart = (answers: OnboardingAnswers) => {
    setTripInfo(answers);
    setHasStarted(true);
  };

  const handleReset = () => {
    setHasStarted(false);
    setTripInfo(null);
    vapi.endCall();
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background overflow-hidden">
        <AnimatePresence mode="wait">
          {!hasStarted ? (
            <motion.div
              key="landing"
              initial={{ opacity: 1, x: 0 }}
              exit={{
                x: "-100%",
                opacity: 0,
              }}
              transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
              className="absolute inset-0"
            >
              <LandingView onStart={handleStart} vapi={vapi} />
            </motion.div>
          ) : (
            <motion.div
              key="main"
              initial={{
                x: "100%",
                opacity: 0,
              }}
              animate={{
                x: 0,
                opacity: 1,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
              className="absolute inset-0"
            >
              <MainLayout onReset={handleReset} tripInfo={tripInfo} vapi={vapi} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
};

export default Index;
