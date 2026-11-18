import React, { useState } from 'react';
import {
  Check,
  MessageSquare,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import {
  cancelFriendRequest,
  ensureDirectChatFromRequest,
  respondFriendRequest,
  sendFriendRequestByUsername,
} from '../lib/chatService';
import { getInitials, sanitizeUsername } from '../lib/utils';
import type { FriendRequest, UserPrivate } from '../types/chat';

interface FriendsViewProps {
  currentUser: UserPrivate;
  friendRequests: FriendRequest[];
  onOpenChat: (chatId: string) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  currentUser,
  friendRequests,
  onOpenChat,
}) => {
  const [searchHandle, setSearchHandle] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const incomingPending = friendRequests.filter(
    (r) => r.status === 'pending' && r.toUid === currentUser.uid
  );
  const outgoingPending = friendRequests.filter(
    (r) => r.status === 'pending' && r.fromUid === currentUser.uid
  );
  const acceptedFriends = friendRequests.filter((r) => r.status === 'accepted');

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const clean = sanitizeUsername(searchHandle);
    if (!clean) return;

    setSending(true);
    try {
      const res = await sendFriendRequestByUsername(currentUser, clean);
      if (res === 'already_friends') {
        setFeedback({ type: 'ok', text: `You and @${clean} are already friends.` });
      } else if (res === 'already_pending') {
        setFeedback({ type: 'ok', text: `A friend request with @${clean} is already pending.` });
      } else {
        setFeedback({ type: 'ok', text: `Friend request sent to @${clean}.` });
        setSearchHandle('');
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not send friend request.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleRespond = async (req: FriendRequest, decision: 'accepted' | 'rejected') => {
    setBusyId(req.id);
    setFeedback(null);
    try {
      const chatId = await respondFriendRequest(req, decision);
      if (decision === 'accepted' && chatId) {
        onOpenChat(chatId);
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleStartChat = async (req: FriendRequest) => {
    setBusyId(req.id);
    try {
      const chatId = await ensureDirectChatFromRequest(req);
      onOpenChat(chatId);
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelOutgoing = async (reqId: string) => {
    setBusyId(reqId);
    try {
      await cancelFriendRequest(reqId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain era-scroll p-4 space-y-6">
      {/* Add Friend by Era Username */}
      <form onSubmit={handleSendRequest} className="space-y-2.5">
        <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Add Friend by Era Handle
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchHandle}
              onChange={(e) => setSearchHandle(sanitizeUsername(e.target.value))}
              placeholder="@username"
              maxLength={24}
              className="w-full h-11 pl-10 pr-3 rounded-xl bg-zinc-100 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-[#A4133C] font-mono-num"
            />
          </div>
          <button
            type="submit"
            disabled={sending || searchHandle.length < 3}
            className="h-11 px-4 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Add
          </button>
        </div>

        {feedback && (
          <p
            className={`text-xs px-3 py-2 rounded-xl ${
              feedback.type === 'ok'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            {feedback.text}
          </p>
        )}
      </form>

      {/* Incoming Pending Requests */}
      {incomingPending.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Pending Requests ({incomingPending.length})
          </h3>
          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80 rounded-2xl bg-zinc-50 dark:bg-[#161618] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {incomingPending.map((req) => (
              <div key={req.id} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {req.fromPhotoURL ? (
                    <img
                      src={req.fromPhotoURL}
                      alt={req.fromDisplayName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#A4133C]/15 text-[#A4133C] font-semibold text-xs flex items-center justify-center shrink-0">
                      {getInitials(req.fromDisplayName)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                      {req.fromDisplayName}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-num truncate">
                      @{req.fromUsername}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => handleRespond(req, 'accepted')}
                    aria-label="Accept friend request"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#A4133C] hover:bg-[#8E1033] text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => handleRespond(req, 'rejected')}
                    aria-label="Reject friend request"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Outgoing Pending Requests */}
      {outgoingPending.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Sent Requests ({outgoingPending.length})
          </h3>
          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80 rounded-2xl bg-zinc-50 dark:bg-[#161618] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {outgoingPending.map((req) => (
              <div key={req.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                    {req.toDisplayName}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-num truncate">
                    @{req.toUsername} · Waiting
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === req.id}
                  onClick={() => handleCancelOutgoing(req.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Accepted Friends List */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Friends ({acceptedFriends.length})
        </h3>
        {acceptedFriends.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-6 text-center">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              No friends yet
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Share your handle <span className="font-mono-num text-[#A4133C]">@{currentUser.username}</span> or add someone above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80 rounded-2xl bg-zinc-50 dark:bg-[#161618] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {acceptedFriends.map((req) => {
              const isFromMe = req.fromUid === currentUser.uid;
              const name = isFromMe ? req.toDisplayName : req.fromDisplayName;
              const handle = isFromMe ? req.toUsername : req.fromUsername;
              const photo = isFromMe ? req.toPhotoURL : req.fromPhotoURL;
              return (
                <button
                  key={req.id}
                  type="button"
                  disabled={busyId === req.id}
                  onClick={() => handleStartChat(req)}
                  className="w-full p-3 flex items-center justify-between gap-3 hover:bg-zinc-100 dark:hover:bg-[#1E1E22] transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {photo ? (
                      <img
                        src={photo}
                        alt={name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#A4133C]/15 text-[#A4133C] font-semibold text-xs flex items-center justify-center shrink-0">
                        {getInitials(name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                        {name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-num truncate">
                        @{handle}
                      </p>
                    </div>
                  </div>
                  <div className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#A4133C]">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
