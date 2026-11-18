import type { Timestamp } from 'firebase/firestore';

export const ERA_LOGO_SRC = '/assets/aistudio/180A3269-1C56-4DD4-9D85-A92E89ECB73F_5cfb1ee1.jpeg';

export function sanitizeUsername(input: string): string {
  return input
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

export function getDeterministicChatId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

export function getSortedParticipantUids(uidA: string, uidB: string): [string, string] {
  const sorted = [uidA, uidB].sort();
  return [sorted[0], sorted[1]];
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'E';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function formatMessageTime(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  const date = ts.toDate();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatChatListTime(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  const date = ts.toDate();
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDateDivider(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Today';
  const date = ts.toDate();
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatLastSeen(lastSeen?: Timestamp | null, isOnline?: boolean): string {
  if (!lastSeen) return isOnline ? 'online' : 'last seen recently';
  const date = lastSeen.toDate();
  const diffMs = Date.now() - date.getTime();
  // Consider user online if heartbeat updated within last 90 seconds and isOnline flag is true
  if (isOnline && diffMs < 95000) {
    return 'online';
  }
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'last seen just now';
  if (diffMin < 60) return `last seen ${diffMin}m ago`;

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `last seen today at ${timeStr}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return `last seen yesterday at ${timeStr}`;
  }

  return `last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}
