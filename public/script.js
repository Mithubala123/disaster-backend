// script.js - updated for mainCategory + subType structure

const API = "/api/pins";
const map = L.map("map").setView([20.5937, 78.9629], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: ""
}).addTo(map);

const markers = L.layerGroup().addTo(map);
let selectedCoords = null;
const alertsEl = document.getElementById("alerts");
const coordsInput = document.getElementById("coords");
const typeFilter = document.getElementById("filter-type");
const areaSummaryEl = document.getElementById("area-summary");

// Categories and subTypes
const CATEGORIES = {
  Hazard: ["Fire", "Flood", "Earthquake", "Chemical Leak", "Landslide", "Storm"],
  Impact: ["Injury", "Damage", "Power Outage", "Blocked Road"],
  Resource: ["Shelter", "Medical Aid", "Food/Water", "Rescue Team"],
  Alert: ["Evacuation", "Missing Person", "Verified Info", "Safety Tip"]
};

// Initial load
loadPins();
loadSummary();

// Map click = select coordinates
map.on("click", (e) => {
  const { lat, lng } = e.latlng;
  selectedCoords = [lat, lng]; // store as [lat, lng] from Leaflet
  coordsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  showToast("Location selected", "Tap 'Send report' or use your location.");
});

// Use geolocation
document.getElementById("use-location").addEventListener("click", () => {
  if (!navigator.geolocation)
    return showToast("No geolocation", "Your browser doesn't support geolocation.");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude,
        lng = pos.coords.longitude;
      selectedCoords = [lat, lng];
      map.setView([lat, lng], 13);
      coordsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      showToast("Using your location", "Ready to submit.");
    },
    () => showToast("Location denied", "Allow location to auto-fill coords.")
  );
});

// Filter change
typeFilter.addEventListener("change", () => loadPins(typeFilter.value));

// Submit form
document.getElementById("pin-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const mainCategory = document.getElementById("mainCategory").value;
  const subType = document.getElementById("subType").value;
  if (!mainCategory || !subType) return alert("Choose both category and subtype.");
  if (!selectedCoords) return alert("Pick a location on the map or use your location.");

  const title = document.getElementById("loc-title").value.trim();
  const file = document.getElementById("image-file").files[0];
  let imageData = null;
  if (file) imageData = await fileToDataURL(file);

  // ✅ FIX: explicitly swap to [lng, lat] before sending
  const payload = {
    mainCategory,
    subType,
    title,
    location: { type: "Point", coordinates: [selectedCoords[1], selectedCoords[0]] },
    imageData
  };

  try {
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    showToast("Report sent", "Thanks. Community will verify.");
    selectedCoords = null;
    coordsInput.value = "";
    document.getElementById("pin-form").reset();
    loadPins(typeFilter.value);
    loadSummary();
  } catch (err) {
    console.error(err);
    alert("Failed to send report.");
  }
});

// Convert file to base64
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Load pins
async function loadPins(filterType) {
  markers.clearLayers();
  alertsEl.innerHTML = `<div class="list-group-item">Loading...</div>`;
  try {
    const query = filterType ? `?mainCategory=${encodeURIComponent(filterType)}` : "";
    const res = await fetch(API + query);
    const data = await res.json();
    const pins = Array.isArray(data.pins) ? data.pins : data; // supports paged API
    renderPinsOnMap(pins);
    renderAlertsList(pins);
  } catch (err) {
    console.error("loadPins", err);
    alertsEl.innerHTML = `<div class="list-group-item">Failed to load</div>`;
  }
}

// Render map pins
function renderPinsOnMap(pins) {
  pins.forEach((pin) => {
    const [lng, lat] = pin.location.coordinates;
    const marker = L.marker([lat, lng]).addTo(markers);
    const title = pin.title || `${pin.mainCategory} - ${pin.subType}`;
    const imgHtml = pin.imageData
      ? `<div><img src="${pin.imageData}" style="max-width:150px;border-radius:6px;margin-top:6px" /></div>`
      : "";
    marker.bindPopup(
      `<b>${escapeHtml(title)}</b><br><small>${pin.mainCategory} › ${pin.subType}</small><br>Votes: ${
        pin.votes || 0
      }${imgHtml}`
    );
  });
}

// Render list of alerts
function renderAlertsList(pins) {
  alertsEl.innerHTML = "";
  if (!pins.length) {
    alertsEl.innerHTML = `<div class="list-group-item">No alerts</div>`;
    return;
  }
  pins.slice(0, 50).forEach((pin) => {
    const el = document.createElement("div");
    el.className = "list-group-item d-flex justify-content-between align-items-center";
    el.innerHTML = `
      <div>
        <strong>${escapeHtml(pin.title || pin.subType)}</strong><br>
        <small>${(pin.location.coordinates[1] || 0).toFixed(4)}, ${(pin.location.coordinates[0] || 0).toFixed(4)}</small>
      </div>
      <div class="text-end">
        <div class="mb-1"><small>Votes: ${pin.votes || 0}</small></div>
        <div>
          <button class="btn btn-sm btn-outline-success me-1" data-id="${pin._id}" data-vote="1">+1</button>
          <button class="btn btn-sm btn-outline-danger me-1" data-id="${pin._id}" data-vote="-1">-1</button>
          <button class="btn btn-sm btn-outline-secondary" data-id="${pin._id}" data-clear="true">Clear</button>
        </div>
      </div>
    `;
    alertsEl.appendChild(el);
  });
}

// Voting and clearing
alertsEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.clear) {
    if (!confirm("Mark as cleared? This removes it.")) return;
    await fetch(`${API}/${id}`, { method: "DELETE" });
    loadPins(typeFilter.value);
    loadSummary();
    return;
  }
  const vote = Number(btn.dataset.vote || 0);
  try {
    await fetch(`${API}/${id}/vote`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote })
    });
    loadPins(typeFilter.value);
    loadSummary();
  } catch (err) {
    console.error("vote", err);
  }
});

// Summary
async function loadSummary() {
  try {
    const res = await fetch("/api/summary");
    const s = await res.json();
    areaSummaryEl.innerHTML = `Active ${s.totalPins} reports · Avg votes ${s.avgVotes.toFixed(
      2
    )} · ${Object.entries(s.byMainCategory)
      .map(([k, v]) => `${k}:${v}`)
      .join(" · ")}`;
  } catch (err) {
    areaSummaryEl.innerText = "";
  }
}

// Toast helper
function showToast(title, body) {
  const container = document.getElementById("toast-area");
  const node = document.createElement("div");
  node.className = "toast align-items-center show";
  node.style.minWidth = "200px";
  node.style.background = "#fff";
  node.style.borderRadius = "6px";
  node.style.padding = "8px 12px";
  node.style.boxShadow = "0 6px 14px rgba(0,0,0,0.12)";
  node.innerHTML = `<strong style="color:#6b4423">${escapeHtml(
    title
  )}</strong><div style="font-size:0.9rem;margin-top:4px">${escapeHtml(
    body
  )}</div>`;
  container.appendChild(node);
  setTimeout(() => node.remove(), 3500);
}

// Escape HTML
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

// Populate subTypes
function updateSubTypes() {
  const main = document.getElementById("mainCategory").value;
  const subSelect = document.getElementById("subType");
  subSelect.innerHTML = "";

  if (!main) {
    subSelect.innerHTML = '<option value="">--Select a category first--</option>';
    return;
  }

  const options = CATEGORIES[main] || [];
  subSelect.innerHTML = options.map((opt) => `<option value="${opt}">${opt}</option>`).join("");
}
