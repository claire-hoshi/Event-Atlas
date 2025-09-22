import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js"

import {
    getFirestore, 
    doc, 
    getDoc, 
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const auth = getAuth();
const db = getFirestore();
const storage = getStorage();

const studentLoginBtn = document.getElementById('student-login-btn');
const orgLoginBtn = document.getElementById('org-login-btn');
const UIErrorMessage = document.getElementById('error-message');

const signUpFormView = document.getElementById("signup-form");
const userProfileView = document.getElementById("user-profile") || document.getElementById("profile-view");
const userEmailText = document.getElementById("user-email");
const userNameText = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");
const requestOrgBtn = document.getElementById('request-org-btn');
const nameLabel = document.getElementById('name-label');
const editOrgNameBtn = document.getElementById('edit-org-name-btn');
const orgNameEditRow = document.getElementById('org-name-edit');
const orgNameInput = document.getElementById('org-name-input');
const orgNameSave = document.getElementById('org-name-save');
const orgNameCancel = document.getElementById('org-name-cancel');
const avatarImg = document.getElementById("avatar");
const avatarUploadBtn = document.getElementById("avatar-upload-btn");
const avatarFileInput = document.getElementById("avatar-file");
const railAvatarImg = document.getElementById('rail-avatar');

// Configure Google provider with domain hint for depauw.edu
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: 'depauw.edu', prompt: 'select_account' });


// Track intent and optional reason when the user chooses org login.
let orgLoginIntent = false;
let orgLoginReason = '';

const signInWithDePauwGoogle = async (e, options = { orgIntent: false, reason: '' }) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    orgLoginIntent = !!options.orgIntent;
    orgLoginReason = options.reason || '';
    try {
        const result = await signInWithPopup(auth, provider);

        // Enforce domain on the client for UX (rules still enforce server-side)
        const email = result.user?.email || "";
        if (!email.toLowerCase().endsWith("@depauw.edu")) {
            await signOut(auth);
            throw { code: 'auth/invalid-domain' };
        }

        // Read secure role from custom claims (set by Admin SDK), fallback to 'student'
        // Note: This does NOT grant roles; it only mirrors the server-assigned role for UI.
        const token = await result.user.getIdTokenResult(true);
        const secureRole = (token.claims && token.claims.role) ? String(token.claims.role) : 'student';

        // Only write the signed-in user's own document; never trust client-selected role
        const docRef = doc(db, "users", result.user.uid);
        await setDoc(docRef, {
            email: result.user.email,
            name: result.user.displayName,
            role: secureRole,
            createdAt: serverTimestamp()
        }, { merge: true });
        // If user intended organizer login but is not yet approved, create a role request
        if (orgLoginIntent && secureRole !== 'organizer') {
            try {
                const reqRef = doc(db, 'roleRequests', result.user.uid);
                const snap = await getDoc(reqRef);
                if (!snap.exists() || (snap.exists() && (snap.data().status || 'pending') !== 'pending')) {
                    await setDoc(reqRef, {
                        uid: result.user.uid,
                        email: result.user.email,
                        reason: orgLoginReason || 'Requested via organizer login',
                        createdAt: serverTimestamp(),
                        status: 'pending'
                    }, { merge: true });
                }
            } catch (reqErr) { /* silent */ }
            // Block organizer login until approved
            try { await signOut(auth); } catch {}
            UIErrorMessage.innerHTML = 'Organizer access pending approval. Please use Student Login or wait for admin approval.';
            UIErrorMessage.classList.add('visible');
            return;
        }
        // UI will update via onAuthStateChanged
    } catch (error) {
        const code = error?.code || 'auth/unknown';
        UIErrorMessage.innerHTML = formatErrorMessage(code);
        UIErrorMessage.classList.add("visible");
    }
};

if (studentLoginBtn) {
    studentLoginBtn.addEventListener('click', (e) => {
        signInWithDePauwGoogle(e, { orgIntent: false });
    });
}

if (orgLoginBtn) {
    orgLoginBtn.addEventListener('click', (e) => {
        // No prompt; request will be filed with a default reason if needed
        signInWithDePauwGoogle(e, { orgIntent: true });
    });
}

// Logout handler
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            // onAuthStateChanged will flip the UI back
        } catch (err) {
            UIErrorMessage.innerHTML = "Failed to log out. Please try again.";
            UIErrorMessage.classList.add("visible");
        }
    });
}

// Keep UI in sync with auth state
onAuthStateChanged(auth, async (user) => {
    if (user && user.email && user.email.toLowerCase().endsWith("@depauw.edu")) {
        if (userEmailText) userEmailText.textContent = user.email;
        if (userNameText) userNameText.textContent = user.displayName || "";
        // After login, go straight to map (profile stays hidden until opened)
        signUpFormView.style.display = "none";
        if (userProfileView) userProfileView.style.display = "none";
        UIErrorMessage.classList.remove("visible");
        // Toggle Request Organizer button depending on claim
        try {
            const token = await user.getIdTokenResult(true);
            const role = String(token.claims?.role || 'student');
            const isOrganizer = ['organizer','organization','org'].includes(role.toLowerCase());
            if (requestOrgBtn) requestOrgBtn.style.display = isOrganizer ? 'none' : 'inline-block';
            if (nameLabel) nameLabel.textContent = isOrganizer ? 'Organization Name' : 'Student Name';
            if (editOrgNameBtn) editOrgNameBtn.style.display = isOrganizer ? 'inline-block' : 'none';
            if (!isOrganizer && orgNameEditRow) orgNameEditRow.style.display = 'none';
        } catch {
            if (requestOrgBtn) requestOrgBtn.style.display = 'inline-block';
        }
    } else {
        if (userProfileView) userProfileView.style.display = "none";
        if (signUpFormView) signUpFormView.style.display = "block";
        if (userNameText) userNameText.textContent = "";
        if (userEmailText) userEmailText.textContent = "";
        if (avatarImg) avatarImg.removeAttribute("src");
        if (requestOrgBtn) requestOrgBtn.style.display = 'none';
        if (nameLabel) nameLabel.textContent = 'Student Name';
        if (editOrgNameBtn) editOrgNameBtn.style.display = 'none';
        if (orgNameEditRow) orgNameEditRow.style.display = 'none';
    }

    // Only attempt Firestore read when user is present
    if (user?.uid) {
        // Refresh token to get up-to-date claims after sign-in
        try {
            await user.getIdToken(true);
        } catch {}
        const docRef = doc(db, "users", user.uid);
        try {
            const docSnap = await getDoc(docRef);
            const data = docSnap.exists() ? docSnap.data() : null;
            if (data && userNameText) {
                userNameText.textContent = data.name || user.displayName || (user.email?.split('@')[0] || "");
            } else if (userNameText) {
                // Fallback if no doc or name field
                userNameText.textContent = user.displayName || (user.email?.split('@')[0] || "");
            }
            // Set avatar from Firestore photoURL or Auth provider photoURL as fallback
            const photoURL = data?.photoURL || user.photoURL || null;
            if (avatarImg && photoURL) { avatarImg.src = photoURL; }
            if (railAvatarImg) {
                if (photoURL) {
                    railAvatarImg.src = photoURL;
                    railAvatarImg.style.display = 'block';
                } else {
                    railAvatarImg.removeAttribute('src');
                    railAvatarImg.style.display = 'none';
                }
            }
            // no-op
        } catch (error) {
            // no-op
        }
    }
});

// Avatar upload handlers
if (avatarUploadBtn && avatarFileInput) {
    avatarUploadBtn.addEventListener('click', () => {
        avatarFileInput.click();
    });

    avatarFileInput.addEventListener('change', async () => {
        const file = avatarFileInput.files && avatarFileInput.files[0];
        if (!file) return;

        // Basic validation: type and size (<= 2MB)
        const isImage = file.type.startsWith('image/');
        const isSmall = file.size <= 2 * 1024 * 1024;
        if (!isImage || !isSmall) {
            UIErrorMessage.innerHTML = 'Please upload a PNG/JPG up to 2MB.';
            UIErrorMessage.classList.add('visible');
            avatarFileInput.value = '';
            return;
        }

        UIErrorMessage.classList.remove('visible');

        try {
            const user = auth.currentUser;
            if (!user) throw new Error('not-signed-in');

            // Path: profileImages/{uid}
            const path = `profileImages/${user.uid}`;
            const ref = storageRef(storage, path);

            // Upload file
            avatarUploadBtn.classList.add('loading');
            await uploadBytes(ref, file, { contentType: file.type });

            // Get download URL and save to user doc
            const url = await getDownloadURL(ref);
            if (avatarImg) avatarImg.src = url;
            if (railAvatarImg) { railAvatarImg.src = url; railAvatarImg.style.display = 'block'; }

            const docRef = doc(db, 'users', user.uid);
            await setDoc(docRef, { photoURL: url, updatedAt: serverTimestamp() }, { merge: true });
        } catch (error) {
            UIErrorMessage.innerHTML = 'Failed to upload image. Please try again.';
            UIErrorMessage.classList.add('visible');
        } finally {
            avatarUploadBtn.classList.remove('loading');
            avatarFileInput.value = '';
        }
    });
}

const formatErrorMessage = (errorCode) => {
    let message = "";
    if (
        errorCode === "auth/invalid-email" ||
        errorCode === "auth/missing-email"
    ) {
        message = "Please enter a valid email.";
    } else if (errorCode === "auth/operation-not-allowed") {
        message = "This sign-in method is disabled. Use Google login.";
    } else if (errorCode === "auth/popup-closed-by-user") {
        message = "Sign-in canceled. Please try again.";
    } else if (errorCode === "auth/cancelled-popup-request") {
        message = "Another sign-in is in progress.";
    } else if (errorCode === "auth/invalid-domain") {
        message = "Please use your DePauw (@depauw.edu) Google account.";
    }

    return message || "Sign in failed. Please try again.";
};

// Handle explicit in-profile "Request Organizer Access" button
if (requestOrgBtn) {
    requestOrgBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        // If already organizer, hide button
        try {
            const token = await user.getIdTokenResult(true);
            if (String(token.claims?.role || 'student') === 'organizer') {
                requestOrgBtn.style.display = 'none';
                return;
            }
        } catch {}
        try {
            const reqRef = doc(db, 'roleRequests', user.uid);
            await setDoc(reqRef, {
                uid: user.uid,
                email: user.email,
                reason: 'Requested via profile button',
                createdAt: serverTimestamp(),
                status: 'pending'
            }, { merge: true });
            UIErrorMessage.innerHTML = 'Request submitted. An admin will review your access.';
            UIErrorMessage.classList.add('visible');
        } catch (e) {
            UIErrorMessage.innerHTML = 'Could not submit request. Please try again later.';
            UIErrorMessage.classList.add('visible');
        }
    });
}

// Organizer can edit Organization Name via inline UI
function showOrgNameEdit() {
    if (!orgNameEditRow) return;
    const current = (userNameText?.textContent || '').trim();
    if (orgNameInput) orgNameInput.value = current;
    orgNameEditRow.style.display = 'flex';
    orgNameInput?.focus();
}
function hideOrgNameEdit() {
    if (orgNameEditRow) orgNameEditRow.style.display = 'none';
}
if (editOrgNameBtn) {
    editOrgNameBtn.addEventListener('click', async () => {
        const user = auth.currentUser; if (!user) return;
        try {
            const token = await user.getIdTokenResult(true);
            const isOrganizer = ['organizer','organization','org'].includes(String(token.claims?.role || 'student').toLowerCase());
            if (!isOrganizer) return;
        } catch {}
        showOrgNameEdit();
    });
}
if (orgNameCancel) {
    orgNameCancel.addEventListener('click', hideOrgNameEdit);
}
if (orgNameSave) {
    orgNameSave.addEventListener('click', async () => {
        const user = auth.currentUser; if (!user) return;
        const newName = (orgNameInput?.value || '').trim();
        if (!newName) { hideOrgNameEdit(); return; }
        try {
            await setDoc(doc(db, 'users', user.uid), { name: newName }, { merge: true });
            if (userNameText) userNameText.textContent = newName;
            hideOrgNameEdit();
        } catch (e) {
            UIErrorMessage.innerHTML = 'Failed to update name. Please try again.';
            UIErrorMessage.classList.add('visible');
        }
    });
}
