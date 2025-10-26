import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";
import { messagingSupported, subscribeToEvent, unsubscribeFromEvent } from './messaging.js';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  documentId
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

// DOM references
const attendeeView = document.getElementById("attendee-view");
const eventListEl = document.getElementById("event-list");
const searchInput = document.getElementById("event-search");
const locationInput = document.getElementById('location-input');
const clearLocationBtn = document.getElementById('clear-location');
const timeFilterBtn = document.getElementById('time-filter-btn');
const timeRangeInput = document.getElementById('time-range');
const inlineCalendar = document.getElementById('inline-calendar');
const clearDatesBtn = document.getElementById('clear-dates-btn');
const categoryChipsEl = document.getElementById("category-chips");
// Filter modal controls
const openFilterBtn = document.getElementById('open-filter-btn');
const filterModal = document.getElementById('filter-modal');
const filterBackdrop = document.getElementById('filter-backdrop');
const closeFilterBtn = document.getElementById('close-filter-btn');
const cancelFilterBtn = document.getElementById('cancel-filter-btn');
const applyFilterBtn = document.getElementById('apply-filter-btn');
const sortSelect = document.getElementById('sort-select');
const filterCalendarHost = document.getElementById('filter-calendar');
const exploreView = document.getElementById("explore-view");
const profileView = document.getElementById("profile-view");
const savedView = document.getElementById('saved-view');
const savedList = document.getElementById('saved-list');
const notificationsView = document.getElementById('notifications-view');
const subscribedList = document.getElementById('subscribed-list');
const notifEnableBtn = document.getElementById('notif-enable-btn');
const notifPermStatus = document.getElementById('notif-perm-status');
const openProfileBtn = document.getElementById("open-profile-btn");
const closeProfileBtn = document.getElementById("close-profile-btn");
const leftRail = document.getElementById('left-rail');
const railProfileBtn = document.getElementById('rail-profile-btn');
const railHomeBtn = document.getElementById('rail-home-btn');
const orgTabs = document.getElementById('org-tabs');
const tabMy = document.getElementById('tab-my');
const tabOthers = document.getElementById('tab-others');
const sectionTitle = document.getElementById('section-title');

// Leaflet map state
let map;
let markersLayer;
const campusCenter = [39.6404, -86.8611]; // Approx DePauw

// Event cache
let allEvents = [];
let isOrganizer = false;
let myOrgName = '';
let currentScope = 'all'; // 'all' for students, 'my' or 'others' for organizers
let currentUid = null;
let currentCategory = 'all';
let currentQuery = '';
let currentLocation = '';
let timeStartMs = NaN, timeEndMs = NaN;
let fpRange = null;
let fpPanel = null;
let currentSort = 'date';
let calendarMode = 'all'; // 'day' | 'week' | 'month' | 'all'
let calendarAnchor = null; // Date used for prev/next navigation

// Temp state for panel (applied only when pressing Apply)
let tempStartMs = NaN, tempEndMs = NaN, tempSort = 'date';

// Category colors for markers and list dots
const CATEGORY_COLORS = {
  Academic: '#f59e0b', // amber
  Arts: '#8b5cf6', // violet
  Athletics: '#10b981', // emerald
  Community: '#ef4444', // red
  Social: '#3b82f6', // blue
  default: '#6b7280' // gray
};

function toMs(value) {
  try {
    if (!value) return NaN;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    const d = new Date(value); return d.getTime();
  } catch { return NaN; }
}

function isUpcoming(evt) {
  const now = Date.now();
  const endMs = toMs(evt.endTime);
  const startMs = toMs(evt.startTime);
  const cmp = !isNaN(endMs) ? endMs : startMs;
  return !isNaN(cmp) && cmp >= now;
}


function initMap() {
  if (map) return map;
  map = L.map("map", { zoomControl: true }).setView(campusCenter, 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  return map;
}

function formatWhen(startISO, endISO) {
  try {
    const start = new Date(startISO);
    const end = new Date(endISO || startISO);
    const opts = { month: "short", day: "numeric" };
    const tOpts = { hour: "numeric", minute: "2-digit" };
    return `${start.toLocaleDateString(undefined, opts)}, ${start.toLocaleTimeString(undefined, tOpts)}${end > start ? ` – ${end.toLocaleTimeString(undefined, tOpts)}` : ""}`;
  } catch {
    return "";
  }
}

function passesTimeFilter(evt) {
  // No time range selected
  if (isNaN(timeStartMs) || isNaN(timeEndMs)) return true;
  const startMs = toMs(evt.startTime);
  const endMs = toMs(evt.endTime);
  const a = isNaN(startMs) ? endMs : startMs;
  const b = isNaN(endMs) ? startMs : endMs;
  if (isNaN(a) && isNaN(b)) return false;
  const evtStart = Math.min(a || b, b || a);
  const evtEnd = Math.max(a || b, b || a);
  // Overlap check
  return evtStart <= timeEndMs && evtEnd >= timeStartMs;
}

function passesCategoryFilter(evt) {
  if (!currentCategory || currentCategory === 'all') return true;
  const c = String(evt.category || '').trim();
  return c === currentCategory;
}

function passesLocationFilter(evt) {
  const q = (currentLocation || '').trim().toLowerCase();
  if (!q) return true;
  const loc = String(evt.locationName || '').toLowerCase();
  return !!loc && loc.includes(q);
}

function passesSearch(evt) {
  const q = currentQuery.trim().toLowerCase();
  if (!q) return true;
  const hay = [evt.title, evt.organization, evt.description, evt.locationName]
    .map(v => String(v || '').toLowerCase());
  return hay.some(t => t.includes(q));
}

function clearList() {
  if (eventListEl) eventListEl.innerHTML = "";
}

function createColoredIcon(color) {
  // simple colored circle marker resembling screenshot
  return L.divIcon({
    className: 'custom-marker',
    html: `<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.2);"></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function createPinIcon(color) {
  const fill = color || CATEGORY_COLORS.default;
  // Material-like pin: rounded head, pointed tip, inner white hole
  const svg = `
    <svg width="44" height="62" viewBox="0 0 44 62" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 2C13.163 2 6 9.163 6 18c0 11.5 16 26 16 26s16-14.5 16-26C38 9.163 30.837 2 22 2z" fill="${fill}"/>
      <circle cx="22" cy="18" r="7" fill="#fff"/>
    </svg>`;
  // popupAnchor y (negative) controls vertical overlap with the pin.
  // Less negative brings the popup closer to the pin to visually overlap it.
  return L.divIcon({ className: 'pin-marker', html: svg, iconSize: [44,62], iconAnchor: [22,62], popupAnchor: [0, -50] });
}

function updateCount(n) {
  const el = document.getElementById('event-count');
  if (!el) return;
  el.textContent = `${n} ${n === 1 ? 'event' : 'events'} found`;
}

async function renderListAndMarkers() {
  if (!map) initMap();
  clearList();
  markersLayer.clearLayers();

  const filtered = allEvents.filter((e) => passesTimeFilter(e) && passesCategoryFilter(e) && passesLocationFilter(e) && passesSearch(e));
  // Optional sort
  if (currentSort === 'title') {
    filtered.sort((a,b) => String(a.title||'').localeCompare(String(b.title||'')));
  } else {
    // Default: by start time asc
    filtered.sort((a,b) => (toMs(a.startTime)||0) - (toMs(b.startTime)||0));
  }
  // Students: count only upcoming; Organizers: count all
  const countVisible = isOrganizer ? filtered.length : filtered.filter(isUpcoming).length;
  updateCount(countVisible);

  const byIdMarker = new Map();
  const bounds = [];

  // Grouping
  const up = filtered.filter(isUpcoming);
  const past = filtered.filter(e => !isUpcoming(e));
  const groups = isOrganizer
    ? [ { title: 'Upcoming events', items: up }, { title: 'Past events', items: past } ]
    : [ { title: '', items: up } ];

  const renderOne = (evt) => {
    // List item
    const card = document.createElement("div");
    card.className = "event-card";
    card.dataset.id = evt.__id || "";

    const color = CATEGORY_COLORS[evt.category] || CATEGORY_COLORS.default;

    const body = document.createElement("div");
    body.className = "event-card-body";
    const title = document.createElement("div");
    title.className = "event-card-title";
    title.textContent = evt.title || "Untitled";
    const meta = document.createElement("div");
    meta.className = "event-card-meta";
    const where = evt.locationName || (evt.lat && evt.lng ? "On campus" : "Location TBD");
    meta.textContent = `${formatWhen(evt.startTime, evt.endTime)}  •  ${where}`;
    body.appendChild(title);
    body.appendChild(meta);
    card.appendChild(body);

    if (eventListEl) eventListEl.appendChild(card);

    // Marker (teardrop pin with category color and white inner hole)
    if (typeof evt.lat === "number" && typeof evt.lng === "number") {
      const color = CATEGORY_COLORS[evt.category] || CATEGORY_COLORS.default;
      const mk = L.marker([evt.lat, evt.lng], { icon: createPinIcon(color) });
      const max = evt.maxAttendees ? `Max ${evt.maxAttendees} attendees` : '';
      const desc = (evt.description || '').toString().trim();
      const short = desc.length > 160 ? desc.slice(0, 157) + '…' : desc;
      const canEdit = isOrganizer && currentScope === 'my' && String(evt.organizerUid||'') === String(currentUid||'');
      const popup = `
        <div style="min-width:260px">
          <div style="font-weight:700;font-size:16px;margin-bottom:4px;">${(evt.title || 'Untitled').replace(/`/g,'')}</div>
          <div style="color:#6b7280;margin-bottom:6px;">${evt.organization || ''}</div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;color:#374151;">
            <div><i class="calendar outline icon" style="margin-right:6px;color:#6b7280;"></i>${formatWhen(evt.startTime, evt.endTime)}</div>
            ${where ? `<div><i class="map marker alternate icon" style="margin-right:6px;color:#6b7280;"></i>${where}</div>` : ''}
            ${max ? `<div><i class="users icon" style="margin-right:6px;color:#6b7280;"></i>${max}</div>` : ''}
          </div>
          ${short ? `<div style="color:#374151;margin-bottom:8px;line-height:1.35;">${short.replace(/</g,'&lt;')}</div>` : ''}
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
            ${canEdit ? `<button class=\"ui button tiny\" data-edit-id=\"${evt.__id}\">Edit</button>` : ''}
            <button class="ui button tiny" data-view-id="${evt.__id}">View details</button>
          </div>
        </div>`;
      mk.bindPopup(popup);
      mk.addTo(markersLayer);
      byIdMarker.set(evt.__id, mk);
      bounds.push([evt.lat, evt.lng]);
    }
  };

  groups.forEach(group => {
    if (group.title && eventListEl) {
      const h = document.createElement('div');
      h.textContent = group.title;
      h.style.fontWeight = '500';
      h.style.margin = '8px 0 6px';
      eventListEl.appendChild(h);
    }
    group.items.forEach(renderOne);
  });

  // List click => focus marker
  if (eventListEl) {
    eventListEl.onclick = (e) => {
      const el = e.target.closest(".event-card");
      if (!el) return;
      const id = el.dataset.id;
      const mk = byIdMarker.get(id);
      if (mk) {
        const ll = mk.getLatLng();
        map.setView(ll, Math.max(map.getZoom(), 16));
        mk.openPopup();
      }
    };
  }

  // Fit bounds to markers when multiple are visible
  if (bounds.length > 1) {
    const b = L.latLngBounds(bounds);
    map.fitBounds(b.pad(0.15));
  } else if (bounds.length === 1) {
    map.setView(bounds[0], Math.max(map.getZoom(), 16));
  }
  try { map.off('popupopen', onPopupOpen); } catch {}
  map.on('popupopen', onPopupOpen);
}

// Wire up popup to open full-screen details
function onPopupOpen(e){
  try {
    const node = e?.popup?._contentNode; if (!node) return;
    const btn = node.querySelector('button[data-view-id]');
    if (btn && !btn._bound) { btn._bound = true; btn.addEventListener('click', () => { const id = btn.getAttribute('data-view-id'); openEventDetailById(id); }); }
    const editBtn = node.querySelector('button[data-edit-id]');
    if (editBtn && !editBtn._bound) {
      editBtn._bound = true;
      editBtn.addEventListener('click', () => {
        const id = editBtn.getAttribute('data-edit-id');
        const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
        const href = hosted ? `/create-event?event=${encodeURIComponent(id)}` : `create-event.html?event=${encodeURIComponent(id)}`;
        window.location.href = href;
      });
    }
  } catch {}
}

function openEventDetailById(id){
  const evt = allEvents.find(ev => String(ev.__id) === String(id));
  if (!evt) return;
  openEventDetail(evt);
}

async function openEventDetail(evt){
  const modal = document.getElementById('event-modal');
  const backdrop = document.getElementById('event-modal-backdrop');
  const closeBtn = document.getElementById('event-modal-close');
  const hero = document.getElementById('event-hero');
  const heroImg = document.getElementById('event-hero-img');
  const titleEl = document.getElementById('event-detail-title');
  const metaEl = document.getElementById('event-detail-meta');
  const descEl = document.getElementById('event-detail-desc');
  const aboutLoc = document.getElementById('event-about-location');
  const aboutOrg = document.getElementById('event-about-org');
  const aboutContact = document.getElementById('event-about-contact');
  const aboutLink = document.getElementById('event-about-link');
  const detailsCategory = document.getElementById('event-details-category');
  const detailsMax = document.getElementById('event-details-max');
  const addCalBtn = document.getElementById('event-addcal-btn');
  const interested = document.getElementById('event-interest-btn');
  const interested2 = document.getElementById('event-interest-btn-2');
  const interestCount = document.getElementById('event-interest-count');
  const viewMapBtn = document.getElementById('event-view-map-btn');
  const ownerSubs = document.getElementById('owner-subscribers');
  const subsList = document.getElementById('subscriber-list');
  if (!modal) return;
  titleEl.textContent = evt.title || 'Untitled';
  const parts = [];
  parts.push(`<div><i class=\"calendar outline icon\" style=\"margin-right:6px;\"></i>${formatWhen(evt.startTime, evt.endTime)}</div>`);
  if (evt.locationName) parts.push(`<div><i class=\"map marker alternate icon\" style=\"margin-right:6px;\"></i>${evt.locationName}</div>`);
  if (evt.organization) parts.push(`<div><i class=\"building outline icon\" style=\"margin-right:6px;\"></i>${evt.organization}</div>`);
  metaEl.innerHTML = parts.join('');
  const desc = (evt.description || '').toString().trim();
  descEl.textContent = desc || '';
  if (evt.imageURL) { hero.style.display='block'; heroImg.src = evt.imageURL; }
  else { hero.style.display='none'; try { heroImg.removeAttribute('src'); } catch {} }
  // Adjust actions for organizer-owner vs student
  try {
    const owner = isOrganizer && String(evt.organizerUid||'') === String(currentUid||'');
    const actions = document.querySelector('.event-actions');
    const interestedBtn = document.getElementById('event-interest-btn');
    const interestedBtn2 = document.getElementById('event-interest-btn-2');
    const addCalBtn = document.getElementById('event-addcal-btn');
    if (owner) {
      if (interestedBtn) interestedBtn.style.display='none';
      if (interestedBtn2) interestedBtn2.style.display='none';
      if (addCalBtn) addCalBtn.style.display='none';
      if (actions && !actions.querySelector('[data-edit-event]')) {
        const editA = document.createElement('a');
        editA.setAttribute('data-edit-event','1');
        editA.className = 'ui button';
        editA.textContent = 'Edit Event';
        const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
        editA.href = hosted ? `/create-event?event=${encodeURIComponent(evt.__id)}` : `create-event.html?event=${encodeURIComponent(evt.__id)}`;
        actions.appendChild(editA);
      }
    } else {
      if (interestedBtn) interestedBtn.style.display='';
      if (interestedBtn2) interestedBtn2.style.display='';
      if (addCalBtn) addCalBtn.style.display='';
      const extra = actions && actions.querySelector('[data-edit-event]'); if (extra) extra.remove();
    }
  } catch {}

  // About section
  aboutLoc.textContent = evt.locationName || 'On campus';
  aboutOrg.textContent = evt.organization || '';
  if (evt.contactEmail) { aboutContact.innerHTML = `<a href=\"mailto:${evt.contactEmail}\">${evt.contactEmail}</a>`; } else { aboutContact.textContent = ''; }
  if (evt.link) { aboutLink.innerHTML = `<a href=\"${evt.link}\" target=\"_blank\" rel=\"noopener\">${evt.link}</a>`; } else { aboutLink.textContent = '—'; }

  // Details
  detailsCategory.textContent = evt.category || '—';
  detailsMax.textContent = evt.maxAttendees ? String(evt.maxAttendees) : '—';

  // Add to calendar: build ICS data URL
  try {
    const toICSDate = (iso) => {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2,'0');
      const y = d.getUTCFullYear();
      const m = pad(d.getUTCMonth()+1);
      const day = pad(d.getUTCDate());
      const hh = pad(d.getUTCHours());
      const mm = pad(d.getUTCMinutes());
      const ss = pad(d.getUTCSeconds());
      return `${y}${m}${day}T${hh}${mm}${ss}Z`;
    };
    const uid = evt.__id || Math.random().toString(36).slice(2);
    const dtStart = toICSDate(evt.startTime);
    const dtEnd = toICSDate(evt.endTime || evt.startTime);
    const summary = (evt.title || 'Event').replace(/\n/g,' ');
    const descICS = (evt.description || '').replace(/\n/g,'\\n');
    const loc = (evt.locationName || '').replace(/\n/g,' ');
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Event Atlas//EN\nBEGIN:VEVENT\nUID:${uid}\nDTSTAMP:${toICSDate(new Date().toISOString())}\nDTSTART:${dtStart}\nDTEND:${dtEnd}\nSUMMARY:${summary}\nDESCRIPTION:${descICS}\nLOCATION:${loc}\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    addCalBtn.href = url;
    addCalBtn.download = `${summary.replace(/[^a-z0-9_-]+/gi,'_')}.ics`;
  } catch {}

  // Interested + Notifications subscription
  function setInterested(active){
    [interested, interested2].forEach(btn => { if (!btn) return; btn.classList.toggle('active', !!active); btn.innerHTML = active ? '<i class="heart icon"></i> Saved' : '<i class="heart outline icon"></i> Save event'; });
  }
  async function setSubscribedUI(){
    // Best-effort: use local flag, since reading token membership is restricted
    const key = `interest:${evt.__id}`;
    const val = localStorage.getItem(key) === '1';
    setInterested(val);
    interestCount.textContent = val ? '1' : '0';
  }
  await setSubscribedUI();
  [interested, interested2].forEach(btn => {
    if (!btn || btn._bound) return; btn._bound = true;
    btn.addEventListener('click', async () => {
      const sup = await messagingSupported();
      const key = `interest:${evt.__id}`;
      const currently = localStorage.getItem(key) === '1';
      if (sup && !currently) {
        const res = await subscribeToEvent(evt.__id);
        if (res.ok) localStorage.setItem(key, '1');
      } else if (sup && currently) {
        const res = await unsubscribeFromEvent(evt.__id);
        if (res.ok) localStorage.setItem(key, '0');
      } else {
        // Fallback to local toggle only
        localStorage.setItem(key, currently ? '0' : '1');
      }
      // Also write a simple registration document with name/email for organizer lists
      try {
        const user = auth.currentUser;
        if (user) {
          const regRef = doc(getFirestore(), 'eventRegistrations', String(evt.__id), 'users', user.uid);
          if (localStorage.getItem(key) === '1') {
            await setDoc(regRef, {
              uid: user.uid,
              email: user.email || '',
              name: user.displayName || (user.email ? user.email.split('@')[0] : ''),
              subscribedAt: serverTimestamp()
            }, { merge: true });
          } else {
            await deleteDoc(regRef).catch(()=>{});
          }
        }
      } catch {}
      // Always maintain userSubscriptions regardless of push permission, so Saved page updates
      try {
        const user = auth.currentUser;
        if (user) {
          const usRef = doc(getFirestore(), 'userSubscriptions', user.uid, 'events', String(evt.__id));
          if (localStorage.getItem(key) === '1') {
            await setDoc(usRef, {
              eventId: String(evt.__id),
              title: evt.title || '',
              startTime: evt.startTime || null,
              endTime: evt.endTime || null,
              locationName: evt.locationName || null,
              savedAt: serverTimestamp()
            }, { merge: true });
          } else {
            await deleteDoc(usRef).catch(()=>{});
          }
        }
      } catch {}
      await setSubscribedUI();
    });
  });

  if (viewMapBtn && !viewMapBtn._bound) {
    viewMapBtn._bound = true;
    viewMapBtn.addEventListener('click', () => {
      try { modal.style.display = 'none'; modal.setAttribute('aria-hidden','true'); } catch {}
      try { if (typeof evt.lat === 'number' && typeof evt.lng === 'number') { map.setView([evt.lat, evt.lng], Math.max(map.getZoom(), 16)); } } catch {}
    });
  }
  // Organizer-owner: show subscriber list via callable function
  try {
    const owner = isOrganizer && String(evt.organizerUid||'') === String(currentUid||'');
    if (owner && ownerSubs && subsList) {
      ownerSubs.style.display = '';
      subsList.innerHTML = '<div style="color:#6b7280;">Loading…</div>';
      const fn = httpsCallable(getFunctions(), 'getEventSubscribers');
      const res = await fn({ eventId: String(evt.__id) });
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      subsList.innerHTML = '';
      if (!items.length) {
        subsList.innerHTML = '<div style="color:#6b7280;">No one has registered yet.</div>';
      } else {
        items.forEach(it => {
          const row = document.createElement('div'); row.className='subscriber';
          const left = document.createElement('div'); left.className='email'; left.textContent = it.email || '(no email)';
          const right = document.createElement('div'); right.className='when';
          try { right.textContent = it.subscribedAt ? new Date(it.subscribedAt._seconds*1000).toLocaleString() : ''; } catch { right.textContent=''; }
          row.appendChild(left); row.appendChild(right); subsList.appendChild(row);
        });
      }
    } else if (ownerSubs) {
      ownerSubs.style.display = 'none';
    }
  } catch {}
  modal.style.display = 'block'; modal.setAttribute('aria-hidden','false');
  function close(){ modal.style.display = 'none'; modal.setAttribute('aria-hidden','true'); }
  if (backdrop && !backdrop._bound) { backdrop._bound = true; backdrop.addEventListener('click', close); }
  if (closeBtn && !closeBtn._bound) { closeBtn._bound = true; closeBtn.addEventListener('click', close); }
}

async function fetchEventsForScope() {
  try {
    const eventsCol = collection(db, 'events');
    // Try to use server-side filter by category when possible; fall back to client-side filtering
    const wantsCategory = currentCategory && currentCategory !== 'all';
    if (isOrganizer) {
      if (currentScope === 'my' && currentUid) {
        // Server-side filter: created by me (reliable even if org name differs)
        try {
          let qref;
          if (wantsCategory) {
            // May require composite index; if it fails we catch below
            qref = query(eventsCol, where('organizerUid', '==', currentUid), where('category','==', currentCategory), orderBy('startTime','asc'));
          } else {
            qref = query(eventsCol, where('organizerUid', '==', currentUid), orderBy('startTime', 'asc'));
          }
          const snap = await getDocs(qref);
          // Return ALL my events; grouping into Upcoming/Past happens in renderer
          return snap.docs.map(d => ({ __id: d.id, ...d.data() }));
        } catch (err) {
          // Fallback: fetch all and filter locally
          const snap = await getDocs(query(eventsCol, orderBy('startTime', 'asc')));
          // Return ALL my events (not just upcoming)
          let arr = snap.docs.map(d => ({ __id: d.id, ...d.data() })).filter(e => (e.organizerUid || '') === currentUid);
          if (wantsCategory) arr = arr.filter(e => (String(e.category||'') === currentCategory));
          return arr;
        }
      }
      if (currentScope === 'others' && currentUid) {
        // Simpler and robust: fetch all and filter out my uid
        const snap = await getDocs(query(eventsCol, orderBy('startTime', 'asc')));
        // Show both upcoming and past for other organizers
        let arr = snap.docs.map(d => ({ __id: d.id, ...d.data() })).filter(e => (e.organizerUid || '') !== currentUid);
        if (wantsCategory) arr = arr.filter(e => (String(e.category||'') === currentCategory));
        return arr;
      }
    }
    // Default: return all events (grouping done in renderer)
    try {
      let qref;
      if (wantsCategory) {
        // May require index; catch errors and fall back
        qref = query(eventsCol, where('category','==', currentCategory), orderBy('startTime','asc'));
      } else {
        qref = query(eventsCol, orderBy('startTime', 'asc'));
      }
      const snap = await getDocs(qref);
      return snap.docs.map(d => ({ __id: d.id, ...d.data() }));
    } catch (e) {
      const snap = await getDocs(query(eventsCol, orderBy('startTime', 'asc')));
      let arr = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
      if (wantsCategory) arr = arr.filter(e => (String(e.category||'') === currentCategory));
      return arr;
    }
  } catch (e) {
    console.log('map.js: failed to fetch events', e);
    return [];
  }
}

async function loadEvents() {
  allEvents = await fetchEventsForScope();
  try { updateLocationOptions(); } catch {}
  await renderListAndMarkers();
  // Deep link: #event={id}
  try {
    const m = String(location.hash || '').match(/event=([^&]+)/);
    if (m && m[1]) { openEventDetailById(decodeURIComponent(m[1])); }
  } catch {}
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function buildCategoryChips() {
  if (!categoryChipsEl || categoryChipsEl._built) return;
  categoryChipsEl._built = true;
  const CATS = [
    { key: 'all', label: 'All' },
    { key: 'Academic', label: 'Academic', color: CATEGORY_COLORS.Academic },
    { key: 'Arts', label: 'Arts', color: CATEGORY_COLORS.Arts },
    { key: 'Athletics', label: 'Athletics', color: CATEGORY_COLORS.Athletics },
    { key: 'Community', label: 'Community', color: CATEGORY_COLORS.Community },
    { key: 'Social', label: 'Social', color: CATEGORY_COLORS.Social },
  ];
  CATS.forEach(c => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (c.key === 'all' ? ' active' : '');
    chip.dataset.key = c.key;
    chip.innerHTML = c.key === 'all' ? 'All' : `<span class="dot" style="background:${c.color || '#9ca3af'}"></span>${c.label}`;
    chip.addEventListener('click', async () => {
      currentCategory = c.key;
      // update active state
      const children = categoryChipsEl.querySelectorAll('.chip');
      children.forEach(el => el.classList.toggle('active', el.dataset.key === currentCategory));
      // Reload events (try server-side filtered query)
      await loadEvents();
    });
    categoryChipsEl.appendChild(chip);
  });
}

function attachFilterHandlers() {
  buildCategoryChips();
  // Search input
  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    const onQ = debounce(() => { currentQuery = searchInput.value || ''; renderListAndMarkers(); }, 250);
    searchInput.addEventListener('input', onQ);
  }
  // Location filter
  if (locationInput && !locationInput._bound) {
    locationInput._bound = true;
    const onL = debounce(() => { currentLocation = locationInput.value || ''; renderListAndMarkers(); }, 250);
    locationInput.addEventListener('input', onL);
  }
  if (clearLocationBtn && !clearLocationBtn._bound) {
    clearLocationBtn._bound = true;
    clearLocationBtn.addEventListener('click', () => { if (locationInput) locationInput.value = ''; currentLocation=''; renderListAndMarkers(); });
  }
  // Time range via Flatpickr
  if (timeRangeInput && inlineCalendar && !timeRangeInput._fpInit) {
    timeRangeInput._fpInit = true;
    try {
      fpRange = flatpickr(timeRangeInput, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        inline: true,
        appendTo: inlineCalendar,
        onClose: (selectedDates) => {
          if (selectedDates && selectedDates.length) {
            const [start, endRaw] = selectedDates;
            const end = endRaw || start;
            const s = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0,0,0,0);
            const e = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23,59,59,999);
            timeStartMs = s.getTime();
            timeEndMs = e.getTime();
            setTimeBtnLabel(s, e);
          } else {
            timeStartMs = NaN; timeEndMs = NaN; setTimeBtnLabel();
          }
          renderListAndMarkers();
        }
      });
    } catch {}
    // Fallback UI if Flatpickr failed to load
    if (!fpRange) {
      try {
        inlineCalendar.innerHTML = '';
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gap = '8px';
        const sWrap = document.createElement('div');
        const eWrap = document.createElement('div');
        const sLab = document.createElement('div'); sLab.textContent = 'Start'; sLab.style.color='#6b7280'; sLab.style.fontSize='0.9rem';
        const eLab = document.createElement('div'); eLab.textContent = 'End'; eLab.style.color='#6b7280'; eLab.style.fontSize='0.9rem';
        const sInp = document.createElement('input'); sInp.type='date'; sInp.style.width='100%';
        const eInp = document.createElement('input'); eInp.type='date'; eInp.style.width='100%';
        sWrap.appendChild(sLab); sWrap.appendChild(sInp);
        eWrap.appendChild(eLab); eWrap.appendChild(eInp);
        grid.appendChild(sWrap); grid.appendChild(eWrap);
        inlineCalendar.appendChild(grid);
        const apply = () => {
          const sVal = sInp.value; const eVal = eInp.value || sVal;
          if (sVal) {
            const s = new Date(sVal+'T00:00:00'); const e = new Date(eVal+'T23:59:59');
            timeStartMs = s.getTime(); timeEndMs = e.getTime(); setTimeBtnLabel(s,e);
          } else { timeStartMs = NaN; timeEndMs = NaN; setTimeBtnLabel(); }
          renderListAndMarkers();
        };
        sInp.addEventListener('change', apply);
        eInp.addEventListener('change', apply);
    } catch {}
    // Initialize calendar toolbar buttons
    try { bindCalToolbar(); } catch {}
  }
  }
  // Hide the button because calendar is inline
  if (timeFilterBtn) timeFilterBtn.style.display = 'none';
  if (clearDatesBtn && !clearDatesBtn._bound) {
    clearDatesBtn._bound = true;
    clearDatesBtn.addEventListener('click', () => {
      timeStartMs = NaN; timeEndMs = NaN; setTimeBtnLabel();
      try { fpRange && fpRange.clear(); } catch {}
      renderListAndMarkers();
    });
  }

  // Modal filter panel
  function openPanel(){
    if (!filterModal) return;
    // Seed temp values
    tempStartMs = timeStartMs; tempEndMs = timeEndMs; tempSort = currentSort;
    if (sortSelect) sortSelect.value = tempSort;
    // Init flatpickr in panel once
    if (filterCalendarHost && !filterCalendarHost._fpInit) {
      filterCalendarHost._fpInit = true;
      try {
        fpPanel = flatpickr(filterCalendarHost, {
          mode: 'range',
          inline: true,
          dateFormat: 'Y-m-d',
          defaultDate: (!isNaN(tempStartMs) && !isNaN(tempEndMs)) ? [new Date(tempStartMs), new Date(tempEndMs)] : [],
          onChange: (dates) => {
            if (dates && dates.length) {
              const [s, eRaw] = dates; const e = eRaw || s;
              const S = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0);
              const E = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23,59,59,999);
              tempStartMs = S.getTime(); tempEndMs = E.getTime();
            } else { tempStartMs = NaN; tempEndMs = NaN; }
          }
        });
      } catch {}
    } else if (fpPanel) {
      try { fpPanel.clear(); if (!isNaN(tempStartMs) && !isNaN(tempEndMs)) fpPanel.setDate([new Date(tempStartMs), new Date(tempEndMs)], true); } catch {}
    }
    filterModal.style.display = 'block';
    filterModal.setAttribute('aria-hidden','false');
  }
  function closePanel(){ if (!filterModal) return; filterModal.style.display = 'none'; filterModal.setAttribute('aria-hidden','true'); }
  if (openFilterBtn && !openFilterBtn._bound) { openFilterBtn._bound = true; openFilterBtn.addEventListener('click', openPanel); }
  if (filterBackdrop && !filterBackdrop._bound) { filterBackdrop._bound = true; filterBackdrop.addEventListener('click', closePanel); }
  if (closeFilterBtn && !closeFilterBtn._bound) { closeFilterBtn._bound = true; closeFilterBtn.addEventListener('click', closePanel); }
  if (cancelFilterBtn && !cancelFilterBtn._bound) { cancelFilterBtn._bound = true; cancelFilterBtn.addEventListener('click', closePanel); }
  if (applyFilterBtn && !applyFilterBtn._bound) {
    applyFilterBtn._bound = true;
    applyFilterBtn.addEventListener('click', async () => {
      currentSort = (sortSelect?.value || 'date');
      timeStartMs = tempStartMs; timeEndMs = tempEndMs; setTimeBtnLabel(isNaN(timeStartMs)?null:new Date(timeStartMs), isNaN(timeEndMs)?null:new Date(timeEndMs));
      await renderListAndMarkers();
      closePanel();
    });
  }
  // Preset ranges inside panel
  function setPreset(days){
    const now = new Date();
    const S = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
    let E = new Date(S);
    if (days === 'today') { E = new Date(S); }
    else { E = new Date(S.getTime() + (Number(days)||0) * 24*60*60*1000 - 1); }
    tempStartMs = S.getTime(); tempEndMs = E.getTime();
    try { fpPanel && fpPanel.setDate([new Date(tempStartMs), new Date(tempEndMs)], true); } catch {}
  }
  const presetBtns = document.querySelectorAll('.when-opt');
  presetBtns.forEach(btn => {
    if (!btn._bound) { btn._bound = true; btn.addEventListener('click', () => { setPreset(btn.dataset.range); }); }
  });
}

function setTimeBtnLabel(start, end){
  if (!timeFilterBtn) return;
  if (!start || !end || isNaN(start.getTime?.() || start) || isNaN(end.getTime?.() || end)) { timeFilterBtn.textContent = 'All Time'; return; }
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  timeFilterBtn.textContent = `${fmt(start)} – ${fmt(end)}`;
}

function updateLocationOptions(){
  const dl = document.getElementById('location-suggestions');
  if (!dl) return;
  const set = new Set();
  allEvents.forEach(e => { const n = String(e.locationName || '').trim(); if (n) set.add(n); });
  const values = Array.from(set).sort();
  dl.innerHTML = '';
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; dl.appendChild(opt);
  });
}

// Calendar toolbar controls
function applyRange(mode, baseDate){
  calendarMode = mode;
  const d = baseDate ? new Date(baseDate) : new Date();
  calendarAnchor = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let s, e;
  if (mode === 'day') {
    s = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), calendarAnchor.getDate(), 0,0,0,0);
    e = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), calendarAnchor.getDate(), 23,59,59,999);
  } else if (mode === 'week') {
    const dow = calendarAnchor.getDay(); // 0=Sun
    const start = new Date(calendarAnchor); start.setDate(start.getDate() - dow);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    s = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0,0,0,0);
    e = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23,59,59,999);
  } else if (mode === 'month') {
    s = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), 1, 0,0,0,0);
    e = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth()+1, 0, 23,59,59,999);
  } else { // all
    timeStartMs = NaN; timeEndMs = NaN; setTimeBtnLabel();
    try { fpRange && fpRange.clear(); } catch {}
    renderListAndMarkers();
    return;
  }
  timeStartMs = s.getTime(); timeEndMs = e.getTime(); setTimeBtnLabel(s,e);
  try { fpRange && fpRange.setDate([s,e], true); } catch {}
  renderListAndMarkers();
}

function shiftRange(dir){ // dir=-1 prev, +1 next
  if (calendarMode === 'all') return;
  const delta = calendarMode === 'day' ? 1 : calendarMode === 'week' ? 7 : 30;
  const base = calendarAnchor ? new Date(calendarAnchor) : new Date();
  base.setDate(base.getDate() + dir*delta);
  applyRange(calendarMode, base);
}

function bindCalToolbar(){
  const el = (id) => document.getElementById(id);
  const today = el('cal-today'), day = el('cal-day'), week = el('cal-week'), month = el('cal-month'), all = el('cal-all');
  const prev = el('cal-prev'), next = el('cal-next'), jump = el('jump-day-input');
  const pills = [today, day, week, month, all];
  const setActive = (btn) => pills.forEach(b => b && b.classList.toggle('active', b===btn));
  if (today && !today._bound) { today._bound = true; today.addEventListener('click', ()=> { setActive(today); applyRange('day', new Date()); }); }
  if (day && !day._bound) { day._bound = true; day.addEventListener('click', ()=> { setActive(day); applyRange('day'); }); }
  if (week && !week._bound) { week._bound = true; week.addEventListener('click', ()=> { setActive(week); applyRange('week'); }); }
  if (month && !month._bound) { month._bound = true; month.addEventListener('click', ()=> { setActive(month); applyRange('month'); }); }
  if (all && !all._bound) { all._bound = true; all.addEventListener('click', ()=> { setActive(all); applyRange('all'); }); }
  if (prev && !prev._bound) { prev._bound = true; prev.addEventListener('click', ()=> shiftRange(-1)); }
  if (next && !next._bound) { next._bound = true; next.addEventListener('click', ()=> shiftRange(1)); }
  if (jump && !jump._bound) { jump._bound = true; jump.addEventListener('change', ()=> { if (!jump.value) return; setActive(day); applyRange('day', new Date(jump.value)); }); }
}

function showExplore() {
  if (exploreView) exploreView.style.display = '';
  if (profileView) profileView.style.display = 'none';
  if (savedView) savedView.style.display = 'none';
  if (notificationsView) notificationsView.style.display = 'none';
  if (attendeeView) attendeeView.classList.remove('profile-open');
  // Give layout a tick to settle, then fix Leaflet sizing
  setTimeout(() => { try { map && map.invalidateSize(); } catch {} }, 60);
}

function showProfile() {
  if (exploreView) exploreView.style.display = 'none';
  if (profileView) profileView.style.display = '';
  if (savedView) savedView.style.display = 'none';
  if (notificationsView) notificationsView.style.display = 'none';
  if (attendeeView) attendeeView.classList.add('profile-open');
}

async function showNotifications() {
  if (exploreView) exploreView.style.display = 'none';
  if (profileView) profileView.style.display = 'none';
  if (savedView) savedView.style.display = 'none';
  if (notificationsView) notificationsView.style.display = '';
  if (attendeeView) attendeeView.classList.add('profile-open');
  try { await loadSubscriptions(); } catch {}
}

async function showSaved() {
  if (exploreView) exploreView.style.display = 'none';
  if (profileView) profileView.style.display = 'none';
  if (notificationsView) notificationsView.style.display = 'none';
  if (savedView) savedView.style.display = '';
  if (attendeeView) attendeeView.classList.add('profile-open');
  try { await loadSavedEvents(); } catch {}
}

function attachProfileToggle() {
  if (openProfileBtn) openProfileBtn.onclick = showProfile;
  if (closeProfileBtn) closeProfileBtn.onclick = showExplore;
  if (railProfileBtn) railProfileBtn.onclick = showProfile;
}

  function syncRoute() {
    const h = String(window.location.hash || '').toLowerCase();
    if (h.includes('profile')) { showProfile(); }
    else if (h.includes('notifications')) { showNotifications(); }
    else if (h.includes('saved')) { showSaved(); }
    else { showExplore(); }
  }

function setScope(scope){
  currentScope = scope;
  if (isOrganizer) {
    if (orgTabs) orgTabs.style.display = '';
    if (tabMy) tabMy.classList.toggle('active', scope === 'my');
    if (tabOthers) tabOthers.classList.toggle('active', scope === 'others');
    if (sectionTitle) sectionTitle.textContent = '';
  } else {
    if (orgTabs) orgTabs.style.display = 'none';
    if (sectionTitle) sectionTitle.textContent = '';
  }
  loadEvents();
}

function attachOrganizerTabs() {
  if (!orgTabs) return;
  if (!isOrganizer) { orgTabs.style.display = 'none'; return; }
  orgTabs.style.display = '';
  if (tabMy && !tabMy._bound) { tabMy._bound = true; tabMy.onclick = () => setScope('my'); }
  if (tabOthers && !tabOthers._bound) { tabOthers._bound = true; tabOthers.onclick = () => setScope('others'); }
  // default view for organizers: "my"
  setScope('my');
}

// Show/hide attendee view with auth state
onAuthStateChanged(auth, (user) => {
  if (attendeeView) attendeeView.style.display = user ? "grid" : "none";
  if (leftRail) leftRail.style.display = user ? 'flex' : 'none';
  if (user) {
    currentUid = user.uid;
    // Determine organizer status and org name
    const boot = async () => {
      try {
        // role
        try {
          const token = await user.getIdTokenResult(true);
          const role = String(token.claims?.role || 'student').toLowerCase();
          isOrganizer = ['organizer','organization','org'].includes(role);
        } catch {}
        // org name from user doc
        try {
          const usnap = await getDoc(doc(db, 'users', user.uid));
          myOrgName = String(usnap.data()?.name || '').trim();
        } catch {}

        initMap();
        attachFilterHandlers();
        attachProfileToggle();
        if (railHomeBtn && !railHomeBtn._bound) { railHomeBtn._bound = true; railHomeBtn.onclick = () => { showExplore(); setScope(isOrganizer ? 'my' : 'all'); }; }
        const railNotifyBtn = document.getElementById('rail-notify-btn');
        if (railNotifyBtn && !railNotifyBtn._bound) { railNotifyBtn._bound = true; railNotifyBtn.onclick = () => { showNotifications(); }; }
        const railSavedBtn = document.getElementById('rail-saved-btn');
        if (railSavedBtn && !railSavedBtn._bound) { railSavedBtn._bound = true; railSavedBtn.onclick = () => { showSaved(); }; }
        // Show saved button only for students
        if (railSavedBtn) railSavedBtn.style.display = isOrganizer ? 'none' : 'flex';
        syncRoute();
        if (isOrganizer) { attachOrganizerTabs(); }
        else { setScope('all'); }
        setTimeout(() => { try { map && map.invalidateSize(); } catch {} }, 50);
      } catch (e) { console.log('map.js: init failed', e); }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(boot);
    } else {
      setTimeout(boot, 0);
    }
  }
});

// Keep map responsive
window.addEventListener('resize', () => { try { map && map.invalidateSize(); } catch {} });
window.addEventListener('hashchange', () => {
  try { const av = document.getElementById('attendee-view'); if (!av || av.style.display==='none') return; } catch {}
  try {
    const h = String(location.hash||'').toLowerCase();
    if (h.includes('profile')) showProfile();
    else if (h.includes('notifications')) showNotifications();
    else if (h.includes('saved')) showSaved();
    else showExplore();
  } catch {}
});

async function loadSavedEvents(){
  const user = auth.currentUser; if (!user) return;
  try {
    const dbi = db; // already getFirestore()
    const subs = await getDocs(collection(dbi, 'userSubscriptions', user.uid, 'events'));
    const ids = subs.docs.map(d => d.id);
    if (savedList) savedList.innerHTML = '<div style="color:#6b7280;">Loading…</div>';
    if (!ids.length) { if (savedList) savedList.innerHTML = '<div style="color:#6b7280;">No saved events yet.</div>'; return; }

    // Fetch events concurrently in batches using documentId() in queries (chunks of 10)
    const chunk = (arr, n) => arr.length ? [arr.slice(0, n), ...chunk(arr.slice(n), n)] : [];
    const chunks = chunk(ids, 10);
    const snaps = await Promise.all(chunks.map(grp => getDocs(query(collection(dbi, 'events'), where(documentId(), 'in', grp)))));
    const events = snaps.flatMap(s => s.docs.map(d => ({ __id: d.id, ...d.data() })));

    // Split into upcoming/past similar to organizer drafts page
    const now = Date.now();
    const toMs = (v) => { try { if (!v) return NaN; if (typeof v?.toMillis === 'function') return v.toMillis(); return new Date(v).getTime(); } catch { return NaN; } };
    const upcoming = [];
    const past = [];
    events.forEach(e => {
      const endMs = toMs(e.endTime);
      const startMs = toMs(e.startTime);
      const cmp = !isNaN(endMs) ? endMs : startMs;
      if (!isNaN(cmp) && cmp >= now) upcoming.push(e); else past.push(e);
    });

    const renderHeader = (label) => { const h = document.createElement('div'); h.textContent = label; h.style.fontWeight='500'; h.style.margin='8px 0 6px'; return h; };
    const renderItem = (e) => {
      const card = document.createElement('div'); card.className = 'event-card'; card.dataset.id = e.__id;
      const body = document.createElement('div'); body.className = 'event-card-body';
      const t = document.createElement('div'); t.className = 'event-card-title'; t.textContent = e.title || 'Untitled';
      const m = document.createElement('div'); m.className = 'event-card-meta'; m.textContent = `${formatWhen(e.startTime, e.endTime)}  •  ${e.locationName || ''}`;
      body.appendChild(t); body.appendChild(m); card.appendChild(body);
      const btn = document.createElement('button'); btn.className='ui button tiny'; btn.textContent='Open'; btn.addEventListener('click', ()=> openEventDetailById(e.__id));
      const actions = document.createElement('div'); actions.style.marginLeft='auto'; actions.appendChild(btn); card.appendChild(actions);
      return card;
    };
    // Upcoming
    if (upcoming.length) {
      if (savedList) savedList.appendChild(renderHeader('Upcoming'));
      upcoming
        .slice()
        .sort((a,b)=> String(a.startTime||'').localeCompare(String(b.startTime||'')))
        .forEach(e => savedList && savedList.appendChild(renderItem(e)));
    }
    // Past
    if (past.length) {
      if (savedList) savedList.appendChild(renderHeader('Past'));
      past
        .slice()
        .sort((a,b)=> String(b.endTime||b.startTime||'').localeCompare(String(a.endTime||a.startTime||'')))
        .forEach(e => savedList && savedList.appendChild(renderItem(e)));
    }
  } catch (e) { console.log('loadSavedEvents failed', e); }
}

// Ensure filters are wired even if auth boot is delayed
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { try { attachFilterHandlers(); } catch {} });
  } else { attachFilterHandlers(); }
} catch {}

async function loadSubscriptions(){
  const user = auth.currentUser; if (!user) return;
  // permission
  try {
    const perm = Notification?.permission || 'default';
    if (notifPermStatus) notifPermStatus.textContent = perm.charAt(0).toUpperCase()+perm.slice(1);
    if (notifEnableBtn && !notifEnableBtn._bound) {
      notifEnableBtn._bound = true; notifEnableBtn.addEventListener('click', async () => {
        try { await Notification.requestPermission(); loadSubscriptions(); } catch {}
      });
    }
  } catch {}
  // list
  try {
    const { getFirestore, collection, getDocs, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js');
    const dbi = getFirestore();
    const coll = collection(dbi, 'userSubscriptions', user.uid, 'events');
    const snap = await getDocs(coll);
    const ids = snap.docs.map(d => d.id);
    if (subscribedList) subscribedList.innerHTML = '';
    for (const id of ids) {
      try {
        const evDoc = await getDoc(doc(dbi, 'events', id));
        if (!evDoc.exists()) continue;
        const ev = { __id: id, ...evDoc.data() };
        const card = document.createElement('div'); card.className = 'event-card'; card.dataset.id = id;
        const body = document.createElement('div'); body.className = 'event-card-body';
        const title = document.createElement('div'); title.className = 'event-card-title'; title.textContent = ev.title || 'Untitled';
        const meta = document.createElement('div'); meta.className = 'event-card-meta'; meta.textContent = `${formatWhen(ev.startTime, ev.endTime)}  •  ${ev.locationName || ''}`;
        body.appendChild(title); body.appendChild(meta); card.appendChild(body);
        const actions = document.createElement('div'); actions.style.marginLeft='auto';
        const btn = document.createElement('button'); btn.className='ui button tiny'; btn.textContent='Unsubscribe';
        btn.addEventListener('click', async () => { try { await unsubscribeFromEvent(id); loadSubscriptions(); } catch {} });
        actions.appendChild(btn); card.appendChild(actions);
        if (subscribedList) subscribedList.appendChild(card);
      } catch {}
    }
    if (ids.length === 0 && subscribedList) { subscribedList.innerHTML = '<div style="color:#6b7280;">No subscriptions yet.</div>'; }
  } catch (e) { console.log('loadSubscriptions failed', e); }
}
