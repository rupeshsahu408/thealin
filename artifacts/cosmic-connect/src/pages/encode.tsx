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
import { Link } from "wouter";
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

              {/* Save */}
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
