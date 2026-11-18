import React, { useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Camera, Check, Loader2, LogOut, Moon, Smartphone, Sun } from 'lucide-react';
import { auth } from '../lib/firebase';
import { updatePresence, updatePublicBioAndName } from '../lib/chatService';
import { uploadToCloudinary } from '../lib/cloudinary';
import { getInitials } from '../lib/utils';
import type { ThemeMode, UserPrivate } from '../types/chat';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  currentUser: UserPrivate;
  theme: ThemeMode;
  onThemeChange: (next: ThemeMode) => void;
  onProfileUpdated: (updated: UserPrivate) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  theme,
  onThemeChange,
  onProfileUpdated,
}) => {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [bio, setBio] = useState('Available on EraApp');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select an image file.');
      return;
    }

    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const uploaded = await uploadToCloudinary(file);
      await updatePublicBioAndName(
        currentUser.uid,
        currentUser.username,
        displayName || currentUser.displayName,
        bio,
        uploaded.secureUrl
      );
      onProfileUpdated({
        ...currentUser,
        displayName: displayName.trim() || currentUser.displayName,
        photoURL: uploaded.secureUrl,
      });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload avatar.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await updatePublicBioAndName(
        currentUser.uid,
        currentUser.username,
        displayName,
        bio
      );
      onProfileUpdated({
        ...currentUser,
        displayName: displayName.trim() || currentUser.displayName,
      });
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await updatePresence(currentUser.uid, false);
    await signOut(auth);
  };

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain era-scroll p-4 space-y-6">
      {/* User Card with Cloudinary Avatar Upload */}
      <div className="rounded-2xl bg-zinc-50 dark:bg-[#161618] border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
        <div className="flex items-center gap-3.5">
          <div className="relative shrink-0">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#A4133C] text-white font-bold text-lg flex items-center justify-center">
                {getInitials(currentUser.displayName)}
              </div>
            )}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#A4133C] hover:bg-[#8E1033] text-white flex items-center justify-center border-2 border-white dark:border-[#161618] shadow-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              {uploadingAvatar ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelected}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-zinc-900 dark:text-white truncate">
              {currentUser.displayName}
            </p>
            <p className="text-xs font-mono-num text-[#A4133C] truncate">
              @{currentUser.username}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              {currentUser.email}
            </p>
            <p className="text-[11px] font-mono-num text-zinc-600 dark:text-zinc-300 mt-1">
              {currentUser.EraPoints ?? 100} EraPoints
            </p>
          </div>
        </div>
        {avatarError && (
          <p className="text-xs text-red-500 pt-1">{avatarError}</p>
        )}
      </div>

      {/* Appearance Theme Switcher */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Appearance
        </h3>
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-zinc-100 dark:bg-[#161618] border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => onThemeChange('dark')}
            className={`h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-[#A4133C] text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Moon className="w-4 h-4" />
            Dark (#121212)
          </button>
          <button
            type="button"
            onClick={() => onThemeChange('light')}
            className={`h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
              theme === 'light'
                ? 'bg-[#A4133C] text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Sun className="w-4 h-4" />
            Light
          </button>
        </div>
      </section>

      {/* Profile Settings */}
      <form onSubmit={handleSaveProfile} className="space-y-3">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Profile
        </h3>
        <div>
          <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            required
            className="w-full h-11 px-3.5 rounded-xl bg-zinc-100 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-[#A4133C]"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            Bio
          </label>
          <input
            type="text"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            className="w-full h-11 px-3.5 rounded-xl bg-zinc-100 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-[#A4133C]"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          {savedNotice ? (
            <>
              <Check className="w-4 h-4" />
              Saved
            </>
          ) : saving ? (
            'Saving...'
          ) : (
            'Save Changes'
          )}
        </button>
      </form>

      {/* PWA Install & APK Readiness */}
      <section className="rounded-2xl bg-zinc-50 dark:bg-[#161618] border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <Smartphone className="w-4 h-4 text-[#A4133C]" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Install App (PWA)
          </h3>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          EraApp runs fullscreen in standalone mode without browser bars and is ready for Android APK packaging via Capacitor or TWA.
        </p>
        <PWAInstallButton variant="full" />
      </section>

      {/* Sign Out */}
      <button
        type="button"
        onClick={handleSignOut}
        className="w-full h-11 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
};
