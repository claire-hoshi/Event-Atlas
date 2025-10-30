import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";
import { getFirestore, collection, getDocs, query, orderBy, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();
const functionsRef = getFunctions(undefined, 'us-central1');

function fmtWhen(start, end){
  try { const s=new Date(start), e=new Date(end||start); return `${s.toLocaleString()}${e>s?` – ${e.toLocaleTimeString()}`:''}`; } catch { return ''; }
}

async function loadReports(){
  const wrap = document.getElementById('reports-list'); if (!wrap) return;
  wrap.textContent = 'Loading…';
  try {
    const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt','desc'), limit(100)));
    if (snap.empty) { wrap.textContent = 'No reports.'; return; }
    wrap.innerHTML = '';
    snap.docs.forEach(d => {
      const r = d.data();
      const card = document.createElement('div'); card.className='event-card';
      const body = document.createElement('div'); body.className='event-card-body';
      const t = document.createElement('div'); t.className='event-card-title'; t.textContent = `[${r.type}] ${r.eventTitle || r.eventId}`;
      const m = document.createElement('div'); m.className='event-card-meta'; m.textContent = `${r.reason || ''} • reporter: ${r.reporterEmail || r.reporterUid || ''}`;
      const p = document.createElement('div'); p.style.whiteSpace='pre-wrap'; p.style.marginTop='6px'; p.textContent = r.details || '';
      body.appendChild(t); body.appendChild(m); body.appendChild(p); card.appendChild(body);
      const actions = document.createElement('div'); actions.style.marginLeft='auto'; actions.style.display='flex'; actions.style.gap='8px';
      if (r.type === 'event' && r.eventId) {
        const unpub = document.createElement('button'); unpub.className='ui button tiny'; unpub.textContent='Unpublish Event';
        unpub.addEventListener('click', async () => { try { await httpsCallable(functionsRef, 'adminUnpublishEvent')({ eventId: String(r.eventId) }); unpub.disabled = true; unpub.textContent='Unpublished'; } catch (e) { alert('Failed: '+(e?.message||e?.code||'error')); } });
        actions.appendChild(unpub);
      }
      card.appendChild(actions);
      wrap.appendChild(card);
    });
  } catch (e) { wrap.textContent = 'Failed to load reports'; }
}

async function loadEvents(){
  const wrap = document.getElementById('events-list'); if (!wrap) return;
  wrap.textContent = 'Loading…';
  try {
    const snap = await getDocs(query(collection(db, 'events'), orderBy('startTime','desc'), limit(50)));
    wrap.innerHTML='';
    snap.docs.forEach(d => {
      const e = { __id: d.id, ...d.data() };
      const card = document.createElement('div'); card.className='event-card';
      const body = document.createElement('div'); body.className='event-card-body';
      const t = document.createElement('div'); t.className='event-card-title'; t.textContent = e.title || 'Untitled';
      const m = document.createElement('div'); m.className='event-card-meta'; m.textContent = `${fmtWhen(e.startTime, e.endTime)} • ${e.locationName || ''}`;
      const tag = document.createElement('div'); tag.textContent = (e.published === false || e.unpublishedAt) ? 'Unpublished' : 'Published'; tag.style.marginTop='4px'; tag.style.color = (e.published===false||e.unpublishedAt)?'#b91c1c':'#065f46';
      body.appendChild(t); body.appendChild(m); body.appendChild(tag); card.appendChild(body);
      const actions = document.createElement('div'); actions.style.marginLeft='auto';
      const unpub = document.createElement('button'); unpub.className='ui button tiny'; unpub.textContent='Unpublish';
      unpub.addEventListener('click', async ()=>{ try { await httpsCallable(functionsRef, 'adminUnpublishEvent')({ eventId: e.__id }); unpub.disabled=true; unpub.textContent='Unpublished'; } catch (er){ alert('Failed: '+(er?.message||er?.code||'error')); } });
      actions.appendChild(unpub); card.appendChild(actions);
      wrap.appendChild(card);
    });
  } catch (e) { wrap.textContent='Failed to load events'; }
}

function bindTabs(){
  const tabs = document.querySelectorAll('[data-tab]');
  tabs.forEach(el => {
    el.addEventListener('click', () => {
      const key = el.getAttribute('data-tab');
      document.querySelectorAll('.menu .item').forEach(i => i.classList.toggle('active', i===el));
      document.querySelectorAll('.segment').forEach(seg => seg.classList.toggle('active', seg.getAttribute('data-tab') === key));
    });
  });
}

onAuthStateChanged(auth, async (user) => {
  const ok = !!user && String(user.email || '').toLowerCase() === 'kureahoshi_2026@depauw.edu';
  document.getElementById('admin-warning').style.display = ok ? 'none' : '';
  document.getElementById('admin-app').style.display = ok ? '' : 'none';
  if (!ok) return;
  try {
    const homeBtn = document.getElementById('admin-rail-home-btn');
    if (homeBtn && !homeBtn._bound) {
      homeBtn._bound = true;
      homeBtn.addEventListener('click', () => {
        const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
        window.location.href = hosted ? '/' : 'index.html';
      });
    }
  } catch {}
  bindTabs();
  await loadReports();
  await loadEvents();
});
