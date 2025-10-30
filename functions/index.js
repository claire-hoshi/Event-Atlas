import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { beforeUserSignedIn } from 'firebase-functions/v2/identity';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp();
const db = getFirestore();

// Blocking function: set role based on allowlist before the session starts
export const beforeSignInSetRole = beforeUserSignedIn(async (event) => {
  try {
    const uid = event.data?.uid || event.data?.user?.uid;
    const email = String(event.data?.email || event.data?.user?.email || '').toLowerCase();
    if (!uid || !email) return;

    // Default role
    let role = 'student';
    // Only depauw.edu users are allowed per client; still check server-side
    if (email.endsWith('@depauw.edu')) {
      const allowDoc = await db.collection('orgAllowlist').doc(email).get();
      const autoDoc = await db.collection('orgAutoApprove').doc(email).get();
      if (allowDoc.exists || autoDoc.exists) role = 'organizer';
    }

    // Persist as custom claim and also return as session claim for immediate use
    await getAuth().setCustomUserClaims(uid, { role });
    return { sessionClaims: { role } };
  } catch (e) {
    console.error('beforeSignInSetRole failed', e);
  }
});

// Admin-only callable to add/remove emails in the allowlist
export const setOrganizerApproval = onCall({ cors: true }, async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  // Require admin claim on caller
  if (!caller.token || caller.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required.');
  }

  const email = String(request.data?.email || '').toLowerCase();
  const approve = Boolean(request.data?.approve);
  const makeAuto = Boolean(request.data?.auto); // if true, also remember for future auto-approval
  if (!email || !email.includes('@depauw.edu')) {
    throw new HttpsError('invalid-argument', 'Provide a depauw.edu email.');
  }

  const allowRef = db.collection('orgAllowlist').doc(email);
  if (approve) {
    await allowRef.set({ email, approvedAt: Date.now(), approvedBy: caller.uid }, { merge: true });
    if (makeAuto) {
      await db.collection('orgAutoApprove').doc(email).set({ email, addedAt: Date.now(), addedBy: caller.uid }, { merge: true });
    }
  } else {
    await allowRef.delete();
    if (makeAuto) await db.collection('orgAutoApprove').doc(email).delete();
  }

  // Optional: also update claim for the user if exists
  try {
    const userRecord = await getAuth().getUserByEmail(email);
    const claims = approve ? { role: 'organizer' } : { role: 'student' };
    await getAuth().setCustomUserClaims(userRecord.uid, claims);
  } catch (e) {
    // If the user doesn't exist yet, ignore; claim will be set at next sign-in
    console.log('setOrganizerApproval note:', e?.message || e);
  }
  return { ok: true };
});

// Optional automation: auto-approve any depauw.edu request created in roleRequests
export const autoApproveRoleRequests = onDocumentCreated('roleRequests/{uid}', async (event) => {
  try {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const email = String(data?.email || '').toLowerCase();
    if (!email.endsWith('@depauw.edu')) return; // guard by domain

    // Only auto-approve if email is in orgAutoApprove
    const autoDoc = await db.collection('orgAutoApprove').doc(email).get();
    if (!autoDoc.exists) return; // leave request pending for manual review

    // Add to allowlist
    await db.collection('orgAllowlist').doc(email).set({
      email,
      approvedAt: Date.now(),
      approvedBy: 'auto',
      source: 'roleRequests'
    }, { merge: true });

    // If the user exists, update custom claims immediately
    try {
      const userRecord = await getAuth().getUserByEmail(email);
      await getAuth().setCustomUserClaims(userRecord.uid, { role: 'organizer' });
    } catch (e) {
      // If user not found yet, they will get organizer at next sign-in via blocking function
      console.log('autoApproveRoleRequests: user not found yet for', email);
    }

    // Mark request approved
    await snap.ref.set({ status: 'approved', approvedAt: Date.now() }, { merge: true });
  } catch (e) {
    console.error('autoApproveRoleRequests failed', e);
  }
});

// Notify subscribers when key event fields change
export const onEventUpdatedNotify = onDocumentUpdated('events/{eventId}', async (event) => {
  try {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    if (!after || !before) return;
    const changed = [];
    if (String(before.startTime||'') !== String(after.startTime||'')) changed.push('time');
    if (String(before.endTime||'') !== String(after.endTime||'')) changed.push('time');
    if (String(before.locationName||'') !== String(after.locationName||'')) changed.push('location');
    if (Number(before.lat||0) !== Number(after.lat||0) || Number(before.lng||0) !== Number(after.lng||0)) changed.push('location');
    if (!changed.length) return; // nothing important changed

    const eventId = event.params.eventId;
    const title = after.title || 'Event updated';
    let body = '';
    if (changed.includes('time')) body += 'Time updated. ';
    if (changed.includes('location')) body += 'Location updated.';
    const url = `https://sample-depauweventmap.web.app/#event=${eventId}`;

    // Fetch tokens subscribed to this event (for push)
    const snap = await db.collection('eventSubscriptions').doc(String(eventId)).collection('tokens').get();
    const tokens = snap.empty ? [] : snap.docs.map(d => d.id);
    const subscriberUids = new Set();
    snap.docs.forEach(d => { const u = d.data()?.uid; if (u) subscriberUids.add(String(u)); });

    // Fetch explicit registrations (covers users without push)
    const regSnap = await db.collection('eventRegistrations').doc(String(eventId)).collection('users').get();
    const emails = [];
    regSnap.docs.forEach(d => {
      const x = d.data() || {};
      const uid = String(x.uid || d.id || '').trim();
      if (uid) subscriberUids.add(uid);
      const em = String(x.email || '').trim().toLowerCase();
      if (em) emails.push(em);
    });
    const payload = {
      notification: { title: `Updated: ${title}`, body },
      data: { eventId: String(eventId), url },
      webpush: { fcmOptions: { link: url } }
    };
    // Send push to tokens in chunks of 500
    if (tokens.length) {
      const chunkSize = 500;
      for (let i = 0; i < tokens.length; i += chunkSize) {
        const slice = tokens.slice(i, i + chunkSize);
        const res = await getMessaging().sendEachForMulticast({ tokens: slice, ...payload });
        // Prune invalid tokens
        const toDelete = [];
        res.responses.forEach((r, idx) => {
          const err = r.error;
          if (err && String(err.code || '').includes('registration-token-not-registered')) {
            toDelete.push(slice[idx]);
          }
        });
        await Promise.all(toDelete.map(t => db.collection('eventSubscriptions').doc(String(eventId)).collection('tokens').doc(t).delete().catch(()=>{})));
      }
    }

    // Also write a notification document for each subscriber uid (for in-app feed)
    const batchWrites = [];
    subscriberUids.forEach(uid => {
      const ref = db.collection('userNotifications').doc(uid).collection('items').doc();
      batchWrites.push(ref.set({
        eventId: String(eventId),
        title: `Event updated: ${title}`,
        body,
        url,
        kind: 'event_update',
        read: false,
        createdAt: Date.now()
      }));
    });
    await Promise.all(batchWrites);

    // Email via Firestore Trigger Email extension: write docs to /mail
    try {
      if (emails.length) {
        const uniq = Array.from(new Set(emails));
        const mailCol = db.collection('mail');
        const subject = `Event updated: ${title}`;
        const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;">
              <h2 style="margin:0 0 8px;">Event updated: ${title}</h2>
              <p style="margin:0 0 6px;">${body}</p>
              <p><a href="${url}">Open event</a></p>
            </div>`;
        const fromEmail = 'kureahoshi_2026@depauw.edu';
        await Promise.all(
          uniq.map(em => mailCol.add({
            to: [String(em)],
            message: {
              subject,
              html,
              text: `${body} Open: ${url}`,
              from: fromEmail,
              replyTo: fromEmail
            }
          }))
        );
      }
    } catch (e) {
      console.log('email via extension write failed', e?.message || e);
    }
  } catch (e) {
    console.error('onEventUpdatedNotify failed', e);
  }
});

// Organizer-only: return list of subscribers (emails) for an event
export const getEventSubscribers = onCall({ cors: true }, async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Must be signed in.');
  const uid = caller.uid;
  const eventId = String(request.data?.eventId || '');
  if (!eventId) throw new HttpsError('invalid-argument', 'eventId is required.');

  // Check organizer claim
  const role = String(caller.token?.role || 'student').toLowerCase();
  if (!['organizer','organization','org'].includes(role)) {
    throw new HttpsError('permission-denied', 'Organizer role required.');
  }

  // Verify ownership of the event
  const evSnap = await db.collection('events').doc(eventId).get();
  if (!evSnap.exists) throw new HttpsError('not-found', 'Event not found');
  const ev = evSnap.data();
  if (String(ev?.organizerUid || '') !== String(uid)) {
    throw new HttpsError('permission-denied', 'Only the event organizer can view subscribers.');
  }

  // Read subscriptions (server-side, not allowed directly by rules)
  const subsSnap = await db.collection('eventSubscriptions').doc(eventId).collection('tokens').get();
  const list = subsSnap.docs.map(d => {
    const x = d.data() || {};
    return { uid: x.uid || null, email: x.email || null, subscribedAt: x.subscribedAt || null };
  });
  // Sort by subscribedAt desc if available
  list.sort((a,b) => (b.subscribedAt?.toMillis?.()||0) - (a.subscribedAt?.toMillis?.()||0));
  return { items: list };
});

// Send a confirmation email when a user subscribes to an event
export const onUserSubscribedEmail = onDocumentWritten('userSubscriptions/{uid}/events/{eventId}', async (event) => {
  try {
    const uid = event.params.uid;
    const eventId = event.params.eventId;
    if (!uid || !eventId) return;

    const before = event.data?.before?.exists ? (event.data.before.data() || {}) : null;
    const after = event.data?.after?.exists ? (event.data.after.data() || {}) : null;
    if (!after) return; // deleted

    const wasSubscribed = !!(before && (before.subscribedAt || before.savedAt || before.token));
    const isSubscribed = !!(after.subscribedAt || after.savedAt || after.token);
    if (!isSubscribed || wasSubscribed) return; // only act on first subscribe/save transition

    // fetch event for details
    const evSnap = await db.collection('events').doc(eventId).get();
    const ev = evSnap.exists ? evSnap.data() : {};
    const title = ev?.title || 'Event';
    const when = ev?.startTime ? new Date(ev.startTime).toLocaleString() : '';
    const where = ev?.locationName ? ` at ${ev.locationName}` : '';
    const link = `https://sample-depauweventmap.web.app/#event=${eventId}`;

    // Look up user's email to send confirmation via Firestore Email extension
    const user = await getAuth().getUser(uid).catch(() => null);
    const toEmail = String(user?.email || '').toLowerCase();
    if (!toEmail) return;

    const subject = `Subscribed: ${title}`;
    const text = `You subscribed to updates for "${title}"${when ? ' on ' + when : ''}${where}. We will notify you if time or location changes. Open: ${link}`;
    const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;">
              <h2 style="margin:0 0 8px;">Subscribed to: ${title}</h2>
              <p style="margin:0 0 6px;">${when ? 'When: ' + when : ''}${where ? '<br/>' + where : ''}</p>
              <p style="margin:12px 0;">We will notify you if time or location changes.</p>
              <p><a href="${link}">View event</a></p>
            </div>`;

    const fromEmail = 'kureahoshi_2026@depauw.edu';
    await db.collection('mail').add({
      to: [toEmail],
      message: { subject, text, html, from: fromEmail, replyTo: fromEmail }
    });

    // Optional: send a small FCM confirmation push if a token exists on this doc
    try {
      const token = String(after.token || '').trim();
      if (token) {
        const payload = {
          token,
          notification: { title: `Subscribed: ${title}`, body: 'We\'ll notify you about time/location changes.' },
          webpush: { fcmOptions: { link } },
          data: { eventId: String(eventId), url: link }
        };
        await getMessaging().send(payload).catch(() => {});
      }
    } catch {}
  } catch (e) {
    console.error('onUserSubscribedEmail failed', e);
  }
});

// Admin-only: Unpublish an event
export const adminUnpublishEvent = onCall({ cors: true }, async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Must be signed in.');
  const email = String(caller.token?.email || '').toLowerCase();
  const isAdmin = email === 'kureahoshi_2026@depauw.edu' || caller.token?.admin === true;
  if (!isAdmin) throw new HttpsError('permission-denied', 'Admin privileges required.');

  const eventId = String(request.data?.eventId || '');
  if (!eventId) throw new HttpsError('invalid-argument', 'eventId required');
  const evRef = db.collection('events').doc(eventId);
  const snap = await evRef.get(); if (!snap.exists) throw new HttpsError('not-found', 'Event not found');
  await evRef.set({ published: false, unpublishedAt: Date.now(), unpublishedBy: email }, { merge: true });
  return { ok: true };
});
