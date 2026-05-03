(function () {
  // map-data.js defines the editable source of truth for systems and routes.
  const data = window.TIMEPILOT_MAP;
  const wikiDetails = window.TIMEPILOT_SYSTEM_DETAILS || {};

  // System groups map to the color language used by the original chart.
  const colors = {
    green: "#18db3b",
    blue: "#78bdd7",
    yellow: "#d7c12b",
    orange: "#f07f18",
    red: "#f21d2f"
  };
  const lightyearsPerMapUnit = 4.37 / 88;

  const svg = document.getElementById("star-map");
  const mapWrap = document.getElementById("map-wrap");
  const viewport = document.getElementById("viewport-layer");
  const sectorGridLayer = document.getElementById("sector-grid-layer");
  const systemsLayer = document.getElementById("systems-layer");
  const routesLayer = document.getElementById("routes-layer");
  const travelRouteLayer = document.getElementById("travel-route-layer");
  const starsLayer = document.getElementById("stars-layer");
  const searchInput = document.getElementById("system-search");
  const countLabel = document.getElementById("system-count");
  const emptyPanel = document.getElementById("panel-empty");
  const systemCard = document.getElementById("system-card");
  const systemClose = document.getElementById("system-close");
  const settingsOpen = document.getElementById("settings-open");
  const settingsClose = document.getElementById("settings-close");
  const settingsModal = document.getElementById("settings-modal");
  const sectorGridToggle = document.getElementById("sector-grid-toggle");
  const fieldInfoPanel = document.getElementById("field-info-panel");
  const fieldInfoTitle = document.getElementById("field-info-title");
  const fieldInfoCopy = document.getElementById("field-info-copy");
  const travelOpen = document.getElementById("travel-open");
  const travelClear = document.getElementById("travel-clear");
  const travelAdd = document.getElementById("travel-add");
  const travelPanel = document.getElementById("travel-panel");

  const travelDetail = {
    status: document.getElementById("travel-status"),
    totals: document.getElementById("travel-totals"),
    totalDistance: document.getElementById("travel-total-distance"),
    totalJumps: document.getElementById("travel-total-jumps"),
    legs: document.getElementById("travel-legs")
  };

  const detail = {
    swatch: document.getElementById("detail-swatch"),
    name: document.getElementById("detail-name"),
    sector: document.getElementById("detail-sector"),
    faction: document.getElementById("detail-faction"),
    spectralClass: document.getElementById("detail-spectral-class"),
    temperature: document.getElementById("detail-temperature"),
    mass: document.getElementById("detail-mass"),
    radius: document.getElementById("detail-radius"),
    magnitude: document.getElementById("detail-magnitude"),
    planets: document.getElementById("detail-planets"),
    moons: document.getElementById("detail-moons"),
    source: document.getElementById("detail-source")
  };

  const fieldInfo = {
    faction: {
      title: "Faction",
      copy: "The political group, settlement authority, or controlling organization associated with the system. Systems marked None are not tied to a major faction on the source wiki."
    },
    spectralClass: {
      title: "Spectral Class",
      copy: [
        "A shorthand classification for the system star based mainly on color and temperature.",
        "O: dark blue; about 28,000-50,000 K; extremely hot stars with heavily ionized atoms, especially helium.",
        "B: blue; about 10,000-28,000 K; hot stars with neutral helium and some hydrogen.",
        "A: light blue to white; about 7,500-10,000 K; strong hydrogen lines and some ionized metals.",
        "F: white; about 6,000-7,500 K; hydrogen plus ionized metals such as calcium and iron.",
        "G: yellow; about 5,000-6,000 K; Sun-like stars with ionized calcium and both neutral and ionized metals.",
        "K: orange; about 3,500-5,000 K; cooler stars with neutral metals.",
        "M: red; about 2,500-3,500 K; cool red stars with neutral atoms."
      ]
    },
    temperature: {
      title: "Temperature",
      copy: "The approximate surface temperature of the system star, shown in Kelvin where available."
    },
    mass: {
      title: "Mass",
      copy: "The star's mass relative to the Sun. A value near 1.00 SM is roughly solar mass; lower values are lighter, higher values are heavier."
    },
    radius: {
      title: "Radius",
      copy: "The listed radius of the system star in kilometers. Larger values generally indicate a physically larger star."
    },
    magnitude: {
      title: "Magnitude",
      copy: "A brightness measurement for the star. Lower magnitude values are brighter; higher values are dimmer."
    },
    planets: {
      title: "Planets",
      copy: "The number of planets listed in the system."
    },
    moons: {
      title: "Moons",
      copy: "The number of moons listed across the system's planets."
    }
  };

  // Fast lookup tables let route rendering and detail panels avoid repeated scans.
  const byName = new Map(data.systems.map((system) => [system.name, system]));
  const linkMap = new Map(data.systems.map((system) => [system.name, []]));
  const systemEls = new Map();

  // Transform values are stored in SVG viewBox units. x/y are screen offsets after scale.
  let selectedName = null;
  let transform = { x: 0, y: 0, scale: 1 };
  let pointer = null;
  let travelState = { active: false, start: null, end: null, mode: "charted", legs: [] };

  // Build an undirected adjacency list from the route pairs.
  data.routes.forEach(([from, to]) => {
    if (linkMap.has(from)) linkMap.get(from).push(to);
    if (linkMap.has(to)) linkMap.get(to).push(from);
  });

  function createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  // Deterministic random values keep the background star field stable between reloads.
  function seededRandom(seed) {
    let value = seed % 2147483647;
    if (value <= 0) value += 2147483646;
    return function next() {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function drawBackground() {
    const random = seededRandom(9421);
    const fragment = document.createDocumentFragment();

    // The decorative stars are SVG elements so they pan and zoom with the chart.
    for (let i = 0; i < 260; i += 1) {
      const star = createSvgElement("circle", {
        class: "background-star",
        cx: Math.round(random() * data.width),
        cy: Math.round(random() * data.height),
        r: 0.45 + random() * 1.25,
        opacity: 0.2 + random() * 0.55
      });
      fragment.appendChild(star);
    }

    starsLayer.appendChild(fragment);
  }

  function drawRoutes() {
    const fragment = document.createDocumentFragment();

    // Routes reference systems by name so coordinates stay centralized in systems[].
    data.routes.forEach(([from, to]) => {
      const start = byName.get(from);
      const end = byName.get(to);
      if (!start || !end) return;

      fragment.appendChild(createSvgElement("line", {
        class: "route",
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y
      }));
    });

    routesLayer.appendChild(fragment);
  }

  function drawSectorGrid() {
    const fragment = document.createDocumentFragment();
    const columns = 6;
    const rows = 4;
    const cellWidth = data.width / columns;
    const cellHeight = data.height / rows;

    for (let col = 1; col < columns; col += 1) {
      const x = col * cellWidth;
      fragment.appendChild(createSvgElement("line", {
        class: "sector-grid-line",
        x1: x,
        y1: 0,
        x2: x,
        y2: data.height
      }));
    }

    for (let row = 1; row < rows; row += 1) {
      const y = row * cellHeight;
      fragment.appendChild(createSvgElement("line", {
        class: "sector-grid-line",
        x1: 0,
        y1: y,
        x2: data.width,
        y2: y
      }));
    }

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const label = createSvgElement("text", {
          class: "sector-grid-label",
          x: col * cellWidth + 16,
          y: row * cellHeight + 26
        });
        label.textContent = `Sector ${String.fromCharCode(65 + row)}-${col + 1}`;
        fragment.appendChild(label);
      }
    }

    sectorGridLayer.appendChild(fragment);
  }

  function parseNumericValue(value) {
    if (!value) return null;
    const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function colorForTemperature(temperature, spectralClass, fallbackColor) {
    const spectralType = spectralClass && spectralClass.trim().charAt(0).toUpperCase();

    if (Number.isFinite(temperature)) {
      if (temperature >= 28000) return "#5f6fff";
      if (temperature >= 10000) return "#9bbcff";
      if (temperature >= 7500) return "#d7e6ff";
      if (temperature >= 6000) return "#fff7ef";
      if (temperature >= 5000) return "#ffe457";
      if (temperature >= 3500) return "#ffad2f";
      if (temperature >= 2500) return "#ff4a2f";
    }

    const spectralColors = {
      O: "#5f6fff",
      B: "#9bbcff",
      A: "#d7e6ff",
      F: "#fff7ef",
      G: "#ffe457",
      K: "#ffad2f",
      M: "#ff4a2f"
    };

    return spectralColors[spectralType] || fallbackColor;
  }

  function systemVisuals(system) {
    const details = wikiDetails[system.name] || {};
    const fallbackColor = colors[system.group] || colors.blue;
    const temperature = parseNumericValue(details.temperature);
    const magnitude = parseNumericValue(details.magnitude);
    const color = colorForTemperature(temperature, details.spectralClass, fallbackColor);
    const baseRadius = system.size || 5;

    if (!Number.isFinite(magnitude)) {
      return { color, radius: baseRadius, opacity: 0.9 };
    }

    // Lower magnitude means visually brighter, so invert the scale into radius/opacity.
    const brightness = Math.min(1, Math.max(0.35, (12 - magnitude) / 12));
    return {
      color,
      radius: Math.max(baseRadius, baseRadius * (0.85 + brightness * 0.55)),
      opacity: 0.5 + brightness * 0.5
    };
  }

  function drawSystems() {
    const fragment = document.createDocumentFragment();

    data.systems.forEach((system) => {
      const visual = systemVisuals(system);
      const group = createSvgElement("g", {
        class: "system",
        tabindex: 0,
        role: "button",
        "aria-label": `${system.name}, rating ${system.rating}`
      });

      const radius = visual.radius;
      const hit = createSvgElement("circle", {
        class: "system-hit",
        cx: system.x,
        cy: system.y,
        r: Math.max(15, radius + 8)
      });
      const node = createSvgElement("circle", {
        class: "system-node",
        cx: system.x,
        cy: system.y,
        r: radius,
        fill: visual.color,
        opacity: visual.opacity
      });
      const labelX = Number.isFinite(system.labelDx) ? system.x + system.labelDx : system.x + radius + 8;
      const labelY = Number.isFinite(system.labelDy) ? system.y + system.labelDy : system.y + 4;
      const label = createSvgElement("text", {
        class: "system-label",
        x: labelX,
        y: labelY,
        "text-anchor": system.labelAnchor || "start"
      });
      label.textContent = system.name;

      group.append(hit, node, label);
      group.addEventListener("click", () => handleSystemClick(system.name));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSystemClick(system.name);
        }
      });

      systemEls.set(system.name, group);
      fragment.appendChild(group);
    });

    systemsLayer.appendChild(fragment);
  }

  // Sector labels are local map metadata; system facts come from system-details.js.
  function sectorFor(system) {
    const col = Math.floor(system.x / (data.width / 6)) + 1;
    const row = Math.floor(system.y / (data.height / 4)) + 1;
    return `Sector ${String.fromCharCode(64 + row)}-${col}`;
  }

  function fieldValue(details, key) {
    return details[key] || "Unknown";
  }

  function radiusValue(details) {
    const radius = fieldValue(details, "radius");
    if (radius === "Unknown") return radius;

    const numericRadius = Number(radius.replaceAll(",", ""));
    return Number.isFinite(numericRadius) ? `${numericRadius.toLocaleString()} km` : `${radius} km`;
  }

  function distanceBetween(fromName, toName) {
    const from = byName.get(fromName);
    const to = byName.get(toName);
    return Math.hypot(to.x - from.x, to.y - from.y);
  }

  function formatDistance(distance) {
    return `${(distance * lightyearsPerMapUnit).toFixed(2)} LY`;
  }

  function findChartedRoute(startName, endName) {
    const distances = new Map(data.systems.map((system) => [system.name, Infinity]));
    const previous = new Map();
    const unvisited = new Set(distances.keys());
    distances.set(startName, 0);

    while (unvisited.size) {
      const current = [...unvisited].sort((a, b) => distances.get(a) - distances.get(b))[0];
      if (!current || distances.get(current) === Infinity) break;
      if (current === endName) break;

      unvisited.delete(current);
      linkMap.get(current).forEach((neighbor) => {
        if (!unvisited.has(neighbor)) return;
        const nextDistance = distances.get(current) + distanceBetween(current, neighbor);
        if (nextDistance < distances.get(neighbor)) {
          distances.set(neighbor, nextDistance);
          previous.set(neighbor, current);
        }
      });
    }

    if (distances.get(endName) === Infinity) return null;

    const path = [];
    let current = endName;
    while (current) {
      path.unshift(current);
      if (current === startName) break;
      current = previous.get(current);
    }

    return path[0] === startName ? { path, distance: distances.get(endName) } : null;
  }

  function updateTransform() {
    // SVG transform order is easiest to reason about as an explicit matrix:
    // screenPoint = worldPoint * scale + offset.
    const value = `matrix(${transform.scale} 0 0 ${transform.scale} ${transform.x} ${transform.y})`;
    starsLayer.setAttribute("transform", value);
    viewport.setAttribute("transform", value);
  }

  function clampScale(scale) {
    return Math.min(5.5, Math.max(0.55, scale));
  }

  function screenToMap(clientX, clientY) {
    // Convert browser pixel coordinates into the SVG viewBox coordinate space.
    const rect = svg.getBoundingClientRect();
    const baseScale = Math.max(rect.width / data.width, rect.height / data.height);
    const offsetX = (rect.width - data.width * baseScale) / 2;
    const offsetY = (rect.height - data.height * baseScale) / 2;
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

  function resetMap() {
    transform = { x: 0, y: 0, scale: 1 };
    updateTransform();
  }

  function fitMap() {
    resetMap();
  }

  function selectSystem(name) {
    const system = byName.get(name);
    if (!system) return;
    if (travelState.active) return;

    // Selection intentionally does not pan or zoom; users keep their current viewport.
    selectedName = name;
    systemEls.forEach((el, systemName) => {
      el.classList.toggle("is-selected", systemName === selectedName);
    });

    const systemWikiDetails = wikiDetails[system.name] || {};
    const color = systemVisuals(system).color;
    detail.swatch.style.background = color;
    detail.swatch.style.color = color;
    detail.name.textContent = system.name;
    detail.sector.textContent = sectorFor(system);
    detail.faction.textContent = fieldValue(systemWikiDetails, "faction");
    detail.spectralClass.textContent = fieldValue(systemWikiDetails, "spectralClass");
    detail.temperature.textContent = fieldValue(systemWikiDetails, "temperature");
    detail.mass.textContent = fieldValue(systemWikiDetails, "mass");
    detail.radius.textContent = radiusValue(systemWikiDetails);
    detail.magnitude.textContent = fieldValue(systemWikiDetails, "magnitude");
    detail.planets.textContent = fieldValue(systemWikiDetails, "planets");
    detail.moons.textContent = fieldValue(systemWikiDetails, "moons");
    //detail.source.href = systemWikiDetails.sourceUrl || `https://starfield.fandom.com/wiki/${encodeURIComponent(system.name.replaceAll(" ", "_"))}`;

    emptyPanel.classList.add("hidden");
    travelPanel.classList.add("hidden");
    closeFieldInfo();
    systemCard.classList.remove("hidden");
  }

  function handleSystemClick(name) {
    if (travelState.active) {
      selectTravelSystem(name);
      return;
    }

    selectSystem(name);
  }

  function closeSystemCard() {
    selectedName = null;
    systemEls.forEach((el) => el.classList.remove("is-selected"));
    systemCard.classList.add("hidden");
    emptyPanel.classList.remove("hidden");
  }

  function clearTravelRoute() {
    travelRouteLayer.replaceChildren();
    travelState = { active: false, start: null, end: null, mode: "charted", legs: [] };
    travelPanel.classList.add("hidden");
    systemCard.classList.add("hidden");
    emptyPanel.classList.remove("hidden");
    systemEls.forEach((el) => el.classList.remove("is-travel-start", "is-travel-end"));
    travelOpen.classList.remove("is-active");
    travelDetail.totals.classList.add("hidden");
    travelDetail.totalDistance.textContent = "-";
    travelDetail.totalJumps.textContent = "-";
    travelDetail.legs.replaceChildren();
    travelAdd.classList.add("hidden");
  }

  function startTravelMode() {
    clearTravelRoute();
    travelState.active = true;
    selectedName = null;
    systemEls.forEach((el) => el.classList.remove("is-selected"));
    emptyPanel.classList.add("hidden");
    systemCard.classList.add("hidden");
    travelPanel.classList.remove("hidden");
    travelOpen.classList.add("is-active");
    travelDetail.status.textContent = "Select an origin system.";
    travelDetail.totals.classList.add("hidden");
    travelDetail.totalDistance.textContent = "-";
    travelDetail.totalJumps.textContent = "-";
    travelDetail.legs.replaceChildren();
    travelAdd.classList.add("hidden");
  }

  function setTravelEndpoint(name, className) {
    const el = systemEls.get(name);
    if (el) el.classList.add(className);
  }

  function renderTravelSegment(fromName, toName, className) {
    const from = byName.get(fromName);
    const to = byName.get(toName);
    travelRouteLayer.appendChild(createSvgElement("line", {
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
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    return wrapper;
  }

  function createTravelPath(path) {
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

  function renderTravelChain() {
    const lastLeg = travelState.legs[travelState.legs.length - 1];
    const totalDistance = travelState.legs.reduce((total, leg) => total + leg.distance, 0);
    const totalJumps = travelState.legs.reduce((total, leg) => total + leg.jumps, 0);

    travelRouteLayer.replaceChildren();
    travelDetail.legs.replaceChildren();

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
      travelDetail.legs.appendChild(createTravelLegCard(leg, index));
    });

    travelDetail.status.textContent = travelState.legs.length > 1 ? "Travel chain plotted." : "Route plotted.";
    travelDetail.totalDistance.textContent = formatDistance(totalDistance);
    travelDetail.totalJumps.textContent = String(totalJumps);
    travelDetail.totals.classList.remove("hidden");
    travelState.start = lastLeg.start;
    travelState.end = lastLeg.end;
    travelState.mode = lastLeg.charted ? "charted" : "direct";
    renderTravelEndpoints();
    travelAdd.classList.remove("hidden");
  }

  function buildTravelLeg(startName, endName, mode) {
    const route = findChartedRoute(startName, endName);

    if (route && mode === "charted") {
      return {
        start: startName,
        end: endName,
        path: route.path,
        distance: route.distance,
        jumps: route.path.length - 1,
        charted: true,
        hasChartedRoute: true
      };
    }

    return {
      start: startName,
      end: endName,
      path: [startName, endName],
      distance: distanceBetween(startName, endName),
      jumps: 1,
      charted: false,
      hasChartedRoute: Boolean(route)
    };
  }

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

  function selectTravelSystem(name) {
    if (travelState.end) {
      systemEls.forEach((el) => el.classList.remove("is-travel-start", "is-travel-end"));
      travelRouteLayer.replaceChildren();
      travelState = { active: true, start: name, end: null, mode: "charted", legs: [] };
      setTravelEndpoint(name, "is-travel-start");
      travelDetail.status.textContent = "Select a destination system.";
      travelAdd.classList.add("hidden");
      return;
    }

    if (!travelState.start) {
      travelState.start = name;
      setTravelEndpoint(name, "is-travel-start");
      travelDetail.status.textContent = "Select a destination system.";
      return;
    }

    if (name === travelState.start) return;

    travelState.end = name;
    setTravelEndpoint(name, "is-travel-end");
    travelState.mode = "charted";
    renderTravelRoute(travelState.start, travelState.end);
  }

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
      travelDetail.status.textContent = "Select the next destination system.";
      travelAdd.classList.add("hidden");
    }
  }

  function addTravelLeg() {
    if (!travelState.end) return;

    travelState.start = travelState.end;
    travelState.end = null;
    travelState.mode = "charted";
    renderTravelEndpoints();
    travelDetail.status.textContent = "Select the next destination system.";
    travelAdd.classList.add("hidden");
  }

  function setSectorGridVisible(visible) {
    sectorGridLayer.classList.toggle("hidden", !visible);
    sectorGridToggle.checked = visible;
    localStorage.setItem("timepilot-sector-grid", visible ? "1" : "0");
  }

  function openSettings() {
    settingsModal.classList.remove("hidden");
    sectorGridToggle.focus();
  }

  function closeSettings() {
    settingsModal.classList.add("hidden");
    settingsOpen.focus();
  }

  function openFieldInfo(field) {
    const info = fieldInfo[field];
    if (!info) return;

    fieldInfoTitle.textContent = info.title;
    fieldInfoCopy.replaceChildren();

    if (Array.isArray(info.copy)) {
      const intro = document.createElement("p");
      const list = document.createElement("ul");
      intro.textContent = info.copy[0];
      info.copy.slice(1).forEach((item) => {
        const listItem = document.createElement("li");
        listItem.textContent = item;
        list.appendChild(listItem);
      });
      fieldInfoCopy.append(intro, list);
    } else {
      const paragraph = document.createElement("p");
      paragraph.textContent = info.copy;
      fieldInfoCopy.appendChild(paragraph);
    }

    fieldInfoPanel.classList.remove("hidden");
    document.querySelectorAll("[data-info-field]").forEach((card) => {
      card.classList.toggle("is-info-active", card.dataset.infoField === field);
    });
  }

  function closeFieldInfo() {
    fieldInfoPanel.classList.add("hidden");
    document.querySelectorAll("[data-info-field]").forEach((card) => card.classList.remove("is-info-active"));
  }

  function filterSystems(query) {
    const normalized = query.trim().toLowerCase();

    systemEls.forEach((el, name) => {
      const matches = !normalized || name.toLowerCase().includes(normalized);
      el.classList.toggle("is-dimmed", !matches);
    });

    if (travelState.active) return;
    if (!normalized) return;

    // Search previews the first matching system in the details panel without moving the map.
    const exact = data.systems.find((system) => system.name.toLowerCase() === normalized);
    const first = exact || data.systems.find((system) => system.name.toLowerCase().includes(normalized));
    if (first) selectSystem(first.name);
  }

  mapWrap.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.14 : 0.88);
  }, { passive: false });

  mapWrap.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    // System clicks should select only; the drag gesture starts on empty map space.
    if (event.target.closest(".system")) return;

    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: transform.x,
      startY: transform.y
    };
    mapWrap.setPointerCapture(event.pointerId);
    mapWrap.classList.add("is-panning");
  });

  mapWrap.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const rect = svg.getBoundingClientRect();
    const baseScale = Math.max(rect.width / data.width, rect.height / data.height);

    // Pointer deltas arrive in CSS pixels, so convert them back to viewBox units.
    transform.x = pointer.startX + (event.clientX - pointer.x) / baseScale;
    transform.y = pointer.startY + (event.clientY - pointer.y) / baseScale;
    updateTransform();
  });

  function endPan(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer = null;
    mapWrap.classList.remove("is-panning");
  }

  mapWrap.addEventListener("pointerup", endPan);
  mapWrap.addEventListener("pointercancel", endPan);

  document.getElementById("zoom-in").addEventListener("click", () => {
    const rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.22);
  });

  document.getElementById("zoom-out").addEventListener("click", () => {
    const rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.82);
  });

  document.getElementById("reset-map").addEventListener("click", resetMap);
  document.getElementById("fit-map").addEventListener("click", fitMap);
  systemClose.addEventListener("click", closeSystemCard);
  travelOpen.addEventListener("click", startTravelMode);
  travelClear.addEventListener("click", clearTravelRoute);
  travelAdd.addEventListener("click", addTravelLeg);
  settingsOpen.addEventListener("click", openSettings);
  settingsClose.addEventListener("click", closeSettings);
  settingsModal.addEventListener("click", (event) => {
    if (event.target === settingsModal) closeSettings();
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
  sectorGridToggle.addEventListener("change", (event) => setSectorGridVisible(event.target.checked));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!fieldInfoPanel.classList.contains("hidden")) closeFieldInfo();
    if (!settingsModal.classList.contains("hidden")) closeSettings();
  });
  searchInput.addEventListener("input", (event) => filterSystems(event.target.value));

  // Initial render order matters: background first, routes second, systems on top.
  drawBackground();
  drawSectorGrid();
  drawRoutes();
  drawSystems();
  updateTransform();
  setSectorGridVisible(localStorage.getItem("timepilot-sector-grid") === "1");
  countLabel.textContent = `${data.systems.length} mapped systems`;
})();
