import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";
import { getFirestore, collection, getDocs, addDoc, query, orderBy, limit, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();
const functionsRef = getFunctions(undefined, 'us-central1');

function toMs(v){ try{ if(!v) return NaN; if(typeof v?.toMillis==='function') return v.toMillis(); if(typeof v==='number') return v<1e12?v*1000:v; return new Date(v).getTime(); }catch{return NaN;} }
function fmtDate(start){ try{ const s=new Date(toMs(start)); return s.toLocaleDateString(undefined,{month:'short', day:'numeric', year:'numeric'});}catch{return'';} }
function fmtTime(start,end){ try{ const s=new Date(toMs(start)), e=new Date(toMs(end||start)); const t=(d)=>d.toLocaleTimeString(undefined,{hour:'numeric', minute:'2-digit'}); return `${t(s)} – ${t(e)}`;}catch{return'';} }

async function loadReports(){
  const wrap = document.getElementById('admin-report-list') || document.getElementById('reports-list');
  if (!wrap) return;
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
  const listEl = document.getElementById('admin-events-list'); if (!listEl) return;
  const upCount = document.getElementById('admin-count-up');
  const repCount = document.getElementById('admin-count-report');
  listEl.textContent = 'Loading…';
  try {
    const snap = await getDocs(query(collection(db, 'events'), orderBy('startTime','desc'), limit(200)));
    const events = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
    const now = Date.now();
    const isUpcoming = (e) => {
      const endMs = toMs(e.endTime); const startMs = toMs(e.startTime);
      const cmp = !isNaN(endMs) ? endMs : startMs; return !isNaN(cmp) && cmp >= now;
    };
    const upcoming = events.filter(isUpcoming);
    if (upCount) upCount.textContent = String(upcoming.length);
    // Preload current report count for badge
    try {
      const rs = await getDocs(query(collection(db, 'reports'), orderBy('createdAt','desc'), limit(100)));
      if (repCount) repCount.textContent = String(rs.size);
    } catch { if (repCount) repCount.textContent = '0'; }

    const renderRows = (rows) => {
      listEl.innerHTML = '';
      const header = document.createElement('div'); header.className='draft-row header five-cols';
      header.innerHTML = `<div>Event</div><div>Date</div><div>Time</div><div>Organizer</div><div></div>`;
      listEl.appendChild(header);
      rows.forEach(e => {
        const row = document.createElement('div'); row.className='draft-row item five-cols';
        const colEvent = document.createElement('div'); colEvent.className='draft-title'; colEvent.textContent = e.title || 'Untitled';
        const colDate = document.createElement('div'); colDate.textContent = fmtDate(e.startTime);
        const colTime = document.createElement('div'); colTime.textContent = fmtTime(e.startTime, e.endTime);
        const colOrg = document.createElement('div'); colOrg.textContent = e.organization || '';
        const actions = document.createElement('div'); actions.className='draft-actions';
        const unpub = document.createElement('button'); unpub.className='ui button tiny'; unpub.textContent='Unpublish';
        unpub.addEventListener('click', async ()=>{ try { await httpsCallable(functionsRef, 'adminUnpublishEvent')({ eventId: e.__id }); unpub.disabled=true; unpub.textContent='Unpublished'; } catch (er){ alert('Failed: '+(er?.message||er?.code||'error')); } });
        actions.appendChild(unpub);
        row.appendChild(colEvent); row.appendChild(colDate); row.appendChild(colTime); row.appendChild(colOrg); row.appendChild(actions);
        listEl.appendChild(row);
      });
    };

    // Default view: upcoming
    renderRows(upcoming);
    const tabUp = document.getElementById('admin-tab-upcoming');
    const tabReport = document.getElementById('admin-tab-report');
    const reportList = document.getElementById('admin-report-list');
    const setActive = (key) => {
      tabUp?.classList.toggle('active', key==='up');
      tabReport?.classList.toggle('active', key==='report');
      if (reportList) reportList.style.display = (key==='report') ? '' : 'none';
      listEl.style.display = (key==='report') ? 'none' : '';
    };
    tabUp?.addEventListener('click', (e)=>{ e.preventDefault(); setActive('up'); renderRows(upcoming); });
    tabReport?.addEventListener('click', async (e)=>{ e.preventDefault(); setActive('report'); await loadReports(); });
  } catch (e) { listEl.textContent='Failed to load events'; }
}

// Removed unused legacy tab binder

onAuthStateChanged(auth, async (user) => {
  const ok = !!user && String(user.email || '').toLowerCase() === 'kureahoshi_2026@depauw.edu';
  document.getElementById('admin-warning').style.display = ok ? 'none' : '';
  document.getElementById('admin-app').style.display = ok ? '' : 'none';
  if (!ok) return;
  await loadEvents();
});
