import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Radio, ArrowLeft, Loader2, AlertCircle, Zap, LayoutDashboard } from "lucide-react";

// ─── Physics Constants ─────────────────────────────────────────────────────────

const C_KM_S = 299_792;
const LY_KM  = 9_461_000_000_000;
const AU_KM  = 149_597_871;

// ─── Milestones ───────────────────────────────────────────────────────────────

interface Milestone { name: string; km: number; description: string; color: string }

const MILESTONES: Milestone[] = [
  { name: "Moon",             km: 384_400,            description: "Earth's only natural satellite",                  color: "#CBD5E1" },
  { name: "Sun",              km: 149_597_871,         description: "Our star — the source of life",                   color: "#FCD34D" },
  { name: "Mars",             km: 225_000_000,         description: "The Red Planet",                                  color: "#F97316" },
  { name: "Asteroid Belt",    km: 330_000_000,         description: "Debris from the early solar system",             color: "#94A3B8" },
  { name: "Jupiter",          km: 778_500_000,         description: "Largest planet in our system",                   color: "#D97706" },
  { name: "Saturn",           km: 1_430_000_000,       description: "Lord of the rings",                               color: "#EAB308" },
  { name: "Uranus",           km: 2_880_000_000,       description: "The ice giant",                                   color: "#67E8F9" },
  { name: "Neptune",          km: 4_500_000_000,       description: "The windy world",                                 color: "#3B82F6" },
  { name: "Pluto",            km: 5_906_400_000,       description: "Edge of the inner solar system",                 color: "#A78BFA" },
  { name: "Heliosphere Edge", km: 18_000_000_000,      description: "Where solar wind stops — interstellar space begins", color: "#6366F1" },
  { name: "Oort Cloud",       km: 0.5 * LY_KM,        description: "Comet reservoir at the solar system's edge",     color: "#818CF8" },
  { name: "Proxima Centauri", km: 4.24 * LY_KM,       description: "Nearest star to our Sun",                        color: "#F472B6" },
  { name: "Alpha Centauri",   km: 4.37 * LY_KM,       description: "Triple-star system",                              color: "#FB923C" },
  { name: "Barnard's Star",   km: 5.96 * LY_KM,       description: "Fastest moving star in our sky",                 color: "#A3E635" },
  { name: "Sirius",           km: 8.6 * LY_KM,        description: "Brightest star in the night sky",                color: "#E0F2FE" },
  { name: "Vega",             km: 25 * LY_KM,         description: "Carl Sagan's first contact target",              color: "#C4B5FD" },
  { name: "Pleiades Cluster", km: 444 * LY_KM,        description: "The Seven Sisters star cluster",                 color: "#93C5FD" },
  { name: "Andromeda Galaxy", km: 2_537_000 * LY_KM,  description: "Our nearest galactic neighbour",                 color: "#F9A8D4" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distanceKm(sentAtMs: number): number { return C_KM_S * (Date.now() - sentAtMs) / 1000; }

function formatDistance(km: number): string {
  if (km < 1_000)               return `${km.toFixed(0)} km`;
  if (km < 1_000_000)           return `${(km / 1_000).toFixed(1)}k km`;
  if (km < AU_KM)               return `${(km / 1_000_000).toFixed(2)}M km`;
  if (km < 60 * C_KM_S)        return `${(km / C_KM_S / 60).toFixed(2)} light-min`;
  if (km < 24 * 3600 * C_KM_S) return `${(km / C_KM_S / 3600).toFixed(2)} light-hrs`;
  if (km < LY_KM)               return `${(km / (C_KM_S * 86400)).toFixed(1)} light-days`;
  return `${(km / LY_KM).toFixed(4)} ly`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000); const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);   const d = Math.floor(h / 24);
  const y = Math.floor(d / 365);
  if (y > 0) return `${y}y ${d % 365}d`;
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function nextMilestone(km: number): Milestone | null { return MILESTONES.find(m => m.km > km) ?? null; }
function lastMilestone(km: number): Milestone | null {
  const passed = MILESTONES.filter(m => m.km <= km);
  return passed[passed.length - 1] ?? null;
}
function progressToNext(km: number): number {
  const prev = lastMilestone(km); const next = nextMilestone(km);
  if (!next) return 1;
  const from = prev ? prev.km : 0;
  return Math.min(1, (km - from) / (next.km - from));
}

// ─── Solar System Data ────────────────────────────────────────────────────────

interface PlanetDef {
  name: string; au: number; size: number; color: number; speed: number;
  hasRings?: boolean; hasMoon?: boolean; emissive?: number;
}

const PLANETS: PlanetDef[] = [
  { name: "Mercury", au: 0.387,  size: 0.15, color: 0xa0a0a0, speed: 0.041,  emissive: 0x111111 },
  { name: "Venus",   au: 0.723,  size: 0.26, color: 0xe8cda0, speed: 0.016,  emissive: 0x221800 },
  { name: "Earth",   au: 1.000,  size: 0.28, color: 0x1a6fd8, speed: 0.010,  emissive: 0x001a40, hasMoon: true },
  { name: "Mars",    au: 1.524,  size: 0.18, color: 0xc1440e, speed: 0.0053, emissive: 0x200400 },
  { name: "Jupiter", au: 5.203,  size: 0.60, color: 0xc88b3a, speed: 0.00084,emissive: 0x120800 },
  { name: "Saturn",  au: 9.537,  size: 0.52, color: 0xead6b8, speed: 0.00034,emissive: 0x100a00, hasRings: true },
  { name: "Uranus",  au: 19.19,  size: 0.38, color: 0x7de8e8, speed: 0.00012,emissive: 0x001010 },
  { name: "Neptune", au: 30.07,  size: 0.36, color: 0x3f54ba, speed: 0.000060,emissive: 0x000610 },
];

const SCENE_R = 50; // scene units at Neptune

function auToScene(au: number): number {
  // Power scale — nearby planets not cramped, far ones visible
  return Math.pow(au / 30.07, 0.38) * SCENE_R;
}

// ─── 3D Solar System Component ────────────────────────────────────────────────

function SolarSystem3D({ sentAtMs }: { sentAtMs: number }) {
  const mountRef       = useRef<HTMLDivElement>(null);
  const sentAtMsRef    = useRef(sentAtMs);
  const distKmRef      = useRef(0);
  const signalMeshRef  = useRef<THREE.Mesh | null>(null);
  const signalMatRef   = useRef<THREE.MeshBasicMaterial | null>(null);
  const frameRef       = useRef(0);
  const planetMeshes   = useRef<Array<{ mesh: THREE.Mesh; pivot: THREE.Object3D; au: number; speed: number }>>([]);
  const earthMeshRef   = useRef<THREE.Mesh | null>(null);
  const moonMeshRef    = useRef<THREE.Mesh | null>(null);
  const [currentZone, setCurrentZone] = useState<string>("Launching…");

  // Sync sentAtMs via ref so animate loop sees latest
  useEffect(() => { sentAtMsRef.current = sentAtMs; }, [sentAtMs]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000008);

    // ── Camera ───────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 2000);
    camera.position.set(0, 55, 70);
    camera.lookAt(0, 0, 0);

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    // ── Controls ─────────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 10;
    controls.maxDistance = 400;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;

    // ── Background stars ─────────────────────────────────────────────────────
    const bgPositions: number[] = [];
    const bgColors: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 600 + Math.random() * 400;
      bgPositions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      const br = 0.5 + Math.random() * 0.5;
      bgColors.push(br, br * 0.95, br);
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute("position", new THREE.Float32BufferAttribute(bgPositions, 3));
    bgGeo.setAttribute("color",    new THREE.Float32BufferAttribute(bgColors, 3));
    scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({ size: 1.2, vertexColors: true, sizeAttenuation: true })));

    // ── Sun ──────────────────────────────────────────────────────────────────
    const sunGeo = new THREE.SphereGeometry(2.5, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sun);

    // Sun corona glow (large transparent sphere)
    const coronaGeo = new THREE.SphereGeometry(3.8, 32, 32);
    const coronaMat = new THREE.MeshBasicMaterial({ color: 0xff9900, transparent: true, opacity: 0.08, side: THREE.BackSide });
    scene.add(new THREE.Mesh(coronaGeo, coronaMat));

    const coronaGeo2 = new THREE.SphereGeometry(5.5, 32, 32);
    const coronaMat2 = new THREE.MeshBasicMaterial({ color: 0xffbb00, transparent: true, opacity: 0.04, side: THREE.BackSide });
    scene.add(new THREE.Mesh(coronaGeo2, coronaMat2));

    // Sun point light
    scene.add(Object.assign(new THREE.PointLight(0xfff8e0, 2, 500), { position: new THREE.Vector3(0, 0, 0) }));
    scene.add(new THREE.AmbientLight(0x111122, 0.8));

    // ── Planets ───────────────────────────────────────────────────────────────
    planetMeshes.current = [];
    PLANETS.forEach((p, i) => {
      const r = auToScene(p.au);

      // Orbit ring
      const orbitGeo = new THREE.RingGeometry(r - 0.06, r + 0.06, 96);
      const orbitMat = new THREE.MeshBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
      scene.add(new THREE.Mesh(orbitGeo, orbitMat));

      // Planet
      const geo = new THREE.SphereGeometry(p.size, 24, 16);
      const mat = new THREE.MeshStandardMaterial({ color: p.color, emissive: p.emissive ?? 0, roughness: 0.8, metalness: 0.1 });
      const mesh = new THREE.Mesh(geo, mat);
      const pivot = new THREE.Object3D();
      mesh.position.x = r;
      // Random starting angle
      pivot.rotation.y = Math.random() * Math.PI * 2;
      pivot.add(mesh);
      scene.add(pivot);

      // Earth reference
      if (p.name === "Earth") {
        earthMeshRef.current = mesh;

        // Moon orbit + mesh
        const moonOrbitR = 1.4;
        const moonPivot = new THREE.Object3D();
        const moonGeo = new THREE.SphereGeometry(0.08, 16, 12);
        const moonMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 1 });
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        moonMesh.position.x = moonOrbitR;
        moonPivot.add(moonMesh);
        mesh.add(moonPivot);
        moonMeshRef.current = moonMesh;
      }

      // Saturn rings
      if (p.hasRings) {
        const ringGeo = new THREE.RingGeometry(p.size * 1.4, p.size * 2.3, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xd4bc8a, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2.5;
        mesh.add(ring);
      }

      planetMeshes.current.push({ mesh, pivot, au: p.au, speed: p.speed });
    });

    // ── Asteroid belt (particle ring) ─────────────────────────────────────────
    const beltPositions: number[] = [];
    const beltColors: number[] = [];
    for (let i = 0; i < 800; i++) {
      const angle = Math.random() * Math.PI * 2;
      const belt_r = auToScene(2.2 + Math.random() * 1.0); // 2.2 – 3.2 AU
      const jitter = (Math.random() - 0.5) * 0.5;
      beltPositions.push(Math.cos(angle) * belt_r, jitter, Math.sin(angle) * belt_r);
      const br = 0.35 + Math.random() * 0.25;
      beltColors.push(br, br * 0.9, br * 0.8);
    }
    const beltGeo = new THREE.BufferGeometry();
    beltGeo.setAttribute("position", new THREE.Float32BufferAttribute(beltPositions, 3));
    beltGeo.setAttribute("color",    new THREE.Float32BufferAttribute(beltColors, 3));
    scene.add(new THREE.Points(beltGeo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, sizeAttenuation: true })));

    // ── Signal expanding sphere (centered at Earth position, updated each frame) ─
    const sigGeo = new THREE.SphereGeometry(1, 24, 16);
    const sigMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, wireframe: true, transparent: true, opacity: 0.18 });
    const sigMesh = new THREE.Mesh(sigGeo, sigMat);
    scene.add(sigMesh);
    signalMeshRef.current = sigMesh;
    signalMatRef.current  = sigMat;

    // ── Resize ────────────────────────────────────────────────────────────────
    function onResize() {
      if (!el) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    }
    window.addEventListener("resize", onResize);

    // ── Animate ───────────────────────────────────────────────────────────────
    let frame = 0;
    let lastZoneUpdate = 0;

    function animate(ts: number) {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      sun.rotation.y += 0.003;

      // Orbit planets
      planetMeshes.current.forEach(({ pivot, speed }) => {
        pivot.rotation.y += speed * 0.005;
      });

      // Moon orbit
      if (earthMeshRef.current) {
        const moonPivot = earthMeshRef.current.children[0] as THREE.Object3D;
        if (moonPivot) moonPivot.rotation.y += 0.02;
      }

      // ── Signal sphere update ──────────────────────────────────────────────
      const elapsedSec = (Date.now() - sentAtMsRef.current) / 1000;
      const dKm = C_KM_S * elapsedSec;
      distKmRef.current = dKm;

      const sigAU = dKm / AU_KM;
      const sigSceneR = Math.min(auToScene(sigAU), SCENE_R * 3.5);

      // Position signal sphere at Earth's world position
      if (signalMeshRef.current && earthMeshRef.current) {
        earthMeshRef.current.getWorldPosition(signalMeshRef.current.position);
        signalMeshRef.current.scale.setScalar(Math.max(0.01, sigSceneR));
      }

      // Pulse opacity
      if (signalMatRef.current) {
        signalMatRef.current.opacity = 0.06 + 0.10 * (0.5 + 0.5 * Math.sin(ts / 600));
      }

      // Determine current zone label (update every 1s)
      frame++;
      if (frame - lastZoneUpdate > 60) {
        lastZoneUpdate = frame;
        const last = lastMilestone(dKm);
        const nxt  = nextMilestone(dKm);
        if (!last) setCurrentZone("Near Earth");
        else if (!nxt) setCurrentZone("Beyond Andromeda");
        else setCurrentZone(`Passed ${last.name} · En route to ${nxt.name}`);
      }

      renderer.render(scene, camera);
    }
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      {/* Zone label */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 border border-blue-500/30 backdrop-blur-sm rounded-full px-4 py-1.5 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
          <span className="text-xs text-cyan-300 font-mono">{currentZone}</span>
        </div>
      </div>
      {/* Drag hint */}
      <div className="absolute top-3 right-3 bg-black/50 border border-white/10 rounded-lg px-2.5 py-1 pointer-events-none">
        <p className="text-xs text-white/30">Drag to orbit · Scroll to zoom</p>
      </div>
    </div>
  );
}

// ─── Signal Data ──────────────────────────────────────────────────────────────

interface SignalData {
  originalText: string; authorName: string; sentAt: Timestamp;
  totalBits: number;    status: string;     userId?: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SignalTracker() {
  const { id } = useParams<{ id: string }>();
  const [signal, setSignal]   = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [distKm, setDistKm]   = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "messages", id))
      .then(snap => {
        if (!snap.exists()) { setError("Signal not found."); return; }
        setSignal(snap.data() as SignalData);
      })
      .catch(() => setError("Could not load signal data."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!signal) return;
    const sentMs = signal.sentAt.toMillis();
    function tick() { setDistKm(distanceKm(sentMs)); setElapsed(Date.now() - sentMs); }
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [signal]);

  const next = signal ? nextMilestone(distKm) : null;
  const last = signal ? lastMilestone(distKm) : null;
  const prog = signal ? progressToNext(distKm) : 0;

  if (loading) {
    return (
      <main className="pt-16 min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Locating your signal in the universe…</p>
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
          <Link href="/encode" className="text-blue-400 hover:underline text-sm">← Back to Encoder</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-16 min-h-screen bg-black text-white flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link href="/encode" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <span className="text-white/20">|</span>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Mission Control — Signal Live</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/my-signals" className="inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
            <LayoutDashboard className="w-3.5 h-3.5" />
            All My Signals
          </Link>
        </div>
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">

        {/* LEFT — 3D Solar System ──────────────────────────────────────────── */}
        <div className="lg:flex-1 relative bg-black" style={{ minHeight: "55vw", maxHeight: "85vh" }}>
          <SolarSystem3D sentAtMs={signal.sentAt.toMillis()} />

          {/* Floating distance badge */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 border border-cyan-500/30 backdrop-blur-sm rounded-2xl px-6 py-3 text-center pointer-events-none z-10">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Distance from Earth</p>
            <p className="font-mono text-2xl font-bold text-white leading-none">{formatDistance(distKm)}</p>
            <p className="text-xs text-cyan-400/60 mt-0.5 font-mono">{C_KM_S.toLocaleString()} km/s · light speed</p>
          </div>
        </div>

        {/* RIGHT — Info panel ──────────────────────────────────────────────── */}
        <div className="lg:w-96 border-l border-white/10 overflow-y-auto flex flex-col">

          {/* Message */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Your Transmission</span>
            </div>
            <p className="text-white font-medium leading-relaxed mb-3">"{signal.originalText}"</p>
            <p className="text-xs text-gray-500">
              Transmitted by <span className="text-gray-300 font-medium">{signal.authorName}</span>
            </p>
            <p className="text-xs text-gray-600 mt-1 font-mono">
              {new Date(signal.sentAt.toMillis()).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
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
                {signal.totalBits?.toLocaleString() ?? "—"}<span className="text-xs text-gray-400 font-normal ml-1">bits</span>
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
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Next milestone</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: next.color }}>{next.name}</span>
                <span className="text-xs text-gray-400">{formatDistance(next.km - distKm)} away</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-2">
                <div className="h-1.5 rounded-full transition-all duration-300" style={{ width: `${prog * 100}%`, backgroundColor: next.color }} />
              </div>
              <p className="text-xs text-gray-500">{next.description}</p>
            </div>
          )}

          {/* Journey milestones */}
          <div className="p-6 flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">Journey so far</p>
            <div className="space-y-3">
              {MILESTONES.map(m => {
                const passed = distKm >= m.km;
                return (
                  <div key={m.name} className={`flex items-center gap-3 transition-opacity ${passed ? "opacity-100" : "opacity-20"}`}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: passed ? m.color : "#334155" }} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${passed ? "text-white" : "text-gray-600"}`}>{m.name}</p>
                      <p className="text-xs text-gray-600 truncate">{formatDistance(m.km)}</p>
                    </div>
                    {passed && <span className="text-xs font-semibold text-green-400 flex-shrink-0">✓ Passed</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-white/10">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center mb-3">
              <Zap className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <p className="text-xs text-gray-400 leading-relaxed">
                This signal will keep traveling forever — even after you close this page.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/encode" className="flex-1 text-center text-xs text-blue-400 hover:underline py-1">
                Send another →
              </Link>
              <Link href="/my-signals" className="flex-1 text-center text-xs text-cyan-400 hover:underline py-1">
                All signals →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
