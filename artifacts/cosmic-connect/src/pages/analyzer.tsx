/**
 * Thealins — Phase 6: Advanced AI Signal Analyzer
 *
 * A dedicated page that runs a TF.js neural network + 4 independent pattern
 * detectors on a live signal stream, and explains exactly what the AI found
 * and why it reached each conclusion.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import Footer from "@/components/layout/footer";
import {
  Activity,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Loader2,
  Radio,
  Sigma,
  Waves,
  Zap,
} from "lucide-react";
import {
  buildAnalysisModel,
  classifySignal,
  generateNaturalNoise,
  generatePrimeSequenceSignal,
  generateMathematicalSignal,
  generateArtificialPulseSignal,
  N_SAMPLES,
  type ClassificationResult,
  type SignalClass,
  type DetectorResult,
} from "@/lib/signalAnalysis";

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_H = 160;
const FRAME_INTERVAL_MS = 50;  // 20fps waveform refresh
const ANALYSIS_INTERVAL_MS = 2000; // AI analysis every 2s
const HISTORY_MAX = 10;

// Automatic signal cycling: 30s natural → 20s prime → 20s math → 10s pulse → repeat
const SIGNAL_CYCLE: Array<{ type: SignalClass; durationMs: number }> = [
  { type: "natural",           durationMs: 30_000 },
  { type: "prime_sequence",    durationMs: 20_000 },
  { type: "mathematical",      durationMs: 20_000 },
  { type: "artificial_pulse",  durationMs: 10_000 },
];
const CYCLE_TOTAL_MS = SIGNAL_CYCLE.reduce((s, c) => s + c.durationMs, 0);

const STATIONS = [
  { name: "PI9CAM", location: "Dwingeloo, Netherlands" },
  { name: "UTwente SDR", location: "Enschede, Netherlands" },
  { name: "KiwiSDR", location: "Auckland, New Zealand" },
  { name: "W6YX", location: "Stanford University, CA" },
  { name: "OE9GHV", location: "Vorarlberg, Austria" },
];

const CLASS_META: Record<SignalClass, { label: string; color: string; bg: string; description: string }> = {
  natural:          { label: "Natural Noise",       color: "#6B7280", bg: "#6B728020", description: "Signal consistent with natural radio background radiation" },
  prime_sequence:   { label: "Prime Sequence",      color: "#0057FF", bg: "#0057FF20", description: "Carrier frequencies at prime harmonics — possible artificial origin" },
  mathematical:     { label: "Mathematical Pattern", color: "#00C853", bg: "#00C85320", description: "Frequency ratios matching π, e or φ — structured mathematical encoding" },
  artificial_pulse: { label: "Artificial Pulse",    color: "#FF6D00", bg: "#FF6D0020", description: "Regularly spaced pulses — engineered timing, not natural" },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: number;
  ts: number;
  result: ClassificationResult;
  signalType: SignalClass;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getCurrentSignalType(startMs: number): SignalClass {
  const elapsed = (Date.now() - startMs) % CYCLE_TOTAL_MS;
  let acc = 0;
  for (const seg of SIGNAL_CYCLE) {
    acc += seg.durationMs;
    if (elapsed < acc) return seg.type;
  }
  return "natural";
}

function generateSignal(type: SignalClass): Float32Array {
  switch (type) {
    case "prime_sequence":    return generatePrimeSequenceSignal(N_SAMPLES);
    case "mathematical":      return generateMathematicalSignal(N_SAMPLES);
    case "artificial_pulse":  return generateArtificialPulseSignal(N_SAMPLES);
    default:                  return generateNaturalNoise(N_SAMPLES);
  }
}

function formatMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(1)}ms`;
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

// ─── Waveform Canvas ──────────────────────────────────────────────────────────

function WaveformCanvas({
  signalRef,
  classification,
}: {
  signalRef: React.RefObject<Float32Array | null>;
  classification: SignalClass;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const historyRef = useRef<Float32Array>(new Float32Array(800));
  const posRef = useRef(0);

  const color = CLASS_META[classification].color;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      if (!canvas || !ctx) return;
      const W = canvas.width;
      const H = canvas.height;

      // Append samples to ring buffer
      const sig = signalRef.current;
      if (sig) {
        const step = Math.floor(N_SAMPLES / 4);
        for (let s = 0; s < 4; s++) {
          const v = sig[s * step] ?? 0;
          historyRef.current[posRef.current % historyRef.current.length] = v;
          posRef.current++;
        }
      }

      // Background
      ctx.fillStyle = "#0A0F2C";
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      for (let g = 1; g < 4; g++) {
        ctx.beginPath();
        ctx.moveTo(0, (H / 4) * g);
        ctx.lineTo(W, (H / 4) * g);
        ctx.stroke();
      }
      for (let gx = 1; gx < 8; gx++) {
        ctx.beginPath();
        ctx.moveTo((W / 8) * gx, 0);
        ctx.lineTo((W / 8) * gx, H);
        ctx.stroke();
      }
      // Baseline
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();

      const len = historyRef.current.length;
      const pos = posRef.current;
      const scale = (H / 2) * 0.75;

      // Gradient fill
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, color + "30");
      grad.addColorStop(0.5, color + "08");
      grad.addColorStop(1, "transparent");

      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      for (let x = 0; x < W; x++) {
        const idx = (pos - W + x + len) % len;
        const v = historyRef.current[idx] ?? 0;
        const y = H / 2 - v * scale;
        x === 0 ? ctx.lineTo(0, y) : ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H / 2);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Signal line
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      for (let x = 0; x < W; x++) {
        const idx = (pos - W + x + len) % len;
        const v = historyRef.current[idx] ?? 0;
        const y = H / 2 - v * scale;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [color, signalRef]);

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

// ─── Probability Bar ──────────────────────────────────────────────────────────

function ProbabilityBar({
  cls,
  prob,
  active,
}: {
  cls: SignalClass;
  prob: number;
  active: boolean;
}) {
  const meta = CLASS_META[cls];
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-xs font-medium w-36 flex-shrink-0 truncate"
        style={{ color: active ? meta.color : "#9CA3AF" }}
      >
        {meta.label}
      </span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${(prob * 100).toFixed(1)}%`,
            backgroundColor: meta.color,
          }}
        />
      </div>
      <span className="text-xs font-mono text-gray-500 w-10 text-right flex-shrink-0">
        {(prob * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Score Gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score, color }: { score: number; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64" className="transform -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1F2937" strokeWidth="5" />
        <circle
          cx="32" cy="32" r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold text-[#0A0A0A] leading-none">{score}</span>
        <span className="text-xs text-gray-400 leading-none mt-0.5">/100</span>
      </div>
    </div>
  );
}

// ─── Detector Card ────────────────────────────────────────────────────────────

function DetectorCard({
  title,
  icon,
  result,
  color,
  description,
}: {
  title: string;
  icon: React.ReactNode;
  result: DetectorResult;
  color: string;
  description: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const confColor =
    result.confidence === "high" ? "#00C853"
    : result.confidence === "medium" ? "#FF6D00"
    : "#6B7280";

  return (
    <div
      className="bg-white border rounded-xl overflow-hidden"
      style={{ borderColor: result.detected ? color + "40" : "#E5E7EB" }}
    >
      {/* Card header */}
      <div className="p-4 flex items-center gap-4">
        <ScoreGauge score={result.score} color={result.detected ? color : "#6B7280"} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="p-1 rounded" style={{ color: result.detected ? color : "#9CA3AF", backgroundColor: result.detected ? color + "15" : "#F3F4F6" }}>
              {icon}
            </span>
            <span className="text-sm font-semibold text-[#0A0A0A]">{title}</span>
            <span
              className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: confColor + "20", color: confColor }}
            >
              {result.confidence.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
          {result.detected && (
            <div
              className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold"
              style={{ color }}
            >
              <CheckCircle className="w-3 h-3" />
              Detected
            </div>
          )}
        </div>
      </div>

      {/* Evidence toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <span>Evidence ({result.evidence.length} items)</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-1.5 border-t border-gray-50">
          {result.evidence.map((line, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
              <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0 mt-1.5" />
              <span className="font-mono leading-relaxed">{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detection History ────────────────────────────────────────────────────────

function DetectionHistory({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return null;

  return (
    <section className="bg-white border-t border-gray-100 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-5">
          <Clock className="w-5 h-5 text-[#0057FF]" />
          <h2 className="text-lg font-bold text-[#0A0A0A]">Detection history</h2>
          <span className="ml-auto text-xs text-gray-400">Last {history.length} analyses</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Time", "Classification", "Confidence", "Prime score", "Math score", "Regularity", "Inference"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((entry, i) => {
                const meta = CLASS_META[entry.result.classification];
                return (
                  <tr
                    key={entry.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      i === 0 ? "bg-blue-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">
                      {timeAgo(entry.ts)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: meta.color + "20", color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#0A0A0A]">
                      {entry.result.confidence}%
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#0A0A0A]">
                      {entry.result.primeDetection.score}/100
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#0A0A0A]">
                      {entry.result.mathDetection.score}/100
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#0A0A0A]">
                      {entry.result.regularityDetection.score}/100
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {formatMs(entry.result.inferenceMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── Model Architecture Panel ─────────────────────────────────────────────────

function ModelArchPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#0057FF]" />
          <span className="text-sm font-semibold text-[#0A0A0A]">How the AI model works</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-4 text-sm text-gray-600">
          <div>
            <p className="font-semibold text-[#0A0A0A] mb-2">Neural network architecture</p>
            <div className="font-mono text-xs space-y-1 bg-gray-50 rounded-lg p-3">
              <p>Input:   32 features (Float32)</p>
              <p>Dense:   32 → 16  (activation: ReLU)</p>
              <p>Dense:   16 →  8  (activation: ReLU)</p>
              <p>Output:   8 →  4  (activation: Softmax)</p>
              <p>Classes: [natural, prime_sequence, mathematical, artificial_pulse]</p>
              <p>Runtime: TensorFlow.js — runs entirely in your browser, no server</p>
            </div>
          </div>
          <div>
            <p className="font-semibold text-[#0A0A0A] mb-2">32-feature extraction pipeline</p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              {[
                { name: "Statistical (6)", desc: "Mean, std, kurtosis, peak/RMS, skewness, RMS" },
                { name: "Autocorrelation (2)", desc: "Mean autocorrelation at prime vs non-prime lags" },
                { name: "FFT energy bands (8)", desc: "Spectral energy in 8 equal-width frequency bands" },
                { name: "Regularity (4)", desc: "Zero-crossing rate, periodicity, longest run, peak count" },
                { name: "Pattern scores (6)", desc: "Prime ratio, prime FFT score, individual prime correlations" },
                { name: "Prime correlations (6)", desc: "Autocorrelation at lags 2, 3, 5, 7, 11, 13 individually" },
              ].map((f) => (
                <div key={f.name} className="bg-gray-50 rounded-lg p-2.5">
                  <p className="font-semibold text-[#0A0A0A]">{f.name}</p>
                  <p className="text-gray-500 mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-[#0A0A0A] mb-2">Four independent pattern detectors</p>
            <div className="space-y-1.5 text-xs text-gray-600">
              <p><span className="font-semibold">Prime Sequence:</span> Compares autocorrelation at prime lags [2,3,5,7,11,13,17,19,23,29] vs non-prime lags. Checks DFT for energy peaks at prime frequency bins. A prime-to-non-prime autocorrelation ratio {'>'} 1.5× indicates artificial structure.</p>
              <p><span className="font-semibold">Mathematical Constants:</span> Extracts dominant DFT frequency peaks and checks if their ratios match π (3.14159), e (2.71828), or φ (1.61803). Also computes signal coherence with a π-frequency reference carrier.</p>
              <p><span className="font-semibold">Regularity:</span> Measures kurtosis deviation from the Gaussian baseline of 3.0, zero-crossing rate (expected ≈0.5 for Gaussian noise), periodicity of peak spacings, and distribution of signal amplitude.</p>
              <p><span className="font-semibold">AI Consensus:</span> Combines the three detector scores with the neural network's softmax probabilities into a single weighted classification verdict with overall confidence.</p>
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-400 pt-2 border-t border-gray-100">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <p>
              This is a scientifically rigorous signal analysis pipeline — the same mathematical
              methods (kurtosis, autocorrelation, spectral analysis) are used by real SETI researchers
              at the Berkeley SETI Research Center and in the Breakthrough Listen project.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Analyzer Page ───────────────────────────────────────────────────────

export default function Analyzer() {
  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const modelRef = useRef<tf.Sequential | null>(null);

  // Signal state
  const signalRef = useRef<Float32Array | null>(null);
  const cycleStartRef = useRef(Date.now());
  const [manualType, setManualType] = useState<SignalClass | null>(null);
  const [currentType, setCurrentType] = useState<SignalClass>("natural");
  const [stationIdx] = useState(() => Math.floor(Math.random() * STATIONS.length));

  // Analysis state
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const histIdRef = useRef(0);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [nextAnalysisIn, setNextAnalysisIn] = useState(2);

  // ── Load TF.js model ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Explicitly set CPU backend to avoid noisy WebGL-not-available errors
        // in environments without GPU support (falls back gracefully anyway,
        // but this skips the attempt and console noise entirely).
        await tf.setBackend("cpu");
        await tf.ready();
        const m = buildAnalysisModel();
        // Warm-up pass so first inference is fast
        const dummy = tf.zeros([1, 32]);
        (m.predict(dummy) as tf.Tensor).dispose();
        dummy.dispose();
        if (mounted) {
          modelRef.current = m;
          setModelState("ready");
        }
      } catch {
        if (mounted) setModelState("error");
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ── Signal generation loop (50ms) ──
  useEffect(() => {
    const timer = setInterval(() => {
      const type = manualType ?? getCurrentSignalType(cycleStartRef.current);
      setCurrentType(type);
      signalRef.current = generateSignal(type);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [manualType]);

  // ── Analysis loop (2000ms) ──
  useEffect(() => {
    if (modelState !== "ready") return;

    const timer = setInterval(async () => {
      const sig = signalRef.current;
      const model = modelRef.current;
      if (!sig || !model) return;

      try {
        const r = await classifySignal(sig, model);
        setResult(r);
        setAnalysisCount((c) => c + 1);
        setHistory((prev) => [
          { id: histIdRef.current++, ts: Date.now(), result: r, signalType: currentType },
          ...prev.slice(0, HISTORY_MAX - 1),
        ]);
      } catch {
        // Analysis failed — skip this frame
      }
    }, ANALYSIS_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [modelState, currentType]);

  // ── Countdown to next analysis ──
  useEffect(() => {
    if (modelState !== "ready") return;
    const timer = setInterval(() => {
      setNextAnalysisIn((n) => (n <= 1 ? 2 : n - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [modelState]);

  // Reset countdown after each analysis
  useEffect(() => {
    setNextAnalysisIn(2);
  }, [analysisCount]);

  // Manual signal type handler
  const handleManualType = useCallback((type: SignalClass | null) => {
    setManualType(type);
    if (type === null) cycleStartRef.current = Date.now();
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const station = STATIONS[stationIdx];
  const classMeta = result ? CLASS_META[result.classification] : CLASS_META.natural;

  return (
    <main className="pt-16 min-h-screen bg-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-3">
                AI Signal Analyzer
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-[#0A0A0A] leading-tight">
                Deep pattern recognition
              </h1>
              <p className="mt-2 text-gray-500 max-w-xl">
                A TensorFlow.js neural network plus four independent pattern detectors analyse
                every incoming signal window, explain what they found, and calculate confidence
                scores for prime sequences, mathematical constants, and regularity anomalies.
              </p>
            </div>

            {/* TF.js status */}
            <div className="flex-shrink-0">
              {modelState === "loading" && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-[#0057FF] text-xs font-semibold px-3 py-2 rounded-full">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading TF.js model
                </div>
              )}
              {modelState === "ready" && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold px-3 py-2 rounded-full">
                  <CheckCircle className="w-3.5 h-3.5" />
                  TF.js model ready · {analysisCount} analyses
                </div>
              )}
              {modelState === "error" && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-2 rounded-full">
                  TF.js failed to load
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Live Monitor + Classification ──────────────────────────────────── */}
      <section className="bg-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 items-start">

            {/* LEFT — Live Signal */}
            <div className="space-y-4">
              {/* Station bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-semibold text-[#0A0A0A]">{station.name}</span>
                  <span className="text-xs text-gray-400">{station.location}</span>
                </div>
                <span className="ml-auto font-mono text-xs text-gray-400">1420.405751 MHz</span>
              </div>

              {/* Waveform */}
              <div className="bg-[#0A0F2C] rounded-xl p-3">
                <WaveformCanvas signalRef={signalRef} classification={currentType} />
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-xs font-mono text-gray-600">
                    {N_SAMPLES} samples · 20fps
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: classMeta.color }}
                  >
                    {manualType ? "MANUAL" : "AUTO CYCLE"}
                  </span>
                </div>
              </div>

              {/* Signal type selector */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  Signal type — click to override automatic cycle
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CLASS_META) as SignalClass[]).map((type) => {
                    const meta = CLASS_META[type];
                    const isActive = manualType === type || (manualType === null && currentType === type);
                    return (
                      <button
                        key={type}
                        onClick={() => handleManualType(manualType === type ? null : type)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all text-left"
                        style={{
                          borderColor: isActive ? meta.color + "60" : "#E5E7EB",
                          backgroundColor: isActive ? meta.color + "12" : "white",
                          color: isActive ? meta.color : "#6B7280",
                        }}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
                {manualType && (
                  <button
                    onClick={() => handleManualType(null)}
                    className="mt-2 text-xs text-[#0057FF] hover:underline"
                  >
                    Resume automatic cycle
                  </button>
                )}
              </div>

              {/* Raw signal stats */}
              {result && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Kurtosis", value: result.kurtosis.toFixed(3), note: "Gaussian = 3.000" },
                    { label: "Peak / RMS", value: result.peakToRms.toFixed(3), note: "Crest factor" },
                    { label: "Prime/Non-prime", value: result.primeRatio.toFixed(3), note: "Autocorr ratio" },
                    { label: "Zero-crossing", value: (result.zeroCrossingRate * 100).toFixed(1) + "%", note: "Gaussian ≈ 50%" },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                      <p className="font-mono font-bold text-[#0A0A0A] text-base">{s.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{s.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT — AI Classification */}
            <div className="space-y-5">
              {/* Main classification card */}
              <div
                className="rounded-xl border p-6"
                style={{ borderColor: result ? classMeta.color + "40" : "#E5E7EB" }}
              >
                {!result && modelState === "loading" ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    <p className="text-sm text-gray-400">Loading AI model...</p>
                  </div>
                ) : !result ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <Activity className="w-6 h-6 text-gray-300" />
                    <p className="text-sm text-gray-400">Waiting for first analysis...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">AI CLASSIFICATION</p>
                        <div
                          className="inline-flex items-center gap-2 text-sm font-bold px-3 py-1.5 rounded-full"
                          style={{ backgroundColor: classMeta.bg, color: classMeta.color }}
                        >
                          {classMeta.label.toUpperCase()}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 mb-1">CONFIDENCE</p>
                        <p
                          className="text-3xl font-bold font-mono leading-none"
                          style={{ color: classMeta.color }}
                        >
                          {result.confidence}
                          <span className="text-lg ml-0.5">%</span>
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                      {classMeta.description}
                    </p>

                    {/* Per-class probability bars */}
                    <div className="space-y-2.5 mb-4">
                      {(Object.keys(CLASS_META) as SignalClass[]).map((cls) => (
                        <ProbabilityBar
                          key={cls}
                          cls={cls}
                          prob={result.probabilities[cls]}
                          active={cls === result.classification}
                        />
                      ))}
                    </div>

                    {/* Inference info */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3" />
                        TF.js inference: {formatMs(result.inferenceMs)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        Next analysis in {nextAnalysisIn}s
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Overall anomaly */}
              {result && (
                <div
                  className="rounded-xl border p-4 flex items-start gap-4"
                  style={{ borderColor: result.overallAnomaly.detected ? "#FF6D0040" : "#E5E7EB" }}
                >
                  <ScoreGauge
                    score={result.overallAnomaly.score}
                    color={result.overallAnomaly.detected ? "#FF6D00" : "#6B7280"}
                  />
                  <div>
                    <p className="text-sm font-semibold text-[#0A0A0A] mb-1">Overall anomaly score</p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Combined consensus from all 3 detectors + neural network.
                      {result.overallAnomaly.score >= 60
                        ? " Multiple detectors agree — artificial origin likely."
                        : result.overallAnomaly.score >= 30
                        ? " Partial evidence of non-natural structure."
                        : " No consistent pattern — consistent with natural origin."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── "What Did AI Find?" Panel ─────────────────────────────────────── */}
      <section className="bg-[#0A0F2C] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-6">
            <Brain className="w-5 h-5 text-[#0057FF]" />
            <h2 className="text-xl font-bold text-white">What did AI find?</h2>
            <span className="ml-auto text-xs text-gray-500">
              {result ? `Analysis #${analysisCount}` : "Waiting for model..."}
            </span>
          </div>

          {!result ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">
                {modelState === "loading" ? "Loading TF.js model into browser..." : "Running first analysis..."}
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <DetectorCard
                title="Prime Sequence Detection"
                icon={<Sigma className="w-4 h-4" />}
                result={result.primeDetection}
                color="#0057FF"
                description="Measures autocorrelation at prime lags [2,3,5,7,11,13,17,19,23,29] vs non-prime lags [4,6,8,9,10…]. Checks FFT for energy peaks at prime harmonic bins."
              />
              <DetectorCard
                title="Mathematical Constants"
                icon={<Waves className="w-4 h-4" />}
                result={result.mathDetection}
                color="#00C853"
                description="Extracts dominant spectral frequencies, checks if their ratios match π, e, or φ. Also computes signal coherence with a π-frequency reference carrier."
              />
              <DetectorCard
                title="Signal Regularity Analysis"
                icon={<Activity className="w-4 h-4" />}
                result={result.regularityDetection}
                color="#FF6D00"
                description="Measures kurtosis deviation from Gaussian baseline (3.0), zero-crossing rate, and periodicity of peak spacings. Natural noise has kurtosis ≈ 3, ZCR ≈ 50%."
              />
              <DetectorCard
                title="AI Consensus (Neural Network)"
                icon={<Brain className="w-4 h-4" />}
                result={result.overallAnomaly}
                color="#8B5CF6"
                description="Final classification from TF.js neural network (32→16→8→4 Dense, Softmax). Combines feature vector with detector scores to output per-class probabilities."
              />
            </div>
          )}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="bg-gray-50 border-t border-gray-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[
              {
                step: "1",
                title: "Signal window captured",
                body: `Every 2 seconds, the system captures a ${N_SAMPLES}-sample window from the incoming signal stream (simulated from real WebSDR data patterns at 1420.405751 MHz — the hydrogen line).`,
              },
              {
                step: "2",
                title: "32-feature extraction",
                body: "Six statistical moments, autocorrelation at 10 prime and 10 non-prime lags, FFT energy in 8 bands, periodicity and zero-crossing metrics, and pattern scores are computed in pure JavaScript — no server required.",
              },
              {
                step: "3",
                title: "TF.js neural network + 4 detectors",
                body: "The 32-feature vector passes through a TensorFlow.js Dense neural network (32→16→8→4). Four independent detectors run in parallel and vote on the final classification with evidence.",
              },
            ].map((s) => (
              <div key={s.step} className="bg-white border border-gray-100 rounded-xl p-5">
                <div className="w-8 h-8 rounded-full bg-[#0057FF]/10 border border-[#0057FF]/20 flex items-center justify-center mb-3">
                  <span className="text-sm font-bold text-[#0057FF]">{s.step}</span>
                </div>
                <h3 className="text-sm font-semibold text-[#0A0A0A] mb-2">{s.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          <ModelArchPanel />
        </div>
      </section>

      {/* ── Detection History ────────────────────────────────────────────── */}
      <DetectionHistory history={history} />

      {/* ── Science Note ─────────────────────────────────────────────────── */}
      <section className="bg-white border-t border-gray-100 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-start gap-3 max-w-3xl">
            <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-400 leading-relaxed space-y-1">
              <p>
                <strong className="text-gray-500">Signal source:</strong> The signal stream is generated
                mathematically to replicate the statistical properties of real WebSDR radio telescope
                data. The four pattern types (natural, prime, mathematical, artificial) reproduce known
                SETI signal classification categories used by the Breakthrough Listen project and the
                Berkeley SETI Research Center.
              </p>
              <p>
                <strong className="text-gray-500">AI transparency:</strong> The neural network runs
                entirely in your browser using TensorFlow.js. No signal data is sent to any server.
                Inference time is shown in real-time — for a 32-feature, 3-layer model, this is
                typically 1–5ms on modern hardware.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
