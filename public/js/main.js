// main.js
// Entry point. Wires UI, map, and API. Uses optimistic UI updates to avoid refetching.

import * as API from "./api.js";
import * as Map from "./map.js";
import * as UI from "./ui.js";

let currentPins = []; // cached pins for UI
let currentPage = 1;
const PAGE_LIMIT = 100;

// init map
const map = Map.initMap((e) => {
  const { lat, lng } = e.latlng;
  selectedCoords = [lng, lat];
  coordsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  UI.showToast("Location selected", "Tap 'Send report' or use your location.");
});

// DOM refs
const alertsEl = document.getElementById("alerts");
const coordsInput = document.getElementById("coords");
const typeFilter = document.getElementById("filter-type");
const areaSummaryEl = document.getElementById("area-summary");
const loadMoreBtn = document.getElementById("load-more");

let selectedCoords = null;

// Populate subtypes on change
document.getElementById("mainCategory").addEventListener("change", (e) => {
  UI.updateSubTypes(e.target.value);
});

// geolocation
document.getElementById("use-location").addEventListener("click", () => {
  if (!navigator.geolocation) return UI.showToast("No geolocation", "Your browser doesn't support geolocation.");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      selectedCoords = [lng, lat];
      map.setView([lat, lng], 13);
      coordsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      UI.showToast("Using your location", "Ready to submit.");
    },
    () => UI.showToast("Location denied", "Allow location to auto-fill coords.")
  );
});

// submit form
document.getElementById("pin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mainCategory = document.getElementById("mainCategory").value;
  const subType = document.getElementById("subType").value;
  if (!mainCategory || !subType) return alert("Choose both category and subtype.");
  if (!selectedCoords) return alert("Pick a location on the map or use your location.");

  const title = document.getElementById("loc-title").value.trim();
  const file = document.getElementById("image-file").files[0];
  let imageData = null;
  if (file) {
    // small client-side size check
    if (file.size > 2_000_000) {
      return alert("Image too large. Max 2MB.");
    }
    imageData = await fileToDataURL(file);
  }

  const payload = {
    mainCategory,
    subType,
    title,
    location: { type: "Point", coordinates: selectedCoords },
    imageData
  };

  try {
    const created = await API.createPin(payload);
    UI.showToast("Report sent", "Thanks. Community will verify.");
    // optimistic: add to local cache and UI
    currentPins.unshift(created);
    renderPinsOnMap(currentPins);
    UI.renderAlertsList(currentPins, { onVote: handleVote, onClear: handleClear });
    selectedCoords = null;
    coordsInput.value = "";
    document.getElementById("pin-form").reset();
    loadSummary(); // small extra fetch
  } catch (err) {
    console.error(err);
    alert("Failed to send report: " + err.message);
  }
});

// file to base64
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// load pins (paginated)
async function loadPins(reset = false) {
  try {
    if (reset) { currentPage = 1; currentPins = []; Map.clearMarkers(); }
    const filter = typeFilter.value || undefined;
    const data = await API.fetchPins({ page: currentPage, limit: PAGE_LIMIT, mainCategory: filter });
    // data: { pins, page, limit, total }
    if (currentPage === 1) currentPins = data.pins;
    else currentPins = currentPins.concat(data.pins);
    renderPinsOnMap(currentPins);
    UI.renderAlertsList(currentPins, { onVote: handleVote, onClear: handleClear });
    // hide load more if no more
    const reachedEnd = currentPins.length >= data.total;
    loadMoreBtn.style.display = reachedEnd ? "none" : "block";
  } catch (err) {
    console.error("loadPins", err);
    const alertsEl = document.getElementById("alerts");
    alertsEl.innerHTML = `<div class="list-group-item">Failed to load</div>`;
  }
}

// render on map
function renderPinsOnMap(pins) {
  Map.clearMarkers();
  pins.forEach((pin) => {
    const title = pin.title || `${pin.mainCategory} - ${pin.subType}`;
    const imgHtml = pin.imageData ? `<div><img src="${pin.imageData}" style="max-width:150px;border-radius:6px;margin-top:6px" /></div>` : "";
    const popup = `<b>${UI.escapeHtml(title)}</b><br><small>${UI.escapeHtml(pin.mainCategory)} › ${UI.escapeHtml(pin.subType)}</small><br>Votes: ${pin.votes || 0}${imgHtml}`;
    Map.addMarker(pin, popup);
  });
}

// voting
async function handleVote(id, vote) {
  try {
    // optimistic UI update: update local cache
    const idx = currentPins.findIndex(p => String(p._id) === String(id));
    if (idx !== -1) {
      currentPins[idx].votes = (currentPins[idx].votes || 0) + vote;
      UI.updateVoteInList(id, currentPins[idx].votes);
    }
    // send to server
    const updated = await API.votePin(id, vote);
    // reconcile in case server value differs
    if (idx !== -1) {
      currentPins[idx] = updated;
      UI.updateVoteInList(id, updated.votes);
    }
  } catch (err) {
    console.error("vote", err);
    UI.showToast("Vote failed", err.message || "Server error");
    // optional: reload pins to reconcile
    loadPins(true);
  }
}

// clear (delete)
async function handleClear(id) {
  try {
    await API.deletePin(id);
    // remove from local cache and UI
    currentPins = currentPins.filter(p => String(p._id) !== String(id));
    UI.renderAlertsList(currentPins, { onVote: handleVote, onClear: handleClear });
    renderPinsOnMap(currentPins);
    loadSummary();
  } catch (err) {
    console.error("clear", err);
    UI.showToast("Delete failed", err.message || "Server error");
  }
}

// summary
async function loadSummary() {
  try {
    const s = await API.getSummary();
    areaSummaryEl.innerHTML = `Active ${s.totalPins} reports · Avg votes ${s.avgVotes.toFixed(2)} · ${Object.entries(s.byMainCategory).map(([k,v])=>`${k}:${v}`).join(" · ")}`;
  } catch (err) {
    areaSummaryEl.innerText = "";
  }
}

// load more pagination
loadMoreBtn.addEventListener("click", () => {
  currentPage++;
  loadPins();
});

// filter change
typeFilter.addEventListener("change", () => {
  loadPins(true);
  loadSummary();
});

// initial load
loadPins(true);
loadSummary();
