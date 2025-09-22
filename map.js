import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

// DOM references
const attendeeView = document.getElementById("attendee-view");
const eventListEl = document.getElementById("event-list");
const searchInput = document.getElementById("event-search");
const timeFilter = document.getElementById("time-filter");
const categoryFilter = document.getElementById("category-filter");
const exploreView = document.getElementById("explore-view");
const profileView = document.getElementById("profile-view");
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

// Category colors for markers and list dots
const CATEGORY_COLORS = {
  Academic: '#f59e0b', // amber
  Arts: '#8b5cf6', // violet
  Athletics: '#10b981', // emerald
  Community: '#ef4444', // red
  Social: '#3b82f6', // blue
  default: '#6b7280' // gray
};


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

function passesTimeFilter(evt) { return true; }

function passesCategoryFilter(evt) { return true; }

function passesSearch(evt) { return true; }

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

  const filtered = allEvents.filter((e) => passesTimeFilter(e) && passesCategoryFilter(e) && passesSearch(e));
  updateCount(filtered.length);

  const byIdMarker = new Map();
  const bounds = [];

  filtered.forEach((evt) => {
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
        </div>`;
      mk.bindPopup(popup);
      mk.addTo(markersLayer);
      byIdMarker.set(evt.__id, mk);
      bounds.push([evt.lat, evt.lng]);
    }
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
}

async function fetchEventsForScope() {
  try {
    const eventsCol = collection(db, 'events');
    if (isOrganizer) {
      if (currentScope === 'my' && currentUid) {
        // Server-side filter: created by me (reliable even if org name differs)
        try {
          const qref = query(eventsCol, where('organizerUid', '==', currentUid), orderBy('startTime', 'asc'));
          const snap = await getDocs(qref);
          return snap.docs.map(d => ({ __id: d.id, ...d.data() }));
        } catch (err) {
          // Fallback: fetch all and filter locally
          const snap = await getDocs(query(eventsCol, orderBy('startTime', 'asc')));
          return snap.docs.map(d => ({ __id: d.id, ...d.data() })).filter(e => (e.organizerUid || '') === currentUid);
        }
      }
      if (currentScope === 'others' && currentUid) {
        // Simpler and robust: fetch all and filter out my uid
        const snap = await getDocs(query(eventsCol, orderBy('startTime', 'asc')));
        return snap.docs.map(d => ({ __id: d.id, ...d.data() })).filter(e => (e.organizerUid || '') !== currentUid);
      }
    }
    // Default: all upcoming events
    const snap = await getDocs(query(eventsCol, orderBy('startTime', 'asc')));
    return snap.docs.map(d => ({ __id: d.id, ...d.data() }));
  } catch (e) {
    console.log('map.js: failed to fetch events', e);
    return [];
  }
}

async function loadEvents() {
  allEvents = await fetchEventsForScope();
  await renderListAndMarkers();
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function attachFilterHandlers() { /* filters disabled for now */ }

function showExplore() {
  if (exploreView) exploreView.style.display = '';
  if (profileView) profileView.style.display = 'none';
  if (attendeeView) attendeeView.classList.remove('profile-open');
  // Give layout a tick to settle, then fix Leaflet sizing
  setTimeout(() => { try { map && map.invalidateSize(); } catch {} }, 60);
}

function showProfile() {
  if (exploreView) exploreView.style.display = 'none';
  if (profileView) profileView.style.display = '';
  if (attendeeView) attendeeView.classList.add('profile-open');
}

function attachProfileToggle() {
  if (openProfileBtn) openProfileBtn.onclick = showProfile;
  if (closeProfileBtn) closeProfileBtn.onclick = showExplore;
  if (railProfileBtn) railProfileBtn.onclick = showProfile;
}

function setScope(scope){
  currentScope = scope;
  if (isOrganizer) {
    if (orgTabs) orgTabs.style.display = '';
    if (tabMy) tabMy.classList.toggle('active', scope === 'my');
    if (tabOthers) tabOthers.classList.toggle('active', scope === 'others');
    if (sectionTitle) sectionTitle.textContent = scope === 'my' ? 'My Events' : 'Other Organizers';
  } else {
    if (orgTabs) orgTabs.style.display = 'none';
    if (sectionTitle) sectionTitle.textContent = 'Upcoming Events';
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
        showExplore();
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
