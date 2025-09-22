import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { beforeUserSignedIn } from 'firebase-functions/v2/identity';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

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
