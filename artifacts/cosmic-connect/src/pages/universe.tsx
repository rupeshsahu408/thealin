import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Globe, Search, X, ChevronRight, Info, Loader2, AlertTriangle, Star } from "lucide-react";
import Footer from "@/components/layout/footer";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawPlanet {
  pl_name: string;
  sy_dist: number | null;
  st_spectype: string | null;
  st_teff: number | null;
  pl_orbsmax: number | null;
  pl_rade: number | null;
  pl_eqt: number | null;
  disc_year: number | null;
}

interface Planet extends RawPlanet {
  lightYears: number;
  isHabitable: boolean;
  civProb: number;
  starClass: string;
  mapX: number;
  mapY: number;
}

type FilterMode = "all" | "habitable" | "earthlike" | "nearest" | "highest";

// ─── Science helpers ─────────────────────────────────────────────────────────

function getStarClass(spectype: string | null, teff: number | null): string {
  if (spectype) {
    const c = spectype.trim().charAt(0).toUpperCase();
    if ("OBAFGKM".includes(c)) return c;
  }
  if (teff !== null) {
    if (teff >= 30000) return "O";
    if (teff >= 10000) return "B";
    if (teff >= 7500) return "A";
    if (teff >= 6000) return "F";
    if (teff >= 5200) return "G";
    if (teff >= 3700) return "K";
    return "M";
  }
  return "?";
}

function isInHabitableZone(p: RawPlanet): boolean {
  // Primary: equilibrium temperature (Earth is ~255 K)
  if (p.pl_eqt !== null) {
    return p.pl_eqt >= 180 && p.pl_eqt <= 340;
  }
  // Fallback: orbital distance vs expected HZ based on star temp
  if (p.pl_orbsmax !== null && p.st_teff !== null) {
    const L = Math.pow(p.st_teff / 5778, 4);
    const innerAU = Math.sqrt(L / 1.1);
    const outerAU = Math.sqrt(L / 0.36);
    return p.pl_orbsmax >= innerAU && p.pl_orbsmax <= outerAU;
  }
  return false;
}

function calcCivProb(p: RawPlanet, habitable: boolean, starClass: string): number {
  let score = 0;
  // Habitable zone — biggest signal
  if (habitable) score += 40;
  // Star type favourability
  const starScore: Record<string, number> = { G: 35, K: 28, F: 18, M: 12, A: 8, B: 3, O: 1 };
  score += starScore[starClass] ?? 5;
  // Planet size (Earth-like radius = 1.0 RE)
  const r = p.pl_rade;
  if (r !== null) {
    if (r >= 0.8 && r <= 1.5) score += 22;
    else if (r >= 0.5 && r <= 2.0) score += 14;
    else if (r >= 2.0 && r <= 4.0) score += 6;
  }
  // Bonus: recently discovered (more data available)
  if (p.disc_year !== null && p.disc_year >= 2015) score += 3;
  return Math.min(Math.round(score), 100);
}

// Deterministic position from planet name hash
function nameHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h;
}

function computeMapPos(planet: RawPlanet, cx: number, cy: number, maxR: number): { x: number; y: number } {
  const h = nameHash(planet.pl_name);
  const angle = (h % 10000) / 10000 * Math.PI * 2;
  const ly = (planet.sy_dist ?? 0) * 3.26156;
  const maxLY = 3500;
  const r = Math.sqrt(Math.min(ly / maxLY, 1)) * maxR; // sqrt for better spread
  return {
    x: +(cx + r * Math.cos(angle)).toFixed(2),
    y: +(cy + r * Math.sin(angle)).toFixed(2),
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STAR_COLORS: Record<string, string> = {
  O: "#9bb0ff",
  B: "#aabfff",
  A: "#cad7ff",
  F: "#f8f7ff",
  G: "#fff4b0",
  K: "#ffd28a",
  M: "#ff9966",
  "?": "#9ca3af",
};

const STAR_LABELS: Record<string, string> = {
  O: "O-type (blue)",
  B: "B-type (blue-white)",
  A: "A-type (white)",
  F: "F-type (yellow-white)",
  G: "G-type (like our Sun)",
  K: "K-type (orange)",
  M: "M-type (red dwarf)",
};

const PROB_COLOR = (n: number) =>
  n >= 70 ? "#00C853" : n >= 40 ? "#0057FF" : n >= 20 ? "#FF6D00" : "#6B7280";

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProbBadge({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center font-mono text-xs font-bold px-2 py-0.5 rounded-full border"
      style={{
        color: PROB_COLOR(value),
        borderColor: PROB_COLOR(value) + "40",
        backgroundColor: PROB_COLOR(value) + "12",
      }}
    >
      {value}%
    </span>
  );
}

function StarMapSVG({
  planets,
  selected,
  onSelect,
}: {
  planets: Planet[];
  selected: Planet | null;
  onSelect: (p: Planet) => void;
}) {
  const W = 700;
  const H = 480;
  const CX = W / 2;
  const CY = H / 2;
  const MAX_R = Math.min(CX, CY) - 20;

  // Background star field — deterministic
  const bgStars = useMemo(() => {
    const stars = [];
    for (let i = 0; i < 160; i++) {
      const h = nameHash(`bg${i}`);
      const h2 = nameHash(`bg${i}y`);
      const size = (nameHash(`bgsize${i}`) % 4) === 0 ? 1.5 : 0.8;
      stars.push({
        key: i,
        x: (h % (W - 8)) + 4,
        y: (h2 % (H - 8)) + 4,
        opacity: 0.2 + ((nameHash(`bgop${i}`) % 100) / 100) * 0.3,
        r: size,
      });
    }
    return stars;
  }, []);

  // Distance rings labels
  const rings = [
    { ly: 500, label: "500 LY" },
    { ly: 1500, label: "1,500 LY" },
    { ly: 3000, label: "3,000 LY" },
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-xl"
      style={{ background: "#0A0F2C", maxHeight: 480 }}
      aria-label="Interactive star map of exoplanets"
    >
      {/* Background stars */}
      {bgStars.map((s) => (
        <circle key={s.key} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.opacity} />
      ))}

      {/* Distance rings */}
      {rings.map(({ ly, label }) => {
        const maxLY = 3500;
        const r = Math.sqrt(Math.min(ly / maxLY, 1)) * MAX_R;
        return (
          <g key={ly}>
            <circle
              cx={CX} cy={CY} r={r}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
              strokeDasharray="4 6"
            />
            <text
              x={CX + r + 3}
              y={CY}
              fill="rgba(255,255,255,0.2)"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Center cross — Sol */}
      <circle cx={CX} cy={CY} r={5} fill="#fff4b0" />
      <circle cx={CX} cy={CY} r={9} fill="none" stroke="#fff4b0" strokeWidth={0.5} opacity={0.4} />
      <text x={CX + 12} y={CY + 4} fill="#fff4b0" fontSize={9} fontFamily="JetBrains Mono, monospace" opacity={0.7}>
        Sol
      </text>

      {/* Planets */}
      {planets.map((p) => {
        const isSelected = selected?.pl_name === p.pl_name;
        const color = STAR_COLORS[p.starClass] ?? STAR_COLORS["?"];
        const r = p.pl_rade !== null
          ? Math.max(2, Math.min(5, 1.5 + p.pl_rade * 0.6))
          : 2.5;

        return (
          <g key={p.pl_name} style={{ cursor: "pointer" }} onClick={() => onSelect(p)}>
            {isSelected && (
              <circle
                cx={p.mapX} cy={p.mapY}
                r={r + 5}
                fill="none"
                stroke="#0057FF"
                strokeWidth={1.5}
                opacity={0.8}
              />
            )}
            {p.isHabitable && !isSelected && (
              <circle
                cx={p.mapX} cy={p.mapY}
                r={r + 3}
                fill="none"
                stroke="#00C853"
                strokeWidth={0.8}
                opacity={0.5}
              />
            )}
            <circle
              cx={p.mapX}
              cy={p.mapY}
              r={r}
              fill={isSelected ? "#0057FF" : color}
              opacity={isSelected ? 1 : 0.85}
            >
              <title>{p.pl_name} — {p.lightYears.toFixed(0)} LY — Civ. Prob: {p.civProb}%</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

function PlanetCard({
  planet,
  selected,
  onSelect,
}: {
  planet: Planet;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = STAR_COLORS[planet.starClass] ?? STAR_COLORS["?"];
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left border rounded-xl p-4 transition-all hover:shadow-md ${
        selected
          ? "border-[#0057FF] bg-blue-50 shadow-md"
          : "border-gray-100 hover:border-blue-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="font-semibold text-[#0A0A0A] text-sm truncate">{planet.pl_name}</span>
        </div>
        <ProbBadge value={planet.civProb} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Distance</span>
          <span className="font-mono font-medium text-[#0A0A0A]">
            {planet.lightYears < 1000
              ? planet.lightYears.toFixed(1)
              : (planet.lightYears / 1000).toFixed(2) + "k"} LY
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Star type</span>
          <span className="font-mono font-medium" style={{ color }}>
            {planet.starClass !== "?" ? `${planet.starClass}-type` : "Unknown"}
          </span>
        </div>
        {planet.pl_rade !== null && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Radius</span>
            <span className="font-mono font-medium text-[#0A0A0A]">{planet.pl_rade.toFixed(2)} R⊕</span>
          </div>
        )}
        {planet.isHabitable && (
          <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Habitable Zone
          </div>
        )}
      </div>
    </button>
  );
}

function PlanetDetailPanel({ planet, onClose }: { planet: Planet; onClose: () => void }) {
  const color = STAR_COLORS[planet.starClass] ?? STAR_COLORS["?"];

  const rows: { label: string; value: string | null }[] = [
    { label: "Distance", value: `${planet.lightYears.toFixed(2)} light years (${(planet.sy_dist ?? 0).toFixed(2)} pc)` },
    { label: "Star type", value: planet.starClass !== "?" ? STAR_LABELS[planet.starClass] ?? planet.starClass : "Unknown" },
    { label: "Star temperature", value: planet.st_teff !== null ? `${planet.st_teff.toLocaleString()} K` : null },
    { label: "Orbital distance", value: planet.pl_orbsmax !== null ? `${planet.pl_orbsmax.toFixed(4)} AU` : null },
    { label: "Planet radius", value: planet.pl_rade !== null ? `${planet.pl_rade.toFixed(3)} Earth radii` : null },
    { label: "Equilibrium temp.", value: planet.pl_eqt !== null ? `${planet.pl_eqt.toFixed(0)} K` : null },
    { label: "Discovery year", value: planet.disc_year !== null ? `${planet.disc_year}` : null },
    { label: "Habitable zone", value: planet.isHabitable ? "Yes — within estimated habitable zone" : "No" },
  ];

  return (
    <div className="border border-gray-100 rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-[#0A0F2C] px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs font-mono text-gray-400">
                {planet.starClass !== "?" ? `${planet.starClass}-type star` : "Star type unknown"}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white leading-tight">{planet.pl_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{planet.lightYears.toFixed(2)} light years away</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono" style={{ color: PROB_COLOR(planet.civProb) }}>
              {planet.civProb}%
            </div>
            <div className="text-xs text-gray-500">civ. probability</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors p-1"
          aria-label="Close detail panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Data rows */}
      <div className="divide-y divide-gray-50">
        {rows
          .filter((r) => r.value !== null)
          .map((row) => (
            <div key={row.label} className="flex items-start justify-between px-5 py-3 gap-4">
              <span className="text-xs text-gray-500 flex-shrink-0">{row.label}</span>
              <span
                className={`text-xs font-medium text-right ${
                  row.label === "Habitable zone"
                    ? planet.isHabitable ? "text-green-600" : "text-gray-400"
                    : "text-[#0A0A0A] font-mono"
                }`}
              >
                {row.value}
              </span>
            </div>
          ))}
      </div>

      {/* Probability explanation */}
      <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
        <div className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-500 leading-relaxed">
            Civilization probability is calculated from: habitable zone position (+40),
            star type favorability (+35 max), planet size (+22 max), and data recency.
            G-type stars like our Sun score highest.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FILTER_OPTIONS: { key: FilterMode; label: string }[] = [
  { key: "all", label: "All Planets" },
  { key: "habitable", label: "Habitable Zone" },
  { key: "earthlike", label: "Earth-like Size" },
  { key: "nearest", label: "Nearest First" },
  { key: "highest", label: "Highest Probability" },
];

export default function Universe() {
  const [rawPlanets, setRawPlanets] = useState<Planet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Planet | null>(null);
  const [mapPlanets, setMapPlanets] = useState<Planet[]>([]);

  // Process raw API data into Planet objects
  const processPlanets = useCallback((raw: RawPlanet[]): Planet[] => {
    const CX = 350;
    const CY = 240;
    const MAX_R = 210;

    return raw
      .filter((p) => p.sy_dist !== null && p.pl_name)
      .map((p) => {
        const starClass = getStarClass(p.st_spectype, p.st_teff);
        const habitable = isInHabitableZone(p);
        const civProb = calcCivProb(p, habitable, starClass);
        const lightYears = (p.sy_dist ?? 0) * 3.26156;
        const pos = computeMapPos(p, CX, CY, MAX_R);
        return {
          ...p,
          lightYears,
          isHabitable: habitable,
          civProb,
          starClass,
          mapX: pos.x,
          mapY: pos.y,
        };
      })
      .sort((a, b) => a.lightYears - b.lightYears);
  }, []);

  // Fetch planets from our proxy
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
        const res = await fetch(`${apiBase}/api/planets`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data: RawPlanet[] = await res.json();
        if (!cancelled) {
          const processed = processPlanets(data);
          setRawPlanets(processed);
          // Limit map to 1500 for performance
          setMapPlanets(processed.slice(0, 1500));
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Failed to load planet data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [processPlanets]);

  // Filtered + searched planet list
  const filteredPlanets = useMemo(() => {
    let list = rawPlanets;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.pl_name.toLowerCase().includes(q));
    }

    switch (filter) {
      case "habitable":
        list = list.filter((p) => p.isHabitable);
        break;
      case "earthlike":
        list = list.filter((p) => p.pl_rade !== null && p.pl_rade >= 0.5 && p.pl_rade <= 2.0);
        break;
      case "nearest":
        list = [...list].sort((a, b) => a.lightYears - b.lightYears);
        break;
      case "highest":
        list = [...list].sort((a, b) => b.civProb - a.civProb);
        break;
    }

    return list;
  }, [rawPlanets, filter, search]);

  // Stats
  const stats = useMemo(() => ({
    total: rawPlanets.length,
    habitable: rawPlanets.filter((p) => p.isHabitable).length,
    earthlike: rawPlanets.filter((p) => p.pl_rade !== null && p.pl_rade >= 0.5 && p.pl_rade <= 2.0).length,
    highProb: rawPlanets.filter((p) => p.civProb >= 40).length,
  }), [rawPlanets]);

  return (
    <main className="pt-16 min-h-screen bg-white flex flex-col">
      {/* Header */}
      <section className="bg-white border-b border-gray-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-3">
                Universe Explorer
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-[#0A0A0A] leading-tight">
                Real confirmed exoplanets
              </h1>
              <p className="mt-2 text-gray-500 max-w-xl">
                Every planet below is real data from the NASA Exoplanet Archive. Positions
                are mapped by distance from Earth. Civilization probability is calculated
                from habitable zone, star type, and planet size.
              </p>
            </div>
            {!loading && !error && (
              <div className="flex gap-6 text-center flex-shrink-0">
                <div>
                  <div className="text-2xl font-bold font-mono text-[#0A0A0A]">{stats.total.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Total planets</div>
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-green-600">{stats.habitable}</div>
                  <div className="text-xs text-gray-500">In habitable zone</div>
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-[#0057FF]">{stats.earthlike}</div>
                  <div className="text-xs text-gray-500">Earth-like size</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-8 h-8 text-[#0057FF] animate-spin" />
            <p className="text-sm text-gray-500">Fetching real exoplanet data from NASA...</p>
            <p className="text-xs text-gray-400 font-mono">NASA Exoplanet Archive — TAP Service</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-orange-500" />
            </div>
            <p className="text-sm font-medium text-[#0A0A0A]">Could not load planet data</p>
            <p className="text-xs text-gray-500 max-w-sm text-center">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-[#0057FF] font-medium hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Main content */}
        {!loading && !error && (
          <div className="space-y-8">
            {/* Star Map */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#0A0A0A]">
                  Interactive Star Map
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    — {mapPlanets.length.toLocaleString()} planets plotted by distance from Sol
                  </span>
                </h2>
                {/* Legend */}
                <div className="hidden sm:flex items-center gap-3 flex-wrap justify-end">
                  {(["G", "K", "M", "F"] as const).map((c) => (
                    <div key={c} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STAR_COLORS[c] }} />
                      <span className="text-xs text-gray-500">{c}-type</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full border border-green-500 border-opacity-50" style={{ backgroundColor: "transparent" }} />
                    <span className="text-xs text-gray-500">Habitable</span>
                  </div>
                </div>
              </div>
              <StarMapSVG
                planets={mapPlanets}
                selected={selected}
                onSelect={setSelected}
              />
              {selected && (
                <p className="mt-2 text-xs text-center text-gray-400 font-mono">
                  Selected: {selected.pl_name} — click anywhere else on the list to deselect
                </p>
              )}
            </div>

            {/* Detail panel (if selected) */}
            {selected && (
              <div className="relative">
                <PlanetDetailPanel planet={selected} onClose={() => setSelected(null)} />
              </div>
            )}

            {/* Filters + search */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setFilter(opt.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      filter === opt.key
                        ? "bg-[#0057FF] text-white"
                        : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                    {opt.key === "habitable" && (
                      <span className="ml-1.5 text-xs opacity-75">({stats.habitable})</span>
                    )}
                    {opt.key === "earthlike" && (
                      <span className="ml-1.5 text-xs opacity-75">({stats.earthlike})</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search planet name..."
                  className="w-full pl-9 pr-8 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0057FF] focus:border-transparent"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 font-mono">
                {filteredPlanets.length.toLocaleString()} planets
                {filter !== "all" || search ? ` (filtered from ${rawPlanets.length.toLocaleString()})` : " loaded from NASA"}
              </p>
              {filter === "highest" && (
                <p className="text-xs text-gray-400">
                  Sorted by civilization probability — highest first
                </p>
              )}
            </div>

            {/* Planet grid */}
            {filteredPlanets.length === 0 ? (
              <div className="text-center py-16">
                <Globe className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No planets match your search.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPlanets.slice(0, 200).map((p) => (
                  <PlanetCard
                    key={p.pl_name}
                    planet={p}
                    selected={selected?.pl_name === p.pl_name}
                    onSelect={() => setSelected(p)}
                  />
                ))}
              </div>
            )}

            {filteredPlanets.length > 200 && (
              <p className="text-center text-xs text-gray-400 pt-4">
                Showing 200 of {filteredPlanets.length.toLocaleString()} results.
                Use filters or search to narrow down.
              </p>
            )}

            {/* Data source note */}
            <div className="border-t border-gray-100 pt-6">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-400 leading-relaxed">
                  All planet data is fetched live from the{" "}
                  <span className="font-mono">NASA Exoplanet Archive Planetary Systems Composite Parameters (pscomppars)</span>{" "}
                  table via their free TAP service. Civilization probability scores are Thealins
                  estimates based on peer-reviewed criteria — not NASA classifications.
                  Habitable zone boundaries use the Kopparapu et al. (2013) conservative estimates.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
