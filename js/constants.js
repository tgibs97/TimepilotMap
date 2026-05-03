// Shared constants for map rendering, travel distance conversion, and inline field help.
export const COLORS = {
  green: "#18db3b",
  blue: "#78bdd7",
  yellow: "#d7c12b",
  orange: "#f07f18",
  red: "#f21d2f"
};

export const LIGHTYEARS_PER_MAP_UNIT = 4.37 / 88;

export const FIELD_INFO = {
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
