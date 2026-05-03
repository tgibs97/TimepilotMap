import { createSvgElement } from "./utils.js";

const WIKI_ROOT = "https://starfield.fandom.com";
const PLANET_COLORS = ["#7fd6ff", "#d5e7ef", "#ffcf7a", "#87e1a5", "#c7a7ff", "#f58f6c"];

// The generated data is intentionally minimal, so counts are derived from the nested model.
function moonCount(planets) {
  return planets.reduce((total, planet) => total + planet.moons.length, 0);
}

function objectWikiUrl(path) {
  // Generated object paths are wiki-relative; keep absolute URLs at render time only.
  return path ? `${WIKI_ROOT}${path}` : null;
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

function buildObjectHeading(object) {
  const title = document.createElement("h3");
  title.textContent = object.name;
  return title;
}

function buildCardSummary(object, metaText) {
  // Native details/summary keeps object cards collapsed by default with keyboard support.
  const summary = document.createElement("summary");
  const wrapper = document.createElement("div");
  const meta = document.createElement("p");

  wrapper.className = "system-card-summary-text";
  meta.className = "system-object-meta";
  meta.textContent = metaText;
  wrapper.append(buildObjectHeading(object), meta);
  summary.appendChild(wrapper);
  return summary;
}

function buildGeneralInfo(info = []) {
  const wrapper = document.createElement("dl");
  wrapper.className = "system-general-info";

  if (!info.length) {
    const empty = document.createElement("p");
    empty.className = "system-info-empty";
    empty.textContent = "General information unavailable";
    return empty;
  }

  info.forEach((item) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");

    term.textContent = item.label;
    detail.textContent = item.value;
    row.append(term, detail);
    wrapper.appendChild(row);
  });

  return wrapper;
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
    // Moon count subtly increases size, but the cap prevents large systems from dominating the view.
    const planetRadius = Math.min(17, 9 + index * 0.8 + planet.moons.length * 0.28);
    const labelAnchor = planetX < cx ? "end" : "start";
    const labelX = planetX + (labelAnchor === "start" ? planetRadius + 10 : -planetRadius - 10);
    const labelY = planetY + 4;

    orbitLayer.appendChild(createSvgElement("circle", {
      class: "system-view-orbit",
      cx,
      cy,
      r: orbitRadius
    }));

    objectLayer.append(
      createSvgElement("circle", {
        class: "system-view-planet",
        cx: planetX,
        cy: planetY,
        r: planetRadius,
        fill: PLANET_COLORS[index % PLANET_COLORS.length]
      }),
      createSvgText({
        x: labelX,
        y: labelY,
        text: planet.name,
        anchor: labelAnchor,
        className: "system-view-planet-label"
      })
    );

    const moonOrbitRadius = planetRadius + 13;
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
      const moonAngle = ((moonIndex / planet.moons.length) * 360 - 20) * (Math.PI / 180);
      objectLayer.appendChild(createSvgElement("circle", {
        class: "system-view-moon",
        cx: planetX + Math.cos(moonAngle) * moonOrbitRadius,
        cy: planetY + Math.sin(moonAngle) * moonOrbitRadius,
        r: 3.2
      }));
    });
  });

  viewport.append(orbitLayer, objectLayer);
  // App-level pan/zoom targets this viewport group, leaving defs and SVG sizing stable.
  svg.append(defs, viewport);
  return svg;
}

function buildObjectList(planets) {
  // The list complements the diagram with exact names and wiki links that labels cannot fit.
  const list = document.createElement("div");
  list.className = "system-object-list";

  planets.forEach((planet) => {
    const card = document.createElement("details");
    const cardBody = document.createElement("div");
    const moonSection = document.createElement("section");

    card.className = "system-object-card";
    cardBody.className = "system-object-body";
    moonSection.className = "system-moon-section";

    if (planet.moons.length) {
      const moonHeading = document.createElement("h4");
      const moonList = document.createElement("div");
      moonHeading.textContent = "Moons";
      moonList.className = "system-moon-list";

      planet.moons.forEach((moon) => {
        const moonCard = document.createElement("details");
        const moonBody = document.createElement("div");

        moonCard.className = "system-moon-card";
        moonBody.className = "system-object-body";
        moonBody.appendChild(buildGeneralInfo(moon.generalInfo));

        moonCard.append(
          buildCardSummary(moon, "Moon"),
          moonBody
        );
        moonList.appendChild(moonCard);
      });

      moonSection.append(moonHeading, moonList);
    } else {
      const empty = document.createElement("span");
      empty.textContent = "No known moons";
      moonSection.appendChild(empty);
    }

    cardBody.appendChild(buildGeneralInfo(planet.generalInfo));
    cardBody.appendChild(moonSection);

    card.append(
      buildCardSummary(planet, `${planet.moons.length} ${planet.moons.length === 1 ? "moon" : "moons"}`),
      cardBody
    );
    list.appendChild(card);
  });

  return list;
}

export function renderStarSystemView({ dom, system, objectData, starColor }) {
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
    : "No local planet or moon data available";
  dom.canvas.replaceChildren();

  if (!planets.length) {
    const empty = document.createElement("div");
    empty.className = "system-view-empty";
    empty.textContent = "This system has no parsed planet table yet. The view will update when the local wiki data is regenerated.";
    dom.canvas.appendChild(empty);
  } else {
    dom.canvas.append(
      buildSystemDiagram({ system, planets, starColor }),
      buildObjectList(planets)
    );
  }

  // Parser status stays visible only when the generated data was incomplete.
  dom.status.textContent = objectData?.parseStatus && objectData.parseStatus !== "ok"
    ? `Data status: ${objectData.parseStatus}`
    : "";
  dom.status.classList.toggle("hidden", !dom.status.textContent);
}
