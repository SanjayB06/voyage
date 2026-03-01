import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import travelSantorini from "@/assets/travel-santorini.jpg";
import travelMaldives from "@/assets/travel-maldives.jpg";
import travelSwiss from "@/assets/travel-swiss.jpg";
import travelParis from "@/assets/travel-paris.jpg";
import travelTokyo from "@/assets/travel-tokyo.jpg";

const images = [
  { src: travelSantorini, alt: "Santorini, Greece" },
  { src: travelMaldives, alt: "Maldives" },
  { src: travelSwiss, alt: "Swiss Alps" },
  { src: travelParis, alt: "Paris, France" },
  { src: travelTokyo, alt: "Tokyo, Japan" },
];

export const BackgroundCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <AnimatePresence mode="sync">
        <motion.div
          key={currentIndex}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        >
          <img
            src={images[currentIndex].src}
            alt={images[currentIndex].alt}
            className="w-full h-full object-cover"
          />
        </motion.div>
      </AnimatePresence>
      
      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background/90" />
      
      {/* Additional vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(220_30%_6%/0.7)_100%)]" />
      
      {/* Map contour pattern overlay */}
      <div className="absolute inset-0 map-pattern opacity-50" />
      
      {/* Dotted flight path SVG overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(24 95% 53%)" stopOpacity="0" />
            <stop offset="50%" stopColor="hsl(24 95% 53%)" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(24 95% 53%)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M-50,200 Q200,100 400,180 T800,120 T1200,200 T1600,150 T2000,200"
          fill="none"
          stroke="url(#pathGradient)"
          strokeWidth="2"
          className="flight-path"
        />
        <path
          d="M-50,400 Q300,300 500,380 T900,320 T1300,400 T1700,350 T2100,400"
          fill="none"
          stroke="url(#pathGradient)"
          strokeWidth="1.5"
          className="flight-path"
          style={{ animationDelay: "-10s" }}
        />
      </svg>
      
      {/* Location indicator */}
      <motion.div
        className="absolute bottom-8 left-8 flex items-center gap-2 text-foreground/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <span className="text-sm font-medium">{images[currentIndex].alt}</span>
      </motion.div>
      
      {/* Carousel indicators */}
      <div className="absolute bottom-8 right-8 flex gap-2">
        {images.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentIndex 
                ? "bg-primary w-6" 
                : "bg-foreground/30 hover:bg-foreground/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
