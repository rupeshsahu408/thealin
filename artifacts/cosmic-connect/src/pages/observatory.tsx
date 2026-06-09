import { useState, useEffect, useRef } from "react";
import * as tf from "@tensorflow/tfjs";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import Footer from "@/components/layout/footer";
import {
  Radio,
  AlertTriangle,
  Flag,
  Info,
  Loader2,
  ChevronRight,
  Wifi,
  Activity,
  Clock,
} from "lucide-react";

// ─── Constants ─────────────────────────────────────────────────────────────

const HYDROGEN_LINE_MHZ = 1420.405751;
const N_SAMPLES = 512;
const CANVAS_H = 160;
const ANIMATION_INTERVAL_MS = 50; // 20fps signal scroll
const ANALYSIS_INTERVAL_MS = 1500; // AI re-scores every 1.5s
const METRICS_INTERVAL_MS = 2000; // stats update every 2s

// Real WebSDR stations worldwide
const STATIONS = [
  { name: "PI9CAM", location: "Dwingeloo, Netherlands", lat: 52.81, lon: 6.39 },
  { name: "CAMRAS", location: "Observatory, Netherlands", lat: 52.81, lon: 6.39 },
  { name: "UTwente SDR", location: "Enschede, Netherlands", lat: 52.22, lon: 6.89 },
  { name: "KiwiSDR", location: "Auckland, New Zealand", lat: -36.86, lon: 174.76 },
  { name: "W6YX", location: "Stanford University, CA", lat: 37.42, lon: -122.17 },
  { name: "OE9GHV", location: "Vorarlberg, Austria", lat: 47.51, lon: 9.74 },
];

// Anomaly cycle: normal 40s → rising 10s → peak anomaly 20s → falling 10s → repeat
const CYCLE_MS = 80_000;
const RISE_START = 40_000;
const PEAK_START = 50_000;
const FALL_START = 70_000;

// ─── Types ──────────────────────────────────────────────────────────────────

interface AIResult {
  score: number;
  kurtosisScore: number;
  corrScore: number;
  snrScore: number;
  verdict: "normal" | "anomaly" | "high-priority";
  reason: string;
}

interface FlaggedSignal {
  id: string;
  timestamp: Timestamp;
  frequency: number;
  source: string;
  strength: number;
  aiScore: number;
  status: "normal" | "anomaly" | "high-priority";
  flaggedBy: number;
  userDisplayName: string;
}

// ─── Utility ────────────────────────────────────────────────────────────────

function gaussRand(): number {
  // Box-Muller transform for Gaussian noise
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Generate one frame of signal data.
 * anomalyLevel 0-1: how strong the artificial signal is.
 */
function generateSignalFrame(t: number, anomalyLevel: number): Float32Array {
  const sig = new Float32Array(N_SAMPLES);
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];

  for (let i = 0; i < N_SAMPLES; i++) {
    // Base: Gaussian noise (radio background)
    let sample = gaussRand() * (0.12 - anomalyLevel * 0.08);

    // Natural drift (interstellar medium scintillation)
    sample += Math.sin(i * 0.07 + t * 0.0008) * 0.018;
    sample += Math.sin(i * 0.13 + t * 0.0003) * 0.010;

    if (anomalyLevel > 0) {
      // Artificial signal: prime-number modulated carrier
      // Uses first N primes weighted by position in frame
      for (let pi = 0; pi < Math.min(5, primes.length); pi++) {
        const p = primes[pi];
        const weight = anomalyLevel * 0.12 * (1 - pi * 0.12);
        sample += weight * Math.sin(i * p * 0.08 + t * 0.015 * p);
      }

      // Mathematical constant embedding (pi encoded in amplitude envelope)
      const piPhase = (Math.PI * i) / N_SAMPLES;
      sample += anomalyLevel * 0.08 * Math.sin(piPhase * 3.14159 + t * 0.01);
    }

    sig[i] = sample;
  }

  return sig;
}

/**
 * AI signal analysis using TensorFlow.js tensor operations.
 * Implements: kurtosis analysis, prime-lag autocorrelation, peak SNR.
 */
function analyzeSignal(signal: Float32Array): AIResult {
  let kurtosisScore = 0;
  let snrScore = 0;
  let kurtosisVal = 0;
  let snrVal = 0;

  // --- TF.js: kurtosis + SNR ---
  tf.tidy(() => {
    const t = tf.tensor1d(Array.from(signal));
    const { mean, variance } = tf.moments(t);
    const meanVal = mean.dataSync()[0];
    const varVal = variance.dataSync()[0];

    if (varVal > 1e-10) {
      // Kurtosis = E[(x-μ)^4] / σ^4   (Gaussian noise = 3.0)
      const centered = t.sub(tf.scalar(meanVal));
      const kurt4 = tf.mean(tf.pow(centered, tf.scalar(4)));
      const var2 = varVal * varVal;
      kurtosisVal = kurt4.dataSync()[0] / var2;

      // Peak SNR
      const maxAmp = tf.max(tf.abs(t)).dataSync()[0];
      const std = Math.sqrt(varVal);
      snrVal = std > 0 ? maxAmp / std : 1;
    }
  });

  kurtosisScore = Math.max(0, (kurtosisVal - 3.0) * 7);
  snrScore = Math.max(0, (snrVal - 2.8) * 9);

  // --- Prime-lag autocorrelation (pure JS for speed) ---
  const primes = [2, 3, 5, 7, 11, 13, 17, 23];
  let corrSum = 0;
  for (const p of primes) {
    let corr = 0;
    for (let i = 0; i < N_SAMPLES - p; i++) {
      corr += signal[i] * signal[i + p];
    }
    corrSum += Math.abs(corr / (N_SAMPLES - p));
  }
  const corrScore = (corrSum / primes.length) * 700;

  const raw = Math.round(kurtosisScore + snrScore + corrScore);
  const score = Math.min(100, Math.max(0, raw));

  const verdict: AIResult["verdict"] =
    score >= 90 ? "high-priority" : score >= 70 ? "anomaly" : "normal";

  const reason =
    score >= 90
      ? "Extreme regularity detected — prime-number harmonic structure confirmed across multiple frequency bands"
      : score >= 70
      ? "Non-natural amplitude modulation pattern — autocorrelation at prime lags elevated"
      : score >= 40
      ? "Mild statistical deviation from background noise baseline"
      : "Signal consistent with natural radio background — no anomalous patterns detected";

  return { score, kurtosisScore, corrScore, snrScore, verdict, reason };
}

// ─── Waveform Canvas ────────────────────────────────────────────────────────

function WaveformCanvas({
  signalRef,
  verdict,
}: {
  signalRef: React.RefObject<Float32Array | null>;
  verdict: AIResult["verdict"];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  // Ring buffer: we scroll the waveform left on each frame
  const historyRef = useRef<Float32Array>(new Float32Array(800));
  const historyPosRef = useRef(0);

  const lineColor =
    verdict === "high-priority"
      ? "#FF6D00"
      : verdict === "anomaly"
      ? "#00C853"
      : "#0057FF";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      if (!canvas || !ctx) return;

      const W = canvas.width;
      const H = canvas.height;

      // Append latest signal mean to history ring buffer
      const sig = signalRef.current;
      if (sig) {
        // Take every 4th sample to condense 512 → ~128 history points per frame
        const step = Math.floor(N_SAMPLES / 4);
        for (let s = 0; s < 4; s++) {
          const val = sig[s * step] ?? 0;
          historyRef.current[historyPosRef.current % historyRef.current.length] = val;
          historyPosRef.current++;
        }
      }

      // Clear
      ctx.fillStyle = "#0A0F2C";
      ctx.fillRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let g = 1; g < 4; g++) {
        const y = (H / 4) * g;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      for (let gx = 1; gx < 8; gx++) {
        const x = (W / 8) * gx;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      // Baseline
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();

      // Signal fill gradient
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, lineColor + "30");
      grad.addColorStop(0.5, lineColor + "08");
      grad.addColorStop(1, "transparent");

      const len = historyRef.current.length;
      const pos = historyPosRef.current;
      const scale = (H / 2) * 0.75;

      // Draw fill
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      for (let x = 0; x < W; x++) {
        const idx = (pos - W + x + len) % len;
        const val = historyRef.current[idx] ?? 0;
        const y = H / 2 - val * scale;
        if (x === 0) ctx.lineTo(0, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H / 2);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Draw line
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = lineColor;
      ctx.shadowBlur = 4;
      for (let x = 0; x < W; x++) {
        const idx = (pos - W + x + len) % len;
        const val = historyRef.current[idx] ?? 0;
        const y = H / 2 - val * scale;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [lineColor, signalRef]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={CANVAS_H}
      className="w-full rounded-lg"
      style={{ height: CANVAS_H, imageRendering: "crisp-edges" }}
    />
  );
}

// ─── Score Meter ────────────────────────────────────────────────────────────

function ScoreMeter({ result }: { result: AIResult }) {
  const { score, verdict } = result;
  const color =
    verdict === "high-priority"
      ? "#FF6D00"
      : verdict === "anomaly"
      ? "#00C853"
      : "#0057FF";

  const pct = score / 100;
  const circumference = 2 * Math.PI * 38;
  const dash = circumference * pct;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r="38" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <circle
            cx="44" cy="44" r="38"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-mono text-white leading-none" style={{ color }}>
            {score}
          </span>
          <span className="text-xs text-gray-500">/100</span>
        </div>
      </div>
      <span
        className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
        style={{
          color,
          backgroundColor: color + "18",
          border: `1px solid ${color}30`,
        }}
      >
        {verdict === "high-priority" ? "HIGH PRIORITY" : verdict === "anomaly" ? "ANOMALY" : "NORMAL"}
      </span>
    </div>
  );
}

// ─── Alert Banner ────────────────────────────────────────────────────────────

function AlertBanner({ result }: { result: AIResult }) {
  if (result.verdict === "normal") return null;

  const isHighPriority = result.verdict === "high-priority";
  return (
    <div
      className={`flex items-start gap-3 rounded-xl px-5 py-4 border ${
        isHighPriority
          ? "bg-orange-950/40 border-orange-500/40"
          : "bg-green-950/40 border-green-500/40"
      }`}
    >
      <AlertTriangle
        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
          isHighPriority ? "text-orange-400" : "text-green-400"
        }`}
      />
      <div className="flex-1">
        <p className={`text-sm font-semibold ${isHighPriority ? "text-orange-300" : "text-green-300"}`}>
          {isHighPriority
            ? `HIGH-PRIORITY SIGNAL DETECTED — AI Score: ${result.score}/100`
            : `Anomaly Detected — AI Score: ${result.score}/100`}
        </p>
        <p className="text-xs mt-0.5 text-gray-400 leading-relaxed">{result.reason}</p>
      </div>
      <span
        className="font-mono text-xs font-bold flex-shrink-0"
        style={{ color: isHighPriority ? "#FF6D00" : "#00C853" }}
      >
        {result.score}/100
      </span>
    </div>
  );
}

// ─── Flag Button ─────────────────────────────────────────────────────────────

function FlagSection({
  result,
  station,
  strength,
  onFlagged,
}: {
  result: AIResult;
  station: (typeof STATIONS)[0];
  strength: number;
  onFlagged: (id: string) => void;
}) {
  const { user } = useAuth();
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFlag() {
    if (!user || flagging || flagged) return;
    setFlagging(true);
    setError(null);
    try {
      const ref = await addDoc(collection(db, "signals"), {
        timestamp: Timestamp.now(),
        frequency: HYDROGEN_LINE_MHZ,
        source: `${station.name}, ${station.location}`,
        strength: Math.round(strength),
        flaggedBy: 1,
        flaggedByUsers: [user.uid],
        status: result.verdict === "high-priority" ? "high-priority" : result.verdict,
        aiScore: result.score,
        userDisplayName: user.displayName || user.email?.split("@")[0] || "Explorer",
      });
      setFlagged(true);
      onFlagged(ref.id);
    } catch (e: any) {
      setError("Could not save flag. Please try again.");
    } finally {
      setFlagging(false);
    }
  }

  return (
    <div className="border border-white/10 rounded-xl p-5 bg-white/5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Flag as Interesting</h3>
          <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
            If this signal looks unusual to you, flag it for the community. Signals
            flagged by 10+ users are escalated to High Priority.
          </p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
        <div className="flex-shrink-0">
          {!user ? (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-white/20 text-white font-medium px-4 py-2 rounded-md hover:bg-white/10 transition-colors text-sm"
            >
              Sign in to flag
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : flagged ? (
            <div className="inline-flex items-center gap-2 bg-green-500/20 border border-green-500/30 text-green-300 font-medium px-4 py-2 rounded-md text-sm">
              <Flag className="w-4 h-4" />
              Flagged
            </div>
          ) : (
            <button
              onClick={handleFlag}
              disabled={flagging}
              className="inline-flex items-center gap-2 bg-[#0057FF] text-white font-medium px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {flagging ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Flag className="w-4 h-4" />
              )}
              {flagging ? "Saving..." : "Flag as Interesting"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Recent Flags ────────────────────────────────────────────────────────────

function RecentFlags({ newFlagId }: { newFlagId: string | null }) {
  const [flags, setFlags] = useState<FlaggedSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "signals"),
      orderBy("timestamp", "desc"),
      limit(12)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data: FlaggedSignal[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FlaggedSignal, "id">),
      }));
      setFlags(data);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const statusColor = (s: string) =>
    s === "high-priority" ? "#FF6D00" : s === "anomaly" ? "#00C853" : "#6B7280";

  const statusLabel = (s: string) =>
    s === "high-priority" ? "High Priority" : s === "anomaly" ? "Anomaly" : "Normal";

  function timeAgo(ts: Timestamp): string {
    const secs = Math.floor((Date.now() - ts.toMillis()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  return (
    <section className="bg-white py-12 border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-1">
              Community
            </p>
            <h2 className="text-xl font-bold text-[#0A0A0A]">Recent flagged signals</h2>
          </div>
          {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>

        {!loading && flags.length === 0 ? (
          <div className="text-center py-12 border border-gray-100 rounded-xl">
            <Radio className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              No signals flagged yet. Be the first to flag an anomaly.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {flags.map((flag) => (
              <div
                key={flag.id}
                className={`border rounded-xl px-5 py-4 transition-all ${
                  flag.id === newFlagId
                    ? "border-[#0057FF] bg-blue-50"
                    : "border-gray-100 bg-white hover:border-blue-100"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold text-[#0A0A0A]">
                        {(flag.frequency ?? HYDROGEN_LINE_MHZ).toFixed(6)} MHz
                      </span>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{
                          color: statusColor(flag.status),
                          backgroundColor: statusColor(flag.status) + "15",
                          border: `1px solid ${statusColor(flag.status)}30`,
                        }}
                      >
                        {statusLabel(flag.status)}
                      </span>
                      {flag.id === newFlagId && (
                        <span className="text-xs text-[#0057FF] font-medium">Just flagged</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Source: {flag.source} — Flagged by{" "}
                      <span className="font-medium text-[#0A0A0A]">{flag.userDisplayName}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span
                      className="text-lg font-bold font-mono leading-none"
                      style={{ color: statusColor(flag.status) }}
                    >
                      {flag.aiScore}
                      <span className="text-xs text-gray-400 font-normal">/100</span>
                    </span>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {flag.timestamp ? timeAgo(flag.timestamp) : "—"}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Flag className="w-3 h-3" />
                      {flag.flaggedBy} flag{flag.flaggedBy !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="w-full bg-gray-100 rounded-full h-1">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: `${flag.aiScore}%`,
                        backgroundColor: statusColor(flag.status),
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Main Observatory Page ────────────────────────────────────────────────────

export default function Observatory() {
  const [tfReady, setTfReady] = useState(false);
  const [stationIdx, setStationIdx] = useState(0);
  const [strength, setStrength] = useState(62);
  const [noiseFloor, setNoiseFloor] = useState(-118);
  const [aiResult, setAiResult] = useState<AIResult>({
    score: 8,
    kurtosisScore: 0,
    corrScore: 0,
    snrScore: 0,
    verdict: "normal",
    reason: "Signal consistent with natural radio background — no anomalous patterns detected",
  });
  const [newFlagId, setNewFlagId] = useState<string | null>(null);

  // Mutable refs — updated at 20fps without causing React re-renders
  const signalRef = useRef<Float32Array>(new Float32Array(N_SAMPLES));
  const cycleStartRef = useRef<number>(Date.now());
  const anomalyLevelRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  const station = STATIONS[stationIdx];

  // Initialize TF.js
  useEffect(() => {
    tf.ready().then(() => setTfReady(true));
  }, []);

  // Signal generation loop (20fps, no re-render)
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = (Date.now() - cycleStartRef.current) % CYCLE_MS;
      let level = 0;

      if (elapsed < RISE_START) {
        level = 0;
      } else if (elapsed < PEAK_START) {
        // Smooth rise
        level = (elapsed - RISE_START) / (PEAK_START - RISE_START);
      } else if (elapsed < FALL_START) {
        level = 1;
      } else {
        // Smooth fall
        level = 1 - (elapsed - FALL_START) / (CYCLE_MS - FALL_START);
      }

      anomalyLevelRef.current = level;
      signalRef.current = generateSignalFrame(frameCountRef.current++, level);
    }, ANIMATION_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  // AI analysis loop (every 1.5s)
  useEffect(() => {
    if (!tfReady) return;

    const id = setInterval(() => {
      const result = analyzeSignal(signalRef.current);
      setAiResult(result);
    }, ANALYSIS_INTERVAL_MS);

    return () => clearInterval(id);
  }, [tfReady]);

  // Signal metrics animation (every 2s)
  useEffect(() => {
    const id = setInterval(() => {
      const anomaly = anomalyLevelRef.current;
      setStrength(Math.round(55 + anomaly * 30 + (Math.random() - 0.5) * 5));
      setNoiseFloor(Math.round(-120 + anomaly * 4 + (Math.random() - 0.5) * 2));
      // Rotate station every ~60s
      if (Math.random() < 0.05) {
        setStationIdx((i) => (i + 1) % STATIONS.length);
      }
    }, METRICS_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  const frequencyDisplay = HYDROGEN_LINE_MHZ.toFixed(6);

  return (
    <main className="pt-16 min-h-screen bg-white flex flex-col">
      {/* Header */}
      <section className="bg-white border-b border-gray-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-3">
                Signal Observatory
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-[#0A0A0A] leading-tight">
                Live radio signal analysis
              </h1>
              <p className="mt-2 text-gray-500 max-w-xl">
                Monitoring the 1420.405751 MHz hydrogen line — the universal frequency
                any intelligent civilization with radio technology would know to use.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {!tfReady ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading AI engine...
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium bg-green-50 border border-green-100 rounded-full px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 signal-pulse" />
                  AI Online
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-[#0057FF] font-medium bg-blue-50 border border-blue-100 rounded-full px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0057FF] signal-pulse" />
                LIVE
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Signal Monitor — dark navy section */}
      <section className="bg-[#0A0F2C] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Station info bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <Wifi className="w-4 h-4 text-[#0057FF]" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Receiving from</p>
                <p className="text-sm font-medium text-white">
                  {station.name}{" "}
                  <span className="text-gray-400 font-normal">— {station.location}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-orange-400 bg-orange-950/40 border border-orange-500/20 rounded-full px-3 py-1">
              <Info className="w-3 h-3" />
              Simulated signal data — scientifically accurate model
            </div>
          </div>

          {/* Waveform */}
          <div className="relative">
            <WaveformCanvas signalRef={signalRef} verdict={aiResult.verdict} />
            <div className="absolute top-2 left-3 flex items-center gap-1.5 text-xs font-mono text-gray-500">
              <Activity className="w-3 h-3" />
              {HYDROGEN_LINE_MHZ} MHz — Hydrogen Line
            </div>
          </div>

          {/* Alert banner (inside dark section) */}
          {aiResult.verdict !== "normal" && (
            <AlertBanner result={aiResult} />
          )}

          {/* Metrics + AI score */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Frequency */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Frequency</p>
              <p className="text-lg font-mono font-bold text-white">
                {frequencyDisplay}
                <span className="text-xs text-gray-400 ml-1">MHz</span>
              </p>
              <p className="text-xs text-gray-600 mt-1">H I 21cm hydrogen line</p>
            </div>

            {/* Signal strength */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Signal Strength</p>
              <p className="text-lg font-mono font-bold text-white">
                {strength}
                <span className="text-xs text-gray-400 ml-1">dBm</span>
              </p>
              <div className="mt-2 w-full bg-white/10 rounded-full h-1">
                <div
                  className="h-1 rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (strength / 100) * 100)}%`,
                    backgroundColor: aiResult.verdict !== "normal" ? "#00C853" : "#0057FF",
                  }}
                />
              </div>
            </div>

            {/* Noise floor */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Noise Floor</p>
              <p className="text-lg font-mono font-bold text-white">
                {noiseFloor}
                <span className="text-xs text-gray-400 ml-1">dBm/Hz</span>
              </p>
              <p className="text-xs text-gray-600 mt-1">Thermal + galactic background</p>
            </div>

            {/* AI Score */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-center">
              {tfReady ? (
                <ScoreMeter result={aiResult} />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-xs">Initializing TF.js...</span>
                </div>
              )}
            </div>
          </div>

          {/* AI breakdown */}
          {tfReady && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-[#0057FF] signal-pulse" />
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  AI Analysis Breakdown
                </span>
              </div>
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                {[
                  {
                    label: "Kurtosis Score",
                    value: Math.min(100, Math.round(aiResult.kurtosisScore)),
                    hint: "Amplitude distribution vs. Gaussian baseline",
                  },
                  {
                    label: "Prime Autocorr.",
                    value: Math.min(100, Math.round(aiResult.corrScore)),
                    hint: "Self-similarity at prime-number time lags",
                  },
                  {
                    label: "Peak SNR",
                    value: Math.min(100, Math.round(aiResult.snrScore)),
                    hint: "Signal-to-noise ratio above thermal floor",
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-400">{item.label}</span>
                      <span className="text-xs font-mono font-bold text-white">{item.value}</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-700"
                        style={{
                          width: `${item.value}%`,
                          backgroundColor: aiResult.verdict !== "normal" ? "#00C853" : "#0057FF",
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{item.hint}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 leading-relaxed border-t border-white/10 pt-3">
                <span className="font-mono text-gray-300">TF.js:</span> {aiResult.reason}
              </p>
            </div>
          )}

          {/* Flag section */}
          <FlagSection
            result={aiResult}
            station={station}
            strength={strength}
            onFlagged={(id) => setNewFlagId(id)}
          />

          {/* Science note */}
          <div className="flex items-start gap-2 pb-2">
            <Info className="w-3.5 h-3.5 text-gray-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-600 leading-relaxed">
              The 1420.405751 MHz hydrogen line is produced by the spin-flip transition
              of neutral hydrogen atoms — the most abundant element in the universe.
              SETI researchers monitor this frequency because any technologically capable
              civilization would know it as a natural cosmic beacon. Real WebSDR integration
              is planned for a future phase.
            </p>
          </div>
        </div>
      </section>

      {/* Recent community flags */}
      <RecentFlags newFlagId={newFlagId} />

      <Footer />
    </main>
  );
}
