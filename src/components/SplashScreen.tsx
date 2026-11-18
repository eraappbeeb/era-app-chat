import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { ERA_LOGO_SRC } from '../lib/utils';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onComplete();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-full bg-[#000000] flex flex-col items-center justify-between overflow-hidden overscroll-none select-none px-6 py-10">
      {/* Top spacer to keep logo optically centered like WhatsApp splash */}
      <div className="h-12" aria-hidden="true" />

      {/* Center ERA Logo — exact image, uncropped, burgundy #A4133C on #000000 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center justify-center"
      >
        <img
          src={ERA_LOGO_SRC}
          alt="ERA"
          draggable={false}
          className="w-[210px] sm:w-[250px] h-auto object-contain select-none pointer-events-none"
        />
      </motion.div>

      {/* Bottom "from Era" lockup matching reference image */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center pb-safe"
      >
        <span className="text-[13px] font-normal text-[#8696A0] tracking-wide leading-tight mb-0.5">
          from
        </span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-xs bg-[#A4133C]" aria-hidden="true" />
          <span className="font-display text-[20px] font-bold text-white tracking-tight leading-none">
            Era
          </span>
        </div>
      </motion.div>
    </div>
  );
};
