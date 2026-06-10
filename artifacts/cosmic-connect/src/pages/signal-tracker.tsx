import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Radio, ArrowLeft, Loader2, AlertCircle, Zap } from "lucide-react";

// ─── Physics Constants ─────────────────────────────────────────────────────────

const C_KM_S = 299_792; // speed of light in km/s
const LY_KM  = 9_461_000_000_000; // 1 light-year in km
const AU_KM  = 149_597_871;       // 1 AU in km

// ─── Milestones ───────────────────────────────────────────────────────────────

interface Milestone {
  name: string;
  km: number;
  description: string;
  color: string;
}

const MILESTONES: Milestone[] = [
  { name: "Moon",              km: 384_400,             description: "Earth's only natural satellite",   color: "#CBD5E1" },
  { name: "Sun",               km: 149_597_871,         description: "Our star — the source of life",    color: "#FCD34D" },
  { name: "Mars",              km: 225_000_000,         description: "The Red Planet",                   color: "#F97316" },
  { name: "Asteroid Belt",     km: 330_000_000,         description: "Debris from the early solar system", color: "#94A3B8" },
  { name: "Jupiter",           km: 778_500_000,         description: "Largest planet in our system",     color: "#D97706" },
  { name: "Saturn",            km: 1_430_000_000,       description: "Lord of the rings",                color: "#EAB308" },
  { name: "Uranus",            km: 2_880_000_000,       description: "The ice giant",                    color: "#67E8F9" },
  { name: "Neptune",           km: 4_500_000_000,       description: "The windy world",                  color: "#3B82F6" },
  { name: "Pluto",             km: 5_906_400_000,       description: "Edge of the inner solar system",   color: "#A78BFA" },
  { name: "Heliosphere Edge",  km: 18_000_000_000,      description: "Where solar wind stops — interstellar space begins", color: "#6366F1" },
  { name: "Oort Cloud",        km: 0.5 * LY_KM,        description: "Comet reservoir at the solar system's edge", color: "#818CF8" },
  { name: "Proxima Centauri",  km: 4.24  * LY_KM,      description: "Nearest star to our Sun",          color: "#F472B6" },
  { name: "Alpha Centauri",    km: 4.37  * LY_KM,      description: "Triple-star system",               color: "#FB923C" },
  { name: "Barnard's Star",    km: 5.96  * LY_KM,      description: "Fastest moving star in our sky",   color: "#A3E635" },
  { name: "Sirius",            km: 8.6   * LY_KM,      description: "Brightest star in the night sky",  color: "#E0F2FE" },
  { name: "Vega",              km: 25    * LY_KM,       description: "Carl Sagan's first contact target", color: "#C4B5FD" },
  { name: "Pleiades Cluster",  km: 444   * LY_KM,       description: "The Seven Sisters star cluster",   color: "#93C5FD" },
  { name: "Milky Way Centre",  km: 26_000 * LY_KM,     description: "The heart of our galaxy",          color: "#FDE68A" },
  { name: "Andromeda Galaxy",  km: 2_537_000 * LY_KM,  description: "Our nearest galactic neighbour",   color: "#F9A8D4" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distanceKm(sentAtMs: number): number {
  return C_KM_S * (Date.now() - sentAtMs) / 1000;
}

function formatDistance(km: number): string {
  if (km < 1_000)          return `${km.toFixed(0)} km`;
  if (km < 1_000_000)      return `${(km / 1_000).toFixed(1)} thousand km`;
  if (km < AU_KM)          return `${(km / 1_000_000).toFixed(2)} million km`;
  if (km < 60 * C_KM_S)   return `${(km / C_KM_S / 60).toFixed(2)} light-minutes`;
  if (km < 24 * 3600 * C_KM_S) return `${(km / C_KM_S / 3600).toFixed(2)} light-hours`;
  if (km < LY_KM)          return `${(km / (C_KM_S * 86400)).toFixed(1)} light-days`;
  return `${(km / LY_KM).toFixed(4)} light-years`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const y = Math.floor(d / 365);
  if (y > 0) return `${y}y ${d % 365}d`;
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function nextMilestone(km: number): Milestone | null {
  return MILESTONES.find((m) => m.km > km) ?? null;
}

function lastMilestone(km: number): Milestone | null {
  const passed = MILESTONES.filter((m) => m.km <= km);
  return passed[passed.length - 1] ?? null;
}

function progressToNext(km: number): number {
  const prev = lastMilestone(km);
  const next = nextMilestone(km);
  if (!next) return 1;
  const from = prev ? prev.km : 0;
  return Math.min(1, (km - from) / (next.km - from));
}

// ─── Stars Canvas ─────────────────────────────────────────────────────────────

interface Star { x: number; y: number; r: number; alpha: number; twinkleSpeed: number }

function useStars(count: number): Star[] {
  const [stars] = useState<Star[]>(() =>
    Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.5 + 0.2,
      alpha: Math.random() * 0.6 + 0.3,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
    }))
  );
  return stars;
}

function SignalCanvas({ distKm }: { distKm: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stars = useStars(300);
  const frameRef = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth  * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function draw(ts: number) {
      if (!canvas || !ctx) return;
      const dt = ts - timeRef.current;
      timeRef.current = ts;
      const W = canvas.width, H = canvas.height;

      // Background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);

      // Nebula glow
      const nebulaGrad = ctx.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.6);
      nebulaGrad.addColorStop(0, "rgba(0, 30, 80, 0.25)");
      nebulaGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = nebulaGrad;
      ctx.fillRect(0, 0, W, H);

      const nebulaGrad2 = ctx.createRadialGradient(W * 0.8, H * 0.7, 0, W * 0.8, H * 0.7, W * 0.5);
      nebulaGrad2.addColorStop(0, "rgba(60, 0, 80, 0.15)");
      nebulaGrad2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = nebulaGrad2;
      ctx.fillRect(0, 0, W, H);

      // Stars
      stars.forEach((s) => {
        const twinkle = Math.sin(ts * s.twinkleSpeed + s.x * 100) * 0.3 + 0.7;
        ctx.globalAlpha = s.alpha * twinkle;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r * devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Earth position — bottom center
      const ex = W / 2, ey = H * 0.82;

      // Log-scale: map distance to radius on screen
      const maxLogDist = Math.log10(MILESTONES[MILESTONES.length - 1].km + 1);
      const logDist = distKm > 0 ? Math.log10(distKm + 1) : 0;
      const maxRadius = Math.min(W, H) * 0.72;

      // Draw milestone rings
      MILESTONES.forEach((m) => {
        const mLog = Math.log10(m.km + 1);
        const mRadius = (mLog / maxLogDist) * maxRadius;
        if (mRadius > maxRadius) return;
        ctx.globalAlpha = m.km <= distKm ? 0.35 : 0.08;
        ctx.strokeStyle = m.km <= distKm ? m.color : "#334155";
        ctx.lineWidth = 1 * devicePixelRatio;
        ctx.setLineDash([3 * devicePixelRatio, 6 * devicePixelRatio]);
        ctx.beginPath();
        ctx.arc(ex, ey, mRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      ctx.globalAlpha = 1;

      // Signal wave rings — expanding pulses
      const signalRadius = (logDist / maxLogDist) * maxRadius;
      for (let i = 0; i < 4; i++) {
        const phase = ((ts / 1200 + i * 0.25) % 1);
        const ringR  = signalRadius * (1 - phase * 0.15);
        const alpha  = (1 - phase) * 0.7;
        if (ringR <= 0) continue;
        const grad = ctx.createRadialGradient(ex, ey, ringR - 3 * devicePixelRatio, ex, ey, ringR + 3 * devicePixelRatio);
        grad.addColorStop(0, `rgba(0, 87, 255, 0)`);
        grad.addColorStop(0.5, `rgba(0, 120, 255, ${alpha})`);
        grad.addColorStop(1, `rgba(0, 87, 255, 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3 * devicePixelRatio;
        ctx.beginPath();
        ctx.arc(ex, ey, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Solid signal front ring
      if (signalRadius > 0) {
        ctx.strokeStyle = "rgba(0, 170, 255, 0.9)";
        ctx.lineWidth = 2 * devicePixelRatio;
        ctx.shadowColor = "#0057FF";
        ctx.shadowBlur  = 16 * devicePixelRatio;
        ctx.beginPath();
        ctx.arc(ex, ey, signalRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Earth glow
      const earthGlow = ctx.createRadialGradient(ex, ey, 0, ex, ey, 24 * devicePixelRatio);
      earthGlow.addColorStop(0, "rgba(0, 120, 255, 0.4)");
      earthGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = earthGlow;
      ctx.beginPath();
      ctx.arc(ex, ey, 24 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();

      // Earth dot
      ctx.fillStyle = "#2563EB";
      ctx.beginPath();
      ctx.arc(ex, ey, 6 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#60A5FA";
      ctx.lineWidth = 1.5 * devicePixelRatio;
      ctx.stroke();

      // Earth label
      ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
      ctx.font = `${10 * devicePixelRatio}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("EARTH", ex, ey + 18 * devicePixelRatio);

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
  }, [stars, distKm]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}

// ─── Signal Data ──────────────────────────────────────────────────────────────

interface SignalData {
  originalText: string;
  authorName: string;
  sentAt: Timestamp;
  totalBits: number;
  status: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SignalTracker() {
  const { id } = useParams<{ id: string }>();
  const [signal, setSignal] = useState<SignalData | null>(null);
  const [loading, setLoading]= useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [distKm, setDistKm] = useState(0);
  const [elapsed, setElapsed]= useState(0);

  // Fetch signal from Firestore
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "messages", id))
      .then((snap) => {
        if (!snap.exists()) { setError("Signal not found."); return; }
        setSignal(snap.data() as SignalData);
      })
      .catch(() => setError("Could not load signal data."))
      .finally(() => setLoading(false));
  }, [id]);

  // Real-time distance ticker — updates every 250ms
  useEffect(() => {
    if (!signal) return;
    const sentMs = signal.sentAt.toMillis();
    function tick() {
      const now = Date.now();
      setDistKm(distanceKm(sentMs));
      setElapsed(now - sentMs);
    }
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [signal]);

  const next  = signal ? nextMilestone(distKm)   : null;
  const last  = signal ? lastMilestone(distKm)    : null;
  const prog  = signal ? progressToNext(distKm)   : 0;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="pt-16 min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Locating your signal…</p>
        </div>
      </main>
    );
  }

  if (error || !signal) {
    return (
      <main className="pt-16 min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-4" />
          <p className="text-gray-300 mb-4">{error ?? "Signal not found."}</p>
          <Link href="/encode" className="text-blue-400 hover:underline text-sm">
            ← Back to Encoder
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-16 min-h-screen bg-black text-white flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <Link
          href="/encode"
          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <span className="text-white/20">|</span>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">
            Signal Active — Traveling at Light Speed
          </span>
        </div>
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">

        {/* LEFT — Canvas ───────────────────────────────────────────────────── */}
        <div className="lg:flex-1 relative" style={{ minHeight: "55vw", maxHeight: "85vh" }}>
          <SignalCanvas distKm={distKm} />

          {/* Floating distance badge */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 border border-white/15 backdrop-blur-sm rounded-2xl px-6 py-3 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Distance from Earth</p>
            <p className="font-mono text-2xl font-bold text-white leading-none">
              {formatDistance(distKm)}
            </p>
          </div>

          {/* Current milestone badge */}
          {last && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/70 border border-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
              <p className="text-xs text-gray-400">Passed:</p>
              <p className="text-sm font-semibold" style={{ color: last.color }}>
                {last.name}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT — Info panel ──────────────────────────────────────────────── */}
        <div className="lg:w-96 border-l border-white/10 overflow-y-auto flex flex-col">

          {/* Message header */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">
                Your Transmission
              </span>
            </div>
            <p className="text-white font-medium leading-relaxed mb-3">
              &ldquo;{signal.originalText}&rdquo;
            </p>
            <p className="text-xs text-gray-500">
              Transmitted by{" "}
              <span className="text-gray-300 font-medium">{signal.authorName}</span>
            </p>
          </div>

          {/* Live stats */}
          <div className="p-6 border-b border-white/10 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Time Elapsed</p>
              <p className="font-mono text-lg font-bold text-white">{formatElapsed(elapsed)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Speed</p>
              <p className="font-mono text-lg font-bold text-white">
                299,792 <span className="text-xs text-gray-400 font-normal">km/s</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Signal Size</p>
              <p className="font-mono text-lg font-bold text-white">
                {signal.totalBits?.toLocaleString() ?? "—"}
                <span className="text-xs text-gray-400 font-normal ml-1">bits</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Frequency</p>
              <p className="font-mono text-lg font-bold text-white">
                1420 <span className="text-xs text-gray-400 font-normal">MHz</span>
              </p>
            </div>
          </div>

          {/* Next milestone */}
          {next && (
            <div className="p-6 border-b border-white/10">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                Next milestone
              </p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: next.color }}>
                  {next.name}
                </span>
                <span className="text-xs text-gray-400">
                  {formatDistance(next.km - distKm)} away
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-2">
                <div
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${prog * 100}%`, backgroundColor: next.color }}
                />
              </div>
              <p className="text-xs text-gray-500">{next.description}</p>
            </div>
          )}

          {/* Milestones passed list */}
          <div className="p-6 flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">
              Journey so far
            </p>
            <div className="space-y-3">
              {MILESTONES.map((m) => {
                const passed = distKm >= m.km;
                return (
                  <div
                    key={m.name}
                    className={`flex items-center gap-3 transition-opacity ${passed ? "opacity-100" : "opacity-25"}`}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: passed ? m.color : "#334155" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${passed ? "text-white" : "text-gray-600"}`}>
                        {m.name}
                      </p>
                      <p className="text-xs text-gray-600 truncate">{formatDistance(m.km)}</p>
                    </div>
                    {passed && (
                      <span className="text-xs font-semibold text-green-400 flex-shrink-0">
                        ✓ Passed
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer CTA */}
          <div className="p-6 border-t border-white/10">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <Zap className="w-5 h-5 text-blue-400 mx-auto mb-2" />
              <p className="text-xs text-gray-400 leading-relaxed">
                This signal will keep traveling forever — even after you close this page.
                It was transmitted on{" "}
                <span className="text-white">
                  {new Date(signal.sentAt.toMillis()).toLocaleDateString("en-IN", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
                .
              </p>
            </div>
            <Link
              href="/encode"
              className="mt-3 block text-center text-xs text-blue-400 hover:underline"
            >
              Send another message →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
