import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ImagePlus, Loader2 } from "lucide-react";
import { BackgroundCarousel } from "./BackgroundCarousel";
import { AnimatedMicrophone } from "../ui/AnimatedMicrophone";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import type { VapiState } from "@/hooks/useVapi";

interface LandingViewProps {
  onStart: (answers: OnboardingAnswers) => void;
  vapi: VapiState;
}

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

export const LandingView = ({ onStart, vapi }: LandingViewProps) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startCall, sendText, isCallActive, isListening, isProcessing, messages, filledFields, error } = vapi;

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  const handleStartConversation = async () => {
    setHasStarted(true);
    await startCall();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed (HTTP ${res.status})`);
      }

      const { imageSessionId } = await res.json();
      setHasStarted(true);
      await startCall(imageSessionId);
    } catch (err: any) {
      console.error("[LandingView] Image upload error:", err);
      setUploadError(err.message || "Failed to analyze image");
    } finally {
      setIsAnalyzing(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    sendText(inputValue.trim());
    setInputValue("");
  };

  // Progress dots: 6 fields to collect
  const totalFields = 8;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <BackgroundCarousel />

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/50 z-[1]" />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <AnimatePresence mode="wait">
          {!hasStarted ? (
            /* Initial Landing State - Minimal */
            <motion.div
              key="landing-intro"
              className="flex flex-col items-center"
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5 }}
            >
              {/* Logo/Brand */}
              <motion.div
                className="mb-8"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <h1 className="font-display text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-white drop-shadow-lg">
                  Voyage
                </h1>
              </motion.div>

              {/* Subtitle - Minimal */}
              <motion.div
                className="text-center mb-16 max-w-xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              >
                <h2 className="text-2xl md:text-3xl font-display font-medium text-white drop-shadow-md">
                  Your AI Travel Agent
                </h2>
              </motion.div>

              {/* Microphone Hero - Central Focus */}
              <motion.div
                className="relative"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.6, type: "spring" }}
              >
                <AnimatedMicrophone
                  size="hero"
                  onClick={handleStartConversation}
                />

                {/* Tap to talk label */}
                <motion.p
                  className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-sm text-white/70 whitespace-nowrap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    Tap to start
                  </span>
                </motion.p>
              </motion.div>

              {/* Image upload option */}
              <motion.div
                className="mt-24 flex flex-col items-center gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Analyzing photo...
                    </>
                  ) : (
                    <>
                      <ImagePlus size={16} />
                      or upload a travel photo
                    </>
                  )}
                </button>
                {uploadError && (
                  <p className="text-red-300 text-xs">{uploadError}</p>
                )}
              </motion.div>
            </motion.div>
          ) : (
            /* Onboarding Chat State - Voice-First */
            <motion.div
              key="onboarding-chat"
              className="w-full max-w-xl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Large mic indicator - fixed height to prevent layout shifts from wave */}
              <motion.div
                className="flex justify-center mb-8 h-44"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
              >
                <AnimatedMicrophone
                  size="large"
                  isListening={isListening}
                  isProcessing={isProcessing}
                />
              </motion.div>

              {/* Error message */}
              {error && (
                <motion.div
                  className="mb-4 p-3 rounded-xl bg-red-500/20 text-red-200 text-sm text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {error}
                </motion.div>
              )}

              {/* Call status */}
              {hasStarted && !isCallActive && !error && messages.length === 0 && (
                <motion.div
                  className="mb-4 text-center text-white/60 text-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  Connecting to voice agent...
                </motion.div>
              )}

              {/* Chat container */}
              <motion.div
                ref={chatContainerRef}
                className="glass-card-dark p-5 mb-4 h-[320px] overflow-y-auto scrollbar-visible"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="space-y-4">
                  <AnimatePresence mode="popLayout">
                    {messages.map((message) => (
                      <motion.div
                        key={message.id}
                        className={cn(
                          "flex",
                          message.role === "user" ? "justify-end" : "justify-start"
                        )}
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                      >
                        <div
                          className={cn(
                            "px-4 py-3 rounded-2xl max-w-[85%] text-base",
                            message.role === "user"
                              ? "bg-gradient-to-r from-primary to-ocean-light text-white rounded-br-sm"
                              : "bg-white/90 text-gray-800 rounded-bl-sm",
                            !message.isFinal && "opacity-70"
                          )}
                        >
                          {message.content}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Typing indicator when agent is processing */}
                  <AnimatePresence>
                    {isProcessing && (
                      <motion.div
                        className="flex justify-start"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <div className="bg-white/90 text-gray-800 px-4 py-3 rounded-2xl rounded-bl-sm">
                          <div className="flex items-center gap-1.5">
                            {[0, 1, 2].map((i) => (
                              <motion.span
                                key={i}
                                className="w-2 h-2 rounded-full bg-primary/60"
                                animate={{ y: [0, -4, 0] }}
                                transition={{
                                  duration: 0.6,
                                  repeat: Infinity,
                                  delay: i * 0.15,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>

              {/* Input area */}
              <motion.div
                className="flex items-center gap-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <div className="relative flex-1">
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Type your answer..."
                    className="pr-4 bg-white/90 border-white/20 rounded-full text-gray-800 placeholder:text-gray-500 h-14 text-base"
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    autoFocus
                  />
                </div>
                <Button
                  size="icon"
                  onClick={handleSendMessage}
                  className="h-14 w-14 rounded-full bg-gradient-to-r from-primary to-ocean-light text-white hover:opacity-90 shadow-lg"
                  disabled={!inputValue.trim()}
                >
                  <Send size={20} />
                </Button>
              </motion.div>

              {/* Progress indicator - based on real field collection */}
              <motion.div
                className="flex justify-center gap-2 mt-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {Array.from({ length: totalFields }).map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "w-2.5 h-2.5 rounded-full transition-all duration-300",
                      idx < filledFields ? "bg-white" : "bg-white/30"
                    )}
                  />
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
