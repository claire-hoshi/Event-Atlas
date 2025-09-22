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
const eventGuardMsg = document.getElementById("event-guard");
const eventForm = document.getElementById("event-form");
const eventTitleInput = document.getElementById("event-title");
const eventOrgInput = document.getElementById("event-org");
const eventCategorySelect = document.getElementById("event-category");
const eventContactInput = document.getElementById("event-contact");
const eventStartInput = document.getElementById("event-start");
const eventEndInput = document.getElementById("event-end");
const eventMaxInput = document.getElementById("event-max");
const eventImageInput = document.getElementById("event-image");
const eventDescInput = document.getElementById("event-desc");
const eventError = document.getElementById("event-error");
const eventSuccess = document.getElementById("event-success");

// Location picker elements (create-event page only)
const buildingSelect = document.getElementById('event-building');
const locationNameInput = document.getElementById('event-location-name');
const latInput = document.getElementById('event-lat');
const lngInput = document.getElementById('event-lng');

// No map for now (later we can enable a Leaflet picker)
const locationMapEl = null;

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
      if (locationNameInput && !locationNameInput.value) locationNameInput.value = name;
    });
  }
}

const setOrganizerUI = (isOrganizer) => {
  // Show the button when organizer; keep form hidden until clicked
  if (openEventFormBtn) openEventFormBtn.style.display = isOrganizer ? "inline-block" : "none";
  if (createEventTopBtn) createEventTopBtn.style.display = isOrganizer ? 'inline-flex' : 'none';
  if (railCreateBtn) railCreateBtn.style.display = isOrganizer ? 'inline-flex' : 'none';
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
});

// Open form on button click
if (openEventFormBtn) {
  openEventFormBtn.addEventListener("click", () => {
    // Navigate to dedicated page
    window.location.href = "create-event.html";
  });
}
if (createEventTopBtn) {
  createEventTopBtn.addEventListener('click', () => {
    window.location.href = 'create-event.html';
  });
}
if (railCreateBtn) {
  railCreateBtn.addEventListener('click', () => {
    window.location.href = 'create-event.html';
  });
}

// Submit handler
if (eventForm) {
  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    // Clear messages
    if (eventError) {
      eventError.style.display = "none";
      eventError.textContent = "";
    }
    if (eventSuccess) eventSuccess.style.display = "none";

    // Validate
    const title = (eventTitleInput?.value || "").trim();
    const org = (eventOrgInput?.value || "").trim();
    const category = (eventCategorySelect?.value || "").trim();
    const startISO = eventStartInput?.value;
    const endISO = eventEndInput?.value;
    if (!title || !org || !category || !startISO || !endISO) {
      if (eventError) {
        eventError.textContent = "Please fill in all required fields.";
        eventError.style.display = "block";
      }
      return;
    }
    const start = new Date(startISO);
    const end = new Date(endISO);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      if (eventError) {
        eventError.textContent = "End time must be after start time.";
        eventError.style.display = "block";
      }
      return;
    }

    const maxAttendees = eventMaxInput?.value ? Number(eventMaxInput.value) : null;
    const description = (eventDescInput?.value || "").trim();

    try {
      const user = auth.currentUser;
      const eventsCol = collection(db, "events");
      const created = await addDoc(eventsCol, {
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

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

      if (eventSuccess) eventSuccess.style.display = "block";
      // Reset most fields
      if (eventTitleInput) eventTitleInput.value = "";
      if (eventCategorySelect) eventCategorySelect.selectedIndex = 0;
      if (eventStartInput) eventStartInput.value = "";
      if (eventEndInput) eventEndInput.value = "";
      if (eventMaxInput) eventMaxInput.value = "";
      if (eventDescInput) eventDescInput.value = "";
      if (eventImageInput) eventImageInput.value = "";
    } catch (err) {
      console.log("event.js: create event failed", err);
      if (eventError) {
        eventError.textContent = err?.message || "Failed to create event.";
        eventError.style.display = "block";
      }
    }
  });
}
