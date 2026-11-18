import React from 'react';
import { Award, Flame, X } from 'lucide-react';
import { motion } from 'motion/react';
import { ERA_LOGO_SRC } from '../lib/utils';

interface DuoNamesProps {
  userOneName: string;
  userOneUsername: string;
  userTwoName: string;
  userTwoUsername: string;
}

export const Era30Sticker: React.FC<DuoNamesProps> = ({
  userOneName,
  userOneUsername,
  userTwoName,
  userTwoUsername,
}) => {
  return (
    <div className="rounded-2xl bg-zinc-50 dark:bg-[#121212] border border-[#A4133C]/40 p-4 space-y-3 text-center">
      <div className="flex items-center justify-between gap-2">
        <div className="w-7 h-5 rounded-md bg-black flex items-center justify-center p-1 border border-zinc-800">
          <img src={ERA_LOGO_SRC} alt="ERA" className="w-full h-full object-contain" />
        </div>
        <span className="text-[10px] font-mono-num font-semibold tracking-wider uppercase text-[#A4133C]">
          Exclusive Duo Sticker
        </span>
      </div>

      <div className="py-1 space-y-1">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#A4133C]/12 text-[#A4133C] text-[11px] font-mono-num font-semibold">
          <Flame className="w-3.5 h-3.5" />
          30 DAYS
        </div>
        <p className="font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          30 ErA&apos;s day
        </p>
      </div>

      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-0.5">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
          {userOneName} &amp; {userTwoName}
        </p>
        <p className="text-[11px] font-mono-num text-zinc-500 dark:text-zinc-400 truncate">
          @{userOneUsername} • @{userTwoUsername}
        </p>
      </div>
    </div>
  );
};

export const Era100GoldSticker: React.FC<DuoNamesProps> = ({
  userOneName,
  userOneUsername,
  userTwoName,
  userTwoUsername,
}) => {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#FDF6E3] via-[#F7E8BF] to-[#EFE0B5] dark:from-[#262012] dark:via-[#1E190F] dark:to-[#292110] border border-[#D4AF37]/60 p-4 space-y-3 text-center">
      <div className="flex items-center justify-between gap-2">
        <div className="w-7 h-5 rounded-md bg-black flex items-center justify-center p-1 border border-[#D4AF37]/50">
          <img src={ERA_LOGO_SRC} alt="ERA" className="w-full h-full object-contain" />
        </div>
        <span className="text-[10px] font-mono-num font-semibold tracking-wider uppercase text-[#8A660C] dark:text-[#E5C158]">
          100-Day Gold Sticker
        </span>
      </div>

      <div className="py-1 space-y-1">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#D4AF37]/20 text-[#7A590B] dark:text-[#F5D77F] text-[11px] font-mono-num font-semibold">
          <Award className="w-3.5 h-3.5" />
          100 DAYS
        </div>
        <p className="font-display text-xl font-bold tracking-tight text-[#6A4C07] dark:text-[#F7DF94]">
          100 ErA&apos;s Day
        </p>
      </div>

      <div className="pt-2 border-t border-[#D4AF37]/30 space-y-0.5">
        <p className="text-xs font-semibold text-[#5C4206] dark:text-[#F5E6BA] truncate">
          {userOneName} &amp; {userTwoName}
        </p>
        <p className="text-[11px] font-mono-num text-[#8A660C]/85 dark:text-[#D9BD75] truncate">
          @{userOneUsername} • @{userTwoUsername}
        </p>
      </div>
    </div>
  );
};

interface Streak7BannerProps {
  peerName: string;
  onDismiss: () => void;
}

export const Streak7Banner: React.FC<Streak7BannerProps> = ({ peerName, onDismiss }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-3xl mx-auto mb-3 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-zinc-200 dark:border-zinc-800 px-3.5 py-2.5 shadow-sm flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-[#A4133C]/12 text-[#A4133C] flex items-center justify-center shrink-0">
          <Flame className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-900 dark:text-white leading-tight">
            7-Day Streak
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
            You and {peerName} kept a streak for 7 days in a row.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss 7-day celebration"
        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

interface StreakMilestoneModalProps extends DuoNamesProps {
  milestone: 30 | 100;
  onClose: () => void;
}

export const StreakMilestoneModal: React.FC<StreakMilestoneModalProps> = ({
  milestone,
  userOneName,
  userOneUsername,
  userTwoName,
  userTwoUsername,
  onClose,
}) => {
  const isGold = milestone === 100;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl bg-white dark:bg-[#1E1E1E] border ${
          isGold ? 'border-[#D4AF37]/60' : 'border-zinc-200 dark:border-zinc-800'
        } p-5 shadow-2xl space-y-4`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isGold ? (
              <Award className="w-4 h-4 text-[#B8860B] dark:text-[#E5C158]" />
            ) : (
              <Flame className="w-4 h-4 text-[#A4133C]" />
            )}
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
              {isGold ? '100-Day Milestone' : '30-Day Streak Celebration'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            aria-label="Close celebration"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {isGold
            ? 'You reached 100 consecutive days together. Your Gold Sticker is unlocked and this chat header turns gold for 24 hours.'
            : `Congratulations! You and ${userTwoName} reached 30 days in a row and unlocked your private duo sticker.`}
        </p>

        {isGold ? (
          <Era100GoldSticker
            userOneName={userOneName}
            userOneUsername={userOneUsername}
            userTwoName={userTwoName}
            userTwoUsername={userTwoUsername}
          />
        ) : (
          <Era30Sticker
            userOneName={userOneName}
            userOneUsername={userOneUsername}
            userTwoName={userTwoName}
            userTwoUsername={userTwoUsername}
          />
        )}

        <button
          type="button"
          onClick={onClose}
          className={`w-full h-11 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
            isGold
              ? 'bg-[#B8860B] hover:bg-[#9E7209] text-white'
              : 'bg-[#A4133C] hover:bg-[#8E1033] text-white'
          }`}
        >
          {isGold ? 'Claim Gold Header & Sticker' : 'Keep Going'}
        </button>
      </motion.div>
    </div>
  );
};
