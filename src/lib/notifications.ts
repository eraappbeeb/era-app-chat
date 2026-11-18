import { getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging';
import { app } from './firebase';
import { saveUserFcmToken } from './chatService';

const FCM_VAPID_KEY =
  'BKvb1c3EYoZR8NKQ6f6HsCEbpm9wYg8iv2ahOrBuNb6IEtiKf-VS_yxbYjp4gHYkBR8hH3NpFGY-byiuJnP4B-I';

const FCM_SW_URL = '/firebase-messaging-sw.js';
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

let foregroundListenerAttached = false;

async function waitForActiveServiceWorker(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return;

  const worker = registration.installing || registration.waiting;
  if (!worker) return;

  await new Promise<void>((resolve) => {
    const onStateChange = () => {
      if (worker.state === 'activated' || worker.state === 'redundant') {
        worker.removeEventListener('statechange', onStateChange);
        resolve();
      }
    };
    worker.addEventListener('statechange', onStateChange);
  });
}

function attachForegroundMessageListener(messaging: Messaging): void {
  if (foregroundListenerAttached) return;
  foregroundListenerAttached = true;

  onMessage(messaging, (payload) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const title = payload.notification?.title || payload.data?.title || 'EraApp';
    const body = payload.notification?.body || payload.data?.body || '';
    const icon = payload.notification?.icon || '/icon-192.png';

    try {
      new Notification(title, { body, icon });
    } catch {
      // Ignore environments that restrict direct Notification construction
    }
  });
}

export async function registerPushNotifications(
  uid: string,
  existingToken?: string
): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;

  try {
    const supported = await isSupported();
    if (!supported) return null;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return null;

    const existingReg = await navigator.serviceWorker.getRegistration(FCM_SW_SCOPE);
    const registration =
      existingReg ||
      (await navigator.serviceWorker.register(FCM_SW_URL, {
        scope: FCM_SW_SCOPE,
      }));
    await waitForActiveServiceWorker(registration);

    const messaging = getMessaging(app);
    attachForegroundMessageListener(messaging);

    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token && token !== existingToken) {
      await saveUserFcmToken(uid, token);
    }

    return token || null;
  } catch (error) {
    console.warn('Push notification registration skipped:', error);
    return null;
  }
}
