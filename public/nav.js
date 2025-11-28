// Basic navigation bindings (works on all pages)
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

function hrefFor(key){
  const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
  if (hosted) {
    return key === 'home' ? '/' : key === 'create' ? '/create-event' : key === 'drafts' ? '/drafts' : key === 'profile' ? '/#profile' : key === 'saved' ? '/#saved' : '/';
  } else {
    return key === 'home' ? 'index.html' : key === 'create' ? 'create-event.html' : key === 'drafts' ? 'drafts.html' : key === 'profile' ? 'index.html#profile' : key === 'saved' ? 'index.html#saved' : 'index.html';
  }
}

function bindNav(id, key){
  const el = document.getElementById(id);
  if (el && !el._bound) { el._bound = true; el.addEventListener('click', () => { window.location.href = hrefFor(key); }); }
}

bindNav('rail-home-btn', 'home');
bindNav('rail-saved-btn', 'saved');
bindNav('rail-create-btn', 'create');
bindNav('rail-drafts-btn', 'drafts');
bindNav('rail-profile-btn', 'profile');

// Arrange sidebar for DSG admin account: hide Saved, set order
try {
  const auth = getAuth();
  onAuthStateChanged(auth, (user) => {
    const isAdmin = String(user?.email || '').toLowerCase() === 'kureahoshi_2026@depauw.edu';
    const setOrder = (id, ord) => { const el = document.getElementById(id); if (el) { const row = el.closest('.nav-row') || el.parentElement; if (row?.style) row.style.order = String(ord); el.style.display = 'flex'; } };
    const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };

    if (isAdmin) {
      hide('rail-saved-btn');
      setOrder('rail-home-btn', 1);
      setOrder('rail-create-btn', 2);
      setOrder('rail-drafts-btn', 3);
      setOrder('rail-report-btn', 4);
      
      // Place Admin + Profile after the spacer (spacer has order:99 via CSS)
      setOrder('rail-admin-btn', 200);
      setOrder('rail-profile-btn', 201);
      return;
    }

    // Student (non-admin) sidebar: Home, Saved, Report, Notifications, Profile. Hide organizer/admin tools.
    const applyStudent = () => {
      setOrder('rail-home-btn', 1);
      setOrder('rail-saved-btn', 2);
      setOrder('rail-report-btn', 3);
      
      hide('rail-create-btn');
      hide('rail-drafts-btn');
      hide('rail-admin-btn');
      setOrder('rail-profile-btn', 201);
    };

    if (!user) { applyStudent(); return; }
    try {
      user.getIdTokenResult().then((tok) => {
        const role = String(tok?.claims?.role || 'student').toLowerCase();
        if (['organizer','organization','org'].includes(role)) {
          // Organizer (non-admin console): Home, Create, Drafts, Report, Notifications; Profile pinned at bottom.
          hide('rail-saved-btn');
          hide('rail-admin-btn');
          setOrder('rail-home-btn', 1);
          setOrder('rail-create-btn', 2);
          setOrder('rail-drafts-btn', 3);
          setOrder('rail-report-btn', 4);
          
          setOrder('rail-profile-btn', 201);
        } else {
          applyStudent();
        }
      }).catch(()=>{ applyStudent(); });
    } catch { applyStudent(); }
  });
} catch {}
