import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { motion } from 'motion/react';
import { AtSign, Eye, EyeOff, Lock, Mail, RefreshCw, User as UserIcon } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { createUserProfile, lookupUsername } from '../lib/chatService';
import { ERA_LOGO_SRC, isValidUsername, sanitizeUsername } from '../lib/utils';
import type { UserPrivate } from '../types/chat';

interface AuthScreenProps {
  pendingAuthUser: User | null;
  needsUsernameSetup: boolean;
  needsEmailVerification: boolean;
  onProfileReady: (profile: UserPrivate) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  pendingAuthUser,
  needsUsernameSetup,
  needsEmailVerification,
  onProfileReady,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Suggested handle for first-time Google user
  const [googleUsername, setGoogleUsername] = useState(() => {
    if (pendingAuthUser?.email) {
      return sanitizeUsername(pendingAuthUser.email.split('@')[0]);
    }
    return '';
  });
  const [googleDisplayName, setGoogleDisplayName] = useState(
    () => pendingAuthUser?.displayName || ''
  );

  const withTimeout = async <T,>(promise: Promise<T>, ms = 10000): Promise<T> => {
    let timerId: number | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timerId = window.setTimeout(() => {
            reject(new Error('Request timed out after 10 seconds. Please check your connection and try again.'));
          }, ms);
        }),
      ]);
    } finally {
      if (timerId !== undefined) window.clearTimeout(timerId);
    }
  };

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : String(err);
    if (code === 'auth/operation-not-allowed') {
      return 'Email/Password sign-in is not enabled yet in Firebase Console (Authentication → Sign-in method → Email/Password). Use "Continue with Google" below or enable it in your Firebase Console.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email already exists. Please sign in instead.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Incorrect email or password. Please check your credentials.';
    }
    if (code === 'auth/weak-password') {
      return 'Password must be at least 6 characters.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Google sign-in window was closed before completing.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network connection error. Please check your internet connection.';
    }
    return msg || 'Authentication failed. Please try again.';
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup') {
      const cleanHandle = sanitizeUsername(username);
      if (!isValidUsername(cleanHandle)) {
        setError('Era username must be 3–24 characters (lowercase letters, numbers, or _).');
        return;
      }
      if (!displayName.trim()) {
        setError('Please enter your display name.');
        return;
      }

      setLoading(true);
      try {
        const cred = await withTimeout(
          createUserWithEmailAndPassword(auth, cleanEmail, password)
        );
        await withTimeout(updateProfile(cred.user, { displayName: displayName.trim() }));
        window.localStorage.setItem(
          `era_pending_profile_${cred.user.uid}`,
          JSON.stringify({ username: cleanHandle, displayName: displayName.trim() })
        );
        await withTimeout(sendEmailVerification(cred.user));
        setInfoMsg('Verification email sent. Please check your inbox and verify your email.');
      } catch (err) {
        setError(mapAuthError(err));
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        await withTimeout(signInWithEmailAndPassword(auth, cleanEmail, password));
      } catch (err) {
        setError(mapAuthError(err));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteUsernameSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAuthUser) return;
    setError(null);

    const cleanHandle = sanitizeUsername(googleUsername);
    if (!isValidUsername(cleanHandle)) {
      setError('Era username must be 3–24 characters (lowercase letters, numbers, or _).');
      return;
    }

    const cleanName = googleDisplayName.trim() || pendingAuthUser.displayName || cleanHandle;
    setLoading(true);
    try {
      const taken = await withTimeout(lookupUsername(cleanHandle));
      if (taken && taken.uid !== pendingAuthUser.uid) {
        setError(`@${cleanHandle} is already taken. Try another Era username.`);
        setLoading(false);
        return;
      }
      const profile = await withTimeout(
        createUserProfile({
          user: pendingAuthUser,
          username: cleanHandle,
          displayName: cleanName,
        })
      );
      onProfileReady(profile);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckEmailVerified = async () => {
    if (!pendingAuthUser) return;
    setError(null);
    setLoading(true);
    try {
      await withTimeout(pendingAuthUser.reload());
      if (!auth.currentUser?.emailVerified) {
        setError('Your email is not verified yet. Please click the link sent to your inbox.');
        setLoading(false);
        return;
      }
      await withTimeout(auth.currentUser.getIdToken(true));
      const savedRaw = window.localStorage.getItem(`era_pending_profile_${auth.currentUser.uid}`);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as { username: string; displayName: string };
        const profile = await withTimeout(
          createUserProfile({
            user: auth.currentUser,
            username: parsed.username,
            displayName: parsed.displayName,
          })
        );
        window.localStorage.removeItem(`era_pending_profile_${auth.currentUser.uid}`);
        onProfileReady(profile);
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingAuthUser) return;
    setError(null);
    setLoading(true);
    try {
      await withTimeout(sendEmailVerification(pendingAuthUser));
      setInfoMsg('Verification email resent. Check your inbox or spam folder.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    await signOut(auth);
    setError(null);
    setInfoMsg(null);
  };

  return (
    <div className="h-[100dvh] w-full bg-[#000000] text-white flex flex-col justify-between overflow-y-auto overscroll-none px-5 py-8">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[400px] mx-auto">
        {/* Exact ERA logo on top */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center mb-7"
        >
          <img
            src={ERA_LOGO_SRC}
            alt="ERA"
            draggable={false}
            className="h-16 sm:h-20 w-auto object-contain mb-3 select-none"
          />
          <p className="text-sm text-zinc-400 text-center">
            {needsEmailVerification
              ? 'Verify your email address'
              : needsUsernameSetup
                ? 'Claim your unique Era handle'
                : mode === 'signin'
                  ? 'Sign in to continue to EraApp'
                  : 'Create your EraApp account'}
          </p>
        </motion.div>

        {/* Verification Screen */}
        {needsEmailVerification && pendingAuthUser ? (
          <div className="w-full rounded-2xl bg-[#121212] border border-zinc-800/90 p-6 space-y-4">
            <div className="text-sm text-zinc-300 leading-relaxed">
              We sent a verification link to{' '}
              <span className="font-semibold text-white">{pendingAuthUser.email}</span>. Verify
              your email to protect your account and start chatting.
            </div>
            {error && (
              <div className="rounded-xl bg-red-950/60 border border-red-800/60 px-3.5 py-2.5 text-xs text-red-200 leading-relaxed">
                {error}
              </div>
            )}
            {infoMsg && (
              <div className="rounded-xl bg-emerald-950/60 border border-emerald-800/60 px-3.5 py-2.5 text-xs text-emerald-200 leading-relaxed">
                {infoMsg}
              </div>
            )}
            <button
              type="button"
              onClick={handleCheckEmailVerified}
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              I&apos;ve Verified — Continue
            </button>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={loading}
                className="text-xs text-zinc-400 hover:text-white transition-colors py-2 cursor-pointer"
              >
                Resend email
              </button>
              <button
                type="button"
                onClick={handleSwitchAccount}
                className="text-xs text-[#E14D72] hover:underline py-2 cursor-pointer"
              >
                Use different account
              </button>
            </div>
          </div>
        ) : needsUsernameSetup && pendingAuthUser ? (
          /* Google First-Time Username Setup */
          <form
            onSubmit={handleCompleteUsernameSetup}
            className="w-full rounded-2xl bg-[#121212] border border-zinc-800/90 p-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Display Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={googleDisplayName}
                  onChange={(e) => setGoogleDisplayName(e.target.value)}
                  placeholder="Your full name"
                  maxLength={50}
                  required
                  className="w-full h-12 pl-10 pr-4 rounded-xl bg-[#1B1B1E] border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#A4133C] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Era (Username)
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 text-[#A4133C] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={googleUsername}
                  onChange={(e) => setGoogleUsername(sanitizeUsername(e.target.value))}
                  placeholder="era_username"
                  maxLength={24}
                  required
                  className="w-full h-12 pl-10 pr-4 rounded-xl bg-[#1B1B1E] border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#A4133C] transition-colors font-mono-num"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-500">
                3–24 characters: lowercase letters, numbers, underscores.
              </p>
            </div>

            {error && (
              <div className="rounded-xl bg-red-950/60 border border-red-800/60 px-3.5 py-2.5 text-xs text-red-200 leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {loading ? 'Creating profile...' : 'Start Messaging'}
            </button>

            <button
              type="button"
              onClick={handleSwitchAccount}
              className="w-full text-center text-xs text-zinc-400 hover:text-white py-1.5 transition-colors cursor-pointer"
            >
              Sign out and switch account
            </button>
          </form>
        ) : (
          /* Standard Sign In / Sign Up Card */
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="w-full rounded-2xl bg-[#121212] border border-zinc-800/90 p-5 sm:p-6 shadow-2xl"
          >
            {/* Mode Segmented Control */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#1C1C1F] mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setInfoMsg(null);
                }}
                className={`h-10 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-[#A4133C] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setInfoMsg(null);
                }}
                className={`h-10 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-[#A4133C] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              {mode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Ahmed Hassan"
                        maxLength={50}
                        required
                        className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#1B1B1E] border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#A4133C] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Era (Username)
                    </label>
                    <div className="relative">
                      <AtSign className="w-4 h-4 text-[#A4133C] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
                        placeholder="ahmed_era"
                        maxLength={24}
                        required
                        className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#1B1B1E] border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#A4133C] transition-colors font-mono-num"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    required
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#1B1B1E] border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#A4133C] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    minLength={6}
                    className="w-full h-11 pl-10 pr-11 rounded-xl bg-[#1B1B1E] border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#A4133C] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-950/60 border border-red-800/60 px-3.5 py-2.5 text-xs text-red-200 leading-relaxed">
                  {error}
                </div>
              )}

              {infoMsg && (
                <div className="rounded-xl bg-emerald-950/60 border border-emerald-800/60 px-3.5 py-2.5 text-xs text-emerald-200 leading-relaxed">
                  {infoMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] active:scale-[0.99] disabled:opacity-60 text-white text-sm font-semibold transition-all cursor-pointer mt-1"
              >
                {loading
                  ? 'Please wait...'
                  : mode === 'signin'
                    ? 'Sign In'
                    : 'Create Era Account'}
              </button>
            </form>

            <div className="relative my-4 flex items-center">
              <div className="flex-1 border-t border-zinc-800" />
              <span className="px-3 text-[11px] text-zinc-500">or</span>
              <div className="flex-1 border-t border-zinc-800" />
            </div>

            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[#1B1B1E] hover:bg-[#242428] border border-zinc-800 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              Continue with Google
            </button>
          </motion.div>
        )}
      </div>

      {/* Exact Footer Requested */}
      <footer className="pt-6 pb-2 text-center">
        <p className="text-xs text-zinc-500" dir="auto">
          Era © 2027 - جميع الحقوق محفوظة
        </p>
      </footer>
    </div>
  );
};
