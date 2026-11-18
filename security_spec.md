# EraApp Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email addresses and theme preferences live strictly in `/users/{uid}` and are readable/writable only by the verified owner (`request.auth.uid == uid`).
2. **No Unbounded List Queries**: `/users`, `/users_public`, and `/usernames` forbid `list` queries (`allow list: if false`). Friend lookup resolves exact `@username` via single-document `getDoc` on `/usernames/{username}`.
3. **Friend Request Integrity**: A friend request must originate from `request.auth.uid == fromUid`, target an existing `/users_public/{toUid}`, and start in `status == 'pending'`. Only the recipient (`toUid`) may transition `pending` -> `accepted` or `rejected`. Terminal states (`accepted`, `rejected`) cannot be mutated back.
4. **Chat & Message Master Gate**: Messages and typing states live under `/chats/{chatId}` and verify parent chat membership on create via `get(/databases/$(database)/documents/chats/$(chatId))`.
5. **Query Cost Guard**: `allow list` on `/friend_requests` and `/chats` evaluates `request.auth.uid in resource.data.participants` (or `participantUids`), and `allow list` on `/chats/{chatId}/messages` and `/chats/{chatId}/typing` validates deterministic `{uid1}_{uid2}` `chatId` participant membership via `isChatIdParticipant(chatId)` without any `get()` or `exists()` lookups.
6. **Temporal Integrity**: All `createdAt`, `updatedAt`, `lastSeen`, `lastMessageAt`, and `readAt` fields must equal `request.time`.
7. **Streak & Freeze Atomicity**: `/streaks/{streakId}` is keyed by sorted `{user1}_{user2}` matching an existing `/chats/{chatId}`. Only verified participants can read/write, and purchasing an extra freeze (`freezes + 1`) requires an atomic `-50` deduction on `/users/{uid}.EraPoints` verified via `getAfter`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Ghost Field Injection on Profile**: `{ uid: "u1", email: "a@b.com", username: "a", displayName: "A", theme: "dark", isAdmin: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }` -> Blocked by `keys().hasOnly(...)`.
2. **Unverified Email Write**: Authenticated user with `email_verified == false` attempting to create `/users_public/u1` -> Blocked by `isVerified()`.
3. **UID Spoofing on Friend Request**: `fromUid: "victim_uid"` while signed in as `attacker_uid` -> Blocked by `incoming().fromUid == request.auth.uid`.
4. **Self-Friend Request**: `fromUid == toUid` -> Blocked by `incoming().toUid != request.auth.uid`.
5. **Orphan Friend Request**: `toUid: "nonexistent_user"` -> Blocked by `exists(/databases/$(database)/documents/users_public/$(incoming().toUid))`.
6. **Sender Self-Accepting Friend Request**: `fromUid` updating `status: "accepted"` -> Blocked by `existing().toUid == request.auth.uid`.
7. **Terminal State Re-opening**: Recipient updating `rejected` request back to `pending` -> Blocked by `existing().status == 'pending'`.
8. **Blanket User List Scraping**: `getDocs(collection(db, 'users_public'))` -> Blocked by `allow list: if false`.
9. **Oversized ID Poisoning**: Creating `/chats/aaaa...(>260 chars)...` -> Blocked by `isValidChatId(chatId)`.
10. **Message Impersonation**: Creating message with `senderId: "other_uid"` -> Blocked by `incoming().senderId == request.auth.uid`.
11. **Sender Forging Read Receipt**: Sender updating `readAt` on their own message -> Blocked by `request.auth.uid != existing().senderId`.
12. **Client Timestamp Forgery**: Creating message with `createdAt: Timestamp(2020-01-01)` -> Blocked by `incoming().createdAt == request.time`.
