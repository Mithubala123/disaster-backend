// map.js
// Map initialization and simple marker management
let map;
let markersLayer;

export function initMap(onClickCb) {
  // Wait for Leaflet to be loaded globally
  map = L.map("map").setView([20.5937, 78.9629], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: ""
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  if (typeof onClickCb === "function") {
    map.on("click", (e) => {
      onClickCb(e);
    });
  }
  return map;
}

export function clearMarkers() {
  markersLayer.clearLayers();
}

export function addMarker(pin, popupHtml) {
  const [lng, lat] = pin.location.coordinates;
  const marker = L.marker([lat, lng]);
  if (popupHtml) marker.bindPopup(popupHtml);
  marker.addTo(markersLayer);
  return marker;
}

export function fitToPins(pins) {
  if (!pins || !pins.length) return;
  const latlngs = pins.map(p => [p.location.coordinates[1], p.location.coordinates[0]]);
  const bounds = L.latLngBounds(latlngs);
  if (map) map.fitBounds(bounds.pad(0.2));
}
