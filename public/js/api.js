// api.js
// Fetch helpers and API layer

const API_BASE = "/api/pins";

export async function fetchPins({ page = 1, limit = 100, mainCategory } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (mainCategory) params.set("mainCategory", mainCategory);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch pins");
  return res.json(); // { pins, page, limit, total }
}

export async function createPin(payload) {
  // payload.location.coordinates must be [lng, lat]  ✅
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to create pin");
  }
  return res.json();
}

export async function votePin(id, vote) {
  const res = await fetch(`${API_BASE}/${id}/vote`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vote }),
  });
  if (!res.ok) throw new Error("Failed to vote");
  return res.json();
}

export async function deletePin(id) {
  const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
  return res.json();
}

export async function getSummary() {
  const res = await fetch("/api/summary");
  if (!res.ok) throw new Error("Failed summary");
  return res.json();
}
