import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";
import { messagingSupported, subscribeToEvent, unsubscribeFromEvent } from './messaging.js';
import {
  getFirestore,
  collection,
  addDoc,
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
const functionsRef = getFunctions(undefined, 'us-central1');
const isPublicMode = () => {
  try { return !!window.PUBLIC_MODE; } catch { return false; }
};

// DOM references
const attendeeView = document.getElementById("attendee-view");
const eventListEl = document.getElementById("event-list");
const searchInput = document.getElementById("event-search");
// Location modal elements (new UI)
const openLocationBtn = document.getElementById('open-location-btn');
const locationModal = document.getElementById('location-modal');
const locationBackdrop = document.getElementById('location-backdrop');
const closeLocationBtn = document.getElementById('close-location-btn');
const cancelLocationBtn = document.getElementById('cancel-location-btn');
const applyLocationBtn = document.getElementById('apply-location-btn');
const locationModalInput = document.getElementById('location-modal-input');
const locationSuggestionsList = document.getElementById('location-suggestions-list');
// Legacy inline controls (may or may not exist)
const locationInput = document.getElementById('location-input');
const clearLocationBtn = document.getElementById('clear-location');
const searchSubmitBtn = document.getElementById('search-submit');
const timeFilterBtn = document.getElementById('time-filter-btn');
const timeRangeInput = document.getElementById('time-range');
const inlineCalendar = document.getElementById('inline-calendar');
const clearDatesBtn = document.getElementById('clear-dates-btn');
const categoryChipsEl = document.getElementById("category-chips");
const categoryListEl = document.getElementById('category-list');
// Categories sheet controls
const openCatsBtn = document.getElementById('open-cats-btn');
const categoriesModal = document.getElementById('categories-modal');
const categoriesBackdrop = document.getElementById('categories-backdrop');
const closeCatsBtn = document.getElementById('close-cats-btn');
const cancelCatsBtn = document.getElementById('cancel-cats-btn');
const applyCatsBtn = document.getElementById('apply-cats-btn');
const categoriesChiplist = document.getElementById('categories-chiplist');
const clearCatsBtn = document.getElementById('clear-categories');
// Filter modal controls
const openFilterBtn = document.getElementById('open-filter-btn');
const suggestedLocationsEl = document.getElementById('suggested-locations');
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
// notifications UI removed
const subscribedList = null;
const openProfileBtn = document.getElementById("open-profile-btn");
const closeProfileBtn = document.getElementById("close-profile-btn");
const leftRail = document.getElementById('left-rail');
const finalFilterBtn = document.getElementById('final-filter-btn');
const filterSummaryEl = document.getElementById('filter-summary');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const filtersCountEl = document.getElementById('filters-count');
const railProfileBtn = document.getElementById('rail-profile-btn');
const railHomeBtn = document.getElementById('rail-home-btn');
const railAdminBtn = document.getElementById('rail-admin-btn');
const railReportBtn = document.getElementById('rail-report-btn');
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
let currentCategory = 'all'; // kept for backward compatibility
let currentCategories = [];   // multi-select active values
let pendingCategories = [];   // staged multi-select until Apply filters
let currentQuery = '';
let currentLocation = '';
// Pending values typed by the user; applied only when pressing the search button or Enter
let pendingQuery = '';
let pendingLocation = '';
let pendingCategory = 'all';
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
    // Firestore Timestamp
    if (typeof value?.toMillis === 'function') return value.toMillis();
    // Numbers: allow seconds or milliseconds
    if (typeof value === 'number') {
      // If value looks like seconds (10 digits), convert to ms
      const ms = value < 1e12 ? value * 1000 : value;
      return ms;
    }
    // ISO/date-like strings
    const d = new Date(value);
    return d.getTime();
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
  // Multi-select logic: no selection or includes 'all' => pass
  if (!currentCategories || currentCategories.length === 0) return true;
  if (currentCategories.includes('all')) return true;
  const c = String(evt.category || '').trim();
  return currentCategories.includes(c);
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

function getThisWeekBounds() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const mondayOffset = (day === 0 ? -6 : 1 - day); // Monday as first day
  const start = new Date(d); start.setDate(d.getDate() + mondayOffset); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate() + 7); end.setMilliseconds(-1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

async function renderListAndMarkers() {
  if (!map) initMap();
  // Public mode no longer restricts to this week; show all unless user sets filters
  clearList();
  markersLayer.clearLayers();

  const filtered = allEvents.filter((e) => passesTimeFilter(e) && passesCategoryFilter(e) && passesLocationFilter(e) && passesSearch(e));
  const visibleFiltered = filtered.filter(e => (e.published !== false) && !e.unpublishedAt);
  // Optional sort
  if (currentSort === 'title') {
    filtered.sort((a,b) => String(a.title||'').localeCompare(String(b.title||'')));
  } else {
    // Default: by start time asc
    filtered.sort((a,b) => (toMs(a.startTime)||0) - (toMs(b.startTime)||0));
  }
  // Determine if any filter is active (keyword, location, date range, category)
  const anyFilterActive = !!((currentQuery||'').trim() || (currentLocation||'').trim() ||
    (!isNaN(timeStartMs) || !isNaN(timeEndMs)) || (Array.isArray(currentCategories) && currentCategories.length > 0));

  // Students: when filters are active, show only upcoming; otherwise allow fallback to visible
  const upcomingOnly = visibleFiltered.filter(isUpcoming);
  const isOthersScope = isOrganizer && (currentScope === 'others');
  const countVisible = isOrganizer
    ? (isOthersScope ? upcomingOnly.length : visibleFiltered.length)
    : (anyFilterActive ? upcomingOnly.length : (upcomingOnly.length || visibleFiltered.length));
  updateCount(countVisible);

  const byIdMarker = new Map();
  const bounds = [];

  // Grouping
  const up = upcomingOnly;
  const past = visibleFiltered.filter(e => !isUpcoming(e));
  const groups = isOrganizer
    ? (isOthersScope
        ? [ { title: 'Upcoming events', items: up } ]
        : [ { title: 'Upcoming events', items: up }, { title: 'Past events', items: past } ])
    : [ { title: '', items: (anyFilterActive ? up : (up.length ? up : visibleFiltered)) } ];

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

// Apply search filters from the pending values in inputs
function applySearchFilters(){
  try {
    // If inputs exist, sync pending from their current values first
    if (searchInput) pendingQuery = searchInput.value || '';
    if (locationInput) pendingLocation = locationInput.value || '';
  } catch {}
  currentQuery = pendingQuery || '';
  currentLocation = pendingLocation || '';
  renderListAndMarkers();
  updateFilterSummary();
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
  const interested = document.getElementById('event-interest-btn');
  const interested2 = document.getElementById('event-interest-btn-2');
  const rsvpBtn = document.getElementById('event-rsvp-btn');
  const rsvpNote = document.getElementById('event-rsvp-note');
  const interestCount = document.getElementById('event-interest-count');
  const viewMapBtn = document.getElementById('event-view-map-btn');
  const reportBtn = document.getElementById('event-report-btn');
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

  // In public mode, hide all attendee action buttons (save/RSVP/add calendar/report)
  if (isPublicMode()) {
    try { const actions = document.querySelector('.event-actions'); if (actions) actions.style.display = 'none'; } catch {}
    try { if (rsvpNote) rsvpNote.style.display = 'none'; } catch {}
  }

  // Ensure Saved state is consistent with userSubscriptions so the Saved page reflects it
  try {
    const key = `interest:${evt.__id}`;
    const isSaved = localStorage.getItem(key) === '1';
    const user = auth.currentUser;
    if (user) {
      const usRef = doc(db, 'userSubscriptions', user.uid, 'events', String(evt.__id));
      if (isSaved) {
        await setDoc(usRef, {
          eventId: String(evt.__id),
          title: evt.title || '',
          startTime: evt.startTime || null,
          endTime: evt.endTime || null,
          locationName: evt.locationName || null,
          savedAt: serverTimestamp()
        }, { merge: true });
      }
    }
  } catch {}
  // Adjust actions for organizer-owner vs student
  try {
    const owner = isOrganizer && String(evt.organizerUid||'') === String(currentUid||'');
    const actions = document.querySelector('.event-actions');
    const interestedBtn = document.getElementById('event-interest-btn');
    const interestedBtn2 = document.getElementById('event-interest-btn-2');
    const rsvpBtnLocal = document.getElementById('event-rsvp-btn');
    if (owner) {
      if (interestedBtn) interestedBtn.style.display='none';
      if (interestedBtn2) interestedBtn2.style.display='none';
      if (rsvpBtnLocal) rsvpBtnLocal.remove();
      try { const note = document.getElementById('event-rsvp-note'); if (note) note.style.display = 'none'; } catch {}
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

  // Add-to-calendar feature removed per request

  // Interested + Notifications subscription
  function setInterested(active){
    [interested, interested2].forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('active', !!active);
      btn.innerHTML = active ? '<i class="bookmark icon"></i> Saved' : '<i class="bookmark outline icon"></i> Save';
    });
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
        // Try to subscribe for push; even if it fails/denied, still save the event locally
        try {
          const res = await subscribeToEvent(evt.__id);
          if (!res || res.ok !== true) {
            // Permission denied or error: still mark as saved (no notifications)
            localStorage.setItem(key, '1');
          } else {
            localStorage.setItem(key, '1');
          }
        } catch {
          localStorage.setItem(key, '1');
        }
      } else if (sup && currently) {
        // Confirm unsave
        const ok = await openConfirm('Are you sure you want to unsave the event?', 'Unsave', 'Keep');
        if (!ok) return;
        // Try to unsubscribe; even if it fails, toggle off locally
        try {
          const res = await unsubscribeFromEvent(evt.__id);
          if (!res || res.ok !== true) {
            localStorage.setItem(key, '0');
          } else {
            localStorage.setItem(key, '0');
          }
        } catch {
          localStorage.setItem(key, '0');
        }
      } else {
        // Fallback to local toggle only
        if (currently) {
          const ok = await openConfirm('Are you sure you want to unsave the event?', 'Unsave', 'Keep');
          if (!ok) return;
        }
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
  // Reporting
  if (reportBtn && !reportBtn._bound) {
    reportBtn._bound = true;
    reportBtn.addEventListener('click', () => openReportModal(evt));
  }
  // RSVP required note
  try { if (rsvpNote) rsvpNote.style.display = evt.rsvpRequired ? '' : 'none'; } catch {}
  // RSVP button (students)
  try {
    if (rsvpBtn) {
      const user = auth.currentUser;
      const isOwner = isOrganizer && String(evt.organizerUid||'') === String(currentUid||'');
      // Hide RSVP for organizers/owners, or when event doesn't require RSVP
      const requires = !!evt.rsvpRequired;
      rsvpBtn.style.display = (!user || isOwner || !requires) ? 'none' : '';
      let rsvpState = false; // last known registration state
      async function setRsvpUI(){
        const u = auth.currentUser;
        let registered = false;
        try {
          if (u) {
            const ref = doc(getFirestore(), 'eventRegistrations', String(evt.__id), 'users', u.uid);
            const snap = await getDoc(ref); // may fail due to rules for students
            registered = !!snap?.exists?.();
          }
        } catch {
          // Fallback to local indicator when read is not permitted for students
          try { registered = localStorage.getItem('rsvp:'+String(evt.__id)) === '1'; } catch {}
        } finally {
          rsvpState = registered;
          // Always show a checkmark icon in the RSVP button UI
          rsvpBtn.innerHTML = registered ? '<i class="check icon"></i> Registered' : '<i class="check icon"></i> RSVP';
          rsvpBtn.classList.toggle('active', !!registered);
          rsvpBtn.disabled = false; rsvpBtn.setAttribute('aria-disabled','false');
          // Note message: thank you vs requirement
          try {
            if (rsvpNote && evt.rsvpRequired) {
              rsvpNote.style.display = '';
              rsvpNote.textContent = registered ? 'Thank you for registering for the event!' : 'RSVP is required for this event.';
              rsvpNote.classList.toggle('green', !!registered);
              rsvpNote.classList.toggle('red', !registered);
            }
          } catch {}
        }
      }
      if (!rsvpBtn._bound) {
        rsvpBtn._bound = true;
        rsvpBtn.addEventListener('click', async () => {
          try {
            const u = auth.currentUser; if (!u) { alert('Please sign in first.'); return; }
            rsvpBtn.disabled = true; rsvpBtn.setAttribute('aria-disabled','true');
            const ref = doc(getFirestore(), 'eventRegistrations', String(evt.__id), 'users', u.uid);
            const willRegister = !rsvpState;
            if (willRegister) {
              // Assume not registered and attempt to create
              await setDoc(ref, {
                uid: u.uid,
                email: u.email || '',
                name: u.displayName || (u.email ? u.email.split('@')[0] : ''),
                registeredAt: serverTimestamp()
              }, { merge: true });
              try {
                localStorage.setItem('rsvp:'+String(evt.__id), '1');
                localStorage.setItem('interest:'+String(evt.__id), '1'); // reflect Saved state in UI
              } catch {}
              // Also auto-save the event so student gets updates
              try {
                const usRef = doc(getFirestore(), 'userSubscriptions', u.uid, 'events', String(evt.__id));
                await setDoc(usRef, {
                  eventId: String(evt.__id),
                  title: evt.title || '',
                  startTime: evt.startTime || null,
                  endTime: evt.endTime || null,
                  locationName: evt.locationName || null,
                  savedAt: serverTimestamp()
                }, { merge: true });
              } catch {}
              // Flip the Save button UI immediately
              try { setInterested(true); if (interestCount) interestCount.textContent = '1'; } catch {}
              try { await subscribeToEvent(evt.__id).catch(()=>{}); } catch {}
            } else {
              // Confirm unregistration
              const ok = await openConfirm('Are you sure you want to unregister?', 'Unregister', 'Keep');
              if (!ok) { rsvpBtn.disabled = false; rsvpBtn.setAttribute('aria-disabled','false'); return; }
              // Remove registration; delete on server even if it may not exist (deletes are idempotent)
              await deleteDoc(ref).catch(()=>{});
              // Clear local indicator; keep Saved state unchanged
              try { localStorage.removeItem('rsvp:'+String(evt.__id)); } catch {}
              // Optional follow-up: also unsave?
              try {
                const key = 'interest:'+String(evt.__id);
                const isSaved = localStorage.getItem(key) === '1';
                if (isSaved) {
                  const also = await openConfirm('Do you also want to unsave this event?', 'Unsave', 'Keep');
                  if (also) {
                    try { await unsubscribeFromEvent(evt.__id); } catch {}
                    try { localStorage.setItem(key, '0'); } catch {}
                  }
                }
              } catch {}
            }
          } catch {}
          try { await setRsvpUI(); } catch {}
          try { await setSubscribedUI(); } catch {}
          rsvpBtn.disabled = false; rsvpBtn.setAttribute('aria-disabled','false');
        });
      }
      setRsvpUI();
    }
  } catch {}

  // Organizer-owner: show subscriber/RSVP list
  try {
    const owner = isOrganizer && String(evt.organizerUid||'') === String(currentUid||'');
    if (owner && ownerSubs && subsList) {
      ownerSubs.style.display = '';
      subsList.innerHTML = '';
      // Fetch RSVP registrations with name+email
      try {
        const snap = await getDocs(query(collection(getFirestore(), 'eventRegistrations', String(evt.__id), 'users'), orderBy('registeredAt','desc')));
        if (snap.empty) {
          subsList.innerHTML = '<div style="color:#6b7280;">No one has registered yet.</div>';
        } else {
          snap.docs.forEach(d => {
            const it = d.data() || {};
            const row = document.createElement('div'); row.className='subscriber';
            const left = document.createElement('div'); left.className='email'; left.textContent = `${it.name || ''} ${it.email ? '• ' + it.email : ''}`.trim();
            const right = document.createElement('div'); right.className='when';
            try { right.textContent = it.registeredAt ? new Date(it.registeredAt.toMillis ? it.registeredAt.toMillis() : it.registeredAt).toLocaleString() : ''; } catch { right.textContent=''; }
            row.appendChild(left); row.appendChild(right); subsList.appendChild(row);
          });
        }
      } catch {
        subsList.innerHTML = '<div style="color:#6b7280;">Unable to load registrations.</div>';
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

// Report modal wiring
let currentReportEvent = null;
function openReportModal(evt){
  currentReportEvent = evt || null;
  const modal = document.getElementById('report-modal');
  const typeSel = document.getElementById('report-type');
  const rowAtt = document.getElementById('report-attendee-row');
  const rowEvent = document.getElementById('report-event-row');
  const rowEventOrg = document.getElementById('report-event-org-row');
  const eventTitleInput = document.getElementById('report-event-title');
  const eventOrgInput = document.getElementById('report-event-org');
  const details = document.getElementById('report-details');
  const error = document.getElementById('report-error');
  const success = document.getElementById('report-success');
  if (!modal) return;
  if (typeSel) typeSel.value = 'event';
  if (rowAtt) rowAtt.style.display = 'none';
  if (rowEvent) rowEvent.style.display = currentReportEvent ? 'none' : '';
  if (rowEventOrg) rowEventOrg.style.display = currentReportEvent ? 'none' : '';
  if (eventTitleInput) eventTitleInput.value = currentReportEvent?.title || '';
  if (eventOrgInput) eventOrgInput.value = currentReportEvent?.organization || '';
  if (details) details.value='';
  if (error) error.style.display='none';
  if (success) success.style.display='none';
  modal.style.display='block'; modal.setAttribute('aria-hidden','false');
}

try {
  const modal = document.getElementById('report-modal');
  const backdrop = document.getElementById('report-backdrop');
  const closeBtn = document.getElementById('report-close');
  const cancelBtn = document.getElementById('report-cancel');
  const submitBtn = document.getElementById('report-submit');
  const typeSel = document.getElementById('report-type');
  const rowAtt = document.getElementById('report-attendee-row');
  const rowEvent = document.getElementById('report-event-row');
  const rowEventOrg = document.getElementById('report-event-org-row');
  const attEmail = document.getElementById('report-attendee-email');
  const eventTitleInput = document.getElementById('report-event-title');
  const eventOrgInput = document.getElementById('report-event-org');
  const reasonSel = document.getElementById('report-reason');
  const details = document.getElementById('report-details');
  const error = document.getElementById('report-error');
  const success = document.getElementById('report-success');
  const hide = () => { if (!modal) return; modal.style.display='none'; modal.setAttribute('aria-hidden','true'); };
  if (backdrop && !backdrop._bound) { backdrop._bound = true; backdrop.addEventListener('click', hide); }
  if (closeBtn && !closeBtn._bound) { closeBtn._bound = true; closeBtn.addEventListener('click', hide); }
  if (cancelBtn && !cancelBtn._bound) { cancelBtn._bound = true; cancelBtn.addEventListener('click', hide); }
  if (typeSel && !typeSel._bound) { typeSel._bound = true; typeSel.addEventListener('change', ()=> { if (rowAtt) rowAtt.style.display = typeSel.value === 'attendee' ? '' : 'none'; if (rowEvent) rowEvent.style.display = (typeSel.value === 'event' && !currentReportEvent) ? '' : 'none'; if (rowEventOrg) rowEventOrg.style.display = (typeSel.value === 'event' && !currentReportEvent) ? '' : 'none'; }); }
  if (submitBtn && !submitBtn._bound) {
    submitBtn._bound = true;
    submitBtn.addEventListener('click', async () => {
      try {
        const user = auth.currentUser; if (!user) { if (error){ error.textContent='Sign in required.'; error.style.display=''; } return; }
        const payload = {
          type: typeSel?.value || 'event',
          eventId: String(currentReportEvent?.__id || ''),
          eventTitle: String(currentReportEvent?.title || eventTitleInput?.value || ''),
          organizerUid: String(currentReportEvent?.organizerUid || ''),
          organizerName: String(currentReportEvent?.organization || eventOrgInput?.value || ''),
          attendeeEmail: String(attEmail?.value || '').trim() || null,
          reason: String(reasonSel?.value || ''),
          details: String(details?.value || '').slice(0, 2000),
          reporterUid: user.uid,
          reporterEmail: user.email || '',
          createdAt: serverTimestamp(),
          status: 'new'
        };
        // Basic validation: require event title and organizer (no event link/ID required)
        if (payload.type === 'event') {
          if (!payload.eventTitle) { if (error){ error.textContent='Please enter the event title.'; error.style.display=''; } return; }
          if (!payload.organizerName) { if (error){ error.textContent='Please enter the event organizer.'; error.style.display=''; } return; }
        }
        // Details optional per request
        // If an ID is present, try to enrich from Firestore (optional)
        if (!currentReportEvent && payload.eventId) {
          try {
            const evSnap = await getDoc(doc(db, 'events', payload.eventId));
            if (evSnap.exists()) {
              const ev = evSnap.data();
              payload.eventTitle = payload.eventTitle || ev?.title || '';
              payload.organizerUid = payload.organizerUid || ev?.organizerUid || '';
              payload.organizerName = payload.organizerName || ev?.organization || '';
            }
          } catch {}
        }
        await addDoc(collection(db, 'reports'), payload);
        // Email DSG via Firestore Email extension
        try {
          const adminEmail = 'kureahoshi_2026@depauw.edu';
          const subject = `[Event Atlas] New ${payload.type} report`;
          const html = `<div style=\"font-family:system-ui,Segoe UI,Arial,sans-serif;\">\n            <h3 style=\"margin:0 0 6px;\">New ${payload.type} report</h3>\n            <p style=\"margin:0 0 6px;\"><b>Event:</b> ${payload.eventTitle || '(unknown)'}</p>\n            ${payload.organizerName ? `<p style=\\\"margin:0 0 6px;\\\"><b>Organizer:</b> ${payload.organizerName}</p>` : ''}\n            ${payload.attendeeEmail ? `<p style=\\\"margin:0 0 6px;\\\"><b>Attendee:</b> ${payload.attendeeEmail}</p>` : ''}\n            <p style=\"margin:0 0 6px;\"><b>Reason:</b> ${payload.reason}</p>\n            <pre style=\"white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;padding:8px;border-radius:8px;\">${payload.details.replace(/</g,'&lt;')}</pre>\n            <p style=\"margin-top:8px;\">Reporter: ${payload.reporterEmail || payload.reporterUid}</p>\n          </div>`;
          await addDoc(collection(db, 'mail'), {
            to: [adminEmail],
            message: { subject, text: `${payload.type} report for ${payload.eventTitle||payload.eventId}\nReason: ${payload.reason}\n${payload.details}`, html, from: 'kureahoshi_2026@depauw.edu', replyTo: 'kureahoshi_2026@depauw.edu' }
          });
        } catch {}
        if (success) { success.style.display=''; }
        if (error) { error.style.display='none'; }
        setTimeout(hide, 800);
      } catch (e) {
        if (error) { error.textContent = e?.message || 'Failed to submit report'; error.style.display=''; }
      }
    });
  }
} catch {}

async function fetchEventsForScope() {
  try {
    const eventsCol = collection(db, 'events');
    // Multi-select category support
    const selectedCats = Array.isArray(currentCategories) ? currentCategories.filter(c => c && c !== 'all') : [];
    const wantsCategory = selectedCats.length > 0;
    if (isOrganizer) {
      if (currentScope === 'my' && currentUid) {
        // Server-side filter: created by me (reliable even if org name differs)
        try {
          let qref;
          if (wantsCategory && selectedCats.length === 1) {
            qref = query(eventsCol, where('organizerUid', '==', currentUid), where('category','==', selectedCats[0]), orderBy('startTime','asc'));
          } else {
            qref = query(eventsCol, where('organizerUid', '==', currentUid), orderBy('startTime', 'asc'));
          }
          const snap = await getDocs(qref);
          let arr = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
          if (wantsCategory && selectedCats.length > 1) arr = arr.filter(e => selectedCats.includes(String(e.category||'')));
          return arr;
        } catch (err) {
          // Fallback: fetch all and filter locally
          const snap = await getDocs(query(eventsCol, orderBy('startTime', 'asc')));
          // Return ALL my events (not just upcoming)
          let arr = snap.docs.map(d => ({ __id: d.id, ...d.data() })).filter(e => (e.organizerUid || '') === currentUid);
          if (wantsCategory) arr = arr.filter(e => selectedCats.includes(String(e.category||'')));
          return arr;
        }
      }
      if (currentScope === 'others' && currentUid) {
        // Simpler and robust: fetch all and filter out my uid
        const snap = await getDocs(query(eventsCol, orderBy('startTime', 'asc')));
        // Show both upcoming and past for other organizers
        let arr = snap.docs.map(d => ({ __id: d.id, ...d.data() })).filter(e => (e.organizerUid || '') !== currentUid);
        if (wantsCategory) arr = arr.filter(e => selectedCats.includes(String(e.category||'')));
        return arr;
      }
    }
    // Default: return all events (grouping done in renderer)
    try {
      let qref;
      if (wantsCategory && selectedCats.length === 1) {
        qref = query(eventsCol, where('category','==', selectedCats[0]), orderBy('startTime','asc'));
      } else {
        qref = query(eventsCol, orderBy('startTime', 'asc'));
      }
      const snap = await getDocs(qref);
      let arr = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
      if (wantsCategory && selectedCats.length > 1) arr = arr.filter(e => selectedCats.includes(String(e.category||'')));
      return arr;
    } catch (e) {
      // Broader fallback: fetch without orderBy in case of index/format issues,
      // then sort and filter on the client.
      const snap = await getDocs(eventsCol);
      let arr = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
      // Sort by startTime ascending if present
      try { arr.sort((a,b) => (toMs(a.startTime)||0) - (toMs(b.startTime)||0)); } catch {}
      if (wantsCategory) arr = arr.filter(e => selectedCats.includes(String(e.category||'')));
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
    { key: 'Academic', label: 'Academic', color: CATEGORY_COLORS.Academic },
    { key: 'Arts', label: 'Arts', color: CATEGORY_COLORS.Arts },
    { key: 'Athletics', label: 'Athletics', color: CATEGORY_COLORS.Athletics },
    { key: 'Community', label: 'Community', color: CATEGORY_COLORS.Community },
    { key: 'Social', label: 'Social', color: CATEGORY_COLORS.Social },
  ];
  // Initialize staged selection to current on first build
  pendingCategories = Array.from(currentCategories);
  CATS.forEach(c => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.key = c.key;
    chip.textContent = c.label; // remove colored dots
    // Reflect initial staged selection
    chip.classList.toggle('active', pendingCategories.includes(c.key));
    chip.addEventListener('click', async () => {
      pendingCategories = [c.key];
      const children = categoryChipsEl.querySelectorAll('.chip');
      children.forEach(el => el.classList.toggle('active', el.dataset.key === c.key));
      // Do not apply immediately; wait for Apply filters
      updateFilterSummary();
    });
    categoryChipsEl.appendChild(chip);
  });
}

function buildCategoriesSheet(){
  // With accordion we render checkbox list into #category-list instead
  if (!categoryListEl || categoryListEl._built) return;
  categoryListEl._built = true;
  const CATS = [
    { key: 'Academic', label: 'Academic' },
    { key: 'Arts', label: 'Arts' },
    { key: 'Athletics', label: 'Athletics' },
    { key: 'Community', label: 'Community' },
    { key: 'Social', label: 'Social' },
  ];
  const render = () => {
    categoryListEl.innerHTML = '';
    CATS.forEach(c => {
      const row = document.createElement('div');
      row.className = 'check-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = `cat-${c.key}`; cb.value = c.key;
      const lbl = document.createElement('label'); lbl.setAttribute('for', `cat-${c.key}`); lbl.textContent = c.label;
      // If none selected, treat as All (UI shows none checked)
      cb.checked = pendingCategories.includes(c.key);
      cb.addEventListener('change', () => {
        const set = new Set(pendingCategories);
        if (cb.checked) set.add(c.key); else set.delete(c.key);
        pendingCategories = Array.from(set);
        updateFilterSummary();
      });
      row.appendChild(cb); row.appendChild(lbl); categoryListEl.appendChild(row);
    });
  };
  render();
}

function attachFilterHandlers() {
  try { buildCategoryChips(); } catch {}
  try { buildCategoriesSheet(); } catch {}
  // Search input
  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    // Update pending value while typing; do not filter yet
    const onQ = debounce(() => { pendingQuery = searchInput.value || ''; }, 100);
    searchInput.addEventListener('input', onQ);
    // Pressing Enter applies both fields
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applySearchFilters(); } });
  }
  // Location filter
  if (locationInput && !locationInput._bound) {
    locationInput._bound = true;
    const onL = debounce(() => { pendingLocation = locationInput.value || ''; updateFilterSummary(); }, 100);
    locationInput.addEventListener('input', onL);
    // Pressing Enter in the location field applies the filter immediately
    locationInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applySearchFilters(); } });
  }
  if (clearLocationBtn && !clearLocationBtn._bound) {
    clearLocationBtn._bound = true;
    clearLocationBtn.addEventListener('click', () => { if (locationInput) locationInput.value = ''; pendingLocation=''; /* wait for submit */ });
  }
  // Rounded search icon button on the right
  if (searchSubmitBtn && !searchSubmitBtn._bound) {
    searchSubmitBtn._bound = true;
    searchSubmitBtn.addEventListener('click', () => applySearchFilters());
  }
  // Accordion toggle
  const filterAccordion = document.getElementById('filter-accordion');
  if (filterAccordion && !filterAccordion._bound) {
    filterAccordion._bound = true;
    filterAccordion.addEventListener('click', (e) => {
      const btn = e.target.closest('.acc-header');
      if (!btn) return;
      const item = btn.closest('.acc-item');
      if (!item) return;
      item.classList.toggle('open');
    });
  }
  if (finalFilterBtn && !finalFilterBtn._bound) {
    finalFilterBtn._bound = true;
    finalFilterBtn.addEventListener('click', async () => {
      try {
        // Always commit staged date range, whether using inline accordion or modal sheet
        timeStartMs = tempStartMs; timeEndMs = tempEndMs;
        try { setTimeBtnLabel(isNaN(timeStartMs)?null:new Date(timeStartMs), isNaN(timeEndMs)?null:new Date(timeEndMs)); } catch {}
        if (filterModal && filterModal.style.display !== 'none') {
          filterModal.style.display = 'none'; filterModal.setAttribute('aria-hidden','true');
        }
      } catch {}
      try {
        // Commit staged category selection (from chips or panel)
        currentCategories = Array.from(pendingCategories);
        if (categoriesModal && categoriesModal.style.display !== 'none') {
          categoriesModal.style.display = 'none'; categoriesModal.setAttribute('aria-hidden','true');
        }
      } catch {}
      // Apply keyword + location and refresh list (re-fetch in case category scope changed)
      applySearchFilters();
      try { await loadEvents(); } catch {}
    });
  }
  if (clearCatsBtn && !clearCatsBtn._bound) {
    clearCatsBtn._bound = true;
    clearCatsBtn.addEventListener('click', () => {
      try {
        pendingCategories = [];
        const list = document.getElementById('category-list');
        if (list) list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateFilterSummary();
      } catch {}
    });
  }
  // Categories sheet handlers
  function openCats(){ if (!categoriesModal) return; pendingCategories = Array.from(currentCategories); buildCategoriesSheet(); categoriesModal.style.display = 'block'; categoriesModal.setAttribute('aria-hidden','false'); }
  function closeCats(){ if (!categoriesModal) return; categoriesModal.style.display = 'none'; categoriesModal.setAttribute('aria-hidden','true'); }
  if (openCatsBtn && !openCatsBtn._bound) { openCatsBtn._bound = true; openCatsBtn.addEventListener('click', openCats); }
  if (categoriesBackdrop && !categoriesBackdrop._bound) { categoriesBackdrop._bound = true; categoriesBackdrop.addEventListener('click', closeCats); }
  if (closeCatsBtn && !closeCatsBtn._bound) { closeCatsBtn._bound = true; closeCatsBtn.addEventListener('click', closeCats); }
  if (cancelCatsBtn && !cancelCatsBtn._bound) { cancelCatsBtn._bound = true; cancelCatsBtn.addEventListener('click', closeCats); }
  if (applyCatsBtn && !applyCatsBtn._bound) { applyCatsBtn._bound = true; applyCatsBtn.addEventListener('click', async () => { currentCategories = Array.from(pendingCategories); await loadEvents(); updateFilterSummary(); closeCats(); }); }
  // Location sheet handlers (new UI)
  function openLocation(){ if (!locationModal) return; seedLocationSuggestions(); locationModal.style.display='block'; locationModal.setAttribute('aria-hidden','false'); try { locationModalInput && locationModalInput.focus(); } catch {} }
  function closeLocation(){ if (!locationModal) return; locationModal.style.display='none'; locationModal.setAttribute('aria-hidden','true'); }
  if (openLocationBtn && !openLocationBtn._bound) { openLocationBtn._bound = true; openLocationBtn.addEventListener('click', openLocation); }
  if (locationBackdrop && !locationBackdrop._bound) { locationBackdrop._bound = true; locationBackdrop.addEventListener('click', closeLocation); }
  if (closeLocationBtn && !closeLocationBtn._bound) { closeLocationBtn._bound = true; closeLocationBtn.addEventListener('click', closeLocation); }
  if (cancelLocationBtn && !cancelLocationBtn._bound) { cancelLocationBtn._bound = true; cancelLocationBtn.addEventListener('click', closeLocation); }
  if (applyLocationBtn && !applyLocationBtn._bound) { applyLocationBtn._bound = true; applyLocationBtn.addEventListener('click', () => { pendingLocation = (locationModalInput?.value || ''); applySearchFilters(); closeLocation(); }); }
  if (locationModalInput && !locationModalInput._bound) { locationModalInput._bound = true; locationModalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pendingLocation = locationModalInput.value || ''; applySearchFilters(); closeLocation(); } }); }
  // Time range via Flatpickr
  if (timeRangeInput && inlineCalendar && !timeRangeInput._fpInit) {
    const initInline = () => {
      try {
        fpRange = flatpickr(timeRangeInput, {
          mode: 'range',
          dateFormat: 'Y-m-d',
          inline: true,
          appendTo: inlineCalendar,
          defaultDate: [],
          onClose: (selectedDates) => {
            if (selectedDates && selectedDates.length) {
              const [start, endRaw] = selectedDates;
              const end = endRaw || start;
              const s = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0,0,0,0);
              const e = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23,59,59,999);
              tempStartMs = s.getTime();
              tempEndMs = e.getTime();
            } else {
              tempStartMs = NaN; tempEndMs = NaN;
            }
          updateFilterSummary();
        }
      });
        try { inlineCalendar.style.minHeight = '360px'; fpRange.redraw && fpRange.redraw(); } catch {}
        if (fpRange) timeRangeInput._fpInit = true;
      } catch {}
    };
    initInline();
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
            tempStartMs = s.getTime(); tempEndMs = e.getTime();
          } else { tempStartMs = NaN; tempEndMs = NaN; }
          updateFilterSummary();
        };
        sInp.addEventListener('change', apply);
        eInp.addEventListener('change', apply);
    } catch {}
    // Initialize calendar toolbar buttons
    try { bindCalToolbar(); } catch {}
    // Retry initialising flatpickr multiple times in case assets load late
    if (!timeRangeInput._fpInit) {
      let tries = 0; const max = 10;
      const retry = () => {
        if (timeRangeInput._fpInit) return;
        if (typeof flatpickr === 'function') initInline();
        tries++;
        if (!timeRangeInput._fpInit && tries < max) setTimeout(retry, 300);
      };
      setTimeout(retry, 300);
    }
  }
  }
  // Hide the legacy button because calendar is inline
  if (timeFilterBtn) timeFilterBtn.style.display = 'none';
  if (clearDatesBtn && !clearDatesBtn._bound) {
    clearDatesBtn._bound = true;
    clearDatesBtn.addEventListener('click', () => {
      tempStartMs = NaN; tempEndMs = NaN; setTimeBtnLabel();
      try { fpRange && fpRange.clear(); } catch {}
      updateFilterSummary();
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
  if (clearFiltersBtn && !clearFiltersBtn._bound) {
    clearFiltersBtn._bound = true;
    clearFiltersBtn.addEventListener('click', async () => {
      // Reset staged and applied filters
      pendingQuery = '';
      pendingLocation = '';
      pendingCategories = [];
      tempStartMs = NaN; tempEndMs = NaN; currentSort = 'date';
      // Reset inputs
      try { if (searchInput) searchInput.value = ''; } catch {}
      try { if (locationInput) locationInput.value = ''; } catch {}
      try { fpRange && fpRange.clear(); fpPanel && fpPanel.clear(); } catch {}
      // Commit immediately to show all events
      currentCategories = [];
      timeStartMs = NaN; timeEndMs = NaN; setTimeBtnLabel();
      applySearchFilters();
      try { await loadEvents(); } catch {}
    });
  }
  if (applyFilterBtn && !applyFilterBtn._bound) {
    applyFilterBtn._bound = true;
    applyFilterBtn.addEventListener('click', async () => {
      currentSort = (sortSelect?.value || 'date');
      // Commit staged filters
      currentCategories = Array.from(pendingCategories);
      timeStartMs = tempStartMs; timeEndMs = tempEndMs;
      setTimeBtnLabel(isNaN(timeStartMs)?null:new Date(timeStartMs), isNaN(timeEndMs)?null:new Date(timeEndMs));
      applySearchFilters();
      try { await loadEvents(); } catch {}
      closePanel();
    });
  }
  // Preset ranges (works for inline calendar in accordion and modal panel)
  function setPreset(days){
    const now = new Date();
    const S = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
    let E = new Date(S);
    if (days === 'today') { E = new Date(S); }
    else { E = new Date(S.getTime() + (Number(days)||0) * 24*60*60*1000 - 1); }
    // Stage values (user must click Apply filters)
    tempStartMs = S.getTime();
    tempEndMs = E.getTime();
    setTimeBtnLabel(S, E);
    // Reflect on calendars if available
    try { fpRange && fpRange.setDate([S, E], true); } catch {}
    try { fpPanel && fpPanel.setDate([S, E], true); } catch {}
    updateFilterSummary();
    // Anchor simple calendar view to the preset's start month (prevents odd jumps)
    try {
      if (inlineCalendar && inlineCalendar._simple && typeof buildSimpleCalendar === 'function') {
        buildSimpleCalendar._month = { y: S.getFullYear(), m: S.getMonth() };
        buildSimpleCalendar(true);
      }
    } catch {}
    // Toggle active state on preset buttons
    try {
      const btns = document.querySelectorAll('.when-opt');
      btns.forEach(b => b.classList.toggle('active', String(b.dataset.range) === String(days)));
    } catch {}
  }
  const presetBtns = document.querySelectorAll('.when-opt');
  presetBtns.forEach(btn => {
    if (!btn._bound) { btn._bound = true; btn.addEventListener('click', () => { setPreset(btn.dataset.range); }); }
  });
}

// Simple inline calendar (month view) that keeps perfect 7-column alignment
function buildSimpleCalendar(onlyRefresh){
  const host = inlineCalendar; if (!host) return;
  const today = new Date();
  if (!buildSimpleCalendar._month || onlyRefresh !== true) {
    // Initialize month to today if not set
    buildSimpleCalendar._month = buildSimpleCalendar._month || { y: today.getFullYear(), m: today.getMonth() };
  }
  const state = buildSimpleCalendar._month;
  const first = new Date(state.y, state.m, 1);
  const startDow = first.getDay(); // 0..6
  const daysInMonth = new Date(state.y, state.m+1, 0).getDate();
  const prevMonthDays = new Date(state.y, state.m, 0).getDate();

  const el = document.createElement('div'); el.className='simple-cal';
  const header = document.createElement('div'); header.className='simple-cal-header';
  const prev = document.createElement('button'); prev.className='simple-cal-nav'; prev.textContent='\u276E';
  const next = document.createElement('button'); next.className='simple-cal-nav'; next.textContent='\u276F';
  const title = document.createElement('div'); title.className='simple-cal-title';
  title.textContent = new Date(state.y, state.m, 1).toLocaleString(undefined,{month:'long', year:'numeric'});
  header.appendChild(prev); header.appendChild(title); header.appendChild(next);
  const wk = document.createElement('div'); wk.className='simple-cal-weekdays';
  ;['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=>{ const s=document.createElement('div'); s.textContent=d; wk.appendChild(s); });
  const grid = document.createElement('div'); grid.className='simple-cal-grid';
  // Leading previous-month days
  for (let i=0;i<startDow;i++){
    const d = document.createElement('div'); d.className='simple-cal-day muted'; d.textContent = String(prevMonthDays-startDow+i+1);
    grid.appendChild(d);
  }
  // Current month
  for (let d=1; d<=daysInMonth; d++){
    const cell = document.createElement('div'); cell.className='simple-cal-day'; cell.textContent=String(d);
    const date = new Date(state.y, state.m, d);
    const msStart = new Date(state.y, state.m, d,0,0,0,0).getTime();
    const msEnd = new Date(state.y, state.m, d,23,59,59,999).getTime();
    if (!isNaN(tempStartMs) && isNaN(tempEndMs) && tempStartMs===msStart) cell.classList.add('selected');
    if (!isNaN(tempStartMs) && !isNaN(tempEndMs) && msStart>=tempStartMs && msEnd<=tempEndMs) cell.classList.add('range');
    cell.addEventListener('click', ()=>{
      if (isNaN(tempStartMs) || (!isNaN(tempStartMs) && !isNaN(tempEndMs))){
        tempStartMs = msStart; tempEndMs = NaN;
      } else {
        if (msEnd < tempStartMs){ tempEndMs = tempStartMs; tempStartMs = msStart; }
        else { tempEndMs = msEnd; }
      }
      setTimeBtnLabel(isNaN(tempStartMs)?null:new Date(tempStartMs), isNaN(tempEndMs)?null:new Date(tempEndMs));
      updateFilterSummary(); buildSimpleCalendar(true);
    });
    grid.appendChild(cell);
  }
  // Trailing next-month days to complete grid
  let filled = startDow + daysInMonth; const trailing = (7 - (filled % 7)) % 7;
  for (let i=1;i<=trailing;i++){ const d=document.createElement('div'); d.className='simple-cal-day muted'; d.textContent=String(i); grid.appendChild(d); }

  el.appendChild(header); el.appendChild(wk); el.appendChild(grid);
  host.innerHTML=''; host.appendChild(el);
  prev.onclick = ()=>{ if (state.m===0){ state.m=11; state.y--; } else state.m--; buildSimpleCalendar(true); };
  next.onclick = ()=>{ if (state.m===11){ state.m=0; state.y++; } else state.m++; buildSimpleCalendar(true); };
}

function setTimeBtnLabel(start, end){
  if (!timeFilterBtn) return;
  if (!start || !end || isNaN(start.getTime?.() || start) || isNaN(end.getTime?.() || end)) { timeFilterBtn.textContent = 'All Time'; return; }
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  timeFilterBtn.textContent = `${fmt(start)} – ${fmt(end)}`;
}

function updateLocationOptions(){
  const dl = document.getElementById('location-suggestions');
  const set = new Set();
  allEvents.forEach(e => { const n = String(e.locationName || '').trim(); if (n) set.add(n); });
  const values = Array.from(set).sort();
  if (dl) {
    dl.innerHTML = '';
    values.forEach(v => { const opt = document.createElement('option'); opt.value = v; dl.appendChild(opt); });
  }
  // Also render suggested chips under the input
  try {
    if (suggestedLocationsEl) {
      suggestedLocationsEl.innerHTML = '';
      values.slice(0, 10).forEach(v => {
        const chip = document.createElement('button');
        chip.type = 'button'; chip.className = 'chip'; chip.textContent = v;
        chip.addEventListener('click', () => {
          try { if (locationInput) locationInput.value = v; } catch {}
          pendingLocation = v; updateFilterSummary();
        });
        suggestedLocationsEl.appendChild(chip);
      });
    }
  } catch {}
}

// Populate clickable suggestions inside the Location sheet
function seedLocationSuggestions(){
  if (!locationSuggestionsList) return;
  const set = new Set();
  allEvents.forEach(e => { const n = String(e.locationName || '').trim(); if (n) set.add(n); });
  const values = Array.from(set).sort();
  locationSuggestionsList.innerHTML = '';
  values.slice(0, 50).forEach(v => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = v;
    chip.addEventListener('click', () => { if (locationModalInput) locationModalInput.value = v; pendingLocation = v; });
    locationSuggestionsList.appendChild(chip);
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
    tempStartMs = NaN; tempEndMs = NaN; setTimeBtnLabel();
    try { fpRange && fpRange.clear(); } catch {}
    updateFilterSummary();
    return;
  }
  tempStartMs = s.getTime(); tempEndMs = e.getTime(); setTimeBtnLabel(s,e);
  try { fpRange && fpRange.setDate([s,e], true); } catch {}
  updateFilterSummary();
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
  const today = el('cal-today'), day = el('cal-day'), week = el('cal-week'), month = el('cal-month'), allBtn = el('cal-all');
  const prev = el('cal-prev'), next = el('cal-next'), jump = el('jump-day-input');
  const pills = [today, day, week, month, allBtn].filter(Boolean);
  const setActive = (btn) => pills.forEach(b => b && b.classList.toggle('active', b===btn));
  if (today && !today._bound) { today._bound = true; today.addEventListener('click', ()=> { setActive(today); applyRange('day', new Date()); }); }
  if (day && !day._bound) { day._bound = true; day.addEventListener('click', ()=> { setActive(day); applyRange('day'); }); }
  if (week && !week._bound) { week._bound = true; week.addEventListener('click', ()=> { setActive(week); applyRange('week'); }); }
  if (month && !month._bound) { month._bound = true; month.addEventListener('click', ()=> { setActive(month); applyRange('month'); }); }
  if (allBtn && !allBtn._bound) { allBtn._bound = true; allBtn.addEventListener('click', ()=> { setActive(allBtn); applyRange('all'); }); }
  if (prev && !prev._bound) { prev._bound = true; prev.addEventListener('click', ()=> shiftRange(-1)); }
  if (next && !next._bound) { next._bound = true; next.addEventListener('click', ()=> shiftRange(1)); }
  if (jump && !jump._bound) { jump._bound = true; jump.addEventListener('change', ()=> { if (!jump.value) return; setActive(day); applyRange('day', new Date(jump.value)); }); }
}

function showExplore() {
  if (exploreView) exploreView.style.display = '';
  if (profileView) profileView.style.display = 'none';
  if (savedView) savedView.style.display = 'none';
  if (attendeeView) attendeeView.classList.remove('profile-open');
  // Give layout a tick to settle, then fix Leaflet sizing
  setTimeout(() => { try { map && map.invalidateSize(); } catch {} }, 60);
}

function showProfile() {
  if (exploreView) exploreView.style.display = 'none';
  if (profileView) profileView.style.display = '';
  if (savedView) savedView.style.display = 'none';
  if (attendeeView) attendeeView.classList.add('profile-open');
}

// notifications page removed

async function showSaved() {
  if (exploreView) exploreView.style.display = 'none';
  if (profileView) profileView.style.display = 'none';
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

// Boot app for public mode (no auth). Ensures left rail hidden, map on left, and loads week-only events.
async function bootPublicMode() {
  try {
    if (!isPublicMode()) return;
    // Ensure UI visible
    if (attendeeView) attendeeView.style.display = 'grid';
    if (leftRail) leftRail.style.display = 'none';
    try { document.body.classList.add('public-mode'); } catch {}
    // Init and wire
    initMap();
    attachFilterHandlers();
    // Always student scope in public mode
    isOrganizer = false;
    currentUid = null;
    setScope('all');
    // Load events
    await loadEvents();
    setTimeout(() => { try { map && map.invalidateSize(); } catch {} }, 50);
  } catch {}
}

// Show/hide attendee view with auth state
onAuthStateChanged(auth, (user) => {
  if (!isPublicMode()) {
    if (attendeeView) attendeeView.style.display = user ? "grid" : "none";
  }
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
        // notifications button removed
        const railSavedBtn = document.getElementById('rail-saved-btn');
        if (railSavedBtn && !railSavedBtn._bound) { railSavedBtn._bound = true; railSavedBtn.onclick = () => { showSaved(); }; }
        // Show saved button only for students
        if (railSavedBtn) railSavedBtn.style.display = isOrganizer ? 'none' : 'flex';
        // Report button visible for both students and organizers
        if (railReportBtn && !railReportBtn._bound) { railReportBtn._bound = true; railReportBtn.onclick = () => openReportModal(null); }
        if (railReportBtn) railReportBtn.style.display = 'flex';
        // Admin console button: only for DSG admin account
        try {
          if (railAdminBtn) {
            const isAdminEmail = String(user.email || '').toLowerCase() === 'kureahoshi_2026@depauw.edu';
            railAdminBtn.style.display = isAdminEmail ? 'flex' : 'none';
            if (isAdminEmail && !railAdminBtn._nav) { railAdminBtn._nav = true; railAdminBtn.onclick = () => { const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname); window.location.href = hosted ? '/admin' : 'admin.html'; }; }
          }
        } catch {}
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
  } else if (isPublicMode()) {
    // If user logs out while in public mode, keep public experience
    bootPublicMode();
  }
});

// Listen for public mode activation from app.js
try {
  document.addEventListener('public-mode', () => { bootPublicMode(); });
  // If page loads with PUBLIC_MODE already set, boot immediately
  if (isPublicMode()) { setTimeout(() => bootPublicMode(), 0); }
} catch {}

// Keep map responsive
window.addEventListener('resize', () => { try { map && map.invalidateSize(); } catch {} });
window.addEventListener('hashchange', () => {
  try { const av = document.getElementById('attendee-view'); if (!av || av.style.display==='none') return; } catch {}
  try {
    const h = String(location.hash||'').toLowerCase();
    if (h.includes('profile')) showProfile();
    else if (h.includes('saved')) showSaved();
    else showExplore();
  } catch {}
});

// notifications feed removed
async function loadNotificationsFeed(){ return; }

async function loadSavedEvents(){
  const user = auth.currentUser; if (!user) return;
  try {
    const dbi = db; // already getFirestore()
    const subs = await getDocs(collection(dbi, 'userSubscriptions', user.uid, 'events'));
    const ids = subs.docs.map(d => d.id);
    if (savedList) savedList.innerHTML = '';
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
      const openBtn = document.createElement('button'); openBtn.className='ui button tiny'; openBtn.textContent='Open'; openBtn.addEventListener('click', ()=> openEventDetailById(e.__id));
      const unsaveBtn = document.createElement('button'); unsaveBtn.className='ui button tiny btn-unsave'; unsaveBtn.textContent='Unsave';
      unsaveBtn.style.marginLeft = '8px';
      unsaveBtn.addEventListener('click', async () => {
        try {
          const ok = await openConfirm('Are you sure you want to unsave the event?', 'Unsave', 'Cancel');
          if (!ok) return;
          await unsubscribeFromEvent(e.__id);
          loadSavedEvents();
        } catch {}
      });
      const actions = document.createElement('div'); actions.style.marginLeft='auto'; actions.appendChild(openBtn); actions.appendChild(unsaveBtn);
      // If RSVP is required and user appears registered (local flag), show Unregister
      try {
        const rsvpLocal = localStorage.getItem('rsvp:'+String(e.__id)) === '1';
        if (e.rsvpRequired && rsvpLocal) {
          const unregBtn = document.createElement('button');
          unregBtn.className = 'ui button tiny';
          unregBtn.textContent = 'Unregister';
          unregBtn.style.marginLeft = '8px';
          unregBtn.addEventListener('click', async () => {
            try {
              const ok = await openConfirm('Are you sure you want to unregister?', 'Unregister', 'Keep');
              if (!ok) return;
              const user = auth.currentUser; if (!user) return;
              await deleteDoc(doc(getFirestore(), 'eventRegistrations', String(e.__id), 'users', user.uid)).catch(()=>{});
              try { localStorage.removeItem('rsvp:'+String(e.__id)); } catch {}
              // Provide quick feedback and hide the button
              unregBtn.disabled = true; unregBtn.textContent = 'Unregistered';
              // Ask whether to unsave as well if it's saved
              try {
                const key = 'interest:'+String(e.__id);
                if (localStorage.getItem(key) === '1') {
                  const also = await openConfirm('Do you also want to unsave this event?', 'Unsave', 'Keep');
                  if (also) {
                    try { await unsubscribeFromEvent(e.__id); } catch {}
                    try { localStorage.setItem(key, '0'); } catch {}
                  }
                }
              } catch {}
            } catch {}
          });
          actions.appendChild(unregBtn);
        }
      } catch {}
      card.appendChild(actions);
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

// Simple reusable confirm modal that returns a Promise<boolean>
function openConfirm(message, okLabel='OK', cancelLabel='Cancel'){
  return new Promise((resolve) => {
    try {
      const modal = document.getElementById('confirm-modal');
      const title = document.getElementById('confirm-title');
      const ok = document.getElementById('confirm-ok');
      const cancel = document.getElementById('confirm-cancel');
      const backdrop = document.getElementById('confirm-backdrop');
      if (!modal || !ok || !cancel || !title) { resolve(window.confirm(message)); return; }
      title.textContent = message || 'Are you sure?';
      ok.textContent = okLabel || 'OK';
      cancel.textContent = cancelLabel || 'Cancel';
      modal.style.display = 'block'; modal.setAttribute('aria-hidden','false');
      const cleanup = (val) => { modal.style.display='none'; modal.setAttribute('aria-hidden','true'); ok.onclick = null; cancel.onclick = null; if (backdrop) backdrop.onclick = null; resolve(val); };
      ok.onclick = () => cleanup(true);
      cancel.onclick = () => cleanup(false);
      if (backdrop) backdrop.onclick = () => cleanup(false);
    } catch { resolve(false); }
  });
}

// Ensure filters are wired even if auth boot is delayed
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { try { attachFilterHandlers(); } catch {} });
  } else { attachFilterHandlers(); }
} catch {}

async function loadSubscriptions(){
  // Notifications UI removed; no-op to avoid DOM references
}
