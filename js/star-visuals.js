import { COLORS } from "./constants.js";
import { parseNumericValue } from "./utils.js";

// Prefer measured temperature, then spectral class, then the original chart group color.
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

// Temperature/spectral class provide hue; magnitude adjusts visual prominence.
export function systemVisuals(system, wikiDetails) {
  const details = wikiDetails[system.name] || {};
  const fallbackColor = COLORS[system.group] || COLORS.blue;
  const temperature = parseNumericValue(details.temperature);
  const magnitude = parseNumericValue(details.magnitude);
  const color = colorForTemperature(temperature, details.spectralClass, fallbackColor);
  const baseRadius = system.size || 5;

  if (!Number.isFinite(magnitude)) {
    return { color, radius: baseRadius, opacity: 0.9 };
  }

  // Lower magnitude means brighter, so invert the scale into radius/opacity.
  const brightness = Math.min(1, Math.max(0.35, (12 - magnitude) / 12));
  return {
    color,
    radius: Math.max(baseRadius, baseRadius * (0.85 + brightness * 0.55)),
    opacity: 0.5 + brightness * 0.5
  };
}
