import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const VAPID_KEY = (window.FCM_VAPID_KEY || 'BIF3fotOumTQGkQdAdXqoAhBa8UTuDCEbZ-3-9qrPVOJxBtjLYC0jqz3vBFgmO8EkaDPjNYqCz6ffYyt7_l8Ekg').trim();
const messagingPromise = (async () => {
  try {
    const supported = await isSupported();
    if (!supported) return null;
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging();
    return { messaging, reg };
  } catch { return null; }
})();

export async function messagingSupported(){
  const m = await messagingPromise; return !!m && !!VAPID_KEY;
}

export async function requestPermission(){
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch { return false; }
}

export async function getFcmToken(){
  const m = await messagingPromise; if (!m) throw new Error('messaging-unsupported');
  if (!VAPID_KEY) throw new Error('missing-vapid-key');
  try {
    const token = await getToken(m.messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: m.reg });
    if (!token) throw new Error('no-token');
    return token;
  } catch (e) { throw e; }
}

export async function subscribeToEvent(eventId){
  try {
    const ok = await requestPermission();
    if (!ok) return { ok:false, reason:'denied' };
    const token = await getFcmToken();
    const auth = getAuth();
    const user = auth.currentUser;
    const db = getFirestore();
    const ref = doc(db, 'eventSubscriptions', String(eventId), 'tokens', token);
    await setDoc(ref, {
      uid: user?.uid || null,
      email: user?.email || null,
      token,
      subscribedAt: serverTimestamp()
    }, { merge: true });
    // Also write a user-facing mapping so the user can list their subscriptions
    if (user?.uid) {
      const uref = doc(db, 'userSubscriptions', user.uid, 'events', String(eventId));
      await setDoc(uref, { eventId: String(eventId), token, subscribedAt: serverTimestamp() }, { merge: true });
    }
    return { ok:true, token };
  } catch (e) {
    return { ok:false, reason: e?.message || 'error' };
  }
}

export async function unsubscribeFromEvent(eventId){
  try {
    const db = getFirestore();
    // Always remove from the userSubscriptions list so Saved view updates,
    // even if the device doesn't have a push token.
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (user?.uid) {
        const uref = doc(db, 'userSubscriptions', user.uid, 'events', String(eventId));
        await deleteDoc(uref).catch(()=>{});
      }
    } catch {}

    // Best-effort: if we can resolve an FCM token, also remove the token subscription document.
    try {
      const token = await getFcmToken();
      if (token) {
        const ref = doc(db, 'eventSubscriptions', String(eventId), 'tokens', token);
        await deleteDoc(ref).catch(()=>{});
      }
    } catch { /* ignore; token not required to unsave */ }

    return { ok:true };
  } catch (e) { return { ok:false, reason: e?.message || 'error' }; }
}

// Foreground message
try {
  messagingPromise.then((m) => {
    if (!m) return;
    onMessage(m.messaging, (payload) => {
      // Optionally show a simple toast
      try {
        const title = payload.notification?.title || 'Event update';
        const body = payload.notification?.body || '';
        console.log('[FCM] foreground', title, body);
      } catch {}
    });
  });
} catch {}
