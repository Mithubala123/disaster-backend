// ui.js
// DOM rendering, toasts, and small helpers

export const CATEGORIES = {
  Hazard: ["Fire", "Flood", "Earthquake", "Chemical Leak", "Landslide", "Storm"],
  Impact: ["Injury", "Damage", "Power Outage", "Blocked Road"],
  Resource: ["Shelter", "Medical Aid", "Food/Water", "Rescue Team"],
  Alert: ["Evacuation", "Missing Person", "Verified Info", "Safety Tip"]
};

export function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

export function showToast(title, body, timeout = 3500) {
  const container = document.getElementById("toast-area");
  if (!container) return;
  const node = document.createElement("div");
  node.className = "toast align-items-center show";
  node.style.minWidth = "200px";
  node.style.background = "#fff";
  node.style.borderRadius = "6px";
  node.style.padding = "8px 12px";
  node.style.boxShadow = "0 6px 14px rgba(0,0,0,0.12)";
  node.innerHTML = `<strong style="color:#6b4423">${escapeHtml(title)}</strong><div style="font-size:0.9rem;margin-top:4px">${escapeHtml(body)}</div>`;
  container.appendChild(node);
  setTimeout(() => node.remove(), timeout);
}

// Renders alerts list. Expects 'pins' array and user callbacks.
export function renderAlertsList(pins, { onVote, onClear } = {}) {
  const alertsEl = document.getElementById("alerts");
  alertsEl.innerHTML = "";
  if (!pins || !pins.length) {
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
        <div class="mb-1"><small>Votes: <span data-id="${pin._id}" class="vote-count">${pin.votes || 0}</span></small></div>
        <div>
          <button class="btn btn-sm btn-outline-success me-1" data-id="${pin._id}" data-vote="1">+1</button>
          <button class="btn btn-sm btn-outline-danger me-1" data-id="${pin._id}" data-vote="-1">-1</button>
          <button class="btn btn-sm btn-outline-secondary" data-id="${pin._id}" data-clear="true">Clear</button>
        </div>
      </div>
    `;
    alertsEl.appendChild(el);
  });

  // delegated events
  alertsEl.onclick = (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.clear) {
      if (!confirm("Mark as cleared? This removes it.")) return;
      if (typeof onClear === "function") onClear(id);
      return;
    }
    const vote = Number(btn.dataset.vote || 0);
    if (typeof onVote === "function") onVote(id, vote);
  };
}

export function updateVoteInList(id, newVotes) {
  const el = document.querySelector(`.vote-count[data-id="${id}"]`);
  if (el) el.textContent = String(newVotes);
}

// Fill subtypes select
export function updateSubTypes(main) {
  const subSelect = document.getElementById("subType");
  subSelect.innerHTML = "";
  if (!main) {
    subSelect.innerHTML = '<option value="">--Select a category first--</option>';
    return;
  }
  const options = CATEGORIES[main] || [];
  subSelect.innerHTML = options.map((opt) => `<option value="${opt}">${opt}</option>`).join("");
}
