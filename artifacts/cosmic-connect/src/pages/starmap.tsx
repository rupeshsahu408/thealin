import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { NAMED_STARS, SPECTRAL_COLORS, starSize, type StarData } from "@/data/stars";
import { ArrowLeft, Info, Search, X, Layers, RotateCcw, Radio } from "lucide-react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

// ─── Physics Constants ─────────────────────────────────────────────────────────
const C_KM_S = 299_792;
const LY_KM  = 9_461_000_000_000;

// ─── Background Star Generation ───────────────────────────────────────────────

function generateBackgroundStars(count: number) {
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const bandWeight = 0.5 + 0.5 * Math.pow(Math.abs(Math.sin(phi - Math.PI / 2 + 0.3)), 0.3);
    const r = 300 + Math.random() * 700 * bandWeight;
    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
    const brightness = 0.3 + Math.random() * 0.7;
    const t = Math.random();
    colors.push(brightness * (0.8 + t * 0.2), brightness * (0.85 + t * 0.1), brightness);
    sizes.push(0.4 + Math.random() * 1.2);
  }
  return { positions, colors, sizes };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDist(ly: number): string {
  if (ly < 1)    return `${(ly * 63241).toFixed(0)} AU`;
  if (ly < 1000) return `${ly.toFixed(2)} light-years`;
  return `${(ly / 1000).toFixed(2)} kly`;
}

function signalYears(ly: number): string {
  if (ly < 1)   return `${(ly * 365.25).toFixed(0)} days`;
  if (ly < 100) return `${ly.toFixed(1)} years`;
  return `${ly.toFixed(0)} years`;
}

function signalDistLy(sentAtMs: number): number {
  const elapsedSec = (Date.now() - sentAtMs) / 1000;
  return (C_KM_S * elapsedSec) / LY_KM;
}

function formatSignalDist(ly: number): string {
  const km = ly * LY_KM;
  if (km < 1_000_000)         return `${(km / 1_000).toFixed(1)}k km`;
  if (km < C_KM_S * 3600)     return `${(km / C_KM_S / 60).toFixed(1)} light-min`;
  if (km < C_KM_S * 86400)    return `${(km / C_KM_S / 3600).toFixed(1)} light-hrs`;
  if (ly < 1)                  return `${(ly * 365.25).toFixed(1)} light-days`;
  return `${ly.toFixed(4)} light-years`;
}

function timeAgoShort(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Signal type ──────────────────────────────────────────────────────────────

interface LiveSignal {
  id: string;
  sentAtMs: number;
  text: string;
}

// ─── Star Info Panel ──────────────────────────────────────────────────────────

function StarPanel({ star, onClose }: { star: StarData; onClose: () => void }) {
  const [r, g, b] = SPECTRAL_COLORS[star.spec];
  const color = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
  const specNames: Record<string, string> = {
    O: "O — Hot Blue",  B: "B — Blue-White", A: "A — White",
    F: "F — Yellow-White", G: "G — Yellow (like our Sun)",
    K: "K — Orange",    M: "M — Red Dwarf",
  };
  const categoryBadge: Record<string, string> = {
    nearby: "🌌 Nearby",
    bright: "⭐ Bright",
    seti:   "📡 SETI Target",
    constellation: "🔭 Constellation",
  };

  return (
    <div className="absolute top-16 right-4 w-80 bg-black/85 border border-white/15 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl z-20">
      <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
            <h2 className="text-white font-bold text-lg leading-tight">{star.name}</h2>
          </div>
          <span className="text-xs text-white/40 font-mono">{categoryBadge[star.category]}</span>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors flex-shrink-0 mt-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-white/10">
        <div>
          <p className="text-xs text-white/40 mb-0.5">Distance</p>
          <p className="text-sm font-mono font-bold text-white">{formatDist(star.dist)}</p>
        </div>
        <div>
          <p className="text-xs text-white/40 mb-0.5">Spectral Type</p>
          <p className="text-sm font-mono font-bold" style={{ color }}>{specNames[star.spec]}</p>
        </div>
        <div>
          <p className="text-xs text-white/40 mb-0.5">Magnitude</p>
          <p className="text-sm font-mono font-bold text-white">{star.mag > 0 ? "+" : ""}{star.mag.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-white/40 mb-0.5">Signal Arrival</p>
          <p className="text-sm font-mono font-bold text-[#0057FF]">{signalYears(star.dist)}</p>
        </div>
      </div>

      <div className="px-5 py-4 border-b border-white/10">
        <p className="text-xs text-white/60 leading-relaxed">{star.note}</p>
      </div>

      <div className="px-5 py-3">
        <p className="text-xs text-white/30 text-center">
          A signal from Earth reaches{" "}
          <span className="text-white/60">{star.name}</span>
          {" "}in{" "}
          <span className="text-[#0057FF] font-semibold">{signalYears(star.dist)}</span>
        </p>
      </div>
    </div>
  );
}

// ─── Live Signals Panel ────────────────────────────────────────────────────────

function LiveSignalsPanel({ signals }: { signals: LiveSignal[] }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (signals.length === 0) return null;

  return (
    <div className="absolute bottom-20 left-4 w-72 bg-black/80 border border-cyan-500/30 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl z-20">
      <div className="px-4 py-3 border-b border-cyan-500/20 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
        </span>
        <span className="text-xs font-bold text-cyan-300 uppercase tracking-widest">
          {signals.length} Live Signal{signals.length > 1 ? "s" : ""} Active
        </span>
        <Radio className="w-3.5 h-3.5 text-cyan-400 ml-auto" />
      </div>
      <div className="divide-y divide-white/5 max-h-52 overflow-y-auto">
        {signals.map((sig, i) => {
          const ly = signalDistLy(sig.sentAtMs);
          return (
            <Link key={sig.id} href={`/signal/${sig.id}`}>
              <div className="px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-xs text-white/70 font-medium line-clamp-1 flex-1">
                    "{sig.text || "Encoded message"}"
                  </p>
                  <span className="text-xs text-white/30 font-mono shrink-0">{timeAgoShort(sig.sentAtMs)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 animate-pulse"
                      style={{ width: `${Math.min(100, (ly / 4.24) * 100).toFixed(2)}%`, minWidth: "4px" }}
                    />
                  </div>
                  <span className="text-xs font-mono text-cyan-400">{formatSignalDist(ly)}</span>
                </div>
                <p className="text-xs text-white/20 mt-1 font-mono">
                  Ring #{i + 1} · {ly < 0.001 ? "Near Earth" : ly < 4.24 ? "En route to Proxima" : "Beyond Proxima Centauri"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="px-4 py-2 border-t border-white/5">
        <p className="text-xs text-white/20 text-center">Tap a signal to track its journey →</p>
      </div>
      {/* Suppress unused tick warning */}
      <span className="hidden">{tick}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StarMap() {
  const { user } = useAuth();

  const mountRef     = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const frameRef     = useRef<number>(0);
  const namedPtsRef  = useRef<THREE.Points | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef     = useRef(new THREE.Vector2());

  // Signal ring meshes — read from animate loop each frame
  type SigMesh = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; sentAtMs: number };
  const signalMeshesRef = useRef<SigMesh[]>([]);

  const [selected, setSelected]     = useState<StarData | null>(null);
  const [hovered, setHovered]       = useState<StarData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [starsCount]                = useState(NAMED_STARS.length + 6000);
  const [search, setSearch]         = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [tooltip, setTooltip]       = useState<{ x: number; y: number; name: string } | null>(null);
  const [signals, setSignals]       = useState<LiveSignal[]>([]);

  const filteredSearch = search.trim().length > 1
    ? NAMED_STARS.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];

  // ── Fetch live signals from Firestore ────────────────────────────────────────
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
        setSignals(snap.docs.map(d => ({
          id: d.id,
          sentAtMs: d.data().sentAt?.toMillis?.() ?? Date.now(),
          text: d.data().originalText ?? "",
        })));
      }, () => { /* Firebase not configured — ignore */ });
    } catch {
      // Firebase not configured in dev — silently skip
    }
    return () => unsub?.();
  }, [user]);

  // ── Sync signal ring meshes into Three.js scene ───────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old meshes
    signalMeshesRef.current.forEach(({ mesh }) => scene.remove(mesh));
    signalMeshesRef.current = [];

    // Create one sphere per signal
    signals.forEach(sig => {
      const geo = new THREE.SphereGeometry(1, 32, 20);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ddff,
        wireframe: true,
        transparent: true,
        opacity: 0.18,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      signalMeshesRef.current.push({ mesh, mat, sentAtMs: sig.sentAtMs });
    });
  }, [signals]);

  // ── Three.js Setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x00000c);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, el.clientWidth / el.clientHeight, 0.1, 5000);
    camera.position.set(0, 8, 28);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2;
    controls.maxDistance = 1200;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
    controlsRef.current = controls;

    // ── Background stars ──────────────────────────────────────────────────────
    const bg = generateBackgroundStars(6000);
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute("position", new THREE.Float32BufferAttribute(bg.positions, 3));
    bgGeo.setAttribute("color",    new THREE.Float32BufferAttribute(bg.colors,    3));
    const bgMat = new THREE.PointsMaterial({
      size: 2.2, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95,
    });
    scene.add(new THREE.Points(bgGeo, bgMat));

    // ── Named / catalog stars ─────────────────────────────────────────────────
    const namedPositions: number[] = [];
    const namedColors:    number[] = [];
    const namedSizes:     number[] = [];

    NAMED_STARS.forEach(s => {
      namedPositions.push(s.x, s.y, s.z);
      const [r, g, b] = SPECTRAL_COLORS[s.spec];
      namedColors.push(r, g, b);
      namedSizes.push(starSize(s.mag));
    });

    const namedGeo = new THREE.BufferGeometry();
    namedGeo.setAttribute("position", new THREE.Float32BufferAttribute(namedPositions, 3));
    namedGeo.setAttribute("color",    new THREE.Float32BufferAttribute(namedColors, 3));

    // Attach sizes — used by ShaderMaterial vertex shader
    const sizesAttr = new THREE.Float32BufferAttribute(namedSizes, 1);
    namedGeo.setAttribute("size", sizesAttr);

    // ShaderMaterial for glow effect; PointsMaterial fallback for limited WebGL
    let namedMat: THREE.ShaderMaterial | THREE.PointsMaterial;
    try {
      namedMat = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: `
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (280.0 / -mvPos.z);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float d = dot(uv, uv);
            if (d > 0.25) discard;
            float alpha = 1.0 - smoothstep(0.04, 0.25, d);
            float core = 1.0 - smoothstep(0.0, 0.10, d);
            vec3 col = mix(vColor, vec3(1.0), core * 0.7);
            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true,
        vertexColors: true,
        depthWrite: false,
      });
    } catch {
      namedMat = new THREE.PointsMaterial({
        size: 4.0, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 1.0,
      });
    }

    const namedPts = new THREE.Points(namedGeo, namedMat);
    namedPtsRef.current = namedPts;
    scene.add(namedPts);

    // ── Earth ─────────────────────────────────────────────────────────────────
    const earthGeo  = new THREE.SphereGeometry(0.35, 32, 32);
    const earthMat  = new THREE.MeshStandardMaterial({ color: 0x1a4fd8, emissive: 0x0a2060, roughness: 0.7 });
    const earth     = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);

    // Earth glow ring
    const glowGeo = new THREE.RingGeometry(0.4, 0.9, 32);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x2255ff, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = Math.PI / 2;
    scene.add(glow);

    // Ambient light
    scene.add(new THREE.AmbientLight(0x334488, 2));
    scene.add(Object.assign(new THREE.DirectionalLight(0xffffff, 1.5), { position: { x: 5, y: 3, z: 5 } }));

    // ── Raycaster threshold ───────────────────────────────────────────────────
    raycasterRef.current.params.Points = { threshold: 0.8 };

    // ── Resize handler ────────────────────────────────────────────────────────
    function onResize() {
      if (!el || !renderer || !camera) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    }
    window.addEventListener("resize", onResize);

    // ── Animation loop ────────────────────────────────────────────────────────
    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      glow.rotation.z += 0.003;

      // Update signal ring spheres each frame
      const t = Date.now() / 1000;
      signalMeshesRef.current.forEach(({ mesh, mat, sentAtMs }, idx) => {
        const elapsedSec = (Date.now() - sentAtMs) / 1000;
        const distLy = (C_KM_S * elapsedSec) / LY_KM;
        // Same sqrt scale as star positions — sphere radius matches star distances
        const r = Math.pow(distLy + 1, 0.45) * 5;
        mesh.scale.setScalar(r);
        // Pulsing opacity — each ring pulses at slightly different phase
        mat.opacity = 0.08 + 0.10 * (0.5 + 0.5 * Math.sin(t * 1.2 + idx * 1.3));
      });

      renderer.render(scene, camera);
    }
    animate();
    setLoading(false);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
      // Clean up signal meshes
      signalMeshesRef.current.forEach(({ mesh }) => scene.remove(mesh));
      signalMeshesRef.current = [];
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  // ── Mouse move — hover detection ────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = mountRef.current;
    if (!el || !cameraRef.current || !namedPtsRef.current) return;
    const rect = el.getBoundingClientRect();
    mouseRef.current.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const hits = raycasterRef.current.intersectObject(namedPtsRef.current);
    if (hits.length > 0) {
      const idx = hits[0].index ?? -1;
      if (idx >= 0 && idx < NAMED_STARS.length) {
        setHovered(NAMED_STARS[idx]);
        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, name: NAMED_STARS[idx].name });
      }
    } else {
      setHovered(null);
      setTooltip(null);
    }
  }, []);

  // ── Click — select star ─────────────────────────────────────────────────────
  const onClick = useCallback(() => {
    if (hovered) setSelected(hovered);
  }, [hovered]);

  // ── Navigate to star ────────────────────────────────────────────────────────
  function flyToStar(star: StarData) {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    ctrl.autoRotate = false;
    const dir = new THREE.Vector3(star.x, star.y, star.z).normalize();
    const dist = 12;
    cam.position.set(dir.x * dist, dir.y * dist + 3, dir.z * dist);
    ctrl.target.set(star.x * 0.3, star.y * 0.3, star.z * 0.3);
    ctrl.update();
    setSelected(star);
    setSearchOpen(false);
    setSearch("");
  }

  // ── Reset camera ────────────────────────────────────────────────────────────
  function resetCamera() {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    cam.position.set(0, 8, 28);
    ctrl.target.set(0, 0, 0);
    ctrl.autoRotate = true;
    ctrl.update();
  }

  return (
    <div className="fixed inset-0 bg-black" style={{ paddingTop: 64 }}>
      {/* Three.js mount */}
      <div
        ref={mountRef}
        onMouseMove={onMouseMove}
        onClick={onClick}
        style={{ cursor: hovered ? "pointer" : "grab", position: "absolute", top: 64, left: 0, right: 0, bottom: 0 }}
      />

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-white/60 text-sm">Rendering {starsCount.toLocaleString()} stars…</p>
          </div>
        </div>
      )}

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="absolute top-16 left-0 right-0 flex items-center justify-between px-4 py-3 z-20 pointer-events-none">
        {/* Left */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <Link href="/" className="inline-flex items-center gap-1.5 bg-black/60 border border-white/15 backdrop-blur-sm text-white/70 hover:text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </Link>
          <div className="bg-black/60 border border-white/15 backdrop-blur-sm rounded-lg px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-xs font-semibold text-white uppercase tracking-widest">Live Star Map</span>
            </div>
            <p className="text-xs text-white/30 font-mono">{starsCount.toLocaleString()} stars rendered</p>
          </div>
          {signals.length > 0 && (
            <div className="bg-cyan-950/60 border border-cyan-500/30 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                </span>
                <span className="text-xs font-bold text-cyan-300">{signals.length} Signal Ring{signals.length > 1 ? "s" : ""}</span>
              </div>
              <p className="text-xs text-cyan-400/50 font-mono">Glowing spheres = your signals</p>
            </div>
          )}
        </div>

        {/* Right — Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Search */}
          <div className="relative">
            <button
              onClick={() => setSearchOpen(o => !o)}
              className="bg-black/60 border border-white/15 backdrop-blur-sm text-white/70 hover:text-white p-2 rounded-lg transition-colors"
              title="Search stars"
            >
              <Search className="w-4 h-4" />
            </button>
            {searchOpen && (
              <div className="absolute right-0 top-10 w-64 bg-black/90 border border-white/15 backdrop-blur-md rounded-xl overflow-hidden shadow-2xl">
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search star name…"
                  className="w-full bg-transparent text-white text-sm px-4 py-3 outline-none placeholder-white/30 border-b border-white/10"
                />
                {filteredSearch.map(s => (
                  <button
                    key={s.id}
                    onClick={() => flyToStar(s)}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/10 transition-colors flex items-center justify-between"
                  >
                    <span className="text-sm text-white">{s.name}</span>
                    <span className="text-xs text-white/40 font-mono">{formatDist(s.dist)}</span>
                  </button>
                ))}
                {search.length > 1 && filteredSearch.length === 0 && (
                  <p className="text-xs text-white/30 px-4 py-3">No stars found</p>
                )}
              </div>
            )}
          </div>
          <button onClick={resetCamera} className="bg-black/60 border border-white/15 backdrop-blur-sm text-white/70 hover:text-white p-2 rounded-lg transition-colors" title="Reset view">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowLabels(l => !l)} className={`border backdrop-blur-sm p-2 rounded-lg transition-colors ${showLabels ? "bg-blue-600/40 border-blue-400/40 text-blue-300" : "bg-black/60 border-white/15 text-white/70"}`} title="Toggle labels">
            <Layers className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Hover tooltip ─────────────────────────────────────────────────────── */}
      {tooltip && !selected && (
        <div
          className="absolute z-20 bg-black/80 border border-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <p className="text-sm text-white font-medium">{tooltip.name}</p>
        </div>
      )}

      {/* ── Star Info Panel ───────────────────────────────────────────────────── */}
      {selected && <StarPanel star={selected} onClose={() => setSelected(null)} />}

      {/* ── Live Signals Panel ─────────────────────────────────────────────────── */}
      <LiveSignalsPanel signals={signals} />

      {/* ── No signals hint (logged in but no signals) ─────────────────────────── */}
      {user && signals.length === 0 && (
        <div className="absolute bottom-20 left-4 bg-black/60 border border-white/10 backdrop-blur-sm rounded-xl px-4 py-3 z-20 pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-3.5 h-3.5 text-white/30" />
            <span className="text-xs text-white/30 font-semibold">No signals transmitted yet</span>
          </div>
          <p className="text-xs text-white/20">Go to Encode & Send → transmit a message to see your signal ring here</p>
        </div>
      )}

      {/* ── Bottom legend ─────────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 border border-white/10 backdrop-blur-sm rounded-full px-5 py-2.5 z-20 pointer-events-none">
        {([["O","#92B5FF","Hot Blue"],["B","#AABFFF","Blue-White"],["A","#CDDEFF","White"],["F","#F8F7FF","White-Yellow"],["G","#FFF4EA","Yellow"],["K","#FFD2A1","Orange"],["M","#FF9966","Red"]] as [string,string,string][]).map(([cls, col, label]) => (
          <div key={cls} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />
            <span className="text-xs text-white/50 hidden sm:block">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 border-l border-white/10 pl-4">
          <span className="w-2 h-2 rounded-full border border-cyan-400" style={{ backgroundColor: "transparent" }} />
          <span className="text-xs text-cyan-400/70 hidden sm:block">Your Signal</span>
        </div>
      </div>

      {/* ── Controls hint ─────────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 right-4 bg-black/50 border border-white/10 backdrop-blur-sm rounded-lg px-3 py-2 z-20 pointer-events-none">
        <p className="text-xs text-white/30">Drag to rotate · Scroll to zoom · Click star for info</p>
      </div>

      {/* ── Earth label ───────────────────────────────────────────────────────── */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none z-10">
        <div className="text-center opacity-60">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mx-auto" />
          <p className="text-xs text-blue-300 mt-1 font-mono tracking-widest">YOU ARE HERE</p>
        </div>
      </div>
    </div>
  );
}
