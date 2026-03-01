import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnimatedMicrophoneProps {
  size?: "hero" | "large" | "panel";
  isListening?: boolean;
  isProcessing?: boolean;
  onClick?: () => void;
  layoutId?: string;
  className?: string;
}

export const AnimatedMicrophone = ({
  size = "panel",
  isListening = false,
  isProcessing = false,
  onClick,
  layoutId = "mic",
  className,
}: AnimatedMicrophoneProps) => {
  const isHero = size === "hero";
  const isLarge = size === "large";

  const containerSize = isHero ? "w-40 h-40" : isLarge ? "w-28 h-28" : "w-20 h-20";
  const iconSize = isHero ? 64 : isLarge ? 48 : 32;

  const getGradient = () => {
    if (isProcessing) return "from-ocean-mid to-ocean-light";
    if (isListening) return "from-teal-soft to-teal-light";
    return "from-primary to-ocean-light";
  };

  return (
    <div className="flex flex-col items-center">
      <motion.button
        layoutId={layoutId}
        onClick={onClick}
        className={cn(
          "relative flex items-center justify-center rounded-full cursor-pointer",
          containerSize,
          className
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {/* Outer glow rings */}
        {(isListening || isProcessing) && (
          <>
            {[0, 0.8, 1.6].map((delay, i) => (
              <motion.span
                key={i}
                className={cn(
                  "absolute inset-0 rounded-full bg-gradient-to-br",
                  getGradient()
                )}
                animate={{ scale: [1, 1, 1.5], opacity: [0, 0.35, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay, times: [0, 0.1, 1] }}
              />
            ))}
          </>
        )}

        {/* Static glow ring when idle */}
        {!isListening && !isProcessing && (
          <motion.span
            className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-ocean-light/20"
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* Main button background */}
        <motion.div
          className={cn(
            "absolute inset-2 rounded-full bg-gradient-to-br shadow-lg",
            getGradient()
          )}
          animate={isListening || isProcessing ? {
            boxShadow: [
              "0 0 30px -5px hsl(205 85% 50% / 0.3)",
              "0 0 50px -5px hsl(205 85% 50% / 0.5)",
              "0 0 30px -5px hsl(205 85% 50% / 0.3)"
            ]
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Glass highlight */}
        <div className="absolute inset-2 rounded-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-transparent" />
        </div>

        {/* Mic icon */}
        <motion.div
          className="relative z-10"
          animate={isListening ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.5, repeat: isListening ? Infinity : 0 }}
        >
          <Mic
            size={iconSize}
            className="drop-shadow-lg text-white"
            strokeWidth={2}
          />
        </motion.div>

        {/* Processing spinner */}
        {isProcessing && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-white/50"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        )}
      </motion.button>

      {/* Voice wave — outside the button so it centers properly */}
      <div className={cn("flex items-center justify-center transition-all duration-300", isListening ? "h-10" : "h-0 overflow-hidden")}>
        {isListening && (
          <motion.div
            className="flex items-center gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[8, 20, 28, 20, 8].map((maxH, i) => (
              <motion.span
                key={i}
                className="w-1 bg-primary rounded-full"
                animate={{ height: [4, maxH, 4] }}
                transition={{
                  duration: 0.5,
                  repeat: Infinity,
                  delay: i * 0.1,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
};
