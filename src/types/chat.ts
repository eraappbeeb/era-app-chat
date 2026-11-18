import type { Timestamp } from 'firebase/firestore';

export type ThemeMode = 'dark' | 'light';

export interface UserPrivate {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  photoURL?: string;
  theme: ThemeMode;
  fcmToken?: string;
  EraPoints?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPublic {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  isOnline: boolean;
  lastSeen: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UsernameLookup {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendRequest {
  id: string;
  fromUid: string;
  toUid: string;
  fromUsername: string;
  fromDisplayName: string;
  fromPhotoURL?: string;
  toUsername: string;
  toDisplayName: string;
  toPhotoURL?: string;
  participants: string[];
  status: FriendRequestStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type MessageType = 'text' | 'image' | 'video' | 'location';

export interface ChatRoom {
  chatId: string;
  participantUids: string[];
  uid1: string;
  uid1Name: string;
  uid1Username: string;
  uid1Photo?: string;
  uid2: string;
  uid2Name: string;
  uid2Username: string;
  uid2Photo?: string;
  lastMessageText: string;
  lastMessageType: MessageType | 'none';
  lastMessageSenderId: string;
  lastMessageAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  participantUids: string[];
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  locationLat?: number;
  locationLng?: number;
  locationLabel?: string;
  createdAt: Timestamp | null;
  readAt?: Timestamp | null;
}

export interface TypingStatus {
  uid: string;
  participantUids: string[];
  isTyping: boolean;
  updatedAt: Timestamp | null;
}

export interface ChatStreak {
  streakId: string;
  participantUids: string[];
  count: number;
  lastDate: string;
  freezes: number;
  lastFreezeReset: string;
  uid1LastSentDate: string;
  uid2LastSentDate: string;
  celebrated7?: boolean;
  celebrated30?: boolean;
  celebrated100?: boolean;
  celebrated7SeenBy?: string[];
  celebrated30SeenBy?: string[];
  celebrated100SeenBy?: string[];
  goldHeaderUntil?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
