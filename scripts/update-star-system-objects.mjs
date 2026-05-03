import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TIMEPILOT_MAP } from "../js/map-data.js";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = "https://starfield.fandom.com/api.php";
const OUTPUT_JSON = resolve(ROOT_DIR, "data", "star-system-objects.json");
const OUTPUT_JS = resolve(ROOT_DIR, "js", "star-system-objects.js");
const OBJECT_FETCH_CONCURRENCY = 8;

function wikiPageName(systemName) {
  // Fandom page names use underscores for spaces while preserving punctuation.
  return systemName.trim().replace(/\s+/g, "_");
}

function wikiUrlForPage(pageName) {
  return `https://starfield.fandom.com/wiki/${encodeURIComponent(pageName).replaceAll("%2F", "/")}`;
}

function decodeEntities(value) {
  // The parser only needs common entities emitted by MediaWiki table markup.
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, "; ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s*;\s*/g, "; ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function wikiPathToPageName(wikiPath) {
  return decodeURIComponent(wikiPath.replace(/^\/wiki\//, ""));
}

function extractLinks(cellHtml) {
  // Planet and moon names are taken from wiki links so display text and paths stay paired.
  const links = [];
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(cellHtml))) {
    const attrs = match[1];
    const href = /href="([^"]+)"/i.exec(attrs)?.[1] || "";
    const title = /title="([^"]+)"/i.exec(attrs)?.[1];
    const text = stripTags(match[2]);
    const name = decodeEntities(title || text).trim();

    if (!name || !href.startsWith("/wiki/") || href.includes(":")) continue;
    links.push({ name, wikiPath: decodeEntities(href) });
  }

  return links;
}

function parseObjectTable(html) {
  // Most pages place object data under a Planets heading; some only expose a matching table.
  const headlineMatch = /<span class="mw-headline" id="Planets">Planets<\/span>/i.exec(html);
  const section = headlineMatch ? html.slice(headlineMatch.index) : html;
  const nextHeading = headlineMatch ? section.slice(1).search(/<h2\b/i) : -1;
  const planetsSection = nextHeading >= 0 ? section.slice(0, nextHeading + 1) : section;
  const tables = [...planetsSection.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((table) => table[0]);
  // Require both headers so unrelated infobox/nav tables are ignored.
  const tableHtml = tables.find((table) => /Planets/i.test(stripTags(table)) && /Moons/i.test(stripTags(table)));

  if (!tableHtml) {
    return { planets: [], status: headlineMatch ? "missing-planets-table" : "missing-planets-heading" };
  }

  const rows = [...tableHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((row) => row[0]);
  const planets = [];

  rows.forEach((row) => {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]);
    if (cells.length < 2) return;

    const firstCellText = stripTags(cells[0]);
    const secondCellText = stripTags(cells[1]);
    if (/^planets$/i.test(firstCellText) && /^moons$/i.test(secondCellText)) return;

    const planetLink = extractLinks(cells[0])[0];
    const planetName = planetLink?.name || firstCellText;
    const moonLinks = extractLinks(cells[1]);

    if (!planetName || /^none$/i.test(planetName)) {
      // Wider wiki tables sometimes put moons on continuation rows beneath the current planet.
      const currentPlanet = planets.at(-1);
      if (currentPlanet) {
        moonLinks.forEach((moon) => {
          currentPlanet.moons.push({
            type: "moon",
            name: moon.name,
            orbitIndex: currentPlanet.moons.length + 1,
            wikiPath: moon.wikiPath
          });
        });
      }
      return;
    }

    const moons = moonLinks.map((moon, index) => ({
      type: "moon",
      name: moon.name,
      orbitIndex: index + 1,
      wikiPath: moon.wikiPath
    }));

    planets.push({
      type: "planet",
      name: planetName,
      orbitIndex: planets.length + 1,
      wikiPath: planetLink?.wikiPath || `/wiki/${wikiPageName(planetName)}`,
      moons
    });
  });

  return {
    planets,
    status: planets.length ? "ok" : "empty-planets-table"
  };
}

function parseGeneralInformation(html) {
  const headingMatch = /<h2\b[^>]*>\s*General Information\s*<\/h2>/i.exec(html);
  if (!headingMatch) return [];

  const section = html.slice(headingMatch.index);
  const endIndex = section.indexOf("</section>");
  const infoSection = endIndex >= 0 ? section.slice(0, endIndex) : section;
  const rows = [...infoSection.matchAll(/<div class="pi-item pi-data[\s\S]*?<\/div>\s*<\/div>/gi)].map((row) => row[0]);

  return rows.flatMap((row) => {
    const key = /data-source="([^"]+)"/i.exec(row)?.[1];
    const labelHtml = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(row)?.[1];
    const valueHtml = /<div class="pi-data-value pi-font">([\s\S]*?)<\/div>/i.exec(row)?.[1];
    const label = labelHtml ? stripTags(labelHtml) : "";
    const value = valueHtml ? stripTags(valueHtml) : "";

    if (!key || !label || !value) return [];
    return [{ key, label, value }];
  });
}

async function fetchParsedHtml(pageName) {
  const url = new URL(API_URL);
  // MediaWiki parse returns rendered HTML, which is more stable here than scraping public page chrome.
  url.search = new URLSearchParams({
    action: "parse",
    page: pageName,
    prop: "text",
    format: "json",
    origin: "*"
  });

  const response = await fetch(url, { headers: { "user-agent": "TimepilotMap data generator" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.info || payload.error.code);

  return payload.parse;
}

async function fetchSystem(systemName) {
  const pageName = wikiPageName(systemName);
  const payload = await fetchParsedHtml(pageName);
  const parsed = parseObjectTable(payload.text["*"]);
  return {
    sourceUrl: wikiUrlForPage(pageName),
    sourcePage: payload.title || systemName,
    parseStatus: parsed.status,
    star: {
      type: "star",
      name: systemName
    },
    planets: parsed.planets
  };
}

async function fetchObjectInfo(object) {
  const pageName = wikiPathToPageName(object.wikiPath);
  const payload = await fetchParsedHtml(pageName);

  object.sourceUrl = wikiUrlForPage(pageName);
  object.sourcePage = payload.title || object.name;
  object.generalInfo = parseGeneralInformation(payload.text["*"]);
  object.infoStatus = object.generalInfo.length ? "ok" : "missing-general-information";
}

function collectSystemObjects(systems) {
  const objects = [];

  Object.values(systems).forEach((system) => {
    system.planets.forEach((planet) => {
      objects.push(planet);
      planet.moons.forEach((moon) => objects.push(moon));
    });
  });

  return objects;
}

async function enrichObjectInfo(systems) {
  const objects = collectSystemObjects(systems);
  const total = objects.length;
  let completed = 0;

  async function worker() {
    while (objects.length) {
      const object = objects.shift();
      try {
        await fetchObjectInfo(object);
      } catch (error) {
        object.infoStatus = `error: ${error.message}`;
        object.generalInfo = [];
      }

      completed += 1;
      if (completed % 25 === 0 || completed === total) {
        console.log(`Object info: ${completed}/${total} fetched`);
      }
    }
  }

  await Promise.all(Array.from({ length: OBJECT_FETCH_CONCURRENCY }, worker));
}

function buildJsModule(jsonText) {
  // The browser imports this when JSON fetch is unavailable, such as direct file opening.
  return `// Generated by scripts/update-star-system-objects.mjs. Do not edit by hand.\nexport const TIMEPILOT_SYSTEM_OBJECTS = ${jsonText};\n`;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const systems = {};

  for (const system of TIMEPILOT_MAP.systems) {
    try {
      systems[system.name] = await fetchSystem(system.name);
      console.log(`${system.name}: ${systems[system.name].planets.length} planets`);
    } catch (error) {
      const pageName = wikiPageName(system.name);
      // Keep a placeholder row so the app can show a graceful incomplete-data state.
      systems[system.name] = {
        sourceUrl: wikiUrlForPage(pageName),
        sourcePage: system.name,
        parseStatus: `error: ${error.message}`,
        star: {
          type: "star",
          name: system.name
        },
        planets: []
      };
      console.warn(`${system.name}: ${error.message}`);
    }
  }

  await enrichObjectInfo(systems);

  const payload = {
    generatedAt,
    source: "https://starfield.fandom.com/wiki/",
    systems
  };
  const jsonText = `${JSON.stringify(payload, null, 2)}\n`;

  await mkdir(dirname(OUTPUT_JSON), { recursive: true });
  await writeFile(OUTPUT_JSON, jsonText, "utf8");
  await writeFile(OUTPUT_JS, buildJsModule(jsonText), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
