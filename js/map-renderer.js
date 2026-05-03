import { createSvgElement, seededRandom } from "./utils.js";
import { systemVisuals } from "./star-visuals.js";

// Draw stable decorative background stars so the map has depth without loading images.
export function drawBackground({ data, starsLayer }) {
  const random = seededRandom(9421);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < 260; i += 1) {
    fragment.appendChild(createSvgElement("circle", {
      class: "background-star",
      cx: Math.round(random() * data.width),
      cy: Math.round(random() * data.height),
      r: 0.45 + random() * 1.25,
      opacity: 0.2 + random() * 0.55
    }));
  }

  starsLayer.appendChild(fragment);
}

// Draw the known system-to-system links from the data file.
export function drawRoutes({ data, byName, routesLayer }) {
  const fragment = document.createDocumentFragment();

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

// Sector grid labels are generated from the map extents, not hard-coded positions.
export function drawSectorGrid({ data, sectorGridLayer }) {
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

// Build every clickable system marker, including hit target, visual dot, and label.
export function drawSystems({ data, wikiDetails, systemsLayer, systemEls, onSystemClick, onSystemDoubleClick }) {
  const fragment = document.createDocumentFragment();

  data.systems.forEach((system) => {
    const visual = systemVisuals(system, wikiDetails);
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
    const label = createSvgElement("text", {
      class: "system-label",
      x: Number.isFinite(system.labelDx) ? system.x + system.labelDx : system.x + radius + 8,
      y: Number.isFinite(system.labelDy) ? system.y + system.labelDy : system.y + 4,
      "text-anchor": system.labelAnchor || "start"
    });
    label.textContent = system.name;

    group.append(hit, node, label);
    group.addEventListener("click", () => onSystemClick(system.name));
    group.addEventListener("dblclick", () => {
      // Double-click is a separate optional entry point for views layered above selection.
      if (onSystemDoubleClick) onSystemDoubleClick(system.name);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSystemClick(system.name);
      }
    });

    systemEls.set(system.name, group);
    fragment.appendChild(group);
  });

  systemsLayer.appendChild(fragment);
}
