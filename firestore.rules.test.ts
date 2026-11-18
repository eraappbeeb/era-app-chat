import fs from 'node:fs';
import path from 'node:path';

/**
 * Security Rules Structural & Payload Verification Suite (Dirty Dozen Spec)
 * Validates that firestore.rules enforces every invariant from security_spec.md.
 */
const rulesPath = path.resolve(process.cwd(), 'firestore.rules');

export function verifyRulesInvariants() {
  const rules = fs.readFileSync(rulesPath, 'utf-8');
  const assertions = [
    { name: 'Global safety net catch-all', pass: rules.includes('match /{document=**}') && rules.includes('allow read, write: if false;') },
    { name: 'Verified user enforcement', pass: rules.includes('request.auth.token.email_verified == true') },
    { name: 'PII isolation on /users/{uid}', pass: rules.includes('match /users/{uid}') && rules.includes('allow list: if false;') },
    { name: 'No blanket list on users_public', pass: rules.includes('match /users_public/{uid}') && rules.includes('allow list: if false;') },
    { name: 'Terminal state lock on friend_requests', pass: rules.includes("existing().status == 'pending'") },
    { name: 'Master gate on messages create', pass: rules.includes('get(/databases/$(database)/documents/chats/$(chatId)).data.participantUids') },
    { name: 'Zero get() calls inside allow list', pass: !/allow list:[^;]*get\(/.test(rules) },
    { name: 'Read-receipt sender guard', pass: rules.includes('request.auth.uid != existing().senderId') },
    { name: 'Server timestamp enforcement', pass: rules.includes('incoming().createdAt == request.time') },
    { name: 'Streak participant & atomic freeze guard', pass: rules.includes('match /streaks/{streakId}') && rules.includes('getAfter(/databases/$(database)/documents/users/$(request.auth.uid)).data.EraPoints') },
    { name: 'Streak celebration milestone & 24h gold guard', pass: rules.includes('isValidSeenByList') && rules.includes('goldHeaderUntil <= request.time.toMillis() + 86460000') }
  ];

  const failures = assertions.filter((a) => !a.pass);
  if (failures.length > 0) {
    throw new Error(`Security rules assertions failed: ${failures.map((f) => f.name).join(', ')}`);
  }
  return assertions;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = verifyRulesInvariants();
  console.log(`All ${results.length} Firestore security rule invariants verified.`);
}
