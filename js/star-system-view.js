import { createSvgElement } from "./utils.js";

const PLANET_VISUAL_PROFILES = {
  earthlike: {
    color: "#3f9fe8",
    landColor: "#0b8f5f"
  },
  barren: {
    color: "#b7afa4",
    baselineGravity: 0.38,
    baselineRadius: 7,
    minRadius: 5.5,
    maxRadius: 10
  },
  rock: {
    color: "#c78f5f",
    baselineGravity: 1,
    baselineRadius: 10,
    minRadius: 7,
    maxRadius: 14
  },
  ice: {
    color: "#d8eef5",
    baselineGravity: 0.06,
    baselineRadius: 5,
    minRadius: 4.5,
    maxRadius: 8
  },
  "ice giant": {
    color: "#72d6ff",
    baselineGravity: 1.03,
    baselineRadius: 17,
    minRadius: 14,
    maxRadius: 20
  },
  "gas giant": {
    color: "#f28d6c",
    bandColor: "#ffd0a8",
    stormColor: "#c85f4f",
    baselineGravity: 2.65,
    baselineRadius: 24,
    minRadius: 18,
    maxRadius: 28,
    gas: true
  },
  "hot gas giant": {
    color: "#ff765c",
    bandColor: "#ffc0a6",
    stormColor: "#b63736",
    baselineGravity: 2.65,
    baselineRadius: 24,
    minRadius: 19,
    maxRadius: 29,
    gas: true
  },
  unknown: {
    color: "#9fb4bd",
    baselineGravity: 1,
    baselineRadius: 9,
    minRadius: 7,
    maxRadius: 13
  }
};

function infoValue(object, key) {
  return (object.generalInfo || []).find((item) => item.key === key)?.value || "";
}

function planetType(planet) {
  return infoValue(planet, "type").trim().toLowerCase() || "unknown";
}

function planetGravity(planet) {
  const value = Number.parseFloat(infoValue(planet, "gravity"));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function biosphereLevel(planet, key) {
  const value = infoValue(planet, key).trim().toLowerCase().split(/\s+/)[0];
  const levels = {
    none: 0,
    unknown: 0,
    primordial: 1,
    marginal: 2,
    moderate: 3,
    abundant: 4
  };
  return levels[value] || 0;
}

function hasEarthlikeBiosphere(planet) {
  return biosphereLevel(planet, "fauna") >= 3 && biosphereLevel(planet, "flora") >= 3;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function moonAngle(moonIndex, moonCountValue) {
  return ((moonIndex / moonCountValue) * 360 - 20) * (Math.PI / 180);
}

export function planetVisuals(planet) {
  const profile = PLANET_VISUAL_PROFILES[planetType(planet)] || PLANET_VISUAL_PROFILES.unknown;
  const isEarthlike = hasEarthlikeBiosphere(planet);
  const gravity = planetGravity(planet) || profile.baselineGravity;
  // Sol's real size spread is far larger than the diagram can use, so gravity nudges a typed baseline.
  const radius = profile.baselineRadius * (gravity / profile.baselineGravity) ** 0.24;

  return {
    bandColor: profile.bandColor,
    color: isEarthlike ? PLANET_VISUAL_PROFILES.earthlike.color : profile.color,
    earthlike: isEarthlike,
    gas: Boolean(profile.gas),
    landColor: PLANET_VISUAL_PROFILES.earthlike.landColor,
    radius: clamp(radius, profile.minRadius, profile.maxRadius),
    stormColor: profile.stormColor
  };
}

// The generated data is intentionally minimal, so counts are derived from the nested model.
function moonCount(planets) {
  return planets.reduce((total, planet) => total + planet.moons.length, 0);
}

export function planetObjectId(planetIndex) {
  return `planet-${planetIndex}`;
}

export function moonObjectId(planetIndex, moonIndex) {
  return `moon-${planetIndex}-${moonIndex}`;
}

function createSvgText({ x, y, text, anchor = "middle", className }) {
  const label = createSvgElement("text", {
    class: className,
    x,
    y,
    "text-anchor": anchor
  });
  label.textContent = text;
  return label;
}

function appendPlanetVisual({ defs, group, planetVisual, planetIndex, planetX, planetY, planetRadius }) {
  const clipId = `system-view-planet-clip-${planetIndex}`;
  const clipPath = createSvgElement("clipPath", {
    id: clipId,
    clipPathUnits: "userSpaceOnUse"
  });
  clipPath.appendChild(createSvgElement("circle", {
    cx: planetX,
    cy: planetY,
    r: planetRadius
  }));
  defs.appendChild(clipPath);

  group.appendChild(createSvgElement("circle", {
    class: "system-view-planet",
    cx: planetX,
    cy: planetY,
    r: planetRadius,
    fill: planetVisual.color
  }));

  if (planetVisual.gas) {
    [
      { dy: -0.42, height: 0.16, opacity: 0.5 },
      { dy: -0.12, height: 0.2, opacity: 0.62 },
      { dy: 0.22, height: 0.18, opacity: 0.54 },
      { dy: 0.48, height: 0.12, opacity: 0.42 }
    ].forEach((band) => {
      group.appendChild(createSvgElement("ellipse", {
        class: "system-view-planet-band",
        cx: planetX,
        cy: planetY + band.dy * planetRadius,
        rx: planetRadius * 1.08,
        ry: planetRadius * band.height,
        fill: planetVisual.bandColor,
        opacity: band.opacity,
        "clip-path": `url(#${clipId})`
      }));
    });

    [
      { dx: -0.22, dy: -0.18, rx: 0.46, ry: 0.12, rotate: -10, opacity: 0.42 },
      { dx: 0.2, dy: 0.1, rx: 0.48, ry: 0.13, rotate: 12, opacity: 0.38 },
      { dx: 0.25, dy: 0.34, rx: 0.28, ry: 0.12, rotate: -8, opacity: 0.55, fill: planetVisual.stormColor }
    ].forEach((swirl) => {
      const swirlX = planetX + swirl.dx * planetRadius;
      const swirlY = planetY + swirl.dy * planetRadius;
      group.appendChild(createSvgElement("ellipse", {
        class: "system-view-planet-swirl",
        cx: swirlX,
        cy: swirlY,
        rx: swirl.rx * planetRadius,
        ry: swirl.ry * planetRadius,
        fill: swirl.fill || planetVisual.bandColor,
        opacity: swirl.opacity,
        transform: `rotate(${swirl.rotate} ${swirlX} ${swirlY})`,
        "clip-path": `url(#${clipId})`
      }));
    });
    return;
  }

  if (!planetVisual.earthlike) return;

  // Simple clipped landmasses make biologically rich planets read as Earth-like at map scale.
  [
    { dx: -0.42, dy: -0.26, rx: 0.52, ry: 0.32, rotate: -18 },
    { dx: 0.36, dy: 0.22, rx: 0.48, ry: 0.3, rotate: 24 },
    { dx: -0.08, dy: 0.5, rx: 0.38, ry: 0.23, rotate: 8 }
  ].forEach((land) => {
    group.appendChild(createSvgElement("ellipse", {
      class: "system-view-planet-land",
      cx: planetX + land.dx * planetRadius,
      cy: planetY + land.dy * planetRadius,
      rx: land.rx * planetRadius,
      ry: land.ry * planetRadius,
      fill: planetVisual.landColor,
      transform: `rotate(${land.rotate} ${planetX + land.dx * planetRadius} ${planetY + land.dy * planetRadius})`,
      "clip-path": `url(#${clipId})`
    }));
  });
}

function buildSystemDiagram({ system, planets, starColor }) {
  // The diagram uses authored SVG coordinates so app-level pan/zoom can transform one viewport group.
  const svg = createSvgElement("svg", {
    class: "system-diagram",
    viewBox: "0 0 1240 720",
    role: "img",
    "aria-label": `${system.name} star system diagram`
  });
  const defs = createSvgElement("defs");
  const starGlow = createSvgElement("filter", {
    id: "system-view-star-glow",
    x: "-120%",
    y: "-120%",
    width: "340%",
    height: "340%"
  });
  starGlow.append(
    createSvgElement("feGaussianBlur", { stdDeviation: 8, result: "blur" }),
    createSvgElement("feMerge", {})
  );
  starGlow.lastChild.append(
    createSvgElement("feMergeNode", { in: "blur" }),
    createSvgElement("feMergeNode", { in: "SourceGraphic" })
  );
  defs.appendChild(starGlow);

  const orbitLayer = createSvgElement("g", { class: "system-orbit-layer" });
  const objectLayer = createSvgElement("g", { class: "system-object-layer" });
  const viewport = createSvgElement("g", { class: "system-view-viewport" });
  const cx = 620;
  const cy = 360;
  const maxOrbit = 292;
  // Spread available orbit rings across however many planets the parsed system currently has.
  const orbitStep = planets.length > 1 ? maxOrbit / planets.length : 120;

  objectLayer.append(
    createSvgElement("circle", {
      class: "system-view-star-glow",
      cx,
      cy,
      r: 50,
      fill: starColor
    }),
    createSvgElement("circle", {
      class: "system-view-star",
      cx,
      cy,
      r: 31,
      fill: starColor
    }),
    createSvgText({
      x: cx,
      y: cy + 62,
      text: system.name,
      className: "system-view-star-label"
    })
  );

  planets.forEach((planet, index) => {
    const orbitRadius = 76 + orbitStep * index;
    // A golden-angle step keeps planets visually separated without needing authored positions.
    const angle = (-70 + index * 137.5) * (Math.PI / 180);
    const planetX = cx + Math.cos(angle) * orbitRadius;
    const planetY = cy + Math.sin(angle) * orbitRadius;
    const planetVisual = planetVisuals(planet);
    const planetRadius = planetVisual.radius;
    const labelY = planetY + planetRadius + 16;
    // Moon rings wrap the marker and below-marker planet label as one local object.
    const moonOrbitRadius = planetRadius + 42;

    orbitLayer.appendChild(createSvgElement("circle", {
      class: "system-view-orbit",
      cx,
      cy,
      r: orbitRadius
    }));

    const planetGroup = createSvgElement("g", {
      class: "system-view-object",
      "data-system-object-id": planetObjectId(index),
      role: "button",
      tabindex: "0",
      "aria-label": planet.name
    });

    planetGroup.appendChild(createSvgElement("circle", {
      class: "system-view-object-hit",
      cx: planetX,
      cy: planetY,
      r: Math.max(24, planetRadius + 10)
    }));
    appendPlanetVisual({ defs, group: planetGroup, planetVisual, planetIndex: index, planetX, planetY, planetRadius });
    planetGroup.appendChild(createSvgText({
      x: planetX,
      y: labelY,
      text: planet.name,
      anchor: "middle",
      className: "system-view-planet-label"
    }));
    objectLayer.appendChild(planetGroup);

    if (planet.moons.length) {
      objectLayer.appendChild(createSvgElement("circle", {
        class: "system-view-moon-orbit",
        cx: planetX,
        cy: planetY,
        r: moonOrbitRadius
      }));
    }

    planet.moons.forEach((moon, moonIndex) => {
      // Moons are arranged locally around their parent so parent-child association stays obvious.
      const angle = moonAngle(moonIndex, planet.moons.length);
      const moonX = planetX + Math.cos(angle) * moonOrbitRadius;
      const moonY = planetY + Math.sin(angle) * moonOrbitRadius;
      const moonLabelX = moonX + Math.cos(angle) * 10;
      const moonLabelY = moonY + Math.sin(angle) * 10 + 3;
      const moonLabelAnchor = Math.cos(angle) < -0.25
        ? "end"
        : Math.cos(angle) > 0.25
          ? "start"
          : "middle";
      const moonGroup = createSvgElement("g", {
        class: "system-view-object",
        "data-system-object-id": moonObjectId(index, moonIndex),
        role: "button",
        tabindex: "0",
        "aria-label": `${moon.name}, moon of ${planet.name}`
      });

      moonGroup.append(
        createSvgElement("circle", {
          class: "system-view-object-hit",
          cx: moonX,
          cy: moonY,
          r: 10
        }),
        createSvgElement("circle", {
          class: "system-view-moon",
          cx: moonX,
          cy: moonY,
          r: 3.2
        }),
        createSvgText({
          x: moonLabelX,
          y: moonLabelY,
          text: moon.name,
          anchor: moonLabelAnchor,
          className: "system-view-moon-label"
        })
      );
      objectLayer.appendChild(moonGroup);
    });
  });

  viewport.append(orbitLayer, objectLayer);
  // App-level pan/zoom targets this viewport group, leaving defs and SVG sizing stable.
  svg.append(defs, viewport);
  return svg;
}

export function renderStarSystemView({ dom, system, objectData, starColor, loading = false, error = "" }) {
  // Normalize old or incomplete generated rows before rendering nested moon UI.
  const planets = (objectData?.planets || []).map((planet) => ({
    ...planet,
    generalInfo: planet.generalInfo || [],
    moons: (planet.moons || []).map((moon) => ({
      ...moon,
      generalInfo: moon.generalInfo || []
    }))
  }));
  const moons = moonCount(planets);

  dom.title.textContent = system.name;
  dom.summary.textContent = planets.length
    ? `${planets.length} planets / ${moons} moons`
    : loading
      ? "Loading planets and moons"
    : "No local planet or moon data available";
  dom.canvas.replaceChildren();

  if (loading || error) {
    const status = document.createElement("div");
    status.className = "system-view-empty";
    status.textContent = error || "Loading star system object data...";
    dom.canvas.appendChild(status);
  } else if (!planets.length) {
    const empty = document.createElement("div");
    empty.className = "system-view-empty";
    empty.textContent = "This system has no parsed planet table yet. The view will update when the local wiki data is regenerated.";
    dom.canvas.appendChild(empty);
  } else {
    dom.canvas.appendChild(buildSystemDiagram({ system, planets, starColor }));
  }

  // Parser status stays visible only when the generated data was incomplete.
  dom.status.textContent = objectData?.parseStatus && objectData.parseStatus !== "ok"
    ? `Data status: ${objectData.parseStatus}`
    : "";
  dom.status.classList.toggle("hidden", !dom.status.textContent);
}
