import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Film,
  Flame,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Paperclip,
  Send,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  markChatMessagesRead,
  sendChatMessage,
  setChatTyping,
} from '../lib/chatService';
import {
  buyExtraFreeze,
  FREEZE_COST_ERA_POINTS,
  getDateKey,
  markStreakCelebrationSeen,
  syncStreakOnChatOpen,
} from '../lib/streakService';
import {
  CLOUDINARY_UPLOAD_PRESET,
  getSavedCloudinaryCloudName,
  saveCloudinaryCloudName,
  uploadToCloudinary,
} from '../lib/cloudinary';
import {
  formatDateDivider,
  formatLastSeen,
  getDeterministicChatId,
  getInitials,
} from '../lib/utils';
import type {
  ChatMessage,
  ChatRoom,
  ChatStreak,
  TypingStatus,
  UserPrivate,
  UserPublic,
} from '../types/chat';
import { ChatBubble } from './ChatBubble';
import {
  Era100GoldSticker,
  Era30Sticker,
  Streak7Banner,
  StreakMilestoneModal,
} from './StreakCelebrations';

interface ChatScreenProps {
  chat: ChatRoom;
  currentUser: UserPrivate;
  onBack?: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  chat,
  currentUser,
  onBack,
}) => {
  const peerUid = useMemo(
    () => chat.participantUids.find((uid) => uid !== currentUser.uid) || chat.uid2,
    [chat.participantUids, chat.uid2, currentUser.uid]
  );

  const fallbackPeer = useMemo(() => {
    const isPeerUid1 = chat.uid1 === peerUid;
    return {
      name: isPeerUid1 ? chat.uid1Name : chat.uid2Name,
      username: isPeerUid1 ? chat.uid1Username : chat.uid2Username,
      photo: isPeerUid1 ? chat.uid1Photo : chat.uid2Photo,
    };
  }, [chat, peerUid]);

  const [peerProfile, setPeerProfile] = useState<UserPublic | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [streak, setStreak] = useState<ChatStreak | null>(null);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [buyingFreeze, setBuyingFreeze] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);
  const [freezeSuccess, setFreezeSuccess] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // One-time Cloudinary Cloud Name modal if not yet configured
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [cloudNameInput, setCloudNameInput] = useState(() => getSavedCloudinaryCloudName());

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTypingSentAt = useRef<number>(0);
  const typingTimeoutRef = useRef<number | null>(null);
  const marked7Ref = useRef<string | null>(null);

  // Subscribe to peer's public profile (for live Last Seen & Online status)
  useEffect(() => {
    const path = `users_public/${peerUid}`;
    const unsub = onSnapshot(
      doc(db, 'users_public', peerUid),
      (snap) => {
        if (snap.exists()) {
          setPeerProfile(snap.data() as UserPublic);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [peerUid]);

  const streakId = useMemo(
    () => getDeterministicChatId(currentUser.uid, peerUid),
    [currentUser.uid, peerUid]
  );

  // Sync & subscribe to streak document (streaks/{user1}_{user2} sorted)
  useEffect(() => {
    syncStreakOnChatOpen(currentUser.uid, peerUid).catch((err) => {
      console.warn('Streak sync skipped:', err);
    });

    const path = `streaks/${streakId}`;
    const unsub = onSnapshot(
      doc(db, 'streaks', streakId),
      (snap) => {
        if (snap.exists()) {
          setStreak(snap.data() as ChatStreak);
        } else {
          setStreak(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [currentUser.uid, peerUid, streakId]);

  // Auto-revert 100-day gold chat header after 24h
  useEffect(() => {
    const until = streak?.goldHeaderUntil;
    setNowMs(Date.now());
    if (!until) return;
    const remaining = until - Date.now();
    if (remaining <= 0) return;

    const timerDelay = Math.min(remaining + 50, 2147483647);
    const timer = window.setTimeout(() => {
      setNowMs(Date.now());
    }, timerDelay);

    return () => window.clearTimeout(timer);
  }, [streak?.goldHeaderUntil]);

  // Subscribe to peer typing status
  useEffect(() => {
    const path = `chats/${chat.chatId}/typing/${peerUid}`;
    let staleTimer: number | null = null;
    const unsub = onSnapshot(
      doc(db, 'chats', chat.chatId, 'typing', peerUid),
      (snap) => {
        if (staleTimer) window.clearTimeout(staleTimer);
        if (!snap.exists()) {
          setPeerTyping(false);
          return;
        }
        const data = snap.data() as TypingStatus;
        const updatedMs = data.updatedAt?.toDate().getTime() || 0;
        const fresh = data.isTyping && Date.now() - updatedMs < 6000;
        setPeerTyping(fresh);
        if (fresh) {
          staleTimer = window.setTimeout(() => setPeerTyping(false), 6000);
        }
      },
      () => {
        setPeerTyping(false);
      }
    );
    return () => {
      if (staleTimer) window.clearTimeout(staleTimer);
      unsub();
    };
  }, [chat.chatId, peerUid]);

  // Subscribe to last 50 messages ONLY (Performance rule)
  useEffect(() => {
    setLoadingMessages(true);
    const path = `chats/${chat.chatId}/messages`;
    const q = query(
      collection(db, 'chats', chat.chatId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as ChatMessage).reverse();
        setMessages(docs);
        setLoadingMessages(false);

        if (document.visibilityState === 'visible') {
          markChatMessagesRead(chat.chatId, docs, currentUser.uid).catch(() => {});
        }
      },
      (err) => {
        setLoadingMessages(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [chat.chatId, currentUser.uid]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, peerTyping]);

  // Cleanup typing on unmount or chat switch
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      setChatTyping(chat.chatId, currentUser.uid, chat.participantUids, false);
    };
  }, [chat.chatId, chat.participantUids, currentUser.uid]);

  const handleInputChange = (val: string) => {
    setText(val);
    const now = Date.now();
    if (val.trim().length > 0 && now - lastTypingSentAt.current > 2400) {
      lastTypingSentAt.current = now;
      setChatTyping(chat.chatId, currentUser.uid, chat.participantUids, true);
    }

    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      setChatTyping(chat.chatId, currentUser.uid, chat.participantUids, false);
    }, 2500);
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setActionError(null);
    setText('');
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    setChatTyping(chat.chatId, currentUser.uid, chat.participantUids, false);

    try {
      await sendChatMessage({
        chat,
        senderId: currentUser.uid,
        type: 'text',
        text: trimmed,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send message.');
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const performCloudinaryUpload = async (file: File, cloudName: string) => {
    setUploadingMedia(true);
    setActionError(null);
    setShowAttachMenu(false);
    try {
      const result = await uploadToCloudinary(file, cloudName);
      await sendChatMessage({
        chat,
        senderId: currentUser.uid,
        type: result.resourceType,
        mediaUrl: result.secureUrl,
        text: text.trim() || undefined,
      });
      setText('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Media upload failed.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const savedCloud = getSavedCloudinaryCloudName();
    if (!savedCloud) {
      setPendingUploadFile(file);
      setShowAttachMenu(false);
      return;
    }

    await performCloudinaryUpload(file, savedCloud);
  };

  const handleConfirmCloudName = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cloudNameInput.trim();
    if (!clean || !pendingUploadFile) return;
    saveCloudinaryCloudName(clean);
    const file = pendingUploadFile;
    setPendingUploadFile(null);
    await performCloudinaryUpload(file, clean);
  };

  const handleShareLocation = () => {
    setShowAttachMenu(false);
    setActionError(null);

    if (!navigator.geolocation) {
      setActionError('Geolocation is not supported on this browser.');
      return;
    }

    setSharingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await sendChatMessage({
            chat,
            senderId: currentUser.uid,
            type: 'location',
            locationLat: pos.coords.latitude,
            locationLng: pos.coords.longitude,
            locationLabel: 'Current Location',
          });
        } catch (err) {
          setActionError(err instanceof Error ? err.message : 'Failed to send location.');
        } finally {
          setSharingLocation(false);
        }
      },
      (geoErr) => {
        setSharingLocation(false);
        setActionError(geoErr.message || 'Location permission was denied.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleBuyExtraFreeze = async () => {
    if (buyingFreeze) return;
    setBuyingFreeze(true);
    setFreezeError(null);
    setFreezeSuccess(false);
    try {
      await buyExtraFreeze(currentUser.uid, peerUid);
      setFreezeSuccess(true);
      window.setTimeout(() => setFreezeSuccess(false), 2500);
    } catch (err) {
      setFreezeError(err instanceof Error ? err.message : 'Failed to buy freeze.');
    } finally {
      setBuyingFreeze(false);
    }
  };

  const streakCount = streak?.count ?? 0;
  const freezesCount = streak?.freezes ?? 1;
  const userEraPoints = currentUser.EraPoints ?? 0;
  const todayKey = getDateKey();
  const sortedParticipants = streak?.participantUids || [];
  const iSentToday =
    sortedParticipants.length === 2 &&
    ((sortedParticipants[0] === currentUser.uid && streak?.uid1LastSentDate === todayKey) ||
      (sortedParticipants[1] === currentUser.uid && streak?.uid2LastSentDate === todayKey));
  const peerSentToday =
    sortedParticipants.length === 2 &&
    ((sortedParticipants[0] === peerUid && streak?.uid1LastSentDate === todayKey) ||
      (sortedParticipants[1] === peerUid && streak?.uid2LastSentDate === todayKey));

  const peerName = peerProfile?.displayName || fallbackPeer.name;
  const peerUsername = peerProfile?.username || fallbackPeer.username;
  const peerPhoto = peerProfile?.photoURL || fallbackPeer.photo;
  const statusText = peerTyping
    ? 'typing...'
    : formatLastSeen(peerProfile?.lastSeen, peerProfile?.isOnline);
  const isOnlineNow = statusText === 'online';

  const isGoldHeader = Boolean(streak?.goldHeaderUntil && streak.goldHeaderUntil > nowMs);
  const show100Modal = Boolean(
    streak &&
      streak.count >= 100 &&
      streak.celebrated100 &&
      !(streak.celebrated100SeenBy || []).includes(currentUser.uid)
  );
  const show30Modal =
    !show100Modal &&
    Boolean(
      streak &&
        streak.count >= 30 &&
        streak.celebrated30 &&
        !(streak.celebrated30SeenBy || []).includes(currentUser.uid)
    );
  const show7Banner =
    !show100Modal &&
    !show30Modal &&
    Boolean(
      streak &&
        streak.count >= 7 &&
        streak.celebrated7 &&
        !(streak.celebrated7SeenBy || []).includes(currentUser.uid)
    );

  const handleDismiss7Celebration = () => {
    if (marked7Ref.current === streakId) return;
    marked7Ref.current = streakId;
    markStreakCelebrationSeen(streakId, currentUser.uid, 7).catch(() => {});
  };

  useEffect(() => {
    marked7Ref.current = null;
  }, [streakId]);

  useEffect(() => {
    if (!show7Banner) return;
    const timer = window.setTimeout(() => {
      if (marked7Ref.current === streakId) return;
      marked7Ref.current = streakId;
      markStreakCelebrationSeen(streakId, currentUser.uid, 7).catch(() => {});
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [show7Banner, streakId, currentUser.uid]);

  return (
    <div className="h-[100dvh] md:h-full w-full flex flex-col overflow-hidden overscroll-none bg-[#EFEFF4] dark:bg-[#121212] relative">
      {/* Top Chat Header (56px compact, gold for 24h at 100-day streak) */}
      <header
        className={`h-[58px] shrink-0 px-3 sm:px-5 flex items-center justify-between gap-3 backdrop-blur-md border-b z-20 transition-colors ${
          isGoldHeader
            ? 'bg-gradient-to-r from-[#FDF6E3] via-[#F7E8BF] to-[#FDF6E3] dark:from-[#262012] dark:via-[#2E2614] dark:to-[#262012] border-[#D4AF37]/60'
            : 'bg-white/95 dark:bg-[#1E1E1E]/95 border-zinc-200 dark:border-zinc-800'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to chats"
              className={`md:hidden min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                isGoldHeader
                  ? 'text-[#5C4206] dark:text-[#F5E6BA] hover:bg-[#D4AF37]/15'
                  : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Avatar */}
          <div className="relative shrink-0">
            {peerPhoto ? (
              <img
                src={peerPhoto}
                alt={peerName}
                referrerPolicy="no-referrer"
                className={`w-10 h-10 rounded-full object-cover bg-zinc-200 dark:bg-zinc-800 ${
                  isGoldHeader ? 'ring-2 ring-[#D4AF37]/70' : ''
                }`}
              />
            ) : (
              <div
                className={`w-10 h-10 rounded-full font-semibold text-sm flex items-center justify-center ${
                  isGoldHeader
                    ? 'bg-[#D4AF37]/25 text-[#6A4C07] dark:text-[#F7DF94] ring-1 ring-[#D4AF37]/60'
                    : 'bg-[#A4133C]/15 text-[#A4133C]'
                }`}
              >
                {getInitials(peerName)}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h2
              className={`text-[15px] font-semibold truncate leading-tight ${
                isGoldHeader ? 'text-[#4F3804] dark:text-[#FAF0CF]' : 'text-zinc-900 dark:text-white'
              }`}
            >
              {peerName}
            </h2>
            <p
              className={`text-xs truncate leading-tight mt-0.5 ${
                peerTyping
                  ? isGoldHeader
                    ? 'text-[#8A660C] dark:text-[#F5D77F] font-medium'
                    : 'text-[#A4133C] font-medium'
                  : isOnlineNow
                    ? isGoldHeader
                      ? 'text-[#8A660C] dark:text-[#F5D77F] font-medium'
                      : 'text-[#A4133C] dark:text-[#F47295] font-medium'
                    : isGoldHeader
                      ? 'text-[#7A590B]/85 dark:text-[#D9BD75]'
                      : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {statusText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setFreezeError(null);
              setFreezeSuccess(false);
              setShowStreakModal(true);
            }}
            title="Chat Streak & Freezes"
            className={`h-9 px-2.5 rounded-xl border flex items-center gap-2 text-xs font-mono-num transition-colors cursor-pointer ${
              isGoldHeader
                ? 'bg-[#F8EBC7]/80 dark:bg-[#1E190F]/85 border-[#D4AF37]/60 hover:border-[#B8860B] text-[#5C4206] dark:text-[#F7DF94]'
                : 'bg-zinc-100 dark:bg-[#121212] border-zinc-200 dark:border-zinc-800 hover:border-[#A4133C]/50 text-zinc-800 dark:text-zinc-100'
            }`}
          >
            <span className="inline-flex items-center gap-1 font-semibold">
              <Flame
                className={`w-3.5 h-3.5 ${
                  isGoldHeader ? 'text-[#B8860B] dark:text-[#E5C158]' : 'text-[#A4133C]'
                }`}
              />
              <span>{streakCount}</span>
            </span>
            <span className={isGoldHeader ? 'text-[#D4AF37]/60' : 'text-zinc-300 dark:text-zinc-700'}>
              |
            </span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <span>❄️</span>
              <span>{freezesCount}</span>
            </span>
          </button>

          <div
            className={`text-xs font-mono-num hidden sm:block truncate ${
              isGoldHeader
                ? 'text-[#7A590B] dark:text-[#E5C158]'
                : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            @{peerUsername}
          </div>
        </div>
      </header>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto overscroll-contain era-scroll era-wallpaper-light dark:era-wallpaper-dark px-3 sm:px-6 py-4">
        {show7Banner && (
          <Streak7Banner peerName={peerName} onDismiss={handleDismiss7Celebration} />
        )}
        {loadingMessages ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#A4133C]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="rounded-2xl bg-white/85 dark:bg-[#1E1E1E]/90 border border-zinc-200/80 dark:border-zinc-800 px-5 py-4 max-w-xs shadow-sm">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Say hello to {peerName}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Send a message, photo, video, or share your location securely on EraApp.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto flex flex-col">
            {messages.map((msg, idx) => {
              const prev = messages[idx - 1];
              const next = messages[idx + 1];
              const isOwn = msg.senderId === currentUser.uid;
              const currentDateLabel = formatDateDivider(msg.createdAt);
              const prevDateLabel = prev ? formatDateDivider(prev.createdAt) : null;
              const showDateDivider = currentDateLabel !== prevDateLabel;

              const isFirstInGroup =
                showDateDivider || !prev || prev.senderId !== msg.senderId;
              const nextDateLabel = next ? formatDateDivider(next.createdAt) : null;
              const isLastInGroup =
                !next ||
                next.senderId !== msg.senderId ||
                nextDateLabel !== currentDateLabel;

              return (
                <React.Fragment key={msg.messageId}>
                  {showDateDivider && (
                    <div className="flex justify-center my-3">
                      <span className="px-3 py-1 rounded-full text-[11px] font-medium bg-black/10 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 backdrop-blur-xs select-none">
                        {currentDateLabel}
                      </span>
                    </div>
                  )}
                  <ChatBubble
                    message={msg}
                    isOwn={isOwn}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                    onImageClick={setLightboxUrl}
                  />
                </React.Fragment>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Inline error / upload banner */}
      {actionError && (
        <div className="px-4 py-2 bg-red-600 text-white text-xs flex items-center justify-between gap-2 shrink-0">
          <span className="truncate">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="p-1 hover:bg-white/20 rounded cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Hidden File Inputs for Photo and Video (No voice, no bot, no Reels) */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Attachment Popover */}
      {showAttachMenu && (
        <div className="absolute bottom-[70px] left-3 sm:left-5 z-30 w-52 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-zinc-200 dark:border-zinc-800 shadow-2xl p-1.5">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-[#A4133C]" />
            Photo
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Film className="w-4 h-4 text-[#A4133C]" />
            Video
          </button>
          <button
            type="button"
            onClick={handleShareLocation}
            className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <MapPin className="w-4 h-4 text-[#A4133C]" />
            Location
          </button>
        </div>
      )}

      {/* Composer Bar */}
      <form
        onSubmit={handleSendText}
        className="shrink-0 px-2.5 sm:px-4 py-2 pb-safe bg-white dark:bg-[#1E1E1E] border-t border-zinc-200 dark:border-zinc-800 flex items-end gap-2 z-20"
      >
        <button
          type="button"
          onClick={() => setShowAttachMenu((v) => !v)}
          disabled={uploadingMedia || sharingLocation}
          aria-label="Attach photo, video, or location"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-[#A4133C] dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
        >
          {uploadingMedia || sharingLocation ? (
            <Loader2 className="w-5 h-5 animate-spin text-[#A4133C]" />
          ) : (
            <Paperclip className="w-5 h-5" />
          )}
        </button>

        <textarea
          value={text}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowAttachMenu(false)}
          placeholder="Message..."
          rows={1}
          maxLength={2000}
          className="flex-1 max-h-28 min-h-[44px] py-2.5 px-3.5 rounded-2xl bg-zinc-100 dark:bg-[#121212] border border-transparent focus:border-[#A4133C]/60 text-[15px] text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none resize-none leading-snug era-scroll"
        />

        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Send message"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#A4133C] hover:bg-[#8E1033] disabled:opacity-40 text-white transition-all active:scale-95 shrink-0 cursor-pointer"
        >
          <Send className="w-4 h-4 translate-x-[1px]" />
        </button>
      </form>

      {/* One-time Cloudinary Cloud Name Setup Modal */}
      {pendingUploadFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmCloudName}
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1E1E1E] border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                Cloudinary Media Setup
              </h3>
              <button
                type="button"
                onClick={() => setPendingUploadFile(null)}
                className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Enter your Cloudinary Cloud Name to upload photos and videos using unsigned preset{' '}
              <span className="font-mono-num text-[#A4133C] font-semibold">
                {CLOUDINARY_UPLOAD_PRESET}
              </span>
              .
            </p>
            <input
              type="text"
              value={cloudNameInput}
              onChange={(e) => setCloudNameInput(e.target.value)}
              placeholder="e.g. demo"
              required
              className="w-full h-11 px-3.5 rounded-xl bg-zinc-100 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-[#A4133C]"
            />
            <button
              type="submit"
              className="w-full h-11 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Save & Upload
            </button>
          </form>
        </div>
      )}

      {/* Streak & Freeze Modal */}
      {showStreakModal && (
        <div
          onClick={() => setShowStreakModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1E1E1E] border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-[#A4133C]" />
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                  Chat Streak
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowStreakModal(false)}
                className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                aria-label="Close streak details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-zinc-100 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Streak</p>
                <p className="mt-1 text-lg font-mono-num font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-[#A4133C]" />
                  {streakCount} {streakCount === 1 ? 'day' : 'days'}
                </p>
              </div>
              <div className="rounded-xl bg-zinc-100 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Freezes</p>
                <p className="mt-1 text-lg font-mono-num font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span>❄️</span>
                  <span>{freezesCount}</span>
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-zinc-50 dark:bg-[#161618] border border-zinc-200 dark:border-zinc-800 p-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <p>
                {iSentToday && peerSentToday
                  ? 'Both of you messaged today — today’s streak is locked in.'
                  : iSentToday
                    ? `You messaged today. Waiting for ${peerName} to reply today.`
                    : peerSentToday
                      ? `${peerName} messaged today. Send a message today to grow your streak.`
                      : 'Both users must send a message on the same day to increase the streak.'}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                1 missed day auto-uses ❄️ 1 freeze to protect your streak. Freezes reset to 1 every Monday if below 1.
              </p>
            </div>

            {streak?.celebrated100 ? (
              <Era100GoldSticker
                userOneName={currentUser.displayName}
                userOneUsername={currentUser.username}
                userTwoName={peerName}
                userTwoUsername={peerUsername}
              />
            ) : streak?.celebrated30 ? (
              <Era30Sticker
                userOneName={currentUser.displayName}
                userOneUsername={currentUser.username}
                userTwoName={peerName}
                userTwoUsername={peerUsername}
              />
            ) : null}

            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-zinc-500 dark:text-zinc-400">Your balance</span>
              <span className="font-mono-num font-semibold text-zinc-900 dark:text-white">
                {userEraPoints} EraPoints
              </span>
            </div>

            {freezeError && (
              <p className="text-xs text-red-500 px-1">{freezeError}</p>
            )}
            {freezeSuccess && (
              <p className="text-xs text-emerald-500 px-1">
                Extra freeze added! ❄️
              </p>
            )}

            <button
              type="button"
              onClick={handleBuyExtraFreeze}
              disabled={buyingFreeze || userEraPoints < FREEZE_COST_ERA_POINTS}
              className="w-full h-11 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {buyingFreeze ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Purchasing...
                </>
              ) : (
                `Buy Extra Freeze (${FREEZE_COST_ERA_POINTS} EraPoints)`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Milestone Celebrations (30-Day Duo Sticker & 100-Day Gold Sticker, Shown Once Per User) */}
      {(show100Modal || show30Modal) && (
        <StreakMilestoneModal
          milestone={show100Modal ? 100 : 30}
          userOneName={currentUser.displayName}
          userOneUsername={currentUser.username}
          userTwoName={peerName}
          userTwoUsername={peerUsername}
          onClose={() => {
            const milestone = show100Modal ? 100 : 30;
            markStreakCelebrationSeen(streakId, currentUser.uid, milestone).catch(() => {});
          }}
        />
      )}

      {/* Photo Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"
            aria-label="Close image"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full preview"
            referrerPolicy="no-referrer"
            className="max-h-[90dvh] max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
