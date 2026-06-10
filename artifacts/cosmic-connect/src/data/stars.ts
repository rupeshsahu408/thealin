// Real star catalog — curated from HYG Database (Hipparcos/Yale/Gliese)
// RA in hours (0-24), Dec in degrees (-90 to +90), dist in light-years

export type SpectralClass = "O" | "B" | "A" | "F" | "G" | "K" | "M";

export interface StarData {
  id: number;
  name: string;
  ra: number;
  dec: number;
  dist: number;
  spec: SpectralClass;
  mag: number;
  category: "nearby" | "bright" | "seti" | "constellation";
  note: string;
  x: number;
  y: number;
  z: number;
}

interface RawStar {
  id: number;
  name: string;
  ra: number;
  dec: number;
  dist: number;
  spec: SpectralClass;
  mag: number;
  category: "nearby" | "bright" | "seti" | "constellation";
  note: string;
}

// Sqrt scale for visualization — nearby stars aren't cramped, far stars visible
function toXYZ(ra_h: number, dec_deg: number, dist_ly: number) {
  const ra  = (ra_h / 24) * Math.PI * 2;
  const dec = (dec_deg / 180) * Math.PI;
  const r   = Math.pow(dist_ly + 1, 0.45) * 5;
  return {
    x:  r * Math.cos(dec) * Math.cos(ra),
    y:  r * Math.sin(dec),
    z:  r * Math.cos(dec) * Math.sin(ra),
  };
}

const RAW: RawStar[] = [
  // ── Nearest Stars ──────────────────────────────────────────────────────────
  { id:  1, name: "Proxima Centauri",   ra: 14.495, dec: -62.679, dist:   4.24, spec: "M", mag: 11.13, category: "nearby", note: "Nearest star to the Sun. Has a confirmed rocky exoplanet in the habitable zone." },
  { id:  2, name: "Alpha Centauri A",   ra: 14.660, dec: -60.835, dist:   4.37, spec: "G", mag: -0.01, category: "nearby", note: "Our closest Sun-like neighbor. Part of a triple star system." },
  { id:  3, name: "Alpha Centauri B",   ra: 14.665, dec: -60.839, dist:   4.37, spec: "K", mag:  1.33, category: "nearby", note: "Slightly smaller and cooler companion to Alpha Centauri A." },
  { id:  4, name: "Barnard's Star",     ra: 17.963, dec:   4.693, dist:   5.96, spec: "M", mag:  9.54, category: "nearby", note: "Fastest moving star in the sky. Will be our nearest neighbor in 10,000 years." },
  { id:  5, name: "Wolf 359",           ra: 10.941, dec:   7.015, dist:   7.79, spec: "M", mag: 13.54, category: "nearby", note: "One of the least luminous stars known. Famous from Star Trek." },
  { id:  6, name: "Lalande 21185",      ra: 11.033, dec:  35.964, dist:   8.31, spec: "M", mag:  7.47, category: "nearby", note: "May host two planetary companions." },
  { id:  7, name: "Sirius",             ra:  6.752, dec: -16.716, dist:   8.61, spec: "A", mag: -1.46, category: "bright", note: "Brightest star in Earth's night sky. Sacred to ancient Egyptians." },
  { id:  8, name: "Luyten 726-8",       ra:  1.638, dec: -17.951, dist:   8.79, spec: "M", mag: 12.54, category: "nearby", note: "Binary red dwarf system — both stars are too faint to see with naked eye." },
  { id:  9, name: "Ross 154",           ra: 18.493, dec: -23.844, dist:   9.69, spec: "M", mag: 10.44, category: "nearby", note: "Young flare star — periodically brightens unpredictably." },
  { id: 10, name: "Ross 248",           ra: 23.702, dec:  43.929, dist:  10.32, spec: "M", mag: 12.29, category: "nearby", note: "Will become our closest neighbor in about 36,000 years." },
  { id: 11, name: "Epsilon Eridani",    ra:  3.549, dec:  -9.458, dist:  10.52, spec: "K", mag:  3.73, category: "seti",   note: "Top SETI target. Has a confirmed planet and an asteroid belt. Featured in many sci-fi stories." },
  { id: 12, name: "Lacaille 9352",      ra: 23.050, dec: -35.851, dist:  10.74, spec: "M", mag:  7.34, category: "nearby", note: "One of the nearest red dwarf stars visible from Earth's southern hemisphere." },
  { id: 13, name: "Ross 128",           ra: 11.796, dec:   0.808, dist:  10.91, spec: "M", mag: 11.13, category: "nearby", note: "Hosts one of the nearest Earth-sized exoplanets." },
  { id: 14, name: "Procyon",            ra:  7.655, dec:   5.225, dist:  11.46, spec: "F", mag:  0.34, category: "bright", note: "Eighth brightest star in the sky. Has a white dwarf companion." },
  { id: 15, name: "61 Cygni",           ra: 21.106, dec:  38.745, dist:  11.40, spec: "K", mag:  5.21, category: "nearby", note: "First star to have its distance measured (1838). Has two planets." },
  { id: 16, name: "Epsilon Indi",       ra: 22.003, dec: -56.791, dist:  11.83, spec: "K", mag:  4.69, category: "seti",   note: "Hosts the nearest known Jovian exoplanet — just 11.8 light-years away." },
  { id: 17, name: "Tau Ceti",           ra:  1.734, dec: -15.937, dist:  11.91, spec: "G", mag:  3.50, category: "seti",   note: "Most Sun-like star within 12 light-years. Has 5 planet candidates including 2 in the habitable zone." },
  { id: 18, name: "Gliese 876",         ra: 22.888, dec: -14.264, dist:  15.34, spec: "M", mag: 10.17, category: "seti",   note: "One of the first red dwarfs known to have multiple exoplanets." },
  { id: 19, name: "Altair",             ra: 19.846, dec:   8.868, dist:  16.73, spec: "A", mag:  0.77, category: "bright", note: "Spins so fast it's noticeably oblate — its equator bulges outward visibly." },
  { id: 20, name: "Gliese 667C",        ra: 17.649, dec: -34.990, dist:  23.62, spec: "M", mag: 10.00, category: "seti",   note: "Has three planets in the habitable zone — most in any known system." },
  { id: 21, name: "TRAPPIST-1",         ra: 23.108, dec:  -5.041, dist:  39.50, spec: "M", mag: 18.80, category: "seti",   note: "Seven Earth-sized planets. Three in the habitable zone. Most studied exoplanet system." },
  { id: 22, name: "Vega",               ra: 18.615, dec:  38.784, dist:  25.05, spec: "A", mag:  0.03, category: "bright", note: "Second brightest star in the northern sky. Earth's pole star in 12,000 years. SETI signals searched here." },
  { id: 23, name: "Fomalhaut",          ra: 22.961, dec: -29.622, dist:  25.13, spec: "A", mag:  1.16, category: "bright", note: "Surrounded by a debris disk. Has a suspected exoplanet. Carl Sagan discussed it extensively." },
  { id: 24, name: "Pollux",             ra:  7.755, dec:  28.026, dist:  33.78, spec: "K", mag:  1.14, category: "bright", note: "Nearest giant star to Earth. Has a confirmed exoplanet: Pollux b." },
  { id: 25, name: "Arcturus",           ra: 14.261, dec:  19.182, dist:  36.66, spec: "K", mag: -0.04, category: "bright", note: "Brightest star in the northern hemisphere. 25x the Sun's diameter." },
  { id: 26, name: "47 Ursae Majoris",   ra: 10.991, dec:  40.430, dist:  45.90, spec: "G", mag:  5.03, category: "seti",   note: "Has 3 exoplanets. Flagship target of the SETI Institute's Phoenix Project." },
  { id: 27, name: "Upsilon Andromedae", ra:  1.613, dec:  41.405, dist:  44.00, spec: "F", mag:  4.09, category: "seti",   note: "First multi-planet system discovered around a main-sequence star." },
  { id: 28, name: "55 Cancri",          ra:  8.877, dec:  28.330, dist:  40.90, spec: "G", mag:  5.96, category: "seti",   note: "5-planet system. 55 Cancri e is a lava world — a year lasts only 18 hours." },
  { id: 29, name: "51 Pegasi",          ra: 22.958, dec:  20.769, dist:  50.90, spec: "G", mag:  5.49, category: "seti",   note: "Home to the first exoplanet ever detected around a Sun-like star (1995). Nobel Prize winning discovery." },
  { id: 30, name: "Capella",            ra:  5.278, dec:  45.998, dist:  42.92, spec: "G", mag:  0.08, category: "bright", note: "Sixth brightest star. Actually four stars — two binary pairs orbiting each other." },
  { id: 31, name: "Aldebaran",          ra:  4.599, dec:  16.509, dist:  65.30, spec: "K", mag:  0.85, category: "bright", note: "The red eye of Taurus. Supergiant — if placed at our Sun, it would swallow Mercury." },
  { id: 32, name: "Regulus",            ra: 10.139, dec:  11.967, dist:  79.00, spec: "B", mag:  1.35, category: "bright", note: "Heart of Leo. Spins so fast it would fly apart if 16% faster." },
  { id: 33, name: "Merak",              ra: 11.031, dec:  56.383, dist:  79.70, spec: "A", mag:  2.37, category: "constellation", note: "Big Dipper — one of the two 'pointer stars' that guide to Polaris." },
  { id: 34, name: "Alioth",             ra: 12.900, dec:  55.960, dist:  82.60, spec: "A", mag:  1.77, category: "constellation", note: "Brightest star in the Big Dipper. Handle begins here." },
  { id: 35, name: "Gacrux",             ra: 12.519, dec: -57.113, dist:  88.60, spec: "M", mag:  1.64, category: "constellation", note: "Top star of the Southern Cross. A red giant — visible only from southern latitudes." },
  { id: 36, name: "Dubhe",              ra: 11.062, dec:  61.751, dist: 123.00, spec: "K", mag:  1.79, category: "constellation", note: "Big Dipper bowl star. Points toward Polaris (the North Star)." },
  { id: 37, name: "Achernar",           ra:  1.629, dec: -57.237, dist: 139.00, spec: "B", mag:  0.46, category: "bright", note: "Ninth brightest star. Spins so fast it's flattened into an oblate shape." },
  { id: 38, name: "Algol",             ra:  3.136, dec:  40.957, dist:  92.80, spec: "B", mag:  2.12, category: "bright", note: "The Demon Star. Eclipsing binary — dims every 2.87 days as one star passes in front of the other." },
  { id: 39, name: "16 Cygni B",         ra: 19.697, dec:  50.525, dist:  69.70, spec: "G", mag:  6.20, category: "seti",   note: "Hosts a giant planet. A copy of our solar system message was aimed here by some astronomers." },
  { id: 40, name: "HD 209458",          ra: 22.053, dec:  18.885, dist: 154.00, spec: "G", mag:  7.65, category: "seti",   note: "First exoplanet confirmed by transit. Its atmosphere is being blown away by stellar wind." },
  { id: 41, name: "Canopus",            ra:  6.399, dec: -52.696, dist: 309.90, spec: "F", mag: -0.74, category: "bright", note: "Second brightest star in the sky. Used by spacecraft for navigation — a natural GPS beacon." },
  { id: 42, name: "Hadar",              ra: 14.064, dec: -60.373, dist: 390.00, spec: "B", mag:  0.61, category: "bright", note: "One of the two 'Pointers' to the Southern Cross. A massive young blue giant." },
  { id: 43, name: "Acrux",             ra: 12.443, dec: -63.099, dist: 320.00, spec: "B", mag:  0.87, category: "bright", note: "Brightest star in the Southern Cross. On the flags of Australia, New Zealand, Brazil and more." },
  { id: 44, name: "Spica",              ra: 13.420, dec: -11.161, dist: 250.00, spec: "B", mag:  0.97, category: "bright", note: "Binary star. Its changing position helped Hipparchus discover the precession of Earth's axis in 127 BC." },
  { id: 45, name: "Antares",            ra: 16.490, dec: -26.432, dist: 550.00, spec: "M", mag:  1.06, category: "bright", note: "Heart of Scorpius. So large it would swallow everything inside Jupiter's orbit." },
  { id: 46, name: "Betelgeuse",         ra:  5.919, dec:   7.407, dist: 700.00, spec: "M", mag:  0.42, category: "bright", note: "Will explode as a supernova. Could happen tomorrow — or in 100,000 years. Brighter than the Moon when it does." },
  { id: 47, name: "Mira",              ra:  2.323, dec:  -2.978, dist: 420.00, spec: "M", mag:  3.00, category: "bright", note: "Prototype of all long-period variable stars. Pulses from magnitude 2 to 10 over 332 days." },
  { id: 48, name: "Polaris",            ra:  2.530, dec:  89.264, dist: 434.00, spec: "F", mag:  1.97, category: "bright", note: "The North Star. Sits almost exactly above Earth's north pole — all other stars circle around it." },
  { id: 49, name: "Bellatrix",          ra:  5.419, dec:   6.350, dist: 250.00, spec: "B", mag:  1.64, category: "constellation", note: "Orion's left shoulder. Name means 'the female warrior' in Latin." },
  { id: 50, name: "Alnilam",            ra:  5.603, dec:  -1.202, dist:1340.00, spec: "B", mag:  1.69, category: "constellation", note: "Middle star of Orion's Belt — the brightest of the three. A blue supergiant." },
  { id: 51, name: "Alnitak",            ra:  5.679, dec:  -1.943, dist: 800.00, spec: "O", mag:  1.74, category: "constellation", note: "Easternmost star of Orion's Belt. Near the Flame Nebula and Horsehead Nebula." },
  { id: 52, name: "Mintaka",            ra:  5.533, dec:  -0.299, dist: 900.00, spec: "O", mag:  2.23, category: "constellation", note: "Westernmost star of Orion's Belt. Sits almost exactly on the celestial equator." },
  { id: 53, name: "Rigel",              ra:  5.242, dec:  -8.202, dist: 860.00, spec: "B", mag:  0.12, category: "bright", note: "Orion's brightest star. A blue supergiant — 120,000× more luminous than the Sun." },
  { id: 54, name: "Mizar",              ra: 13.399, dec:  54.925, dist:  82.90, spec: "A", mag:  2.04, category: "constellation", note: "First double star discovered through a telescope (1617). Part of the Big Dipper handle." },
  { id: 55, name: "Alkaid",             ra: 13.792, dec:  49.313, dist: 101.00, spec: "B", mag:  1.86, category: "constellation", note: "Tip of the Big Dipper's handle. Not actually part of the Ursa Major moving group." },
  { id: 56, name: "Deneb",              ra: 20.691, dec:  45.280, dist:2615.00, spec: "A", mag:  1.25, category: "bright", note: "Most luminous star visible to the naked eye — 200,000× brighter than our Sun. Its light left before Rome fell." },
];

function buildStars(): StarData[] {
  return RAW.map((s) => {
    const xyz = toXYZ(s.ra, s.dec, s.dist);
    return { ...s, ...xyz };
  });
}

export const NAMED_STARS: StarData[] = buildStars();

// Spectral type → RGB color (for Three.js)
export const SPECTRAL_COLORS: Record<SpectralClass, [number, number, number]> = {
  O: [0.573, 0.710, 1.000], // blue
  B: [0.667, 0.749, 1.000], // blue-white
  A: [0.796, 0.875, 1.000], // white-blue
  F: [0.973, 0.969, 1.000], // white
  G: [1.000, 0.957, 0.918], // yellow-white (our Sun)
  K: [1.000, 0.824, 0.631], // orange
  M: [1.000, 0.600, 0.400], // red-orange
};

// Visual size scale based on apparent magnitude (brighter = bigger)
export function starSize(mag: number): number {
  return Math.max(0.8, Math.min(6, (5 - mag) * 0.5 + 1.5));
}
