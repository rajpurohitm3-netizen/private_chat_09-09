"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, Sparkles } from "lucide-react";

interface TimeLeft {
  years: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function Countdown() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    const startDate = new Date("2022-06-28T07:05:00");

    const calculateTime = () => {
      const now = new Date();
      const diff = now.getTime() - startDate.getTime();

      if (diff < 0) {
        setTimeLeft({ years: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      let years = now.getFullYear() - startDate.getFullYear();
      let yearStart = new Date(startDate);
      yearStart.setFullYear(startDate.getFullYear() + years);
      
      if (yearStart > now) {
        years--;
        yearStart = new Date(startDate);
        yearStart.setFullYear(startDate.getFullYear() + years);
      }
      
      const diffAfterYears = now.getTime() - yearStart.getTime();
      const days = Math.floor(diffAfterYears / (1000 * 60 * 60 * 24));
      
      const totalSeconds = Math.floor(diff / 1000);
      const h = Math.floor((totalSeconds % 86400) / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;

      setTimeLeft({
        years,
        days,
        hours: h,
        minutes: m,
        seconds: s
      });
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!timeLeft) return null;

  const TimeUnit = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center justify-center bg-[#1e3a8a]/40 border border-white/10 rounded-2xl w-full aspect-square md:aspect-auto md:h-32 p-4 backdrop-blur-md shadow-xl">
      <span className="text-3xl md:text-5xl font-black text-white leading-none mb-2">
        {value}
      </span>
      <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/60">
        {label}
      </span>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-gradient-to-br from-[#0c24a1] to-[#06114f] border border-white/10 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden shadow-2xl"
    >
      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-20" 
           style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      
      <div className="relative z-10 flex flex-col items-center">
        <div className="flex items-center gap-3 mb-10">
          <Heart className="w-8 h-8 text-blue-400 fill-blue-400 animate-pulse" />
          <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tight uppercase">
            Our Journey Since 28/06/2022
          </h2>
          <Sparkles className="w-8 h-8 text-blue-400 animate-spin-slow" />
        </div>

        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 md:gap-4 w-full">
          <TimeUnit value={timeLeft.years} label="Years" />
          <TimeUnit value={timeLeft.days} label="Days" />
          <TimeUnit value={timeLeft.hours} label="Hours" />
          <TimeUnit value={timeLeft.minutes} label="Minutes" />
          <TimeUnit value={timeLeft.seconds} label="Seconds" />
        </div>

        <div className="mt-10 flex items-center gap-2">
          <p className="text-xs md:text-sm font-black italic uppercase tracking-widest text-white/50">
            Every moment with you is precious
          </p>
          <Heart className="w-4 h-4 text-blue-400 fill-blue-400" />
        </div>
      </div>
    </motion.div>
  );
}
