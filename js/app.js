import { TIMEPILOT_MAP as data } from "./map-data.js";
import { TIMEPILOT_SYSTEM_DETAILS as wikiDetails } from "./system-details.js";
import { FIELD_INFO, LIGHTYEARS_PER_MAP_UNIT } from "./constants.js";
import { getDomRefs } from "./dom.js";
import { drawBackground, drawRoutes, drawSectorGrid, drawSystems } from "./map-renderer.js";
import { renderStarSystemView } from "./star-system-view.js";
import { systemVisuals } from "./star-visuals.js";
import { createSvgElement, fieldValue, radiusValue, sectorFor } from "./utils.js";
import { buildLinkMap, buildTravelLeg as createTravelLeg } from "./travel-routing.js";

const dom = getDomRefs();
const byName = new Map(data.systems.map((system) => [system.name, system]));
const linkMap = buildLinkMap(data);
const systemEls = new Map();
const SYSTEM_OBJECT_MANIFEST = "./data/star-systems/manifest.json";

// Transform values are SVG viewBox offsets after scale, matching the matrix in updateTransform().
let selectedName = null;
let activeView = "map";
let systemObjectManifest = null;
const systemObjectCache = new Map();
let transform = { x: 0, y: 0, scale: 1 };
// The Star System View has its own transform so returning to the galaxy map preserves map pan/zoom.
let systemViewTransform = { x: 0, y: 0, scale: 1 };
let pointer = null;
let systemViewPointer = null;
let travelState = { active: false, start: null, end: null, mode: "charted", legs: [] };

// Keep all rendered map layers in sync with the current pan/zoom state.
function updateTransform() {
  const value = `matrix(${transform.scale} 0 0 ${transform.scale} ${transform.x} ${transform.y})`;
  dom.starsLayer.setAttribute("transform", value);
  dom.viewport.setAttribute("transform", value);
}

function systemViewSvg() {
  return dom.systemView.canvas.querySelector(".system-diagram");
}

function systemViewViewport() {
  // Only the inner viewport is transformed; controls and object cards stay fixed/readable.
  return dom.systemView.canvas.querySelector(".system-view-viewport");
}

function updateSystemViewTransform() {
  const viewport = systemViewViewport();
  if (!viewport) return;

  const value = `matrix(${systemViewTransform.scale} 0 0 ${systemViewTransform.scale} ${systemViewTransform.x} ${systemViewTransform.y})`;
  viewport.setAttribute("transform", value);
}

function clampScale(scale) {
  // Keep zoom within the range the label sizes and hit targets were tuned for.
  return Math.min(5.5, Math.max(0.55, scale));
}

function clampSystemViewScale(scale) {
  // Match the main map's useful range while allowing close inspection of moon clusters.
  return Math.min(6, Math.max(0.55, scale));
}

function screenToMap(clientX, clientY) {
  const rect = dom.svg.getBoundingClientRect();

  // The SVG uses preserveAspectRatio="slice", so the larger scale controls mapping.
  const baseScale = Math.max(rect.width / data.width, rect.height / data.height);
  const offsetX = (rect.width - data.width * baseScale) / 2;
  const offsetY = (rect.height - data.height * baseScale) / 2;

  return {
    x: (clientX - rect.left - offsetX) / baseScale,
    y: (clientY - rect.top - offsetY) / baseScale
  };
}

function screenToSystemView(clientX, clientY) {
  const svg = systemViewSvg();
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  // The system diagram uses the default meet behavior, so the smaller scale controls mapping.
  const baseScale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
  const offsetX = (rect.width - viewBox.width * baseScale) / 2;
  const offsetY = (rect.height - viewBox.height * baseScale) / 2;

  return {
    x: (clientX - rect.left - offsetX) / baseScale,
    y: (clientY - rect.top - offsetY) / baseScale
  };
}

function zoomAt(clientX, clientY, delta) {
  const pointerMap = screenToMap(clientX, clientY);
  const oldScale = transform.scale;
  const nextScale = clampScale(oldScale * delta);
  if (nextScale === oldScale) return;

  // Preserve the world point under the cursor while scale changes.
  const focusedWorldX = (pointerMap.x - transform.x) / oldScale;
  const focusedWorldY = (pointerMap.y - transform.y) / oldScale;

  transform.scale = nextScale;
  transform.x = pointerMap.x - focusedWorldX * nextScale;
  transform.y = pointerMap.y - focusedWorldY * nextScale;
  updateTransform();
}

function zoomSystemViewAt(clientX, clientY, delta) {
  const pointerMap = screenToSystemView(clientX, clientY);
  if (!pointerMap) return;

  const oldScale = systemViewTransform.scale;
  const nextScale = clampSystemViewScale(oldScale * delta);
  if (nextScale === oldScale) return;

  // Keep the diagram point under the cursor fixed as the view scale changes.
  const focusedWorldX = (pointerMap.x - systemViewTransform.x) / oldScale;
  const focusedWorldY = (pointerMap.y - systemViewTransform.y) / oldScale;

  systemViewTransform.scale = nextScale;
  systemViewTransform.x = pointerMap.x - focusedWorldX * nextScale;
  systemViewTransform.y = pointerMap.y - focusedWorldY * nextScale;
  updateSystemViewTransform();
}

function resetMap() {
  transform = { x: 0, y: 0, scale: 1 };
  updateTransform();
}

function resetSystemView() {
  // Each system opens centered so the previous system's inspection position does not leak across views.
  systemViewTransform = { x: 0, y: 0, scale: 1 };
  updateSystemViewTransform();
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadSystemObjectManifest() {
  if (systemObjectManifest) return systemObjectManifest;
  systemObjectManifest = await loadJson(SYSTEM_OBJECT_MANIFEST);
  return systemObjectManifest;
}

async function loadStarSystemObjects(system) {
  if (systemObjectCache.has(system.name)) return systemObjectCache.get(system.name);

  // The manifest points to per-system and per-planet files so only the selected system loads.
  const manifest = await loadSystemObjectManifest();
  const entry = manifest.systems[system.name];
  if (!entry) throw new Error(`Missing object manifest entry for ${system.name}`);

  const systemData = await loadJson(entry.planetsPath);
  const planets = await Promise.all(systemData.planets.map(async (planet) => {
    const moonData = await loadJson(planet.moonsPath);
    return {
      ...planet,
      moons: moonData.moons || []
    };
  }));
  const objectData = { ...systemData, planets };

  systemObjectCache.set(system.name, objectData);
  return objectData;
}

async function renderSelectedStarSystemView(system) {
  // Reuse star visuals so the system-view star color matches the main map marker.
  const visual = systemVisuals(system, wikiDetails);
  renderStarSystemView({
    dom: dom.systemView,
    system,
    objectData: null,
    loading: true,
    starColor: visual.color
  });

  try {
    const objectData = await loadStarSystemObjects(system);
    if (activeView !== "system" || selectedName !== system.name) return;

    renderStarSystemView({
      dom: dom.systemView,
      system,
      objectData,
      starColor: visual.color
    });
    resetSystemView();
  } catch (error) {
    renderStarSystemView({
      dom: dom.systemView,
      system,
      objectData: null,
      error: error.message,
      starColor: visual.color
    });
  }
}

function openStarSystemView(name) {
  if (travelState.active) return;

  const system = byName.get(name || selectedName);
  if (!system) return;

  // Opening the view still selects the system, preserving side-panel context and map highlighting.
  selectSystem(system.name);
  activeView = "system";
  renderSelectedStarSystemView(system);
  resetSystemView();
  dom.mapStage.classList.add("is-system-view");
  dom.svg.classList.add("hidden");
  dom.systemView.container.classList.remove("hidden");
  dom.systemView.back.focus();
}

function closeStarSystemView() {
  if (activeView !== "system") return;

  activeView = "map";
  // Clear any in-progress drag so pointer capture state cannot affect the map after returning.
  systemViewPointer = null;
  dom.mapStage.classList.remove("is-system-view");
  dom.systemView.canvas.classList.remove("is-panning");
  dom.systemView.container.classList.add("hidden");
  dom.svg.classList.remove("hidden");
}

// Route distances are calculated in map units, then displayed as lightyears.
function formatDistance(distance) {
  return `${(distance * LIGHTYEARS_PER_MAP_UNIT).toFixed(2)} LY`;
}

// Populate the right-side system card without changing the current map position.
function selectSystem(name) {
  const system = byName.get(name);
  if (!system || travelState.active) return;

  selectedName = name;
  systemEls.forEach((el, systemName) => {
    el.classList.toggle("is-selected", systemName === selectedName);
  });

  const systemWikiDetails = wikiDetails[system.name] || {};
  const color = systemVisuals(system, wikiDetails).color;
  dom.detail.swatch.style.background = color;
  dom.detail.swatch.style.color = color;
  dom.detail.name.textContent = system.name;
  dom.detail.sector.textContent = sectorFor(system, data);
  dom.detail.faction.textContent = fieldValue(systemWikiDetails, "faction");
  dom.detail.spectralClass.textContent = fieldValue(systemWikiDetails, "spectralClass");
  dom.detail.temperature.textContent = fieldValue(systemWikiDetails, "temperature");
  dom.detail.mass.textContent = fieldValue(systemWikiDetails, "mass");
  dom.detail.radius.textContent = radiusValue(systemWikiDetails);
  dom.detail.magnitude.textContent = fieldValue(systemWikiDetails, "magnitude");
  dom.detail.planets.textContent = fieldValue(systemWikiDetails, "planets");
  dom.detail.moons.textContent = fieldValue(systemWikiDetails, "moons");
  if (activeView === "system") renderSelectedStarSystemView(system);

  dom.emptyPanel.classList.add("hidden");
  dom.travelPanel.classList.add("hidden");
  closeFieldInfo();
  dom.systemCard.classList.remove("hidden");
}

function handleSystemClick(name) {
  // In travel mode, clicks build routes instead of opening the detail card.
  if (travelState.active) {
    selectTravelSystem(name);
    return;
  }

  selectSystem(name);
}

function closeSystemCard() {
  closeStarSystemView();
  // Clearing selection returns the side panel to its empty placeholder state.
  selectedName = null;
  systemEls.forEach((el) => el.classList.remove("is-selected"));
  dom.systemCard.classList.add("hidden");
  dom.emptyPanel.classList.remove("hidden");
}

// The sector grid is optional UI state and persists between visits.
function setSectorGridVisible(visible) {
  dom.sectorGridLayer.classList.toggle("hidden", !visible);
  dom.sectorGridToggle.checked = visible;
  localStorage.setItem("timepilot-sector-grid", visible ? "1" : "0");
}

function openSettings() {
  dom.settingsModal.classList.remove("hidden");
  dom.sectorGridToggle.focus();
}

function closeSettings() {
  dom.settingsModal.classList.add("hidden");
  dom.settingsOpen.focus();
}

// Data-point explainers render inline in the system card.
function openFieldInfo(field) {
  const info = FIELD_INFO[field];
  if (!info) return;

  dom.fieldInfoTitle.textContent = info.title;
  dom.fieldInfoCopy.replaceChildren();

  if (Array.isArray(info.copy)) {
    const intro = document.createElement("p");
    const list = document.createElement("ul");
    intro.textContent = info.copy[0];
    info.copy.slice(1).forEach((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      list.appendChild(listItem);
    });
    dom.fieldInfoCopy.append(intro, list);
  } else {
    const paragraph = document.createElement("p");
    paragraph.textContent = info.copy;
    dom.fieldInfoCopy.appendChild(paragraph);
  }

  dom.fieldInfoPanel.classList.remove("hidden");
  document.querySelectorAll("[data-info-field]").forEach((card) => {
    card.classList.toggle("is-info-active", card.dataset.infoField === field);
  });
}

function closeFieldInfo() {
  dom.fieldInfoPanel.classList.add("hidden");
  document.querySelectorAll("[data-info-field]").forEach((card) => card.classList.remove("is-info-active"));
}

// Search highlights matching systems and selects the first match outside travel mode.
function filterSystems(query) {
  const normalized = query.trim().toLowerCase();

  systemEls.forEach((el, name) => {
    const matches = !normalized || name.toLowerCase().includes(normalized);
    el.classList.toggle("is-dimmed", !matches);
  });

  if (travelState.active || !normalized) return;

  const exact = data.systems.find((system) => system.name.toLowerCase() === normalized);
  const first = exact || data.systems.find((system) => system.name.toLowerCase().includes(normalized));
  if (first) selectSystem(first.name);
}

function setTravelEndpoint(name, className) {
  const el = systemEls.get(name);
  if (el) el.classList.add(className);
}

// Travel route overlays are drawn in map coordinates so they pan/zoom with systems.
function renderTravelSegment(fromName, toName, className) {
  const from = byName.get(fromName);
  const to = byName.get(toName);
  dom.travelRouteLayer.appendChild(createSvgElement("line", {
    class: className,
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y
  }));
}

function renderTravelEndpoints() {
  systemEls.forEach((el) => el.classList.remove("is-travel-start", "is-travel-end"));

  if (travelState.legs.length) {
    setTravelEndpoint(travelState.legs[0].start, "is-travel-start");
    setTravelEndpoint(travelState.legs[travelState.legs.length - 1].end, "is-travel-end");
    return;
  }

  if (travelState.start) setTravelEndpoint(travelState.start, "is-travel-start");
}

function createTravelStat(label, value) {
  // Travel stats render as dt/dd pairs so CSS can lay them out as a compact grid.
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  wrapper.append(term, detail);
  return wrapper;
}

function createTravelPath(path) {
  // Keep the plotted path visible in the panel so users can inspect intermediate hops.
  const wrapper = document.createElement("div");
  const heading = document.createElement("h3");
  const list = document.createElement("ol");

  wrapper.className = "travel-path";
  heading.textContent = "Route";

  path.forEach((name) => {
    const item = document.createElement("li");
    item.textContent = name;
    list.appendChild(item);
  });

  wrapper.append(heading, list);
  return wrapper;
}

// Each leg owns its charted/direct toggle so changing one leg does not mutate the chain.
function createTravelLegCard(leg, index) {
  const card = document.createElement("section");
  const statusRow = document.createElement("div");
  const status = document.createElement("p");
  const toggle = document.createElement("button");
  const stats = document.createElement("dl");
  const warning = document.createElement("p");

  card.className = "travel-leg";
  statusRow.className = "travel-status-row";
  status.textContent = leg.charted ? "Charted route plotted." : "Direct route plotted.";
  toggle.className = "travel-mode-toggle";
  toggle.type = "button";
  toggle.textContent = leg.charted ? "Direct route" : "Charted route";
  toggle.disabled = !leg.hasChartedRoute;
  if (!leg.hasChartedRoute) toggle.textContent = "No charted route";
  toggle.addEventListener("click", () => toggleTravelLegMode(index));
  statusRow.append(status, toggle);

  stats.append(
    createTravelStat("Origin", leg.start),
    createTravelStat("Destination", leg.end),
    createTravelStat("Distance", formatDistance(leg.distance)),
    createTravelStat("Jumps", String(leg.jumps))
  );

  warning.className = "travel-warning";
  warning.textContent = "Displaying direct uncharted route. Exercise extreme caution when using uncharted routes.";
  if (leg.charted) warning.classList.add("hidden");

  card.append(statusRow, stats, createTravelPath(leg.path), warning);
  return card;
}

// Rebuild the route overlay and panel whenever the travel chain changes.
function renderTravelChain() {
  const lastLeg = travelState.legs[travelState.legs.length - 1];
  const totalDistance = travelState.legs.reduce((total, leg) => total + leg.distance, 0);
  const totalJumps = travelState.legs.reduce((total, leg) => total + leg.jumps, 0);

  dom.travelRouteLayer.replaceChildren();
  dom.travelDetail.legs.replaceChildren();

  travelState.legs.forEach((leg) => {
    if (leg.charted) {
      for (let i = 0; i < leg.path.length - 1; i += 1) {
        renderTravelSegment(leg.path[i], leg.path[i + 1], "travel-route");
      }
      return;
    }

    renderTravelSegment(leg.start, leg.end, "travel-route travel-route-uncharted");
  });

  travelState.legs.forEach((leg, index) => {
    dom.travelDetail.legs.appendChild(createTravelLegCard(leg, index));
  });

  dom.travelDetail.status.textContent = travelState.legs.length > 1 ? "Travel chain plotted." : "Route plotted.";
  dom.travelDetail.totalDistance.textContent = formatDistance(totalDistance);
  dom.travelDetail.totalJumps.textContent = String(totalJumps);
  dom.travelDetail.totals.classList.remove("hidden");
  travelState.start = lastLeg.start;
  travelState.end = lastLeg.end;
  travelState.mode = lastLeg.charted ? "charted" : "direct";
  renderTravelEndpoints();
  dom.travelAdd.classList.remove("hidden");
}

function buildTravelLeg(startName, endName, mode) {
  // The routing module owns charted-vs-direct decisions and distance calculations.
  return createTravelLeg({ data, linkMap, byName, startName, endName, mode });
}

// Plot a new route leg, or replace the current pending leg when toggling route mode.
function renderTravelRoute(startName, endName, mode = travelState.mode) {
  const leg = buildTravelLeg(startName, endName, mode);
  travelState.mode = leg.charted ? "charted" : "direct";

  const lastIndex = travelState.legs.length - 1;
  if (lastIndex >= 0 && travelState.legs[lastIndex].start === startName && travelState.legs[lastIndex].end === endName) {
    travelState.legs[lastIndex] = leg;
  } else {
    travelState.legs.push(leg);
  }
  renderTravelChain();
}

// Travel mode consumes system clicks as origin/destination choices instead of opening cards.
function selectTravelSystem(name) {
  if (travelState.end) {
    systemEls.forEach((el) => el.classList.remove("is-travel-start", "is-travel-end"));
    dom.travelRouteLayer.replaceChildren();
    travelState = { active: true, start: name, end: null, mode: "charted", legs: [] };
    setTravelEndpoint(name, "is-travel-start");
    dom.travelDetail.status.textContent = "Select a destination system.";
    dom.travelAdd.classList.add("hidden");
    return;
  }

  if (!travelState.start) {
    travelState.start = name;
    setTravelEndpoint(name, "is-travel-start");
    dom.travelDetail.status.textContent = "Select a destination system.";
    return;
  }

  if (name === travelState.start) return;

  travelState.end = name;
  setTravelEndpoint(name, "is-travel-end");
  travelState.mode = "charted";
  renderTravelRoute(travelState.start, travelState.end);
}

// Switching charted/direct mode is scoped to the clicked leg.
function toggleTravelLegMode(index) {
  const leg = travelState.legs[index];
  if (!leg || !leg.hasChartedRoute) return;

  const nextMode = leg.charted ? "direct" : "charted";
  const pendingNextLeg = travelState.start && !travelState.end && travelState.legs.length > 0;
  const previousStart = travelState.start;
  const previousEnd = travelState.end;
  const previousMode = travelState.mode;

  travelState.legs[index] = buildTravelLeg(leg.start, leg.end, nextMode);
  renderTravelChain();

  if (pendingNextLeg) {
    travelState.start = previousStart;
    travelState.end = previousEnd;
    travelState.mode = previousMode;
    renderTravelEndpoints();
    dom.travelDetail.status.textContent = "Select the next destination system.";
    dom.travelAdd.classList.add("hidden");
  }
}

function clearTravelRoute() {
  closeStarSystemView();
  // Reset both the overlay and side-panel state so the next route starts cleanly.
  dom.travelRouteLayer.replaceChildren();
  travelState = { active: false, start: null, end: null, mode: "charted", legs: [] };
  dom.travelPanel.classList.add("hidden");
  dom.systemCard.classList.add("hidden");
  dom.emptyPanel.classList.remove("hidden");
  systemEls.forEach((el) => el.classList.remove("is-travel-start", "is-travel-end"));
  dom.travelOpen.classList.remove("is-active");
  dom.travelDetail.totals.classList.add("hidden");
  dom.travelDetail.totalDistance.textContent = "-";
  dom.travelDetail.totalJumps.textContent = "-";
  dom.travelDetail.legs.replaceChildren();
  dom.travelAdd.classList.add("hidden");
}

function startTravelMode() {
  // Starting travel mode intentionally hides any selected system to avoid conflicting UI states.
  clearTravelRoute();
  travelState.active = true;
  selectedName = null;
  systemEls.forEach((el) => el.classList.remove("is-selected"));
  dom.emptyPanel.classList.add("hidden");
  dom.systemCard.classList.add("hidden");
  dom.travelPanel.classList.remove("hidden");
  dom.travelOpen.classList.add("is-active");
  dom.travelDetail.status.textContent = "Select an origin system.";
}

function addTravelLeg() {
  if (!travelState.end) return;

  // New chained legs always begin from the previous destination.
  travelState.start = travelState.end;
  travelState.end = null;
  travelState.mode = "charted";
  renderTravelEndpoints();
  dom.travelDetail.status.textContent = "Select the next destination system.";
  dom.travelAdd.classList.add("hidden");
}

// All DOM listeners are registered once after the SVG layers are built.
function bindEvents() {
  dom.mapWrap.addEventListener("wheel", (event) => {
    if (activeView !== "map") return;
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.14 : 0.88);
  }, { passive: false });

  dom.systemView.canvas.addEventListener("wheel", (event) => {
    // Wheel zoom is limited to the diagram so the planet/moon list keeps normal scrolling.
    if (activeView !== "system" || !event.target.closest(".system-diagram")) return;
    event.preventDefault();
    zoomSystemViewAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.14 : 0.88);
  }, { passive: false });

  dom.mapWrap.addEventListener("pointerdown", (event) => {
    if (activeView !== "map") return;
    if (event.button !== 0) return;
    if (event.target.closest(".system")) return;

    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: transform.x,
      startY: transform.y
    };
    dom.mapWrap.setPointerCapture(event.pointerId);
    dom.mapWrap.classList.add("is-panning");
  });

  dom.systemView.canvas.addEventListener("pointerdown", (event) => {
    const svg = systemViewSvg();
    // Dragging starts only on the SVG diagram; links in the object list remain clickable text.
    if (activeView !== "system" || event.button !== 0 || !svg || !event.target.closest(".system-diagram")) return;

    systemViewPointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: systemViewTransform.x,
      startY: systemViewTransform.y
    };
    dom.systemView.canvas.setPointerCapture(event.pointerId);
    dom.systemView.canvas.classList.add("is-panning");
  });

  dom.mapWrap.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const rect = dom.svg.getBoundingClientRect();
    // Pan in map space so drag speed stays consistent regardless of container scaling.
    const baseScale = Math.max(rect.width / data.width, rect.height / data.height);
    transform.x = pointer.startX + (event.clientX - pointer.x) / baseScale;
    transform.y = pointer.startY + (event.clientY - pointer.y) / baseScale;
    updateTransform();
  });

  dom.systemView.canvas.addEventListener("pointermove", (event) => {
    const svg = systemViewSvg();
    if (!systemViewPointer || systemViewPointer.id !== event.pointerId || !svg) return;

    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    // Convert screen-pixel drag movement into the diagram's viewBox coordinate space.
    const baseScale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
    systemViewTransform.x = systemViewPointer.startX + (event.clientX - systemViewPointer.x) / baseScale;
    systemViewTransform.y = systemViewPointer.startY + (event.clientY - systemViewPointer.y) / baseScale;
    updateSystemViewTransform();
  });

  function endPan(event) {
    // Pointer capture can end via release or cancellation, so both routes share cleanup.
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer = null;
    dom.mapWrap.classList.remove("is-panning");
  }

  function endSystemViewPan(event) {
    if (!systemViewPointer || systemViewPointer.id !== event.pointerId) return;
    systemViewPointer = null;
    dom.systemView.canvas.classList.remove("is-panning");
  }

  dom.mapWrap.addEventListener("pointerup", endPan);
  dom.mapWrap.addEventListener("pointercancel", endPan);
  dom.systemView.canvas.addEventListener("pointerup", endSystemViewPan);
  dom.systemView.canvas.addEventListener("pointercancel", endSystemViewPan);

  document.getElementById("zoom-in").addEventListener("click", () => {
    const rect = dom.svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.22);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    const rect = dom.svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.82);
  });
  document.getElementById("reset-map").addEventListener("click", resetMap);
  document.getElementById("fit-map").addEventListener("click", resetMap);
  dom.systemClose.addEventListener("click", closeSystemCard);
  dom.systemViewOpen.addEventListener("click", () => openStarSystemView(selectedName));
  dom.systemView.back.addEventListener("click", closeStarSystemView);
  dom.systemView.zoomIn.addEventListener("click", () => {
    const svg = systemViewSvg();
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Button zooms use the diagram center as the focus point for predictable control behavior.
    zoomSystemViewAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.22);
  });
  dom.systemView.zoomOut.addEventListener("click", () => {
    const svg = systemViewSvg();
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    zoomSystemViewAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.82);
  });
  dom.systemView.reset.addEventListener("click", resetSystemView);
  dom.travelOpen.addEventListener("click", startTravelMode);
  dom.travelClear.addEventListener("click", clearTravelRoute);
  dom.travelAdd.addEventListener("click", addTravelLeg);
  dom.settingsOpen.addEventListener("click", openSettings);
  dom.settingsClose.addEventListener("click", closeSettings);
  dom.settingsModal.addEventListener("click", (event) => {
    if (event.target === dom.settingsModal) closeSettings();
  });
  document.querySelectorAll("[data-info-field]").forEach((field) => {
    field.addEventListener("click", () => openFieldInfo(field.dataset.infoField));
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFieldInfo(field.dataset.infoField);
      }
    });
  });
  dom.sectorGridToggle.addEventListener("change", (event) => setSectorGridVisible(event.target.checked));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (activeView === "system") closeStarSystemView();
    if (!dom.fieldInfoPanel.classList.contains("hidden")) closeFieldInfo();
    if (!dom.settingsModal.classList.contains("hidden")) closeSettings();
  });
  dom.searchInput.addEventListener("input", (event) => filterSystems(event.target.value));
}

// Initial render order matters: background, optional grid, routes, then clickable systems.
function init() {
  drawBackground({ data, starsLayer: dom.starsLayer });
  drawSectorGrid({ data, sectorGridLayer: dom.sectorGridLayer });
  drawRoutes({ data, byName, routesLayer: dom.routesLayer });
  drawSystems({
    data,
    wikiDetails,
    systemsLayer: dom.systemsLayer,
    systemEls,
    onSystemClick: handleSystemClick,
    onSystemDoubleClick: openStarSystemView
  });
  updateTransform();
  setSectorGridVisible(localStorage.getItem("timepilot-sector-grid") === "1");
  dom.countLabel.textContent = `${data.systems.length} mapped systems`;
  bindEvents();
}

init();
