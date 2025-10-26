import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const auth = getAuth();
const db = getFirestore();
const storage = getStorage();

// Event form elements
const eventFormTitle = document.getElementById("event-form-title");
const eventFormSection = document.getElementById("event-form-section");
const openEventFormBtn = document.getElementById("open-event-form-btn");
const createEventTopBtn = document.getElementById('create-event-btn');
const railCreateBtn = document.getElementById('rail-create-btn');
const railHomeBtn = document.getElementById('rail-home-btn');
const railProfileBtn = document.getElementById('rail-profile-btn');
const railDraftsBtn = document.getElementById('rail-drafts-btn');
const openDraftsBtn = document.getElementById('open-drafts-btn');
const eventGuardMsg = document.getElementById("event-guard");
const eventForm = document.getElementById("event-form");
const eventTitleInput = document.getElementById("event-title");
const eventOrgInput = document.getElementById("event-org");
const eventCategorySelect = document.getElementById("event-category");
const eventContactInput = document.getElementById("event-contact");
const eventStartInput = document.getElementById("event-start");
const eventEndInput = document.getElementById("event-end");
const eventStartIsoHidden = document.getElementById('event-start-iso');
const eventEndIsoHidden = document.getElementById('event-end-iso');
const startIcon = document.getElementById('event-start-icon');
const endIcon = document.getElementById('event-end-icon');
const eventMaxInput = document.getElementById("event-max");
const eventImageInput = document.getElementById("event-image");
const eventDescInput = document.getElementById("event-desc");
const eventError = document.getElementById("event-error");
const eventSuccess = document.getElementById("event-success");
const saveDraftBtn = document.getElementById('event-save-draft');
const saveChangesBtn = document.getElementById('event-save-changes');
// Confirm leave modal elements
const confirmModal = document.getElementById('confirm-leave-modal');
const confirmBackdrop = document.getElementById('confirm-leave-backdrop');
const confirmDiscard = document.getElementById('confirm-discard');
const confirmSave = document.getElementById('confirm-save');
let pendingNavigateTo = null;
let currentDraftId = null;
let currentEventId = null;
let isDirty = false;

// Location picker elements (create-event page only)
const buildingSelect = document.getElementById('event-building');
const locationNameInput = document.getElementById('event-location-name');
const latInput = document.getElementById('event-lat');
const lngInput = document.getElementById('event-lng');
const locationMapEl = document.getElementById('location-map');
const coordsReadout = document.getElementById('coords-readout');

// Limited campus locations for selection (refined)
const BUILDINGS = [
  { name: 'Union Building', lat: 39.63941, lng: -86.86116 },
  { name: 'Roy O. West Library', lat: 39.64088, lng: -86.86370 },
  { name: 'Center of Diversity and Inclusion', lat: 39.6392213, lng: -86.8650929 },
  { name: 'East College', lat: 39.6403672, lng: -86.861659 },
  { name: 'Harrison Hall', lat: 39.64050, lng: -86.86310}
];


function setLocation(lat, lng, nameFromPick) {
  if (latInput) latInput.value = (typeof lat === 'number') ? lat.toFixed(6) : '';
  if (lngInput) lngInput.value = (typeof lng === 'number') ? lng.toFixed(6) : '';
  if (nameFromPick && locationNameInput && !locationNameInput.value) {
    locationNameInput.value = nameFromPick;
  }
  // Map interactions disabled for now
}

// Leaflet map state (create-event page)
let locMap = null;
let locMarker = null;

function syncCoordsReadout() {
  const la = latInput?.value || '';
  const lo = lngInput?.value || '';
  if (coordsReadout) {
    if (la && lo) coordsReadout.textContent = `Selected location: ${la}, ${lo}`;
    else coordsReadout.textContent = 'Click the map to drop a pin.';
  }
}

function placeOrMoveMarker(lat, lng) {
  if (!locMap || typeof L === 'undefined') return;
  const ll = [lat, lng];
  if (!locMarker) {
    locMarker = L.marker(ll, { draggable: true }).addTo(locMap);
    locMarker.on('dragend', () => {
      const p = locMarker.getLatLng();
      setLocation(p.lat, p.lng);
      syncCoordsReadout();
    });
  } else {
    locMarker.setLatLng(ll);
  }
  setLocation(lat, lng);
  syncCoordsReadout();
}

function initLocationPicker() {
  // Populate building dropdown (always, even without map)
  if (buildingSelect && buildingSelect.options.length <= 1) {
    BUILDINGS.forEach(b => {
      const opt = document.createElement('option');
      opt.value = `${b.lat},${b.lng}`;
      opt.textContent = b.name;
      opt.dataset.name = b.name;
      buildingSelect.appendChild(opt);
    });
  }

  if (buildingSelect) {
    buildingSelect.addEventListener('change', () => {
      const v = buildingSelect.value;
      if (!v) return;
      const [latStr, lngStr] = v.split(',');
      const lat = parseFloat(latStr), lng = parseFloat(lngStr);
      const name = buildingSelect.options[buildingSelect.selectedIndex].dataset.name || '';
      setLocation(lat, lng, name);
      try { if (locMap) { placeOrMoveMarker(lat, lng); locMap.setView([lat, lng], Math.max(locMap.getZoom() || 15, 16)); } } catch {}
      if (locationNameInput && !locationNameInput.value) locationNameInput.value = name;
    });
  }

  // Initialize Leaflet map if container exists
  if (locationMapEl && typeof L !== 'undefined' && !locMap) {
    try {
      const center = [39.6404, -86.8611]; // DePauw approx
      locMap = L.map(locationMapEl, { zoomControl: true }).setView(center, 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(locMap);

      // Existing lat/lng? Show marker
      if (latInput?.value && lngInput?.value) {
        const lat = Number(latInput.value), lng = Number(lngInput.value);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          placeOrMoveMarker(lat, lng);
          locMap.setView([lat, lng], 17);
        }
      }

      // Click to drop/move pin
      locMap.on('click', (ev) => {
        const { lat, lng } = ev.latlng;
        placeOrMoveMarker(lat, lng);
      });

      // Adjust map if the container becomes visible later
      setTimeout(() => { try { locMap.invalidateSize(); } catch {} }, 60);
    } catch {}
  }
}

// Enhanced date-time pickers using Flatpickr
let startPicker = null;
let endPicker = null;
function initDateTimePickers() {
  try {
    if (!window.flatpickr) return; // wait until script loaded
    if (startPicker || endPicker) return; // prevent double init

    if (eventStartInput) {
      try { eventStartInput.type = 'text'; } catch {}
      startPicker = window.flatpickr(eventStartInput, {
        enableTime: true,
        minuteIncrement: 5,
        altInput: true,
        altInputClass: 'site-alt-input',
        altFormat: 'M j, Y h:i K',
        dateFormat: 'Z', // we will store ISO via onChange
        onChange: (selectedDates) => {
          const d = selectedDates && selectedDates[0];
          if (d && eventStartIsoHidden) eventStartIsoHidden.value = d.toISOString();
          if (endPicker && d) endPicker.set('minDate', d);
        },
      });
    }

    if (eventEndInput) {
      try { eventEndInput.type = 'text'; } catch {}
      endPicker = window.flatpickr(eventEndInput, {
        enableTime: true,
        minuteIncrement: 5,
        altInput: true,
        altInputClass: 'site-alt-input',
        altFormat: 'M j, Y h:i K',
        dateFormat: 'Z',
        onChange: (selectedDates) => {
          const d = selectedDates && selectedDates[0];
          if (d && eventEndIsoHidden) eventEndIsoHidden.value = d.toISOString();
        },
      });
    }
  } catch {}
}

// If Flatpickr isn't available, fall back to native datetime-local
function initDateTimeFallback() {
  if (window.flatpickr) return; // picker present
  if (eventStartInput && eventStartInput.type !== 'datetime-local') {
    try { eventStartInput.type = 'datetime-local'; eventStartInput.step = 300; } catch {}
  }
  if (eventEndInput && eventEndInput.type !== 'datetime-local') {
    try { eventEndInput.type = 'datetime-local'; eventEndInput.step = 300; } catch {}
  }
}

const setOrganizerUI = (isOrganizer) => {
  // Show the button when organizer; keep form hidden until clicked
  if (openEventFormBtn) openEventFormBtn.style.display = isOrganizer ? "inline-block" : "none";
  if (createEventTopBtn) createEventTopBtn.style.display = isOrganizer ? 'inline-flex' : 'none';
  if (railCreateBtn) railCreateBtn.style.display = isOrganizer ? 'inline-flex' : 'none';
  if (railDraftsBtn) railDraftsBtn.style.display = isOrganizer ? 'inline-flex' : 'none';
  if (openDraftsBtn) openDraftsBtn.style.display = isOrganizer ? 'inline-block' : 'none';
  if (!isOrganizer) {
    if (eventFormTitle) eventFormTitle.style.display = "none";
    if (eventFormSection) eventFormSection.style.display = "none";
    if (eventGuardMsg) eventGuardMsg.style.display = "block";
  }
};

// Auth state: decide visibility and prefill contact email
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setOrganizerUI(false);
    return;
  }
  try {
    // Prefer secure role from custom claims; fall back to Firestore doc if needed
    let claimsRole = '';
    try {
      const token = await user.getIdTokenResult(true);
      claimsRole = String(token.claims?.role || '').toLowerCase();
    } catch {}

    let isOrganizer = claimsRole === 'organization' || claimsRole === 'organizer' || claimsRole === 'org';
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!isOrganizer) {
      const docRole = (userDoc.data()?.role || "").toLowerCase();
      isOrganizer = docRole === "organization" || docRole === "organizer" || docRole === "org";
    }
    setOrganizerUI(isOrganizer);
    if (isOrganizer) {
      if (eventContactInput) eventContactInput.value = user.email || "";
      // Prefill organization name from user doc if available
      const orgName = String(userDoc.data()?.name || '').trim();
      if (orgName && eventOrgInput && !eventOrgInput.value) eventOrgInput.value = orgName;
    }
  } catch (e) {
    console.log("event.js: failed to read user role", e);
    setOrganizerUI(false);
  }
  // Initialize location picker after auth check (page may not have map)
  try { initLocationPicker(); } catch {}
  try { initDateTimePickers(); } catch {}
  try { initDateTimeFallback(); } catch {}
  try { await loadDraftFromQuery(); } catch {}
  try { await loadEventFromQuery(); } catch {}
  if (currentEventId) {
    if (saveChangesBtn) saveChangesBtn.style.display = 'inline-block';
    const discardBtn = document.getElementById('event-discard'); if (discardBtn) discardBtn.style.display = 'inline-block';
    const publishBtn = document.getElementById('event-submit'); if (publishBtn) publishBtn.style.display = 'none';
    if (saveDraftBtn) saveDraftBtn.style.display = 'none';
  }

  // Icon clicks open the pickers (or focus the input in fallback)
  try {
    if (startIcon) startIcon.addEventListener('click', () => {
      if (startPicker && typeof startPicker.open === 'function') startPicker.open();
      else if (eventStartInput) eventStartInput.focus();
    });
    if (endIcon) endIcon.addEventListener('click', () => {
      if (endPicker && typeof endPicker.open === 'function') endPicker.open();
      else if (eventEndInput) eventEndInput.focus();
    });
  } catch {}
});

// Also initialize pickers regardless of auth state so the calendar always appears
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try { initDateTimePickers(); } catch {}
      try { initDateTimeFallback(); } catch {}
    });
  } else {
    try { initDateTimePickers(); } catch {}
    try { initDateTimeFallback(); } catch {}
  }
  // Retry once when window fully loaded in case CDN was slow
  window.addEventListener('load', () => { try { initDateTimePickers(); } catch {} });
} catch {}

// Open form on button click
if (openEventFormBtn) {
  openEventFormBtn.addEventListener("click", () => {
    const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
    window.location.href = hosted ? '/create-event' : 'create-event.html';
  });
}
if (createEventTopBtn) {
  createEventTopBtn.addEventListener('click', () => {
    const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
    window.location.href = hosted ? '/create-event' : 'create-event.html';
  });
}
if (railCreateBtn) {
  railCreateBtn.addEventListener('click', () => {
    const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
    guardNavigate(hosted ? '/create-event' : 'create-event.html');
  });
}
if (railHomeBtn) {
  railHomeBtn.addEventListener('click', () => {
    const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
    guardNavigate(hosted ? '/' : 'index.html');
  });
}
if (railProfileBtn) {
  railProfileBtn.addEventListener('click', () => {
    const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
    guardNavigate(hosted ? '/#profile' : 'index.html#profile');
  });
}
if (railDraftsBtn) {
  railDraftsBtn.addEventListener('click', () => {
    const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
    guardNavigate(hosted ? '/drafts' : 'drafts.html');
  });
}
if (openDraftsBtn) {
  openDraftsBtn.addEventListener('click', () => {
    const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
    guardNavigate(hosted ? '/drafts' : 'drafts.html');
  });
}

async function loadDraftFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const draftId = params.get('draft');
  if (!draftId) return;
  currentDraftId = draftId;
  try {
    const snap = await getDoc(doc(db, 'eventDrafts', draftId));
    if (!snap.exists()) return;
    const d = snap.data();
    if (eventTitleInput) eventTitleInput.value = d.title || '';
    if (eventOrgInput) eventOrgInput.value = d.organization || '';
    if (eventCategorySelect) eventCategorySelect.value = d.category || '';
    if (eventContactInput) eventContactInput.value = d.contactEmail || '';
    if (eventDescInput) eventDescInput.value = d.description || '';
    if (locationNameInput) locationNameInput.value = d.locationName || '';
    if (typeof d.lat === 'number' && typeof d.lng === 'number') {
      setLocation(d.lat, d.lng);
      try { placeOrMoveMarker(d.lat, d.lng); } catch {}
    }
    if (d.startTime) {
      const s = new Date(d.startTime);
      if (startPicker) { startPicker.setDate(s, true); }
      if (eventStartIsoHidden) eventStartIsoHidden.value = s.toISOString();
      if (eventStartInput && !startPicker) eventStartInput.value = s.toISOString().slice(0,16);
    }
    if (d.endTime) {
      const e = new Date(d.endTime);
      if (endPicker) { endPicker.setDate(e, true); }
      if (eventEndIsoHidden) eventEndIsoHidden.value = e.toISOString();
      if (eventEndInput && !endPicker) eventEndInput.value = e.toISOString().slice(0,16);
    }
  } catch {}
}
// Load published event for editing via ?event=ID
async function loadEventFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('event');
  if (!eventId) return;
  currentEventId = eventId;
  try {
    const snap = await getDoc(doc(db, 'events', eventId));
    if (!snap.exists()) return;
    const d = snap.data();
    if (eventTitleInput) eventTitleInput.value = d.title || '';
    if (eventOrgInput) eventOrgInput.value = d.organization || '';
    if (eventCategorySelect) eventCategorySelect.value = d.category || '';
    if (eventContactInput) eventContactInput.value = d.contactEmail || '';
    if (eventDescInput) eventDescInput.value = d.description || '';
    if (locationNameInput) locationNameInput.value = d.locationName || '';
    if (typeof d.lat === 'number' && typeof d.lng === 'number') {
      setLocation(d.lat, d.lng);
      try { placeOrMoveMarker(d.lat, d.lng); } catch {}
    }
    if (d.startTime) {
      const s = new Date(d.startTime);
      if (startPicker) { startPicker.setDate(s, true); }
      if (eventStartIsoHidden) eventStartIsoHidden.value = s.toISOString();
      if (eventStartInput && !startPicker) eventStartInput.value = s.toISOString().slice(0,16);
    }
    if (d.endTime) {
      const e = new Date(d.endTime);
      if (endPicker) { endPicker.setDate(e, true); }
      if (eventEndIsoHidden) eventEndIsoHidden.value = e.toISOString();
      if (eventEndInput && !endPicker) eventEndInput.value = e.toISOString().slice(0,16);
    }
  } catch {}
}

// Mark form dirty on changes
try {
  const markDirty = () => { isDirty = true; };
  [eventTitleInput, eventOrgInput, eventCategorySelect, eventContactInput, eventStartInput, eventEndInput, locationNameInput, eventDescInput]
    .forEach(el => { if (el && !el._dirtyBound) { el._dirtyBound = true; el.addEventListener('input', markDirty); el.addEventListener('change', markDirty); }});
} catch {}

// Save Changes button triggers form submission for updates
if (saveChangesBtn) {
  saveChangesBtn.addEventListener('click', () => { if (eventForm) eventForm.requestSubmit(); });
}

// Discard button: revert fields to last saved values
const discardBtnRef = document.getElementById('event-discard');
if (discardBtnRef) {
  discardBtnRef.addEventListener('click', async () => {
    if (!currentEventId) return;
    try {
      const snap = await getDoc(doc(db, 'events', currentEventId));
      if (!snap.exists()) return;
      const d = snap.data();
      if (eventTitleInput) eventTitleInput.value = d.title || '';
      if (eventOrgInput) eventOrgInput.value = d.organization || '';
      if (eventCategorySelect) eventCategorySelect.value = d.category || '';
      if (eventContactInput) eventContactInput.value = d.contactEmail || '';
      if (eventDescInput) eventDescInput.value = d.description || '';
      if (locationNameInput) locationNameInput.value = d.locationName || '';
      if (typeof d.lat === 'number' && typeof d.lng === 'number') { setLocation(d.lat, d.lng); try { placeOrMoveMarker(d.lat, d.lng); } catch {} }
      if (d.startTime) { const s = new Date(d.startTime); if (startPicker) startPicker.setDate(s, true); if (eventStartIsoHidden) eventStartIsoHidden.value = s.toISOString(); if (eventStartInput && !startPicker) eventStartInput.value = s.toISOString().slice(0,16); }
      if (d.endTime) { const e = new Date(d.endTime); if (endPicker) endPicker.setDate(e, true); if (eventEndIsoHidden) eventEndIsoHidden.value = e.toISOString(); if (eventEndInput && !endPicker) eventEndInput.value = e.toISOString().slice(0,16); }
      isDirty = false;
      if (eventSuccess) { eventSuccess.textContent = 'Changes discarded.'; eventSuccess.style.display = 'block'; }
    } catch {}
  });
}

// Warn before closing tab if unsaved
window.addEventListener('beforeunload', (e) => { if (isDirty) { e.preventDefault(); e.returnValue=''; } });

function openConfirm(toUrl){
  pendingNavigateTo = toUrl;
  if (!confirmModal) { if (toUrl) window.location.href = toUrl; return; }
  confirmModal.style.display = 'block'; confirmModal.setAttribute('aria-hidden','false');
}
function closeConfirm(){ if (!confirmModal) return; confirmModal.style.display = 'none'; confirmModal.setAttribute('aria-hidden','true'); }

if (confirmBackdrop && !confirmBackdrop._bound) { confirmBackdrop._bound = true; confirmBackdrop.addEventListener('click', closeConfirm); }
if (confirmDiscard && !confirmDiscard._bound) { confirmDiscard._bound = true; confirmDiscard.addEventListener('click', () => { isDirty=false; const url=pendingNavigateTo; closeConfirm(); if (url) window.location.href=url; }); }
if (confirmSave && !confirmSave._bound) { confirmSave._bound = true; confirmSave.addEventListener('click', () => { closeConfirm(); if (eventForm) eventForm.requestSubmit(); }); }

function guardNavigate(url){ if (!isDirty) { window.location.href = url; } else { openConfirm(url); } }

function clearFieldError(el) {
  if (!el) return;
  try { el.classList.remove('invalid'); } catch {}
  const next = el.nextElementSibling;
  if (next && next.classList && next.classList.contains('field-error')) {
    next.remove();
  }
}

function setFieldError(el, message) {
  if (!el) return;
  clearFieldError(el);
  try { el.classList.add('invalid'); } catch {}
  const msg = document.createElement('div');
  msg.className = 'field-error';
  msg.innerHTML = `<i class="exclamation triangle icon"></i>${message}`;
  el.insertAdjacentElement('afterend', msg);
}

function clearAllFieldErrors() {
  try {
    eventForm.querySelectorAll('.field-error').forEach(n => n.remove());
    [eventTitleInput, eventOrgInput, eventCategorySelect, eventContactInput, eventStartInput, eventEndInput, locationNameInput]
      .forEach(el => el && el.classList.remove('invalid'));
  } catch {}
}

function setGlobalError(message) {
  if (!eventError) return;
  eventError.innerHTML = `<i class="exclamation triangle icon"></i>${message}`;
  eventError.style.display = 'block';
}

// Submit handler
if (eventForm) {
  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    // Clear messages
    if (eventError) { eventError.style.display = 'none'; eventError.textContent = ''; eventError.innerHTML = ''; }
    if (eventSuccess) eventSuccess.style.display = "none";
    clearAllFieldErrors();

    // Clear any prior programmatic invalid markers
    try {
      [eventStartInput, eventEndInput].forEach(el => el && el.classList.remove('invalid'));
    } catch {}

    // Validate
    const title = (eventTitleInput?.value || "").trim();
    const org = (eventOrgInput?.value || "").trim();
    const category = (eventCategorySelect?.value || "").trim();
    const startISO = (eventStartIsoHidden?.value || eventStartInput?.value || '').trim();
    const endISO = (eventEndIsoHidden?.value || eventEndInput?.value || '').trim();
    const locationName = (locationNameInput?.value || '').trim();
    let hasMissing = false;
    if (!title) { setFieldError(eventTitleInput, 'Please provide a title'); hasMissing = true; }
    if (!org) { setFieldError(eventOrgInput, 'Please provide an organization'); hasMissing = true; }
    if (!category) { setFieldError(eventCategorySelect, 'Please select a category'); hasMissing = true; }
    const contactVal = (eventContactInput?.value || '').trim();
    if (!contactVal) { setFieldError(eventContactInput, 'Please provide a contact email'); hasMissing = true; }
    else if (eventContactInput && !eventContactInput.checkValidity()) { setFieldError(eventContactInput, 'Please provide a properly formatted email address'); hasMissing = true; }
    if (!startISO) { setFieldError(eventStartInput, 'Please provide a start date and time'); hasMissing = true; }
    if (!endISO) { setFieldError(eventEndInput, 'Please provide an end date and time'); hasMissing = true; }
    if (!locationName) { setFieldError(locationNameInput, 'Please provide a location name'); hasMissing = true; }
    if (hasMissing) {
      setGlobalError('There are items that need to be filled in.');
      const firstError = eventForm.querySelector('.field-error');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const start = startISO ? new Date(startISO) : new Date(NaN);
    const end = endISO ? new Date(endISO) : new Date(NaN);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      setGlobalError('End time must be after start time.');
      setFieldError(eventEndInput, 'End time must be after start time');
      return;
    }

    const maxAttendees = eventMaxInput?.value ? Number(eventMaxInput.value) : null;
    const description = (eventDescInput?.value || "").trim();

    try {
      const user = auth.currentUser;
      const payload = {
        title,
        organization: org,
        category,
        contactEmail: eventContactInput?.value || user.email || "",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        maxAttendees: maxAttendees || null,
        description,
        // Location fields (optional)
        locationName: (locationNameInput?.value || '').trim() || null,
        lat: latInput?.value ? Number(latInput.value) : null,
        lng: lngInput?.value ? Number(lngInput.value) : null,
        organizerUid: user.uid,
        organizerEmail: user.email || "",
        status: 'published',
        published: true,
        updatedAt: serverTimestamp(),
      };
      let created = null;
      if (currentEventId) {
        await updateDoc(doc(db, 'events', currentEventId), payload);
        created = { id: currentEventId };
      } else {
        const eventsCol = collection(db, 'events');
        created = await addDoc(eventsCol, { ...payload, createdAt: serverTimestamp() });
      }

      // Optional image
      const file = eventImageInput?.files && eventImageInput.files[0];
      if (file) {
        const isImage = file.type.startsWith("image/");
        const isSmall = file.size <= 4 * 1024 * 1024;
        if (!isImage || !isSmall) {
          throw new Error("Please upload a valid image up to 4MB.");
        }
        const path = `eventImages/${created.id}/${file.name}`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, file, { contentType: file.type });
        const url = await getDownloadURL(ref);
        await updateDoc(doc(db, "events", created.id), {
          imageURL: url,
          updatedAt: serverTimestamp(),
        });
      }

      if (eventSuccess) {
        eventSuccess.textContent = currentEventId ? 'Event updated!' : 'Event published!';
        eventSuccess.style.display = 'block';
      }
      isDirty = false;
      // Reset most fields only when creating new
      if (!currentEventId) {
        if (eventTitleInput) eventTitleInput.value = '';
        if (eventCategorySelect) eventCategorySelect.selectedIndex = 0;
        if (eventStartInput) eventStartInput.value = '';
        if (eventEndInput) eventEndInput.value = '';
        if (eventMaxInput) eventMaxInput.value = '';
        if (eventDescInput) eventDescInput.value = '';
        if (eventImageInput) eventImageInput.value = '';
      }
    } catch (err) {
      console.log("event.js: create event failed", err);
      setGlobalError(err?.message || 'Failed to create event.');
    }
  });
}

// Save Draft handler (stores to separate collection to keep drafts non-public)
if (saveDraftBtn) {
  saveDraftBtn.addEventListener('click', async () => {
    if (!auth.currentUser) return;

    // Clear messages
    if (eventError) { eventError.style.display = 'none'; eventError.textContent = ''; eventError.innerHTML = ''; }
    if (eventSuccess) eventSuccess.style.display = 'none';
    clearAllFieldErrors();

    // Drafts: only require a title; other fields optional
    const title = (eventTitleInput?.value || '').trim();
    if (!title) {
      setGlobalError('You will need to provide an event title to save a draft.');
      setFieldError(eventTitleInput, 'Please provide a title');
      return;
    }
    const org = (eventOrgInput?.value || '').trim() || null;
    const category = (eventCategorySelect?.value || '').trim() || null;
    const startISO = (eventStartIsoHidden?.value || eventStartInput?.value || '').trim() || null;
    const endISO = (eventEndIsoHidden?.value || eventEndInput?.value || '').trim() || null;
    const maxAttendees = eventMaxInput?.value ? Number(eventMaxInput.value) : null;
    const description = (eventDescInput?.value || '').trim() || null;
    const locName = (locationNameInput?.value || '').trim() || null;
    
    try {
      const user = auth.currentUser;
      const draftCol = collection(db, 'eventDrafts');
      const payload = {
        title,
        organization: org,
        category,
        contactEmail: (eventContactInput?.value || user.email || '') || '',
        startTime: startISO,
        endTime: endISO,
        maxAttendees: maxAttendees || null,
        description: description || null,
        locationName: locName,
        lat: latInput?.value ? Number(latInput.value) : null,
        lng: lngInput?.value ? Number(lngInput.value) : null,
        organizerUid: user.uid,
        organizerEmail: user.email || '',
        status: 'draft',
        published: false,
        updatedAt: serverTimestamp(),
      };
      let created = { id: currentDraftId };
      if (currentDraftId) {
        await updateDoc(doc(db, 'eventDrafts', currentDraftId), payload);
      } else {
        created = await addDoc(draftCol, { ...payload, createdAt: serverTimestamp() });
        currentDraftId = created.id;
      }

      // Optional image upload for draft
      const file = eventImageInput?.files && eventImageInput.files[0];
      if (file) {
        const isImage = file.type.startsWith('image/');
        const isSmall = file.size <= 4 * 1024 * 1024;
        if (!isImage || !isSmall) {
          throw new Error('Please upload a valid image up to 4MB.');
        }
        const path = `draftImages/${created.id}/${file.name}`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, file, { contentType: file.type });
        const url = await getDownloadURL(ref);
        await updateDoc(doc(db, 'eventDrafts', created.id), {
          imageURL: url,
          updatedAt: serverTimestamp(),
        });
      }

      if (eventSuccess) {
        eventSuccess.textContent = 'Draft saved!';
        eventSuccess.style.display = 'block';
      }
    } catch (err) {
      console.log('event.js: save draft failed', err);
      setGlobalError(err?.message || 'Failed to save draft.');
    }
  });
}
