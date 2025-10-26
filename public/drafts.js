import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, addDoc, setDoc, doc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

const guard = document.getElementById('drafts-guard');
const errorEl = document.getElementById('drafts-error');
const emptyEl = document.getElementById('drafts-empty');
const listEl = document.getElementById('drafts-list');
const countDrafts = document.getElementById('count-drafts');
const countPublished = document.getElementById('count-published');
const countPast = document.getElementById('count-past');
const tabPublished = document.getElementById('tab-published');
const tabDrafts = document.getElementById('tab-drafts');
const tabPast = document.getElementById('tab-past');
// Left-rail buttons on this page
const railHomeBtn = document.getElementById('rail-home-btn');
const railCreateBtn = document.getElementById('rail-create-btn');
const railProfileBtn = document.getElementById('rail-profile-btn');
const railDraftsBtn = document.getElementById('rail-drafts-btn');

function show(el, yes) { if (!el) return; el.style.display = yes ? 'block' : 'none'; }
function clearList() { if (listEl) listEl.innerHTML = ''; }

function timeAgo(ts){
  try{
    const t = (typeof ts?.toMillis === 'function') ? new Date(ts.toMillis()) : new Date(ts);
    const diff = Math.floor((Date.now() - t.getTime())/1000);
    if (diff < 60) return 'a few seconds';
    if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)} h ago`;
    return t.toLocaleDateString();
  }catch{ return ''; }
}

let currentView = 'drafts';
let eventsUpcoming = [];
let eventsPast = [];

function renderHeader(){
  if (!listEl) return;
  const hdr = document.createElement('div'); hdr.className='draft-row header';
  if (currentView === 'drafts') {
    hdr.innerHTML = '<div>Event</div><div>Last updated</div><div></div>';
  } else {
    hdr.classList.add('four-cols');
    hdr.innerHTML = '<div>Event</div><div>Date</div><div>Time</div><div></div>';
  }
  listEl.appendChild(hdr);
}

function renderDraftRow(d) {
  const row = document.createElement('div');
  row.className = 'draft-row item';

  const colPost = document.createElement('div');
  const title = document.createElement('div'); title.className = 'draft-title'; title.textContent = d.title?.trim() || 'untitled';
  colPost.appendChild(title);

  const colUpdated = document.createElement('div'); colUpdated.textContent = timeAgo(d.updatedAt || d.createdAt);

  const colActions = document.createElement('div'); colActions.className = 'draft-actions';
  const editBtn = document.createElement('a'); editBtn.className = 'ui button tiny btn-edit'; editBtn.textContent = 'Edit';
  const isHosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
  editBtn.href = (isHosted ? `/create-event?draft=${encodeURIComponent(d.__id)}` : `create-event.html?draft=${encodeURIComponent(d.__id)}`);
  const publishBtn = document.createElement('button'); publishBtn.className = 'ui button tiny btn-publish'; publishBtn.textContent = 'Publish';
  publishBtn.addEventListener('click', async () => {
    try {
      publishBtn.classList.add('loading');
      const events = collection(db, 'events');
      const payload = { ...d }; delete payload.__id; payload.status='published'; payload.published=true; payload.updatedAt=serverTimestamp();
      await addDoc(events, payload);
      await deleteDoc(doc(db, 'eventDrafts', d.__id));
      row.remove();
    } catch { if (errorEl) { errorEl.textContent='Failed to publish draft.'; show(errorEl, true);} } finally { publishBtn.classList.remove('loading'); }
  });
  colActions.appendChild(editBtn); colActions.appendChild(publishBtn);

  row.appendChild(colPost);
  row.appendChild(colUpdated);
  row.appendChild(colActions);
  return row;
}

let allDrafts = [];
async function loadDraftsFor(uid) {
  try {
    show(errorEl, false);
    const qref = query(collection(db, 'eventDrafts'), where('organizerUid', '==', uid));
    const snap = await getDocs(qref);
    const drafts = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
    allDrafts = drafts;
    if (countDrafts) countDrafts.textContent = String(drafts.length);
    // View rendering handled by setView
  } catch (e) {
    if (errorEl) { errorEl.textContent = 'Failed to load drafts.'; show(errorEl, true); }
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
    window.location.href = hosted ? '/' : 'index.html';
    return;
  }
  try {
    const token = await user.getIdTokenResult(true);
    const role = String(token.claims?.role || 'student').toLowerCase();
    const isOrganizer = ['organizer','organization','org'].includes(role);
    if (!isOrganizer) { show(guard, true); return; }
    await Promise.all([loadDraftsFor(user.uid), loadEventsFor(user.uid)]);
    setView('drafts');
  } catch (e) {
    show(guard, true);
  }
});

// Local navigation handlers for the left rail on the Drafts page
try {
  if (railHomeBtn && !railHomeBtn._bound) { railHomeBtn._bound = true; railHomeBtn.addEventListener('click', () => { const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname); window.location.href = hosted ? '/' : 'index.html'; }); }
  if (railCreateBtn && !railCreateBtn._bound) { railCreateBtn._bound = true; railCreateBtn.addEventListener('click', () => { const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname); window.location.href = hosted ? '/create-event' : 'create-event.html'; }); }
  if (railProfileBtn && !railProfileBtn._bound) { railProfileBtn._bound = true; railProfileBtn.addEventListener('click', () => { const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname); window.location.href = hosted ? '/#profile' : 'index.html#profile'; }); }
  if (railDraftsBtn && !railDraftsBtn._bound) { railDraftsBtn._bound = true; railDraftsBtn.addEventListener('click', () => { /* already here */ }); }
} catch {}

// Toolbar removed; no search filter

function toMs(value){
  try {
    if (!value) return NaN;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    const d = new Date(value); return d.getTime();
  } catch { return NaN; }
}

async function loadEventsFor(uid){
  try{
    const eventsCol = collection(db, 'events');
    const snap = await getDocs(query(eventsCol, where('organizerUid','==', uid)));
    const now = Date.now();
    const events = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
    // Count all events created by this organizer (regardless of a published flag)
    const publishedAll = events;
    eventsPast = [];
    eventsUpcoming = [];
    publishedAll.forEach(e => {
      const endMs = toMs(e.endTime);
      const startMs = toMs(e.startTime);
      const cmp = !isNaN(endMs) ? endMs : startMs;
      if (!isNaN(cmp) && cmp >= now) eventsUpcoming.push(e); else eventsPast.push(e);
    });
    if (countPublished) countPublished.textContent = String(eventsUpcoming.length);
    if (countPast) countPast.textContent = String(eventsPast.length);
  }catch(e){ /* ignore */ }
}

function renderEventRow(e){
  const row = document.createElement('div'); row.className = 'draft-row item four-cols';
  const colTitle = document.createElement('div');
  const t = document.createElement('div'); t.className='draft-title'; t.textContent = (e.title || 'untitled').toString();
  const sub = document.createElement('div'); sub.className='draft-sub'; sub.textContent = '';
  colTitle.appendChild(t); colTitle.appendChild(sub);

  const start = e.startTime ? new Date(e.startTime) : null;
  const end = e.endTime ? new Date(e.endTime) : null;
  const dOpts = { month:'short', day:'numeric' };
  const tOpts = { hour:'numeric', minute:'2-digit' };

  const colDate = document.createElement('div');
  colDate.textContent = start ? start.toLocaleDateString(undefined, dOpts) : '';

  const colTime = document.createElement('div');
  colTime.textContent = start ? `${start.toLocaleTimeString(undefined, tOpts)}${end?` – ${end.toLocaleTimeString(undefined,tOpts)}`:''}` : '';

  const colAct = document.createElement('div'); colAct.className='draft-actions';
  const isHosted = /(\.web\.app|\.firebaseapp\.com)$/.test(location.hostname);
  const openBtn = document.createElement('a'); openBtn.className='ui button tiny'; openBtn.textContent='Open'; openBtn.href = (isHosted ? '/' : 'index.html');
  const editBtn = document.createElement('a'); editBtn.className='ui button tiny btn-edit'; editBtn.textContent='Edit';
  editBtn.href = (isHosted ? `/create-event?event=${encodeURIComponent(e.__id)}` : `create-event.html?event=${encodeURIComponent(e.__id)}`);
  colAct.appendChild(editBtn);
  colAct.appendChild(openBtn);

  row.appendChild(colTitle);
  row.appendChild(colDate);
  row.appendChild(colTime);
  row.appendChild(colAct);
  return row;
}

function setView(view){
  currentView = view;
  if (tabPublished) tabPublished.classList.toggle('active', view==='upcoming');
  if (tabDrafts) tabDrafts.classList.toggle('active', view==='drafts');
  if (tabPast) tabPast.classList.toggle('active', view==='past');
  clearList(); renderHeader();
  if (view === 'drafts') {
    if (!allDrafts.length) { show(emptyEl, false); return; }
    show(emptyEl, false);
    allDrafts
      .slice()
      .sort((a,b)=> (b.updatedAt?.toMillis?.()||0) - (a.updatedAt?.toMillis?.()||0))
      .forEach(d=> listEl.appendChild(renderDraftRow(d)));
  } else if (view === 'upcoming') {
    if (!eventsUpcoming.length) { show(emptyEl, false); return; }
    show(emptyEl, false);
    eventsUpcoming
      .slice()
      .sort((a,b)=> String(a.startTime||'').localeCompare(String(b.startTime||'')))
      .forEach(e => listEl.appendChild(renderEventRow(e)));
  } else if (view === 'past') {
    if (!eventsPast.length) { show(emptyEl, false); return; }
    show(emptyEl, false);
    eventsPast
      .slice()
      .sort((a,b)=> String(b.endTime||b.startTime||'').localeCompare(String(a.endTime||a.startTime||'')))
      .forEach(e => listEl.appendChild(renderEventRow(e)));
  }
}

// Bind tab clicks
if (tabPublished && !tabPublished._bound) { tabPublished._bound = true; tabPublished.addEventListener('click', (e)=>{ e.preventDefault(); setView('upcoming'); }); }
if (tabDrafts && !tabDrafts._bound) { tabDrafts._bound = true; tabDrafts.addEventListener('click', (e)=>{ e.preventDefault(); setView('drafts'); }); }
if (tabPast && !tabPast._bound) { tabPast._bound = true; tabPast.addEventListener('click', (e)=>{ e.preventDefault(); setView('past'); }); }
