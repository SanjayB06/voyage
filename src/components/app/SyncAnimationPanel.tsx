import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncAnimationPanelProps {
  isLoading: boolean;
  onComplete?: () => void;
}

const statusMessages = [
  "Syncing itinerary...",
  "Ready!",
];

const NODE_COLORS = [
  "#5BB8D4", // ocean-light blue
  "#E84A27", // orange
  "#a78bfa", // purple
  "#34d399", // green
  "#fbbf24", // amber
  "#ffffff",  // center — white
];

const PARTICLE_COLORS = [
  "#5BB8D4",
  "#E84A27",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#60a5fa",
  "#5BB8D4",
  "#E84A27",
  "#a78bfa",
];

export const SyncAnimationPanel = ({ isLoading, onComplete }: SyncAnimationPanelProps) => {
  const [currentStatus, setCurrentStatus] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setCurrentStatus(0);
      setIsComplete(false);

      const interval = setInterval(() => {
        setCurrentStatus((prev) => {
          if (prev < statusMessages.length - 1) {
            return prev + 1;
          }
          clearInterval(interval);
          setIsComplete(true);
          onComplete?.();
          return prev;
        });
      }, 800);

      return () => clearInterval(interval);
    }
  }, [isLoading, onComplete]);

  const nodes = [
    { x: 50, y: 30 },
    { x: 20, y: 50 },
    { x: 80, y: 50 },
    { x: 35, y: 70 },
    { x: 65, y: 70 },
    { x: 50, y: 50 },
  ];

  const connections = [
    [0, 5], [1, 5], [2, 5], [3, 5], [4, 5],
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 4],
  ];

  return (
    <motion.div
      className="glass-card h-full flex flex-col overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/30 bg-gradient-to-r from-primary/5 to-ocean-light/5">
        <div className="flex items-center gap-2">
          <motion.div
            className={cn("w-2 h-2 rounded-full", isComplete ? "bg-green-500" : "")}
            style={!isComplete ? { background: "linear-gradient(135deg, #5BB8D4, #E84A27)" } : {}}
            animate={!isComplete ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-sm font-medium text-foreground">
            {isComplete ? "Itinerary Ready" : "Syncing itinerary..."}
          </span>
        </div>
      </div>

      {/* Animation area */}
      <div className="flex-1 relative overflow-hidden p-4">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <defs>
            {connections.map((_, i) => (
              <linearGradient key={`grad-${i}`} id={`linegrad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={PARTICLE_COLORS[i % PARTICLE_COLORS.length]} stopOpacity="0.8" />
                <stop offset="100%" stopColor={PARTICLE_COLORS[(i + 3) % PARTICLE_COLORS.length]} stopOpacity="0.3" />
              </linearGradient>
            ))}
          </defs>

          {/* Connections */}
          {connections.map(([from, to], index) => (
            <motion.line
              key={`line-${index}`}
              x1={`${nodes[from].x}%`}
              y1={`${nodes[from].y}%`}
              x2={`${nodes[to].x}%`}
              y2={`${nodes[to].y}%`}
              stroke={isComplete ? "hsl(142 76% 36%)" : PARTICLE_COLORS[index % PARTICLE_COLORS.length]}
              strokeWidth="0.6"
              strokeOpacity={0.35}
              initial={{ pathLength: 0 }}
              animate={{
                pathLength: 1,
                strokeOpacity: isLoading && !isComplete ? [0.2, 0.6, 0.2] : 0.35,
              }}
              transition={{
                pathLength: { duration: 0.5, delay: index * 0.05 },
                strokeOpacity: { duration: 1.5 + index * 0.1, repeat: Infinity },
              }}
            />
          ))}

          {/* Data flow particles */}
          {isLoading && !isComplete && connections.map(([from, to], index) => (
            <motion.circle
              key={`particle-${index}`}
              r="1.8"
              fill={PARTICLE_COLORS[index % PARTICLE_COLORS.length]}
              initial={{
                cx: `${nodes[from].x}%`,
                cy: `${nodes[from].y}%`,
                opacity: 0,
              }}
              animate={{
                cx: [`${nodes[from].x}%`, `${nodes[to].x}%`],
                cy: [`${nodes[from].y}%`, `${nodes[to].y}%`],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 1.2 + index * 0.1,
                delay: index * 0.18,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}

          {/* Nodes */}
          {nodes.map((node, index) => (
            <motion.circle
              key={`node-${index}`}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r={index === 5 ? "4.5" : "2.5"}
              fill={isComplete && index === 5 ? "hsl(142 76% 36%)" : NODE_COLORS[index]}
              stroke={NODE_COLORS[index]}
              strokeWidth={index === 5 ? "1.5" : "0.8"}
              strokeOpacity={0.6}
              initial={{ scale: 0 }}
              animate={{
                scale: index === 5 && isLoading && !isComplete ? [1, 1.2, 1] : 1,
              }}
              transition={{
                scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
                default: { delay: index * 0.05, type: "spring" },
              }}
            />
          ))}
        </svg>

        {/* Central rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Outer rotating gradient ring */}
          <motion.div
            className="w-20 h-20 rounded-full"
            style={{
              border: "2px dashed transparent",
              background: "linear-gradient(#0f0f0f, #0f0f0f) padding-box, linear-gradient(135deg, #5BB8D4, #E84A27, #a78bfa) border-box",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />

          {/* Inner counter-rotating ring */}
          <motion.div
            className="absolute w-12 h-12 rounded-full"
            style={{
              border: "1.5px solid transparent",
              background: "linear-gradient(#0f0f0f, #0f0f0f) padding-box, linear-gradient(135deg, #fbbf24, #5BB8D4) border-box",
            }}
            animate={{ rotate: -360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />

          {/* Complete animation */}
          <AnimatePresence>
            {isComplete && (
              <motion.div
                className="absolute flex items-center justify-center"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <Check size={20} className="text-white" />
                </div>
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0],
                      x: Math.cos(i * 60 * Math.PI / 180) * 40,
                      y: Math.sin(i * 60 * Math.PI / 180) * 40,
                    }}
                    transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                  >
                    <Sparkles size={12} className="text-accent" />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Status text */}
      <div className="px-4 py-2 border-t border-border/30 bg-muted/20">
        <AnimatePresence mode="wait">
          <motion.p
            key={currentStatus}
            className={cn(
              "text-xs text-center",
              isComplete ? "text-green-600 font-medium" : "text-muted-foreground"
            )}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {statusMessages[currentStatus]}
          </motion.p>
        </AnimatePresence>

        {/* Progress dots — each a different color */}
        <div className="flex justify-center gap-1.5 mt-3">
          {statusMessages.map((_, index) => (
            <motion.div
              key={index}
              className="w-1.5 h-1.5 rounded-full transition-all duration-300"
              style={{
                background: index <= currentStatus
                  ? (isComplete ? "#22c55e" : NODE_COLORS[index % NODE_COLORS.length])
                  : undefined,
              }}
              initial={{ scale: 0 }}
              animate={{ scale: index === currentStatus && !isComplete ? [1, 1.4, 1] : 1 }}
              transition={{ duration: 0.8, repeat: index === currentStatus ? Infinity : 0 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};
