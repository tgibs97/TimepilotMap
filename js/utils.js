// Small pure helpers used by multiple modules.
export function createSvgElement(tag, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

// Deterministic random values keep decorative star placement stable between reloads.
export function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return function next() {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function parseNumericValue(value) {
  if (!value) return null;
  const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

// Missing wiki fields are displayed consistently across the details panel.
export function fieldValue(details, key) {
  return details[key] || "Unknown";
}

// Radius values come from the wiki as plain numbers, so add formatting and units here.
export function radiusValue(details) {
  const radius = fieldValue(details, "radius");
  if (radius === "Unknown") return radius;

  const numericRadius = Number(radius.replaceAll(",", ""));
  return Number.isFinite(numericRadius) ? `${numericRadius.toLocaleString()} km` : `${radius} km`;
}

// The visible sector name is derived from the same 6x4 grid used by the grid overlay.
export function sectorFor(system, data) {
  const col = Math.floor(system.x / (data.width / 6)) + 1;
  const row = Math.floor(system.y / (data.height / 4)) + 1;
  return `Sector ${String.fromCharCode(64 + row)}-${col}`;
}
