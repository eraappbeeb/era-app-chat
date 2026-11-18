/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { updateThemePreference } from './lib/chatService';
import { ensureUserEraPoints } from './lib/streakService';
import type { ThemeMode, UserPrivate } from './types/chat';
import { AuthScreen } from './components/AuthScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainChatHome } from './components/MainChatHome';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SplashScreen } from './components/SplashScreen';

const THEME_STORAGE_KEY = 'era_theme_mode';

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserPrivate | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  // Sync Tailwind .dark class + meta theme-color
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', !splashDone ? '#000000' : theme === 'dark' ? '#121212' : '#FFFFFF');
    }
  }, [theme, splashDone]);

  // Listen to Firebase Auth state & subscribe live to users/{uid}
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let initializedEraPoints = false;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      initializedEraPoints = false;
      setFirebaseUser(user);

      if (!user) {
        setUserProfile(null);
        setProfileLoading(false);
        setAuthReady(true);
        return;
      }

      if (!user.emailVerified) {
        setUserProfile(null);
        setProfileLoading(false);
        setAuthReady(true);
        return;
      }

      setProfileLoading(true);
      const path = `users/${user.uid}`;
      unsubProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const rawExisting = snap.exists()
            ? (snap.data() as UserPrivate & { dankPoints?: number })
            : null;
          const existing = rawExisting
            ? {
                ...rawExisting,
                EraPoints:
                  typeof rawExisting.EraPoints === 'number'
                    ? rawExisting.EraPoints
                    : rawExisting.dankPoints,
              }
            : null;
          setUserProfile(existing);
          if (existing?.theme === 'light' || existing?.theme === 'dark') {
            setTheme(existing.theme);
          }
          if (
            rawExisting &&
            typeof rawExisting.EraPoints !== 'number' &&
            !initializedEraPoints
          ) {
            initializedEraPoints = true;
            ensureUserEraPoints(user.uid, rawExisting.dankPoints).catch(() => {});
          }
          setProfileLoading(false);
          setAuthReady(true);
        },
        (err) => {
          setProfileLoading(false);
          setAuthReady(true);
          handleFirestoreError(err, OperationType.GET, path);
        }
      );
    });

    return () => {
      if (unsubProfile) unsubProfile();
      unsubAuth();
    };
  }, []);

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true);
  }, []);

  const handleThemeChange = useCallback(
    (next: ThemeMode) => {
      setTheme(next);
      if (userProfile) {
        updateThemePreference(userProfile.uid, next).catch(() => {});
      }
    },
    [userProfile]
  );

  const renderScreen = () => {
    // 1. WhatsApp-style 2.5s Splash Screen
    if (!splashDone || !authReady || profileLoading) {
      if (!splashDone) {
        return <SplashScreen onComplete={handleSplashComplete} />;
      }
      return (
        <div className="h-[100dvh] w-full bg-black flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[#A4133C] border-t-transparent animate-spin" />
        </div>
      );
    }

    // 2. Auth / Verification / Username Onboarding
    if (!firebaseUser) {
      return (
        <AuthScreen
          pendingAuthUser={null}
          needsUsernameSetup={false}
          needsEmailVerification={false}
          onProfileReady={setUserProfile}
        />
      );
    }

    if (!firebaseUser.emailVerified) {
      return (
        <AuthScreen
          pendingAuthUser={firebaseUser}
          needsUsernameSetup={false}
          needsEmailVerification={true}
          onProfileReady={setUserProfile}
        />
      );
    }

    if (!userProfile) {
      return (
        <AuthScreen
          pendingAuthUser={firebaseUser}
          needsUsernameSetup={true}
          needsEmailVerification={false}
          onProfileReady={setUserProfile}
        />
      );
    }

    // 3. Main Chat Home + Real-time Chat Screen
    return (
      <MainChatHome
        currentUser={userProfile}
        theme={theme}
        onThemeChange={handleThemeChange}
        onProfileUpdated={setUserProfile}
      />
    );
  };

  return (
    <ErrorBoundary>
      <OfflineIndicator />
      {renderScreen()}
    </ErrorBoundary>
  );
}
