import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { DEFAULT_ERA_POINTS, recordMessageForStreak } from './streakService';
import {
  getDeterministicChatId,
  getSortedParticipantUids,
  isValidUsername,
  sanitizeUsername,
} from './utils';
import type {
  ChatMessage,
  ChatRoom,
  FriendRequest,
  MessageType,
  ThemeMode,
  UserPrivate,
  UserPublic,
  UsernameLookup,
} from '../types/chat';

export async function getUserPrivate(uid: string): Promise<UserPrivate | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserPrivate) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getUserPublic(uid: string): Promise<UserPublic | null> {
  const path = `users_public/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users_public', uid));
    return snap.exists() ? (snap.data() as UserPublic) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function lookupUsername(username: string): Promise<UsernameLookup | null> {
  const clean = sanitizeUsername(username);
  if (!isValidUsername(clean)) return null;
  const path = `usernames/${clean}`;
  try {
    const snap = await getDoc(doc(db, 'usernames', clean));
    return snap.exists() ? (snap.data() as UsernameLookup) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createUserProfile(params: {
  user: User;
  username: string;
  displayName: string;
  theme?: ThemeMode;
}): Promise<UserPrivate> {
  const cleanUsername = sanitizeUsername(params.username);
  if (!isValidUsername(cleanUsername)) {
    throw new Error('Era username must be 3–24 characters (lowercase letters, numbers, underscores).');
  }
  const cleanName = params.displayName.trim().slice(0, 50) || cleanUsername;
  const email = (params.user.email || '').trim().slice(0, 254);
  const photoURL = (params.user.photoURL || '').trim().slice(0, 500);
  const theme: ThemeMode = params.theme || 'dark';

  // Ensure username is not taken
  const existingUsername = await lookupUsername(cleanUsername);
  if (existingUsername && existingUsername.uid !== params.user.uid) {
    throw new Error(`@${cleanUsername} is already taken. Choose another Era username.`);
  }

  const batch = writeBatch(db);
  const now = serverTimestamp();

  const privatePayload = {
    uid: params.user.uid,
    email,
    username: cleanUsername,
    displayName: cleanName,
    photoURL,
    theme,
    EraPoints: DEFAULT_ERA_POINTS,
    createdAt: now,
    updatedAt: now,
  };

  const publicPayload = {
    uid: params.user.uid,
    username: cleanUsername,
    displayName: cleanName,
    photoURL,
    bio: 'Available on EraApp',
    isOnline: true,
    lastSeen: now,
    createdAt: now,
    updatedAt: now,
  };

  const lookupPayload = {
    uid: params.user.uid,
    username: cleanUsername,
    displayName: cleanName,
    photoURL,
    createdAt: now,
    updatedAt: now,
  };

  batch.set(doc(db, 'users', params.user.uid), privatePayload);
  batch.set(doc(db, 'users_public', params.user.uid), publicPayload);
  batch.set(doc(db, 'usernames', cleanUsername), lookupPayload);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${params.user.uid}`);
  }

  const created = await getUserPrivate(params.user.uid);
  if (!created) {
    throw new Error('Failed to load created profile.');
  }
  return created;
}

export async function updateThemePreference(uid: string, theme: ThemeMode): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      theme,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveUserFcmToken(uid: string, fcmToken: string): Promise<void> {
  const cleanToken = fcmToken.trim().slice(0, 512);
  if (!cleanToken) return;
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      fcmToken: cleanToken,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updatePublicBioAndName(
  uid: string,
  username: string,
  displayName: string,
  bio: string,
  photoURL?: string
): Promise<void> {
  const cleanName = displayName.trim().slice(0, 50);
  const cleanBio = bio.trim().slice(0, 160);
  if (!cleanName) throw new Error('Display name cannot be empty.');

  const batch = writeBatch(db);
  const now = serverTimestamp();

  const userUpdate: Record<string, unknown> = {
    displayName: cleanName,
    updatedAt: now,
  };
  const publicUpdate: Record<string, unknown> = {
    displayName: cleanName,
    bio: cleanBio,
    updatedAt: now,
  };
  const usernameUpdate: Record<string, unknown> = {
    displayName: cleanName,
    updatedAt: now,
  };

  if (typeof photoURL === 'string') {
    const cleanPhoto = photoURL.trim().slice(0, 500);
    userUpdate.photoURL = cleanPhoto;
    publicUpdate.photoURL = cleanPhoto;
    usernameUpdate.photoURL = cleanPhoto;
  }

  batch.update(doc(db, 'users', uid), userUpdate);
  batch.update(doc(db, 'users_public', uid), publicUpdate);
  batch.update(doc(db, 'usernames', username), usernameUpdate);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${uid}`);
  }
}

export async function updatePresence(uid: string, isOnline: boolean): Promise<void> {
  const path = `users_public/${uid}`;
  try {
    await updateDoc(doc(db, 'users_public', uid), {
      isOnline,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Presence updates should not crash the UI if user signed out mid-flight
    console.warn('Presence update skipped:', error);
  }
}

export async function sendFriendRequestByUsername(
  me: UserPrivate,
  rawTargetUsername: string
): Promise<'sent' | 'already_friends' | 'already_pending'> {
  const cleanTarget = sanitizeUsername(rawTargetUsername);
  if (!isValidUsername(cleanTarget)) {
    throw new Error('Enter a valid Era username (3–24 lowercase letters, numbers, or _).');
  }
  if (cleanTarget === me.username) {
    throw new Error('You cannot send a friend request to yourself.');
  }

  const target = await lookupUsername(cleanTarget);
  if (!target) {
    throw new Error(`No user found with Era username @${cleanTarget}.`);
  }

  const requestId = getDeterministicChatId(me.uid, target.uid);
  const reqRef = doc(db, 'friend_requests', requestId);

  let existingSnap;
  try {
    existingSnap = await getDoc(reqRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `friend_requests/${requestId}`);
  }

  if (existingSnap.exists()) {
    const existing = existingSnap.data() as FriendRequest;
    if (existing.status === 'accepted') {
      return 'already_friends';
    }
    if (existing.status === 'pending') {
      return 'already_pending';
    }
    if (existing.status === 'rejected') {
      await deleteDoc(reqRef);
    }
  }

  const participants = getSortedParticipantUids(me.uid, target.uid);

  try {
    await setDoc(reqRef, {
      fromUid: me.uid,
      toUid: target.uid,
      fromUsername: me.username,
      fromDisplayName: me.displayName,
      fromPhotoURL: me.photoURL || '',
      toUsername: target.username,
      toDisplayName: target.displayName,
      toPhotoURL: target.photoURL || '',
      participants,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `friend_requests/${requestId}`);
  }

  return 'sent';
}

export async function respondFriendRequest(
  req: FriendRequest,
  decision: 'accepted' | 'rejected'
): Promise<string | null> {
  const reqRef = doc(db, 'friend_requests', req.id);
  try {
    await updateDoc(reqRef, {
      status: decision,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `friend_requests/${req.id}`);
  }

  if (decision === 'accepted') {
    const chatId = await ensureDirectChatFromRequest(req);
    return chatId;
  }
  return null;
}

export async function cancelFriendRequest(requestId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friend_requests', requestId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friend_requests/${requestId}`);
  }
}

export async function ensureDirectChatFromRequest(req: FriendRequest): Promise<string> {
  const [uid1, uid2] = getSortedParticipantUids(req.fromUid, req.toUid);
  const chatId = `${uid1}_${uid2}`;
  const chatRef = doc(db, 'chats', chatId);

  let snap;
  try {
    snap = await getDoc(chatRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `chats/${chatId}`);
  }

  if (snap.exists()) {
    return chatId;
  }

  const isUid1From = uid1 === req.fromUid;
  const uid1Name = (isUid1From ? req.fromDisplayName : req.toDisplayName).slice(0, 50);
  const uid1Username = isUid1From ? req.fromUsername : req.toUsername;
  const uid1Photo = (isUid1From ? req.fromPhotoURL : req.toPhotoURL) || '';

  const uid2Name = (isUid1From ? req.toDisplayName : req.fromDisplayName).slice(0, 50);
  const uid2Username = isUid1From ? req.toUsername : req.fromUsername;
  const uid2Photo = (isUid1From ? req.toPhotoURL : req.fromPhotoURL) || '';

  try {
    await setDoc(chatRef, {
      chatId,
      participantUids: [uid1, uid2],
      uid1,
      uid1Name,
      uid1Username,
      uid1Photo,
      uid2,
      uid2Name,
      uid2Username,
      uid2Photo,
      lastMessageText: '',
      lastMessageType: 'none',
      lastMessageSenderId: '',
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}`);
  }

  return chatId;
}

export async function sendChatMessage(params: {
  chat: ChatRoom;
  senderId: string;
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  locationLat?: number;
  locationLng?: number;
  locationLabel?: string;
}): Promise<void> {
  const msgCollection = collection(db, 'chats', params.chat.chatId, 'messages');
  const msgRef = doc(msgCollection);
  const messageId = msgRef.id;
  const now = serverTimestamp();

  const cleanText = params.text ? params.text.trim().slice(0, 2000) : '';
  const previewText =
    params.type === 'text'
      ? cleanText.slice(0, 500)
      : params.type === 'image'
        ? cleanText ? `Photo: ${cleanText}`.slice(0, 500) : 'Photo'
        : params.type === 'video'
          ? cleanText ? `Video: ${cleanText}`.slice(0, 500) : 'Video'
          : params.locationLabel
            ? `Location: ${params.locationLabel}`.slice(0, 500)
            : 'Shared Location';

  const messageDoc: Record<string, unknown> = {
    messageId,
    chatId: params.chat.chatId,
    senderId: params.senderId,
    participantUids: params.chat.participantUids,
    type: params.type,
    createdAt: now,
  };

  if (cleanText) messageDoc.text = cleanText;
  if (params.mediaUrl) messageDoc.mediaUrl = params.mediaUrl.slice(0, 800);
  if (typeof params.locationLat === 'number') messageDoc.locationLat = params.locationLat;
  if (typeof params.locationLng === 'number') messageDoc.locationLng = params.locationLng;
  if (params.locationLabel) messageDoc.locationLabel = params.locationLabel.slice(0, 200);

  const batch = writeBatch(db);
  batch.set(msgRef, messageDoc);
  batch.update(doc(db, 'chats', params.chat.chatId), {
    lastMessageText: previewText,
    lastMessageType: params.type,
    lastMessageSenderId: params.senderId,
    lastMessageAt: now,
    updatedAt: now,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${params.chat.chatId}/messages/${messageId}`);
  }

  // Update daily chat streak & award EraPoints (both users must send on the same day to increment)
  await recordMessageForStreak(params.chat.participantUids, params.senderId).catch((err) => {
    console.warn('Streak update skipped:', err);
  });
}

export async function markChatMessagesRead(
  chatId: string,
  messages: ChatMessage[],
  myUid: string
): Promise<void> {
  const unread = messages.filter((m) => m.senderId !== myUid && !m.readAt);
  if (unread.length === 0) return;

  const batch = writeBatch(db);
  const now = serverTimestamp();
  unread.slice(0, 50).forEach((m) => {
    batch.update(doc(db, 'chats', chatId, 'messages', m.messageId), {
      readAt: now,
    });
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages`);
  }
}

export async function setChatTyping(
  chatId: string,
  uid: string,
  participantUids: string[],
  isTyping: boolean
): Promise<void> {
  const typingRef = doc(db, 'chats', chatId, 'typing', uid);
  try {
    await setDoc(typingRef, {
      uid,
      participantUids,
      isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-critical ephemeral typing indicator; silently ignore transient failures
  }
}
