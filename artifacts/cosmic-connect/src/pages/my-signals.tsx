import { useEffect, useState } from "react";
import { Link } from "wouter";
import { collection, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Radio, ArrowLeft, Rocket, Clock, Zap, ChevronRight, Loader2, LogIn } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const C_KM_S = 299_792;
const LY_KM  = 9_461_000_000_000;
const AU_KM  = 149_597_871;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distKm(sentAtMs: number): number {
  return C_KM_S * (Date.now() - sentAtMs) / 1000;
}

function formatDistance(km: number): string {
  if (km < 1_000)               return `${km.toFixed(0)} km`;
  if (km < 1_000_000)           return `${(km / 1_000).toFixed(1)}k km`;
  if (km < AU_KM)               return `${(km / 1_000_000).toFixed(2)}M km`;
  if (km < 60 * C_KM_S)        return `${(km / C_KM_S / 60).toFixed(2)} light-min`;
  if (km < 24 * 3600 * C_KM_S) return `${(km / C_KM_S / 3600).toFixed(2)} light-hrs`;
  if (km < LY_KM)               return `${(km / (C_KM_S * 86400)).toFixed(2)} light-days`;
  return `${(km / LY_KM).toFixed(4)} light-years`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000); const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);   const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

const MILESTONES = [
  { name: "Moon",          km: 384_400        },
  { name: "Sun",           km: 149_597_871    },
  { name: "Mars",          km: 225_000_000    },
  { name: "Jupiter",       km: 778_500_000    },
  { name: "Saturn",        km: 1_430_000_000  },
  { name: "Pluto",         km: 5_906_400_000  },
  { name: "Heliosphere",   km: 18_000_000_000 },
  { name: "Proxima Cen.",  km: 4.24 * LY_KM   },
  { name: "Sirius",        km: 8.6  * LY_KM   },
  { name: "Andromeda",     km: 2_537_000 * LY_KM },
];

function getCurrentZone(km: number): string {
  const passed = MILESTONES.filter(m => m.km <= km);
  const next   = MILESTONES.find(m => m.km > km);
  if (passed.length === 0) return "Near Earth";
  const last = passed[passed.length - 1];
  if (!next) return `Beyond Andromeda`;
  return `Past ${last.name}`;
}

function getProgressPercent(km: number): number {
  const nextM = MILESTONES.find(m => m.km > km);
  if (!nextM) return 100;
  const idx = MILESTONES.indexOf(nextM);
  const prevM = idx > 0 ? MILESTONES[idx - 1] : { km: 0 };
  return Math.min(100, ((km - prevM.km) / (nextM.km - prevM.km)) * 100);
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

interface SignalDoc {
  id: string;
  originalText: string;
  authorName: string;
  sentAt: Timestamp;
  totalBits: number;
  status: string;
}

function SignalCard({ sig, now }: { sig: SignalDoc; now: number }) {
  const sentMs  = sig.sentAt.toMillis();
  const km      = distKm(sentMs);
  const elapsed = now - sentMs;
  const zone    = getCurrentZone(km);
  const pct     = getProgressPercent(km);

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden hover:border-cyan-500/30 transition-all group">
      {/* Top row */}
      <div className="px-5 py-4 border-b border-white/5 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Live</span>
            <span className="text-xs text-white/20">·</span>
            <span className="text-xs text-white/30 font-mono">{new Date(sentMs).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          <p className="text-white font-medium leading-snug line-clamp-2">"{sig.originalText}"</p>
        </div>
        <Link href={`/signal/${sig.id}`}>
          <div className="shrink-0 flex items-center gap-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-300 text-xs font-semibold px-3 py-2 rounded-xl transition-all group-hover:border-cyan-400/50">
            <Rocket className="w-3.5 h-3.5" />
            Track Live
            <ChevronRight className="w-3 h-3" />
          </div>
        </Link>
      </div>

      {/* Stats row */}
      <div className="px-5 py-3 grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-white/30 mb-0.5">Distance</p>
          <p className="text-sm font-mono font-bold text-white">{formatDistance(km)}</p>
        </div>
        <div>
          <p className="text-xs text-white/30 mb-0.5">Travel Time</p>
          <p className="text-sm font-mono font-bold text-white">{formatElapsed(elapsed)}</p>
        </div>
        <div>
          <p className="text-xs text-white/30 mb-0.5">Current Zone</p>
          <p className="text-sm font-bold text-cyan-300">{zone}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-white/20">Earth</span>
          <span className="text-xs text-white/20">→ Andromeda (2.5M ly)</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-purple-500 transition-all"
            style={{ width: `${Math.max(pct, 0.4)}%` }}
          />
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <Zap className="w-3 h-3 text-white/20" />
          <span className="text-xs text-white/30 font-mono">299,792 km/s · {sig.totalBits?.toLocaleString() ?? "—"} bits</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MySignals() {
  const { user, loading: authLoading } = useAuth();
  const [signals, setSignals]          = useState<SignalDoc[] | null>(null);
  const [now, setNow]                  = useState(Date.now());

  // Live distance ticker
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // Fetch all user signals
  useEffect(() => {
    if (!user) { setSignals([]); return; }
    let unsub: (() => void) | undefined;
    try {
      const q = query(
        collection(db, "messages"),
        where("userId", "==", user.uid),
        where("status", "==", "transmitted"),
        orderBy("sentAt", "desc"),
      );
      unsub = onSnapshot(q, snap => {
        setSignals(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<SignalDoc, "id">) })));
      }, () => setSignals([]));
    } catch {
      setSignals([]);
    }
    return () => unsub?.();
  }, [user]);

  // ── Not logged in ──
  if (!authLoading && !user) {
    return (
      <main className="pt-16 min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
            <LogIn className="w-7 h-7 text-white/40" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Sign in to see your signals</h2>
          <p className="text-white/40 text-sm mb-6">Your transmitted messages are tied to your account.</p>
          <Link href="/login" className="inline-flex items-center gap-2 bg-[#0057FF] text-white font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-blue-700 transition-colors">
            <LogIn className="w-4 h-4" /> Sign In
          </Link>
        </div>
      </main>
    );
  }

  // ── Loading ──
  if (authLoading || signals === null) {
    return (
      <main className="pt-16 min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
          <p className="text-white/40 text-sm">Loading your signals…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-16 min-h-screen bg-black text-white">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 px-4 sm:px-8 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" /> Home
            </Link>
            <span className="text-white/20">|</span>
            <div>
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <h1 className="text-lg font-bold text-white">My Signal Dashboard</h1>
              </div>
              <p className="text-xs text-white/30 mt-0.5">All your transmissions — live positions in the universe</p>
            </div>
          </div>
          <Link href="/encode" className="inline-flex items-center gap-2 bg-[#0057FF] hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Rocket className="w-3.5 h-3.5" />
            New Transmission
          </Link>
        </div>
      </div>

      {/* ── Stats summary ────────────────────────────────────────────────────── */}
      {signals.length > 0 && (
        <div className="border-b border-white/5 px-4 sm:px-8 py-4">
          <div className="max-w-4xl mx-auto flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
              </span>
              <span className="text-sm font-bold text-white">{signals.length} Signal{signals.length > 1 ? "s" : ""} Active</span>
            </div>
            <div className="flex items-center gap-2 text-white/40">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs">All traveling at 299,792 km/s</span>
            </div>
            <div className="text-xs text-white/20 font-mono ml-auto hidden sm:block">
              Updated every 0.5s · {new Date(now).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">

        {/* Empty state */}
        {signals.length === 0 && (
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
              <Radio className="w-8 h-8 text-white/20" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">No signals yet</h2>
            <p className="text-white/30 text-sm mb-8 max-w-xs mx-auto">
              Transmit your first message to space and watch it travel through the universe in real time.
            </p>
            <Link href="/encode" className="inline-flex items-center gap-2 bg-[#0057FF] hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
              <Rocket className="w-4 h-4" />
              Encode & Transmit First Signal
            </Link>
          </div>
        )}

        {/* Signal cards */}
        {signals.length > 0 && (
          <div className="space-y-4">
            {signals.map(sig => (
              <SignalCard key={sig.id} sig={sig} now={now} />
            ))}
          </div>
        )}

        {/* Footer note */}
        {signals.length > 0 && (
          <div className="mt-10 text-center">
            <p className="text-xs text-white/20 leading-relaxed">
              These signals are permanent. They will continue traveling through space<br />
              long after this page is closed — forever.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
