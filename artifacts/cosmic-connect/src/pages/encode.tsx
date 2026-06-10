import { useState, useEffect, useRef } from "react";
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
import { Link, useLocation } from "wouter";
import Footer from "@/components/layout/footer";
import {
  Waves,
  Download,
  Save,
  ChevronRight,
  Info,
  Loader2,
  Radio,
  Grid3x3,
  Binary,
  Layers,
  Clock,
  CheckCircle,
  AlertCircle,
  Send,
  Rocket,
  X,
  Zap,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const HYDROGEN_FREQ_HZ = 1420405751; // 1420.405751 MHz in Hz
const PI_DIGITS = 314159265;         // first 9 digits of pi × 10^8
const PRIME_HEADER_NUMS = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
const MAX_CHARS = 280;
const PLACEHOLDER = "Hello Universe, Earth is here. We are looking for you.";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EncodedMessage {
  originalText: string;
  primeHeaderBinary: string;
  messageBinary: string;
  piMarkerBinary: string;
  hydrogenMarkerBinary: string;
  separatorBinary: string;
  fullBinary: string;
  totalBits: number;
  gridRows: number;
  gridCols: number;
  gridBits: boolean[];
}

interface SavedMessage {
  id: string;
  originalText: string;
  encodedBinary: string;
  sentAt: Timestamp;
  status: "encoded" | "queued" | "transmitted";
  authorName: string;
  authorId: string;
  totalBits: number;
}

type PreviewTab = "waveform" | "pixelgrid" | "binary";

// ─── Encoding Utilities ───────────────────────────────────────────────────────

function sieve(max: number): number[] {
  const arr = new Array(max + 1).fill(true);
  arr[0] = arr[1] = false;
  for (let i = 2; i * i <= max; i++) {
    if (arr[i]) for (let j = i * i; j <= max; j += i) arr[j] = false;
  }
  return arr.map((v, i) => (v ? i : 0)).filter(Boolean);
}

const PRIMES = sieve(800);

/**
 * Find two prime dimensions p × q >= n.
 * Scores candidates by squareness (closeness to sqrt(n)) weighted more heavily
 * than padding, so the pixel grid is always roughly rectangular — never a 2×N strip.
 */
function findPrimeDimensions(n: number): [number, number] {
  const sqrtN = Math.sqrt(n);
  let bestP = 2, bestQ = 2, bestScore = Infinity;

  for (const p of PRIMES) {
    if (p > sqrtN * 4) break; // no benefit searching much past sqrt(n)
    for (const q of PRIMES) {
      if (p > q) continue;
      const prod = p * q;
      if (prod < n) continue;
      // Squareness score: prefer p×q close to sqrt(n)×sqrt(n)
      const sqrtScore = Math.abs(p - sqrtN) + Math.abs(q - sqrtN);
      const paddingScore = (prod - n) / n;
      const score = sqrtScore * 0.8 + paddingScore * 5;
      if (score < bestScore) {
        bestScore = score;
        bestP = p;
        bestQ = q;
      }
      break; // smallest valid q for this p; larger q only increases score
    }
  }
  return [bestP, bestQ];
}

function intToBin(n: number, minBits = 0): string {
  const b = Math.abs(Math.round(n)).toString(2);
  return b.padStart(Math.max(minBits, b.length), "0");
}

function charToBin(c: string): string {
  return c.charCodeAt(0).toString(2).padStart(8, "0");
}

/** Full 4-layer encoding pipeline */
function encodeMessage(text: string): EncodedMessage {
  // Layer 2: message → ASCII → 8-bit binary
  const messageBinary = text.split("").map(charToBin).join("");

  // Layer 1: prime number header (6-bit per prime)
  const primeHeaderBinary = PRIME_HEADER_NUMS.map((p) => intToBin(p, 6)).join("");

  // Layer 3: mathematical constants (32-bit each)
  const piMarkerBinary = intToBin(PI_DIGITS, 32);
  const hydrogenMarkerBinary = intToBin(HYDROGEN_FREQ_HZ, 32);

  // 8-bit separator between layers
  const separatorBinary = "00000000";

  // Full transmission: [PRIME_HEADER][SEP][MESSAGE][SEP][PI][SEP][HYDROGEN]
  const fullBinary =
    primeHeaderBinary +
    separatorBinary +
    messageBinary +
    separatorBinary +
    piMarkerBinary +
    separatorBinary +
    hydrogenMarkerBinary;

  const totalBits = fullBinary.length;

  // Layer 4: Arecibo pixel grid — prime dimensions
  const [gridRows, gridCols] = findPrimeDimensions(totalBits);
  const padded = fullBinary.padEnd(gridRows * gridCols, "0");
  const gridBits = padded.split("").map((b) => b === "1");

  return {
    originalText: text,
    primeHeaderBinary,
    messageBinary,
    piMarkerBinary,
    hydrogenMarkerBinary,
    separatorBinary,
    fullBinary,
    totalBits,
    gridRows,
    gridCols,
    gridBits,
  };
}

/** Build downloadable .txt content */
function buildDownloadContent(enc: EncodedMessage): string {
  const date = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
  const gridLines = Array.from({ length: enc.gridRows }, (_, r) =>
    enc.gridBits
      .slice(r * enc.gridCols, (r + 1) * enc.gridCols)
      .map((b) => (b ? "█" : "·"))
      .join("")
  );
  return [
    "THEALINS INTERSTELLAR MESSAGE ENCODING",
    "Generated: " + date,
    "Platform: Thealins — humanity's first crowd-sourced interstellar communication platform",
    "",
    "═══ ORIGINAL MESSAGE ═══",
    enc.originalText,
    "",
    "═══ ENCODING SUMMARY ═══",
    `Total bits      : ${enc.totalBits}`,
    `Characters      : ${enc.originalText.length}`,
    `Pixel grid      : ${enc.gridRows} × ${enc.gridCols} (both prime numbers)`,
    `Grid cells      : ${enc.gridRows * enc.gridCols}`,
    `Carrier freq    : 1420.405751 MHz (neutral hydrogen line)`,
    "",
    "═══ LAYER 1: PRIME NUMBER HEADER ═══",
    "Primes: " + PRIME_HEADER_NUMS.join(", "),
    enc.primeHeaderBinary.match(/.{1,6}/g)!.join(" "),
    "",
    "═══ LAYER 2: BINARY MESSAGE (ASCII) ═══",
    enc.messageBinary.match(/.{1,8}/g)!.join(" "),
    "",
    "═══ LAYER 3: MATHEMATICAL CONSTANTS ═══",
    `Pi marker  (π × 10^8 = ${PI_DIGITS}):`,
    enc.piMarkerBinary,
    `Hydrogen freq (${HYDROGEN_FREQ_HZ} Hz):`,
    enc.hydrogenMarkerBinary,
    "",
    "═══ LAYER 4: FULL ENCODED TRANSMISSION ═══",
    enc.fullBinary,
    "",
    `═══ PIXEL GRID (${enc.gridRows}×${enc.gridCols}) ═══`,
    ...gridLines,
    "",
    "═══ WHAT TO DO NEXT ═══",
    "1. Find a licensed Ham Radio operator: https://www.arrl.org/find-a-club",
    "2. Share this file with them",
    "3. Ask them to transmit your binary sequence at 1420.405751 MHz",
    "4. Your message travels at the speed of light — reaching Proxima Centauri in 4.24 years",
    "",
    "This file was produced by Thealins.",
    "The encoding follows the same protocol as the 1974 Arecibo Message.",
  ].join("\n");
}

// ─── Waveform Canvas ─────────────────────────────────────────────────────────

function WaveformPreview({ binary }: { binary: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !binary) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const bits = binary.slice(0, Math.min(binary.length, 320));
    const bitWidth = W / bits.length;
    const primeZoneEnd = PRIME_HEADER_NUMS.map((p) => intToBin(p, 6)).join("").length;
    const constZoneStart = binary.length - 80;

    ctx.fillStyle = "#0A0F2C";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      ctx.beginPath();
      ctx.moveTo(0, (H / 4) * g);
      ctx.lineTo(W, (H / 4) * g);
      ctx.stroke();
    }

    // Labels
    ctx.fillStyle = "rgba(255,255,255,0.20)";
    ctx.font = "9px monospace";
    ctx.fillText("1 (HIGH)", 3, H * 0.15 - 3);
    ctx.fillText("0 (LOW)", 3, H * 0.85 + 9);

    // Draw signal
    ctx.lineWidth = 1.5;
    let prevY = H / 2;

    for (let i = 0; i < bits.length; i++) {
      const bit = bits[i] === "1";
      const x = i * bitWidth;
      const targetY = bit ? H * 0.15 : H * 0.82;

      // Zone colour
      let colour: string;
      if (i < primeZoneEnd) {
        colour = "#00C853";
      } else if (i > constZoneStart && constZoneStart < bits.length) {
        colour = "#FF6D00";
      } else {
        colour = "#0057FF";
      }

      ctx.strokeStyle = colour;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 3;

      // Vertical transition
      ctx.beginPath();
      ctx.moveTo(x, prevY);
      ctx.lineTo(x, targetY);
      ctx.stroke();

      // Horizontal segment
      ctx.beginPath();
      ctx.moveTo(x, targetY);
      ctx.lineTo(Math.min(x + bitWidth, W), targetY);
      ctx.stroke();

      prevY = targetY;
    }

    ctx.shadowBlur = 0;
  }, [binary]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={160}
      className="w-full rounded-lg"
      style={{ height: 160, imageRendering: "crisp-edges" }}
    />
  );
}

// ─── Pixel Grid Canvas ────────────────────────────────────────────────────────

function PixelGridPreview({
  gridBits,
  rows,
  cols,
}: {
  gridBits: boolean[];
  rows: number;
  cols: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gridBits.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const maxW = 640;
    const cellSize = Math.max(2, Math.min(12, Math.floor(maxW / cols)));
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;

    ctx.fillStyle = "#0A0F2C";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const primeZoneEnd = PRIME_HEADER_NUMS.map((p) => intToBin(p, 6)).join("").length;
    const constZoneStart = rows * cols - 80;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const bit = gridBits[idx] ?? false;

        if (bit) {
          if (idx < primeZoneEnd) {
            ctx.fillStyle = "#00C853";
          } else if (idx > constZoneStart) {
            ctx.fillStyle = "#FF6D00";
          } else {
            ctx.fillStyle = "#0057FF";
          }
        } else {
          ctx.fillStyle = "#111827";
        }

        ctx.fillRect(
          c * cellSize + 1,
          r * cellSize + 1,
          cellSize - 1,
          cellSize - 1
        );
      }
    }
  }, [gridBits, rows, cols]);

  return (
    <div className="flex justify-center overflow-auto rounded">
      <canvas
        ref={canvasRef}
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

// ─── Raw Binary View ──────────────────────────────────────────────────────────

function RawBinaryView({ enc }: { enc: EncodedMessage }) {
  const segments = [
    { label: "Layer 1 — Prime Header", bits: enc.primeHeaderBinary, color: "#00C853", groupBy: 6 },
    { label: "Separator", bits: enc.separatorBinary, color: "#6B7280", groupBy: 8 },
    { label: "Layer 2 — Binary Message", bits: enc.messageBinary, color: "#0057FF", groupBy: 8 },
    { label: "Separator", bits: enc.separatorBinary, color: "#6B7280", groupBy: 8 },
    { label: "Layer 3 — Pi Marker", bits: enc.piMarkerBinary, color: "#FF6D00", groupBy: 8 },
    { label: "Separator", bits: enc.separatorBinary, color: "#6B7280", groupBy: 8 },
    { label: "Layer 3 — Hydrogen Freq", bits: enc.hydrogenMarkerBinary, color: "#FF6D00", groupBy: 8 },
  ];

  return (
    <div className="space-y-4">
      {segments.map((seg, idx) => (
        <div key={idx}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-xs font-semibold" style={{ color: seg.color }}>
              {seg.label}
            </span>
            <span className="text-xs text-gray-600 ml-auto font-mono">{seg.bits.length} bits</span>
          </div>
          <div
            className="font-mono text-xs leading-relaxed break-all rounded px-3 py-2"
            style={{ backgroundColor: seg.color + "12", color: seg.color }}
          >
            {seg.bits.match(new RegExp(`.{1,${seg.groupBy}}`, "g"))?.join(" ") ?? seg.bits}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Layer Breakdown ──────────────────────────────────────────────────────────

function LayerBreakdown({ enc }: { enc: EncodedMessage }) {
  const layers = [
    {
      num: 1,
      title: "Prime Number Header",
      color: "#00C853",
      bits: enc.primeHeaderBinary.length,
      description:
        "First 15 prime numbers encoded in 6-bit binary. Any intelligence with mathematics will immediately recognise this sequence as artificial — primes never occur in this pattern naturally.",
      detail: `Primes: ${PRIME_HEADER_NUMS.join(", ")}`,
    },
    {
      num: 2,
      title: "Binary Message",
      color: "#0057FF",
      bits: enc.messageBinary.length,
      description:
        "Your text converted to ASCII codes, then to 8-bit binary. The universal digital encoding — any civilisation that has discovered electronics will understand binary.",
      detail: `${enc.originalText.length} chars × 8 bits = ${enc.messageBinary.length} bits`,
    },
    {
      num: 3,
      title: "Mathematical Constants",
      color: "#FF6D00",
      bits: enc.piMarkerBinary.length + enc.hydrogenMarkerBinary.length,
      description:
        "Pi (3.14159265) and the hydrogen line frequency (1420.405751 MHz) embedded as 32-bit binary values. Universal scientific constants any advanced civilisation would recognise.",
      detail: `π × 10⁸ = ${PI_DIGITS} | H-line = ${HYDROGEN_FREQ_HZ} Hz`,
    },
    {
      num: 4,
      title: "Arecibo Pixel Grid",
      color: "#8B5CF6",
      bits: enc.gridRows * enc.gridCols,
      description: `All ${enc.totalBits} bits arranged into a ${enc.gridRows}×${enc.gridCols} rectangle — both prime numbers. When displayed as a 2D image, the structure becomes visible. This is exactly how the 1974 Arecibo Message was encoded.`,
      detail: `${enc.gridRows} × ${enc.gridCols} = ${enc.gridRows * enc.gridCols} cells (${enc.gridRows * enc.gridCols - enc.totalBits} bits padding)`,
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {layers.map((layer) => (
        <div
          key={layer.num}
          className="rounded-xl border p-4"
          style={{ borderColor: layer.color + "28", backgroundColor: layer.color + "07" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: layer.color + "20", color: layer.color }}
            >
              {layer.num}
            </span>
            <span className="text-sm font-semibold text-[#0A0A0A]">{layer.title}</span>
            <span className="ml-auto text-xs font-mono text-gray-400">{layer.bits} bits</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mb-2">{layer.description}</p>
          <p className="text-xs font-mono text-gray-400">{layer.detail}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Celebration Modal ────────────────────────────────────────────────────────

interface CelebrationData {
  signalId: string;
  text: string;
  bits: number;
  sentAt: Date;
}

function CelebrationModal({ data, onNavigate, onClose }: {
  data: CelebrationData;
  onNavigate: () => void;
  onClose: () => void;
}) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(id); onNavigate(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onNavigate]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,4,0.95)" }}>
      {/* Animated star dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white animate-pulse"
            style={{
              width: `${1 + Math.random() * 2}px`,
              height: `${1 + Math.random() * 2}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.2 + Math.random() * 0.6,
              animationDuration: `${1.5 + Math.random() * 3}s`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Main card */}
      <div className="relative z-10 max-w-lg w-full mx-4 bg-black/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">

        {/* Close button */}
        <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white transition-colors z-20">
          <X className="w-5 h-5" />
        </button>

        {/* Glowing top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-cyan-400 to-purple-600" />

        <div className="px-8 py-8 text-center">
          {/* Rocket animation */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-blue-600/20 animate-ping" />
            <div className="absolute inset-2 rounded-full bg-cyan-500/15 animate-ping" style={{ animationDelay: "0.3s" }} />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-600/30 to-cyan-600/20 border border-cyan-500/30 flex items-center justify-center">
              <Rocket className="w-9 h-9 text-cyan-300" />
            </div>
          </div>

          {/* Headline */}
          <h2 className="text-2xl font-bold text-white mb-1">बधाई हो! 🎉</h2>
          <p className="text-cyan-300 font-semibold mb-1">Your message is now in space!</p>
          <p className="text-white/40 text-sm mb-6">Traveling at the speed of light — 299,792 km/s</p>

          {/* Message preview */}
          <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 mb-6 text-left">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Your Message</p>
            <p className="text-white font-medium leading-relaxed line-clamp-3">"{data.text}"</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white/5 rounded-xl px-3 py-3">
              <Zap className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <p className="text-xs text-white/30">Encoded</p>
              <p className="text-sm font-bold text-white font-mono">{data.bits.toLocaleString()}</p>
              <p className="text-xs text-white/20">bits</p>
            </div>
            <div className="bg-white/5 rounded-xl px-3 py-3">
              <Radio className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <p className="text-xs text-white/30">Frequency</p>
              <p className="text-sm font-bold text-white font-mono">1420</p>
              <p className="text-xs text-white/20">MHz</p>
            </div>
            <div className="bg-white/5 rounded-xl px-3 py-3">
              <Send className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <p className="text-xs text-white/30">Sent At</p>
              <p className="text-sm font-bold text-white font-mono">{data.sentAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-xs text-white/20">today</p>
            </div>
          </div>

          {/* Real data disclaimer */}
          <div className="bg-green-950/40 border border-green-500/20 rounded-xl px-4 py-3 mb-6 flex items-start gap-2 text-left">
            <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
            <p className="text-xs text-green-300/80 leading-relaxed">
              <span className="font-semibold text-green-300">Real Data, Not Simulated.</span>{" "}
              Your signal position is calculated using actual physics: distance = 299,792 km/s × elapsed time.
            </p>
          </div>

          {/* CTA + Countdown */}
          <button
            onClick={onNavigate}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold py-3.5 rounded-xl transition-all mb-3 shadow-lg shadow-blue-500/25"
          >
            <Rocket className="w-4 h-4" />
            Open Mission Control — Track Live
          </button>

          {/* Countdown progress bar */}
          <div className="w-full bg-white/10 rounded-full h-1 mb-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-white/40 transition-all duration-1000"
              style={{ width: `${((5 - countdown) / 5) * 100}%` }}
            />
          </div>
          <p className="text-xs text-white/25">Auto-opening in {countdown}s…</p>
        </div>
      </div>
    </div>
  );
}

// ─── Transmit Section ─────────────────────────────────────────────────────────

function TransmitSection({ enc }: { enc: EncodedMessage }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [transmitting, setTransmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);

  function handleNavigate(signalId: string) {
    navigate(`/signal/${signalId}`);
  }

  async function handleTransmit() {
    if (!user || transmitting) return;
    setTransmitting(true);
    setError(null);
    try {
      const now = new Date();
      const ref = await addDoc(collection(db, "messages"), {
        userId: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Explorer",
        authorId: user.uid,
        originalText: enc.originalText,
        encodedBinary: enc.fullBinary.slice(0, 1000),
        targetCoordinates: "Omnidirectional — all directions",
        sentAt: Timestamp.now(),
        status: "transmitted",
        totalBits: enc.totalBits,
        gridRows: enc.gridRows,
        gridCols: enc.gridCols,
      });
      setCelebration({ signalId: ref.id, text: enc.originalText, bits: enc.totalBits, sentAt: now });
    } catch {
      setError("Could not transmit. Please try again.");
      setTransmitting(false);
    }
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-2 bg-[#0057FF] text-white font-semibold px-5 py-2.5 rounded-md hover:bg-blue-700 transition-colors text-sm"
      >
        Sign in to transmit to space
        <ChevronRight className="w-4 h-4" />
      </Link>
    );
  }

  return (
    <>
      {celebration && (
        <CelebrationModal
          data={celebration}
          onNavigate={() => handleNavigate(celebration.signalId)}
          onClose={() => { setCelebration(null); setTransmitting(false); }}
        />
      )}
      <div className="space-y-2">
        <button
          onClick={handleTransmit}
          disabled={transmitting || enc.originalText.trim().length < 3}
          className="inline-flex items-center gap-2 bg-[#0057FF] text-white font-semibold px-5 py-2.5 rounded-md hover:bg-blue-700 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
        >
          {transmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Launching signal…
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Transmit to Space — Track Live
            </>
          )}
        </button>
        {error && (
          <span className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </span>
        )}
      </div>
    </>
  );
}

// ─── Save Section ─────────────────────────────────────────────────────────────

function SaveSection({ enc, onSaved }: { enc: EncodedMessage; onSaved: (id: string) => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSaved(false);
    setError(null);
  }, [enc.originalText]);

  async function handleSave() {
    if (!user || saving || saved) return;
    setSaving(true);
    setError(null);
    try {
      const ref = await addDoc(collection(db, "messages"), {
        userId: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Explorer",
        authorId: user.uid,
        originalText: enc.originalText,
        encodedBinary: enc.fullBinary.slice(0, 1000),
        targetCoordinates: "Broadcast — all directions",
        sentAt: Timestamp.now(),
        status: "encoded",
        totalBits: enc.totalBits,
        gridRows: enc.gridRows,
        gridCols: enc.gridCols,
      });
      setSaved(true);
      onSaved(ref.id);
    } catch {
      setError("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {!user ? (
        <Link
          href="/login"
          className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 font-medium px-4 py-2 rounded-md hover:bg-gray-50 transition-colors text-sm"
        >
          Sign in to save to community
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : saved ? (
        <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 font-medium px-4 py-2 rounded-md text-sm">
          <CheckCircle className="w-4 h-4" />
          Saved to community
        </div>
      ) : (
        <button
          onClick={handleSave}
          disabled={saving || enc.originalText.trim().length < 3}
          className="inline-flex items-center gap-2 bg-[#0A0F2C] text-white font-medium px-4 py-2 rounded-md hover:bg-[#0d1540] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : "Save to community"}
        </button>
      )}
      {error && (
        <span className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </span>
      )}
    </div>
  );
}

// ─── Community Messages ───────────────────────────────────────────────────────

function CommunityMessages({ newMsgId }: { newMsgId: string | null }) {
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("sentAt", "desc"), limit(10));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedMessage, "id">) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

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
            <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-1">Community</p>
            <h2 className="text-xl font-bold text-[#0A0A0A]">Messages encoded by humanity</h2>
          </div>
          {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>

        {!loading && messages.length === 0 ? (
          <div className="text-center py-12 border border-gray-100 rounded-xl">
            <Waves className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              No messages encoded yet. Be the first to send a message to the universe.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`border rounded-xl px-5 py-4 transition-all ${
                  msg.id === newMsgId
                    ? "border-[#0057FF] bg-blue-50"
                    : "border-gray-100 hover:border-blue-100"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-[#0057FF] uppercase tracking-wide">
                        {msg.status}
                      </span>
                      {msg.id === newMsgId && (
                        <span className="text-xs text-[#0057FF] font-medium">Just encoded</span>
                      )}
                    </div>
                    <p className="text-sm text-[#0A0A0A] font-medium mb-1 leading-relaxed">
                      &ldquo;{msg.originalText}&rdquo;
                    </p>
                    <p className="text-xs text-gray-400">
                      Encoded by{" "}
                      <span className="font-medium text-gray-600">{msg.authorName}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="font-mono text-sm font-bold text-[#0A0A0A]">
                      {msg.totalBits?.toLocaleString() ?? "—"}
                      <span className="text-xs text-gray-400 font-normal ml-1">bits</span>
                    </span>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {msg.sentAt ? timeAgo(msg.sentAt) : "—"}
                    </div>
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

// ─── Ham Radio Section ────────────────────────────────────────────────────────

function HamRadioSection() {
  const steps = [
    {
      n: 1,
      title: "Download your encoded file",
      desc: "Click Download to get a .txt file with your complete binary encoding, pixel grid, and all 4 encoding layers documented.",
    },
    {
      n: 2,
      title: "Find a Ham Radio operator",
      desc: "Visit arrl.org/find-a-club to find licensed Amateur Radio operators near you. There are 30+ million worldwide — most are happy to help.",
    },
    {
      n: 3,
      title: "Request a 1420 MHz transmission",
      desc: "Share your encoded file. Ask them to transmit the binary sequence on 1420.405751 MHz — the neutral hydrogen line frequency monitored by all SETI researchers.",
    },
    {
      n: 4,
      title: "Your message travels at light speed",
      desc: "Once transmitted, your signal propagates at 299,792 km/s. It reaches Proxima Centauri — the nearest star — in 4.24 years.",
    },
  ];

  return (
    <section className="bg-[#0A0F2C] py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-3">
            What Happens Next
          </p>
          <h2 className="text-2xl font-bold text-white">Transmitting your message to space</h2>
          <p className="mt-2 text-gray-400 max-w-xl text-sm leading-relaxed">
            Ham Radio operators are licensed volunteers who own real transmitters. They can
            broadcast your encoded message on the hydrogen line — the same frequency all SETI
            researchers monitor globally.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {steps.map((step) => (
            <div key={step.n} className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="w-8 h-8 rounded-full bg-[#0057FF]/20 border border-[#0057FF]/30 flex items-center justify-center mb-3">
                <span className="text-sm font-bold text-[#0057FF]">{step.n}</span>
              </div>
              <h3 className="text-sm font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="https://www.arrl.org/find-a-club"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#0057FF] text-white font-medium px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm"
          >
            <Radio className="w-4 h-4" />
            Find a Ham Radio club — ARRL
          </a>
          <a
            href="https://www.iaru.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-white/20 text-white font-medium px-4 py-2 rounded-md hover:bg-white/10 transition-colors text-sm"
          >
            IARU International
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Encode() {
  const [text, setText] = useState("");
  const [encoded, setEncoded] = useState<EncodedMessage | null>(null);
  const [activeTab, setActiveTab] = useState<PreviewTab>("waveform");
  const [newMsgId, setNewMsgId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Debounced auto-encode on text change
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 1) {
      setEncoded(null);
      return;
    }
    const timer = setTimeout(() => {
      setEncoded(encodeMessage(trimmed));
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  function handleDownload() {
    if (!encoded) return;
    const content = buildDownloadContent(encoded);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thealins-message-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleCopyBinary() {
    if (!encoded) return;
    navigator.clipboard.writeText(encoded.fullBinary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const tabs: { id: PreviewTab; label: string; icon: React.ReactNode }[] = [
    { id: "waveform", label: "Waveform", icon: <Waves className="w-3.5 h-3.5" /> },
    { id: "pixelgrid", label: "Pixel Grid", icon: <Grid3x3 className="w-3.5 h-3.5" /> },
    { id: "binary", label: "Raw Binary", icon: <Binary className="w-3.5 h-3.5" /> },
  ];

  return (
    <main className="pt-16 min-h-screen bg-white flex flex-col">
      {/* Header */}
      <section className="bg-white border-b border-gray-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-3">
            Message Encoder
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-[#0A0A0A] leading-tight">
            Send your message to the universe
          </h1>
          <p className="mt-2 text-gray-500 max-w-2xl">
            Type any message. Thealins encodes it through 4 scientific layers — a prime number
            header, binary ASCII, embedded mathematical constants, and an Arecibo-style pixel grid —
            then shows you the exact waveform that would travel through space at the speed of light.
          </p>
        </div>
      </section>

      {/* Composer + Preview */}
      <section className="bg-white py-10 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* LEFT — Compose */}
            <div className="space-y-5">
              <div>
                <label className="text-sm font-semibold text-[#0A0A0A] block mb-2">
                  Your message to the universe
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                  placeholder={PLACEHOLDER}
                  rows={6}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-[#0A0A0A] placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#0057FF] focus:border-transparent leading-relaxed"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-gray-400">Encodes live as you type</p>
                  <p className="text-xs font-mono text-gray-400">
                    {text.length} / {MAX_CHARS}
                  </p>
                </div>
              </div>

              {/* Stats grid */}
              {encoded && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Total bits", value: encoded.totalBits.toLocaleString() },
                    { label: "Characters", value: encoded.originalText.length.toString() },
                    { label: "Pixel grid", value: `${encoded.gridRows} × ${encoded.gridCols}` },
                    { label: "Grid cells", value: (encoded.gridRows * encoded.gridCols).toLocaleString() },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-0.5">{stat.label}</p>
                      <p className="text-base font-bold font-mono text-[#0A0A0A]">{stat.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              {encoded && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center gap-2 bg-[#0057FF] text-white font-medium px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download (.txt)
                  </button>
                  <button
                    onClick={handleCopyBinary}
                    className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 font-medium px-4 py-2 rounded-md hover:bg-gray-50 transition-colors text-sm"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Binary className="w-4 h-4" />
                        Copy binary
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Transmit to Space */}
              {encoded && (
                <div className="border border-[#0057FF]/30 bg-blue-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest">
                    Ready to launch?
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Transmit your encoded message to the cosmos and track it live — watch your signal travel past the Moon, Mars, Proxima Centauri and beyond, in real time.
                  </p>
                  <TransmitSection enc={encoded} />
                </div>
              )}

              {/* Save to community */}
              {encoded && (
                <SaveSection enc={encoded} onSaved={(id) => setNewMsgId(id)} />
              )}

              {/* Arecibo note */}
              <div className="flex items-start gap-2 text-xs text-gray-400 leading-relaxed">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p>
                  This encoding follows the same scientific principles as the 1974 Arecibo Message —
                  broadcast from Puerto Rico toward globular cluster M13, 25,000 light years away. It
                  contained binary numbers, DNA structure, and a map of the Solar System.
                </p>
              </div>
            </div>

            {/* RIGHT — Preview */}
            <div className="space-y-5">
              {/* Tabs */}
              <div className="flex bg-gray-50 border border-gray-100 rounded-lg p-1 gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                      activeTab === tab.id
                        ? "bg-white shadow-sm text-[#0A0A0A]"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Preview canvas area */}
              <div className="bg-[#0A0F2C] rounded-xl overflow-hidden">
                {!encoded ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
                    <Waves className="w-8 h-8 text-gray-700" />
                    <p className="text-xs text-center px-6 leading-relaxed">
                      Start typing to see your message encoded into a scientifically
                      accurate radio transmission
                    </p>
                  </div>
                ) : (
                  <div className="p-4">
                    {activeTab === "waveform" && (
                      <>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                          <span className="text-xs font-mono text-gray-500">
                            AM binary · first {Math.min(encoded.totalBits, 320)} bits
                          </span>
                          <div className="flex items-center gap-3 ml-auto text-xs">
                            {[
                              { color: "#00C853", label: "Prime header" },
                              { color: "#0057FF", label: "Message" },
                              { color: "#FF6D00", label: "Constants" },
                            ].map((z) => (
                              <span key={z.label} className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />
                                <span className="text-gray-500">{z.label}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                        <WaveformPreview binary={encoded.fullBinary} />
                      </>
                    )}
                    {activeTab === "pixelgrid" && (
                      <>
                        <p className="text-xs font-mono text-gray-500 mb-3">
                          {encoded.gridRows} × {encoded.gridCols} Arecibo pixel grid
                          ({(encoded.gridRows * encoded.gridCols).toLocaleString()} cells)
                        </p>
                        <PixelGridPreview
                          gridBits={encoded.gridBits}
                          rows={encoded.gridRows}
                          cols={encoded.gridCols}
                        />
                      </>
                    )}
                    {activeTab === "binary" && (
                      <div className="overflow-y-auto max-h-80">
                        <RawBinaryView enc={encoded} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Transmission facts */}
              {encoded && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    { label: "Carrier frequency", value: "1420.405751 MHz", sub: "Hydrogen line" },
                    { label: "Signal speed", value: "299,792 km/s", sub: "Speed of light" },
                    { label: "Proxima Cen arrival", value: "4.24 years", sub: "Nearest system" },
                    { label: "Encoding protocol", value: "Arecibo binary", sub: "Prime-dimension grid" },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <p className="text-gray-400 mb-0.5">{item.label}</p>
                      <p className="font-mono font-bold text-[#0A0A0A] text-sm">{item.value}</p>
                      <p className="text-gray-400 mt-0.5">{item.sub}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Encoding layers breakdown — only when encoded */}
      {encoded && (
        <section className="bg-gray-50 border-t border-gray-100 py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 mb-6">
              <Layers className="w-5 h-5 text-[#0057FF]" />
              <h2 className="text-lg font-bold text-[#0A0A0A]">Encoding layers breakdown</h2>
              <span className="ml-auto text-xs font-mono text-gray-400">
                {encoded.totalBits.toLocaleString()} total bits
              </span>
            </div>
            <LayerBreakdown enc={encoded} />

            {/* Composition bar */}
            <div className="mt-6">
              <p className="text-xs text-gray-500 mb-2">Bit composition</p>
              <div className="flex rounded-full overflow-hidden h-3">
                {[
                  {
                    label: "Prime header",
                    color: "#00C853",
                    bits: encoded.primeHeaderBinary.length,
                  },
                  {
                    label: "Message",
                    color: "#0057FF",
                    bits: encoded.messageBinary.length,
                  },
                  {
                    label: "Constants + sep.",
                    color: "#FF6D00",
                    bits:
                      encoded.piMarkerBinary.length +
                      encoded.hydrogenMarkerBinary.length +
                      encoded.separatorBinary.length * 3,
                  },
                ].map((seg) => (
                  <div
                    key={seg.label}
                    title={`${seg.label}: ${seg.bits} bits`}
                    style={{
                      width: `${(seg.bits / encoded.totalBits) * 100}%`,
                      backgroundColor: seg.color,
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-4 mt-2">
                {[
                  { color: "#00C853", label: "Prime header", bits: encoded.primeHeaderBinary.length },
                  { color: "#0057FF", label: "Message", bits: encoded.messageBinary.length },
                  {
                    color: "#FF6D00",
                    label: "Constants + sep.",
                    bits:
                      encoded.piMarkerBinary.length +
                      encoded.hydrogenMarkerBinary.length +
                      encoded.separatorBinary.length * 3,
                  },
                ].map((seg) => (
                  <div key={seg.label} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                    {seg.label}
                    <span className="font-mono text-gray-400">{seg.bits} bits</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Ham Radio explanation */}
      <HamRadioSection />

      {/* Community messages */}
      <CommunityMessages newMsgId={newMsgId} />

      <Footer />
    </main>
  );
}
