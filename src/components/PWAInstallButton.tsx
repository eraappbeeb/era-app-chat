import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'full' }> = ({
  variant = 'full',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          variant === 'compact'
            ? 'flex items-center gap-1.5 rounded-lg bg-[#A4133C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#8E1033] transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : 'w-full flex items-center justify-center gap-2 rounded-xl bg-[#A4133C] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#8E1033] transition-colors cursor-pointer'
        }
      >
        <Download className="w-4 h-4" />
        Install EraApp
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'compact'
              ? 'flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
              : 'w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer'
          }
        >
          <Share className="w-4 h-4" />
          Install on iPhone / iPad
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1E1E1E] border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                  Install EraApp on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-white cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                <li>1. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</li>
                <li>2. Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>3. Tap <strong>Add</strong> to launch EraApp fullscreen.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#A4133C] py-2.5 text-sm font-medium text-white hover:bg-[#8E1033] transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
