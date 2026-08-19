import { db } from './firebaseConfig';
import {
  collection, addDoc, doc, setDoc, getDoc, updateDoc,
  query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';

export interface FirebaseMessage {
  id: string;
  from: string;
  fromName: string;
  text: string;
  timestamp: Timestamp | null;
}

export interface ThreadPreview {
  id: string;
  otherEmail: string;
  otherName: string;
  otherAvatar: string;
  lastMessage: string;
  lastMessageTime: Timestamp | null;
  unreadCount: number;
}

/** Stable thread ID = both emails sorted & joined */
export function getThreadId(email1: string, email2: string): string {
  return [email1, email2].sort().join('__');
}

/**
 * Send a chat message.
 * IMPORTANT: We never use dot-notation field paths with email addresses because
 * Firestore interprets dots as nested path separators.  Instead we READ the
 * current map, mutate it in JS, then write the whole map back.
 */
export async function sendFirebaseMessage(
  fromEmail: string,
  fromName: string,
  fromAvatar: string,
  toEmail: string,
  toName: string,
  toAvatar: string,
  text: string
): Promise<void> {
  const threadId = getThreadId(fromEmail, toEmail);
  const threadRef = doc(db, 'threads', threadId);
  const threadSnap = await getDoc(threadRef);

  if (!threadSnap.exists()) {
    // First message in this thread
    await setDoc(threadRef, {
      participants: [fromEmail, toEmail],
      participantNames: { [fromEmail]: fromName, [toEmail]: toName },
      participantAvatars: { [fromEmail]: fromAvatar, [toEmail]: toAvatar },
      lastMessage: text,
      lastMessageTime: serverTimestamp(),
      unreadCount: { [fromEmail]: 0, [toEmail]: 1 },
    });
  } else {
    const data = threadSnap.data();

    // Build updated maps in JS (no dot-notation paths - safe with email keys)
    const unreadCount: Record<string, number> = { ...(data.unreadCount ?? {}) };
    unreadCount[toEmail] = (unreadCount[toEmail] ?? 0) + 1;
    // Sender's own unread resets to 0 (they just sent, so they obviously see it)
    unreadCount[fromEmail] = 0;

    const participantNames: Record<string, string> = {
      ...(data.participantNames ?? {}),
      [fromEmail]: fromName,
      [toEmail]: toName,
    };
    const participantAvatars: Record<string, string> = {
      ...(data.participantAvatars ?? {}),
      [fromEmail]: fromAvatar,
      [toEmail]: toAvatar,
    };

    await updateDoc(threadRef, {
      lastMessage: text,
      lastMessageTime: serverTimestamp(),
      unreadCount,
      participantNames,
      participantAvatars,
    });
  }

  // Store the actual message in the sub-collection
  await addDoc(collection(db, 'threads', threadId, 'messages'), {
    from: fromEmail,
    fromName,
    text,
    timestamp: serverTimestamp(),
  });
}

/** Real-time listener for a single chat thread */
export function subscribeToThread(
  email1: string,
  email2: string,
  callback: (msgs: FirebaseMessage[]) => void
): () => void {
  const threadId = getThreadId(email1, email2);
  // Use a simple query without orderBy - sort client-side
  const q = collection(db, 'threads', threadId, 'messages');
  return onSnapshot(q, (snap) => {
    const msgs: FirebaseMessage[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<FirebaseMessage, 'id'>),
    }));
    // Sort ascending by timestamp client-side
    msgs.sort((a, b) => {
      const aMs = a.timestamp ? a.timestamp.toMillis() : 0;
      const bMs = b.timestamp ? b.timestamp.toMillis() : 0;
      return aMs - bMs;
    });
    callback(msgs);
  });
}

/** Real-time listener for all threads where myEmail is a participant (inbox) */
export function subscribeToInbox(
  myEmail: string,
  callback: (threads: ThreadPreview[]) => void
): () => void {
  // No orderBy - sort client-side to avoid composite index requirement
  const q = query(
    collection(db, 'threads'),
    where('participants', 'array-contains', myEmail)
  );
  return onSnapshot(q, (snap) => {
    const threads: ThreadPreview[] = snap.docs.map((d) => {
      const data = d.data();
      const otherEmail =
        (data.participants as string[]).find((p) => p !== myEmail) ?? '';
      return {
        id: d.id,
        otherEmail,
        otherName: (data.participantNames?.[otherEmail] as string) ?? otherEmail,
        otherAvatar: (data.participantAvatars?.[otherEmail] as string) ?? '',
        lastMessage: (data.lastMessage as string) ?? '',
        lastMessageTime: (data.lastMessageTime as Timestamp) ?? null,
        unreadCount: (data.unreadCount?.[myEmail] as number) ?? 0,
      };
    });
    // Sort newest first client-side
    threads.sort((a, b) => {
      const aMs = a.lastMessageTime ? a.lastMessageTime.toMillis() : 0;
      const bMs = b.lastMessageTime ? b.lastMessageTime.toMillis() : 0;
      return bMs - aMs;
    });
    callback(threads);
  });
}

/**
 * Mark a thread as read for myEmail.
 * Reads the current unreadCount map and sets myEmail's value to 0,
 * then writes the whole map back (avoids Firestore dot-path issue with emails).
 */
export async function markThreadRead(myEmail: string, otherEmail: string): Promise<void> {
  const threadId = getThreadId(myEmail, otherEmail);
  const threadRef = doc(db, 'threads', threadId);
  try {
    const snap = await getDoc(threadRef);
    if (snap.exists()) {
      const unreadCount: Record<string, number> = { ...(snap.data().unreadCount ?? {}) };
      unreadCount[myEmail] = 0;
      await updateDoc(threadRef, { unreadCount });
    }
  } catch {
    // Thread might not exist yet - ignore
  }
}

/** Format a Firestore Timestamp into a human-readable relative time */
export function formatTimestamp(ts: Timestamp | null): string {
  if (!ts) return '';
  const date = ts.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
