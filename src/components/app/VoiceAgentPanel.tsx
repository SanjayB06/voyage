import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic } from "lucide-react";
import { AnimatedMicrophone } from "../ui/AnimatedMicrophone";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import type { VapiState } from "@/hooks/useVapi";

interface VoiceAgentPanelProps {
  onComplete: () => void;
  isActive: boolean;
  tripInfo?: {
    name: string;
    destination: string;
    dates: string;
    travelers: string;
  } | null;
  vapi: VapiState;
}

export const VoiceAgentPanel = ({ onComplete, isActive, tripInfo, vapi }: VoiceAgentPanelProps) => {
  const [inputValue, setInputValue] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const {
    startCall,
    endCall,
    sendText,
    isCallActive,
    isListening,
    isProcessing,
    messages,
    error,
    pipelinePhase,
  } = vapi;

  const isPhase3 = pipelinePhase === 3;

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  // Notify parent when all travel fields are collected
  useEffect(() => {
    if (vapi.travelInfo) {
      onComplete();
    }
  }, [vapi.travelInfo, onComplete]);

  const handleMicClick = () => {
    if (isCallActive) {
      endCall();
    } else {
      startCall();
    }
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendText(inputValue.trim());
    setInputValue("");
  };

  return (
    <motion.div
      className="h-full flex flex-col glass-card overflow-hidden min-h-0"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header with mic */}
      <div className="p-4 border-b border-border/50 bg-gradient-to-r from-primary/5 to-ocean-light/5">
        <div className="flex items-center gap-4">
          <AnimatedMicrophone
            size="panel"
            isListening={isListening}
            isProcessing={isProcessing}
            onClick={handleMicClick}
          />
          <div className="flex-1">
            <h2 className="font-display text-xl font-semibold text-foreground">
              {isPhase3 ? "Collecting Booking Details" : "Talk to Voyage"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isListening
                ? "Listening..."
                : isProcessing
                ? "Processing..."
                : isCallActive
                ? isPhase3
                  ? "Collecting phone, email & date of birth"
                  : "Voice call active — speak anytime"
                : "Click mic to start voice call"}
            </p>
          </div>
        </div>


        {/* Error display */}
        {error && (
          <p className="mt-2 text-xs text-red-500">{error}</p>
        )}
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scrollbar-visible p-4 space-y-4">
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: 0.4,
                type: "spring",
                stiffness: 200,
                damping: 20,
              }}
            >
              <div
                className={cn(
                  message.role === "user"
                    ? "chat-bubble-user"
                    : "chat-bubble-agent",
                  !message.isFinal && "opacity-70"
                )}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              className="flex justify-start"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="chat-bubble-agent">
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

      {/* Input area */}
      <div className="p-4 border-t border-border/50 bg-card/50">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a message..."
              className="pr-12 bg-background border-border rounded-full"
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full",
                isCallActive
                  ? "text-green-500 hover:text-green-600"
                  : "text-muted-foreground hover:text-primary"
              )}
              onClick={handleMicClick}
            >
              <Mic size={18} />
            </Button>
          </div>
          <Button
            size="icon"
            onClick={handleSend}
            className="h-10 w-10 rounded-full bg-gradient-to-r from-primary to-ocean-light text-white hover:opacity-90"
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
