import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  Check,
  MessageCircle,
  Moon,
  Search,
  Settings,
  Sun,
  UserPlus,
  Users,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { updatePresence } from '../lib/chatService';
import { registerPushNotifications } from '../lib/notifications';
import {
  ERA_LOGO_SRC,
  formatChatListTime,
  getInitials,
} from '../lib/utils';
import type {
  ChatRoom,
  FriendRequest,
  ThemeMode,
  UserPrivate,
} from '../types/chat';
import { ChatScreen } from './ChatScreen';
import { FriendsView } from './FriendsView';
import { PWAInstallButton } from './PWAInstallButton';
import { SettingsView } from './SettingsView';

interface MainChatHomeProps {
  currentUser: UserPrivate;
  theme: ThemeMode;
  onThemeChange: (next: ThemeMode) => void;
  onProfileUpdated: (updated: UserPrivate) => void;
}

type SidebarTab = 'chats' | 'friends' | 'settings';

export const MainChatHome: React.FC<MainChatHomeProps> = ({
  currentUser,
  theme,
  onThemeChange,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chats');
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/^\/chat\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  });
  const [searchQuery, setSearchQuery] = useState('');

  const lastPresenceWriteAt = useRef<number>(0);

  // 60-Second Throttled Last Seen Updater (Low Firestore writes/reads)
  useEffect(() => {
    const syncPresence = (online: boolean, force = false) => {
      const now = Date.now();
      if (!force && now - lastPresenceWriteAt.current < 60000) {
        return;
      }
      lastPresenceWriteAt.current = now;
      updatePresence(currentUser.uid, online);
    };

    // Initial mark online
    syncPresence(true, true);

    // Heartbeat every 60 seconds ONLY while visible
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncPresence(true);
      }
    }, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncPresence(true);
      }
    };

    const handleBeforeUnload = () => {
      updatePresence(currentUser.uid, false);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      updatePresence(currentUser.uid, false);
    };
  }, [currentUser.uid]);

  const savedFcmTokenRef = useRef(currentUser.fcmToken);
  savedFcmTokenRef.current = currentUser.fcmToken;

  // Request Notification permission on login and persist FCM token to users/{uid}.fcmToken
  useEffect(() => {
    void registerPushNotifications(currentUser.uid, savedFcmTokenRef.current);
  }, [currentUser.uid]);

  // Handle notification click deep links (/chat/{chatId}) and SW OPEN_CHAT messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_CHAT' && typeof event.data.chatId === 'string' && event.data.chatId) {
        setSelectedChatId(event.data.chatId);
        setActiveTab('chats');
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, []);

  // Subscribe to user's chats (no composite index required; sorted locally)
  useEffect(() => {
    const path = 'chats';
    const q = query(
      collection(db, 'chats'),
      where('participantUids', 'array-contains', currentUser.uid),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as ChatRoom);
        list.sort((a, b) => {
          const aTime = a.lastMessageAt?.toMillis() || 0;
          const bTime = b.lastMessageAt?.toMillis() || 0;
          return bTime - aTime;
        });
        setChats(list);
        setLoadingChats(false);
      },
      (err) => {
        setLoadingChats(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [currentUser.uid]);

  // Subscribe to friend requests & accepted friends
  useEffect(() => {
    const path = 'friend_requests';
    const q = query(
      collection(db, 'friend_requests'),
      where('participants', 'array-contains', currentUser.uid),
      limit(100)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          ...(d.data() as Omit<FriendRequest, 'id'>),
          id: d.id,
        }));
        setFriendRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );

    return () => unsub();
  }, [currentUser.uid]);

  const pendingIncomingCount = useMemo(
    () =>
      friendRequests.filter(
        (r) => r.status === 'pending' && r.toUid === currentUser.uid
      ).length,
    [friendRequests, currentUser.uid]
  );

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((chat) => {
      const peerIsUid1 = chat.uid1 !== currentUser.uid;
      const peerName = (peerIsUid1 ? chat.uid1Name : chat.uid2Name).toLowerCase();
      const peerUsername = (peerIsUid1 ? chat.uid1Username : chat.uid2Username).toLowerCase();
      return (
        peerName.includes(q) ||
        peerUsername.includes(q) ||
        chat.lastMessageText.toLowerCase().includes(q)
      );
    });
  }, [chats, currentUser.uid, searchQuery]);

  const activeChat = useMemo(
    () => chats.find((c) => c.chatId === selectedChatId) || null,
    [chats, selectedChatId]
  );

  const handleOpenChatFromFriends = (chatId: string) => {
    setSelectedChatId(chatId);
    setActiveTab('chats');
  };

  return (
    <div className="h-[100dvh] w-full flex overflow-hidden overscroll-none bg-[#F4F4F6] dark:bg-[#121212] text-zinc-900 dark:text-white">
      {/* Left Sidebar (Chat List / Friends / Settings) */}
      <aside
        className={`${
          activeChat ? 'hidden md:flex' : 'flex'
        } w-full md:w-[350px] lg:w-[380px] shrink-0 h-[100dvh] flex-col bg-white dark:bg-[#1E1E1E] border-r border-zinc-200 dark:border-zinc-800 overflow-hidden`}
      >
        {/* Sidebar Header (58px) */}
        <header className="h-[58px] shrink-0 px-4 flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center p-1.5 shrink-0 border border-zinc-800">
              <img
                src={ERA_LOGO_SRC}
                alt="ERA"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-base font-bold tracking-tight text-zinc-900 dark:text-white leading-none truncate">
                EraApp
              </h1>
              <p className="text-[11px] font-mono-num text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                @{currentUser.username}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <PWAInstallButton variant="compact" />
            <button
              type="button"
              onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </button>
          </div>
        </header>

        {/* Active Tab Body */}
        {activeTab === 'chats' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Search Filter */}
            <div className="px-3.5 py-2.5 shrink-0 border-b border-zinc-100 dark:border-zinc-800/80">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-zinc-100 dark:bg-[#121212] text-sm text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#A4133C]"
                />
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto overscroll-contain era-scroll">
              {loadingChats ? (
                <div className="p-4 space-y-3">
                  {[0, 1, 2, 3].map((idx) => (
                    <div key={idx} className="flex items-center gap-3 animate-pulse">
                      <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-2/5 rounded bg-zinc-200 dark:bg-zinc-800" />
                        <div className="h-3 w-4/5 rounded bg-zinc-200 dark:bg-zinc-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredChats.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#A4133C]/12 text-[#A4133C] flex items-center justify-center mb-3">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {searchQuery ? 'No matching chats' : 'No conversations yet'}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[230px] leading-relaxed">
                    {searchQuery
                      ? 'Try searching a different name or Era handle.'
                      : 'Add a friend by their @username to start chatting in real time.'}
                  </p>
                  {!searchQuery && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('friends')}
                      className="mt-4 px-4 py-2 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add Friend
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {filteredChats.map((chat) => {
                    const peerIsUid1 = chat.uid1 !== currentUser.uid;
                    const peerName = peerIsUid1 ? chat.uid1Name : chat.uid2Name;
                    const peerPhoto = peerIsUid1 ? chat.uid1Photo : chat.uid2Photo;
                    const isSelected = chat.chatId === selectedChatId;
                    const isLastFromMe = chat.lastMessageSenderId === currentUser.uid;

                    return (
                      <button
                        key={chat.chatId}
                        type="button"
                        onClick={() => setSelectedChatId(chat.chatId)}
                        className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#A4133C]/10 dark:bg-[#A4133C]/18'
                            : 'hover:bg-zinc-50 dark:hover:bg-[#252528]'
                        }`}
                      >
                        {peerPhoto ? (
                          <img
                            src={peerPhoto}
                            alt={peerName}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-full object-cover shrink-0 bg-zinc-200 dark:bg-zinc-800"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#A4133C]/15 text-[#A4133C] font-semibold text-sm flex items-center justify-center shrink-0">
                            {getInitials(peerName)}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-[14.5px] font-semibold truncate ${
                                isSelected
                                  ? 'text-[#A4133C] dark:text-white'
                                  : 'text-zinc-900 dark:text-white'
                              }`}
                            >
                              {peerName}
                            </span>
                            <span className="text-[11px] font-mono-num text-zinc-400 dark:text-zinc-500 shrink-0">
                              {formatChatListTime(chat.lastMessageAt)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 mt-0.5 min-w-0">
                            {isLastFromMe && chat.lastMessageType !== 'none' && (
                              <Check className="w-3.5 h-3.5 text-[#A4133C] shrink-0" />
                            )}
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                              {chat.lastMessageText || 'Connected — say hello'}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'friends' && (
          <FriendsView
            currentUser={currentUser}
            friendRequests={friendRequests}
            onOpenChat={handleOpenChatFromFriends}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            currentUser={currentUser}
            theme={theme}
            onThemeChange={onThemeChange}
            onProfileUpdated={onProfileUpdated}
          />
        )}

        {/* Bottom Navigation Anchor (56px compact — well within 15% mobile sticky cap) */}
        <nav className="h-[58px] shrink-0 grid grid-cols-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1E1E1E] pb-safe">
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
              activeTab === 'chats'
                ? 'text-[#A4133C]'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            <span>Chats</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('friends')}
            className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
              activeTab === 'friends'
                ? 'text-[#A4133C]'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <div className="relative">
              <Users className="w-5 h-5" />
              {pendingIncomingCount > 0 && (
                <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#A4133C] text-white text-[10px] font-mono-num font-bold flex items-center justify-center">
                  {pendingIncomingCount}
                </span>
              )}
            </div>
            <span>Friends</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'text-[#A4133C]'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </nav>
      </aside>

      {/* Right Workspace Pane (Active Chat or Desktop Empty State) */}
      <main
        className={`${
          activeChat ? 'flex' : 'hidden md:flex'
        } flex-1 min-w-0 h-[100dvh] flex-col overflow-hidden`}
      >
        {activeChat ? (
          <ChatScreen
            chat={activeChat}
            currentUser={currentUser}
            onBack={() => {
              setSelectedChatId(null);
              if (window.location.pathname.startsWith('/chat/')) {
                window.history.replaceState(null, '', '/');
              }
            }}
          />
        ) : (
          <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center era-wallpaper-light dark:era-wallpaper-dark">
            <div className="rounded-3xl bg-white/90 dark:bg-[#1E1E1E]/95 border border-zinc-200 dark:border-zinc-800 px-8 py-8 max-w-sm shadow-sm">
              <div className="w-20 h-14 mx-auto rounded-2xl bg-black flex items-center justify-center p-2.5 mb-5 border border-zinc-800">
                <img
                  src={ERA_LOGO_SRC}
                  alt="ERA"
                  className="w-full h-full object-contain"
                />
              </div>
              <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white">
                Welcome to EraApp
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                Select a conversation on the left or connect with friends using your handle{' '}
                <span className="font-mono-num text-[#A4133C] font-semibold">
                  @{currentUser.username}
                </span>
                .
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('friends')}
                className="mt-5 px-5 py-2.5 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Find Friends
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
