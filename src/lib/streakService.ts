import {
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { getDeterministicChatId, getSortedParticipantUids } from './utils';
import type { ChatStreak, UserPrivate } from '../types/chat';

export const FREEZE_COST_ERA_POINTS = 50;
export const DEFAULT_ERA_POINTS = 100;
export const GOLD_HEADER_DURATION_MS = 24 * 60 * 60 * 1000;

export function getDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDaysToKey(key: string, days: number): string {
  const dt = parseDateKey(key);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function diffDateKeys(earlierKey: string, laterKey: string): number {
  const ms = parseDateKey(laterKey).getTime() - parseDateKey(earlierKey).getTime();
  return Math.round(ms / 86400000);
}

export function getMondayDateKey(dateKey: string): string {
  const dt = parseDateKey(dateKey);
  const day = dt.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt.toISOString().slice(0, 10);
}

interface StreakStateSlice {
  count: number;
  lastDate: string;
  freezes: number;
  lastFreezeReset: string;
  uid1LastSentDate: string;
  uid2LastSentDate: string;
}

export function evaluateStreakTransition(
  current: StreakStateSlice,
  today: string = getDateKey()
): { next: StreakStateSlice; changed: boolean } {
  const monday = getMondayDateKey(today);
  let count = current.count;
  let lastDate = current.lastDate;
  let freezes = current.freezes;
  let lastFreezeReset = current.lastFreezeReset;

  // Every Monday reset freezes to 1 if less than 1
  if (!lastFreezeReset || lastFreezeReset < monday) {
    if (freezes < 1) {
      freezes = 1;
    }
    lastFreezeReset = monday;
  }

  // If one day missed and freezes > 0, auto use 1 freeze and keep count
  if (count > 0 && lastDate) {
    const diff = diffDateKeys(lastDate, today);
    if (diff === 2) {
      if (freezes > 0) {
        freezes -= 1;
        lastDate = addDaysToKey(today, -1);
      } else {
        count = 0;
      }
    } else if (diff > 2) {
      count = 0;
    }
  }

  const changed =
    count !== current.count ||
    lastDate !== current.lastDate ||
    freezes !== current.freezes ||
    lastFreezeReset !== current.lastFreezeReset;

  return {
    next: {
      count,
      lastDate,
      freezes,
      lastFreezeReset,
      uid1LastSentDate: current.uid1LastSentDate,
      uid2LastSentDate: current.uid2LastSentDate,
    },
    changed,
  };
}

export async function ensureUserEraPoints(
  uid: string,
  legacyDankPoints?: number
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const initialPoints =
      typeof legacyDankPoints === 'number' ? legacyDankPoints : DEFAULT_ERA_POINTS;
    const payload: Record<string, unknown> = {
      EraPoints: initialPoints,
      updatedAt: serverTimestamp(),
    };
    if (typeof legacyDankPoints === 'number') {
      payload.dankPoints = deleteField();
    }
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncStreakOnChatOpen(uidA: string, uidB: string): Promise<void> {
  const streakId = getDeterministicChatId(uidA, uidB);
  const participantUids = getSortedParticipantUids(uidA, uidB);
  const streakRef = doc(db, 'streaks', streakId);
  const today = getDateKey();
  const monday = getMondayDateKey(today);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(streakRef);
      const now = serverTimestamp();

      if (!snap.exists()) {
        tx.set(streakRef, {
          streakId,
          participantUids,
          count: 0,
          lastDate: '',
          freezes: 1,
          lastFreezeReset: monday,
          uid1LastSentDate: '',
          uid2LastSentDate: '',
          createdAt: now,
          updatedAt: now,
        });
        return;
      }

      const data = snap.data() as ChatStreak;
      const { next, changed } = evaluateStreakTransition(
        {
          count: data.count || 0,
          lastDate: data.lastDate || '',
          freezes: typeof data.freezes === 'number' ? data.freezes : 1,
          lastFreezeReset: data.lastFreezeReset || '',
          uid1LastSentDate: data.uid1LastSentDate || '',
          uid2LastSentDate: data.uid2LastSentDate || '',
        },
        today
      );

      const updatePayload: Record<string, unknown> = {};
      if (changed) {
        updatePayload.count = next.count;
        updatePayload.lastDate = next.lastDate;
        updatePayload.freezes = next.freezes;
        updatePayload.lastFreezeReset = next.lastFreezeReset;
      }

      if (next.count >= 7 && !data.celebrated7) {
        updatePayload.celebrated7 = true;
      }
      if (next.count >= 30 && !data.celebrated30) {
        updatePayload.celebrated30 = true;
      }
      if (next.count >= 100 && !data.celebrated100) {
        updatePayload.celebrated100 = true;
        updatePayload.goldHeaderUntil = Date.now() + GOLD_HEADER_DURATION_MS;
      }

      if (Object.keys(updatePayload).length > 0) {
        updatePayload.updatedAt = now;
        tx.update(streakRef, updatePayload);
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `streaks/${streakId}`);
  }
}

export async function recordMessageForStreak(
  participantUidsInput: string[],
  senderId: string
): Promise<void> {
  if (participantUidsInput.length !== 2) return;
  const participantUids = getSortedParticipantUids(
    participantUidsInput[0],
    participantUidsInput[1]
  );
  const [uid1, uid2] = participantUids;
  const streakId = `${uid1}_${uid2}`;
  const streakRef = doc(db, 'streaks', streakId);
  const userRef = doc(db, 'users', senderId);

  const today = getDateKey();
  const monday = getMondayDateKey(today);

  try {
    await runTransaction(db, async (tx) => {
      const [streakSnap, userSnap] = await Promise.all([
        tx.get(streakRef),
        tx.get(userRef),
      ]);
      const now = serverTimestamp();

      let baseState: StreakStateSlice = {
        count: 0,
        lastDate: '',
        freezes: 1,
        lastFreezeReset: monday,
        uid1LastSentDate: '',
        uid2LastSentDate: '',
      };

      if (streakSnap.exists()) {
        const existing = streakSnap.data() as ChatStreak;
        const evaluated = evaluateStreakTransition(
          {
            count: existing.count || 0,
            lastDate: existing.lastDate || '',
            freezes: typeof existing.freezes === 'number' ? existing.freezes : 1,
            lastFreezeReset: existing.lastFreezeReset || '',
            uid1LastSentDate: existing.uid1LastSentDate || '',
            uid2LastSentDate: existing.uid2LastSentDate || '',
          },
          today
        );
        baseState = evaluated.next;
      }

      const uid1LastSentDate =
        senderId === uid1 ? today : baseState.uid1LastSentDate;
      const uid2LastSentDate =
        senderId === uid2 ? today : baseState.uid2LastSentDate;

      let nextCount = baseState.count;
      let nextLastDate = baseState.lastDate;
      let streakIncremented = false;

      if (
        uid1LastSentDate === today &&
        uid2LastSentDate === today &&
        nextLastDate !== today
      ) {
        nextCount += 1;
        nextLastDate = today;
        streakIncremented = true;
      }

      const existingStreak = streakSnap.exists() ? (streakSnap.data() as ChatStreak) : null;
      const milestonePatch: Record<string, unknown> = {};
      if (nextCount >= 7 && !existingStreak?.celebrated7) {
        milestonePatch.celebrated7 = true;
      }
      if (nextCount >= 30 && !existingStreak?.celebrated30) {
        milestonePatch.celebrated30 = true;
      }
      if (nextCount >= 100 && !existingStreak?.celebrated100) {
        milestonePatch.celebrated100 = true;
        milestonePatch.goldHeaderUntil = Date.now() + GOLD_HEADER_DURATION_MS;
      }

      if (!streakSnap.exists()) {
        tx.set(streakRef, {
          streakId,
          participantUids,
          count: nextCount,
          lastDate: nextLastDate,
          freezes: baseState.freezes,
          lastFreezeReset: baseState.lastFreezeReset,
          uid1LastSentDate,
          uid2LastSentDate,
          ...milestonePatch,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        tx.update(streakRef, {
          count: nextCount,
          lastDate: nextLastDate,
          freezes: baseState.freezes,
          lastFreezeReset: baseState.lastFreezeReset,
          uid1LastSentDate,
          uid2LastSentDate,
          ...milestonePatch,
          updatedAt: now,
        });
      }

      if (userSnap.exists()) {
        const userData = userSnap.data() as UserPrivate & { dankPoints?: number };
        if (typeof userData.EraPoints !== 'number') {
          const legacyPoints =
            typeof userData.dankPoints === 'number'
              ? userData.dankPoints
              : DEFAULT_ERA_POINTS;
          const userPatch: Record<string, unknown> = {
            EraPoints: legacyPoints,
            updatedAt: now,
          };
          if (typeof userData.dankPoints === 'number') {
            userPatch.dankPoints = deleteField();
          }
          tx.update(userRef, userPatch);
        } else {
          const earned = streakIncremented ? 25 : 5;
          tx.update(userRef, {
            EraPoints: Math.min(1000000, userData.EraPoints + earned),
            updatedAt: now,
          });
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `streaks/${streakId}`);
  }
}

export async function buyExtraFreeze(uid: string, peerUid: string): Promise<void> {
  const streakId = getDeterministicChatId(uid, peerUid);
  const participantUids = getSortedParticipantUids(uid, peerUid);
  const userRef = doc(db, 'users', uid);
  const streakRef = doc(db, 'streaks', streakId);
  const today = getDateKey();
  const monday = getMondayDateKey(today);

  try {
    await runTransaction(db, async (tx) => {
      const [userSnap, streakSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(streakRef),
      ]);

      if (!userSnap.exists()) {
        throw new Error('User profile not found.');
      }

      const userData = userSnap.data() as UserPrivate;
      const currentPoints = typeof userData.EraPoints === 'number' ? userData.EraPoints : 0;
      if (currentPoints < FREEZE_COST_ERA_POINTS) {
        throw new Error(`Not enough EraPoints (${FREEZE_COST_ERA_POINTS} required).`);
      }

      const now = serverTimestamp();

      tx.update(userRef, {
        EraPoints: currentPoints - FREEZE_COST_ERA_POINTS,
        updatedAt: now,
      });

      if (!streakSnap.exists()) {
        tx.set(streakRef, {
          streakId,
          participantUids,
          count: 0,
          lastDate: '',
          freezes: 2,
          lastFreezeReset: monday,
          uid1LastSentDate: '',
          uid2LastSentDate: '',
          createdAt: now,
          updatedAt: now,
        });
      } else {
        const existing = streakSnap.data() as ChatStreak;
        const currentFreezes = typeof existing.freezes === 'number' ? existing.freezes : 0;
        tx.update(streakRef, {
          freezes: currentFreezes + 1,
          updatedAt: now,
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Not enough EraPoints')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `streaks/${streakId}`);
  }
}

export async function markStreakCelebrationSeen(
  streakId: string,
  uid: string,
  milestone: 7 | 30 | 100
): Promise<void> {
  const streakRef = doc(db, 'streaks', streakId);
  const field =
    milestone === 7
      ? 'celebrated7SeenBy'
      : milestone === 30
        ? 'celebrated30SeenBy'
        : 'celebrated100SeenBy';

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(streakRef);
      if (!snap.exists()) return;
      const data = snap.data() as ChatStreak;
      const currentList = Array.isArray(data[field]) ? data[field] : [];
      if (currentList.includes(uid)) return;
      const nextList = [...currentList, uid].slice(0, 2);
      tx.update(streakRef, {
        [field]: nextList,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `streaks/${streakId}`);
  }
}
