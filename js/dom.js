// Centralized DOM lookups keep IDs in one place and make the app coordinator easier to scan.
export function getDomRefs() {
  return {
    svg: document.getElementById("star-map"),
    mapWrap: document.getElementById("map-wrap"),
    viewport: document.getElementById("viewport-layer"),
    sectorGridLayer: document.getElementById("sector-grid-layer"),
    systemsLayer: document.getElementById("systems-layer"),
    routesLayer: document.getElementById("routes-layer"),
    travelRouteLayer: document.getElementById("travel-route-layer"),
    starsLayer: document.getElementById("stars-layer"),
    searchInput: document.getElementById("system-search"),
    countLabel: document.getElementById("system-count"),
    emptyPanel: document.getElementById("panel-empty"),
    systemCard: document.getElementById("system-card"),
    systemClose: document.getElementById("system-close"),
    settingsOpen: document.getElementById("settings-open"),
    settingsClose: document.getElementById("settings-close"),
    settingsModal: document.getElementById("settings-modal"),
    sectorGridToggle: document.getElementById("sector-grid-toggle"),
    fieldInfoPanel: document.getElementById("field-info-panel"),
    fieldInfoTitle: document.getElementById("field-info-title"),
    fieldInfoCopy: document.getElementById("field-info-copy"),
    travelOpen: document.getElementById("travel-open"),
    travelClear: document.getElementById("travel-clear"),
    travelAdd: document.getElementById("travel-add"),
    travelPanel: document.getElementById("travel-panel"),
    travelDetail: {
      status: document.getElementById("travel-status"),
      totals: document.getElementById("travel-totals"),
      totalDistance: document.getElementById("travel-total-distance"),
      totalJumps: document.getElementById("travel-total-jumps"),
      legs: document.getElementById("travel-legs")
    },
    detail: {
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
      moons: document.getElementById("detail-moons")
    }
  };
}
