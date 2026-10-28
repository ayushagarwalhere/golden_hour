"use client";

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { TraceNode, TraceResult } from "@/lib/trace";

const COLORS: Record<string, string> = {
  victim: "#fbefe2",
  wallet: "#e07a55",
  scam: "#ff6b5e",
  exchange_deposit: "#ffd29a",
  exchange_hot: "#ffc46b",
  mixer: "#b48cff",
  bridge: "#7fd6d0",
  dex: "#9fb7ff",
  contract: "#a99",
};

export const KIND_LABEL: Record<string, string> = {
  victim: "Your wallet",
  wallet: "Hop wallet",
  scam: "Flagged scam wallet",
  exchange_deposit: "Exchange deposit address",
  exchange_hot: "Exchange wallet",
  mixer: "Mixer",
  bridge: "Bridge",
  dex: "DEX",
  contract: "Contract",
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Laid = TraceNode & { pos: THREE.Vector3 };

const isExchange = (k: string) => k === "exchange_deposit" || k === "exchange_hot";
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Columns by hop; exchanges get their own final column so the gold endpoint reads clearly.
 *  Busy columns become a golden-angle disc in depth instead of a tall stack. Result is scaled to fit. */
function layout(trace: TraceResult): Laid[] {
  const byCol = new Map<number, TraceNode[]>();
  const maxDepth = Math.max(...trace.nodes.filter((n) => !isExchange(n.kind)).map((n) => n.depth), 0);
  for (const n of trace.nodes) {
    const c = isExchange(n.kind) ? maxDepth + 1 : n.depth;
    byCol.set(c, [...(byCol.get(c) ?? []), n]);
  }
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  const span = Math.max(1, cols.length - 1);
  const laid: Laid[] = cols.flatMap((c, ci) => {
    const col = byCol.get(c)!;
    // exchanges first within their column, then by kind so similar nodes sit together
    col.sort((a, b) => Number(isExchange(b.kind)) - Number(isExchange(a.kind)) || a.kind.localeCompare(b.kind));
    return col.map((n, i) => {
      let y: number, z: number;
      if (col.length <= 6) {
        y = (i - (col.length - 1) / 2) * 1.15;
        z = Math.sin(i * 1.9 + c * 0.7) * 0.5;
      } else {
        const r = 0.42 * Math.sqrt(i + 0.5);
        y = r * Math.cos(i * GOLDEN);
        z = r * Math.sin(i * GOLDEN);
      }
      return { ...n, pos: new THREE.Vector3((ci / span) * 2.6 * span, y, z) };
    });
  });
  // fit into a ~8.5 × 4.4 box, centred
  const box = new THREE.Box3().setFromPoints(laid.map((n) => n.pos));
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const s = Math.min(1.25, 8.5 / Math.max(size.x, 1e-6), 4.4 / Math.max(size.y, 1e-6));
  laid.forEach((n) => n.pos.sub(centre).multiplyScalar(s));
  return laid;
}

function curveFor(a: THREE.Vector3, b: THREE.Vector3) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += 0.35 + a.distanceTo(b) * 0.08;
  mid.z += 0.5;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

function Flow({ curves }: { curves: { curve: THREE.QuadraticBezierCurve3; weight: number; color: THREE.Color }[] }) {
  const PER = 7;
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const total = curves.length * PER;
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    curves.forEach((c, ci) => {
      for (let k = 0; k < PER; k++) m.setColorAt(ci * PER + k, c.color);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [curves]);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    curves.forEach((c, ci) => {
      for (let k = 0; k < PER; k++) {
        const u = (t * 0.16 + k / PER + ci * 0.13) % 1;
        tmp.position.copy(c.curve.getPoint(u));
        const s = (0.025 + c.weight * 0.035) * Math.sin(u * Math.PI);
        tmp.scale.setScalar(s);
        tmp.updateMatrix();
        m.setMatrixAt(ci * PER + k, tmp.matrix);
      }
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, total)]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Orb({ n, active, onHover, dense }: { n: Laid; active: boolean; onHover: (a: string | null) => void; dense: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const exchange = n.kind === "exchange_deposit" || n.kind === "exchange_hot";
  const size = n.kind === "victim" ? 0.16 : exchange ? 0.2 : dense ? 0.065 : 0.11;
  const color = useMemo(() => new THREE.Color(COLORS[n.kind] ?? "#fff").multiplyScalar(exchange ? 2.2 : 1.5), [n.kind, exchange]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ref.current) ref.current.scale.setScalar(1 + (active ? 0.25 : 0) + Math.sin(t * 1.6 + n.pos.x) * 0.05);
    if (ring.current) {
      const p = (t * 0.45 + n.pos.y) % 1;
      ring.current.scale.setScalar(1 + p * 2.6);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.55;
      ring.current.lookAt(0, 0, 10);
    }
  });
  return (
    <group position={n.pos}>
      <mesh ref={ref} onPointerOver={(e) => (e.stopPropagation(), onHover(n.address))} onPointerOut={() => onHover(null)}>
        <sphereGeometry args={[size, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {exchange && (
        <mesh ref={ring}>
          <ringGeometry args={[size * 1.15, size * 1.3, 64]} />
          <meshBasicMaterial color={color} transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {(active || exchange || n.kind === "victim" || n.kind === "mixer" || n.kind === "bridge") && (
        <Html center distanceFactor={9} zIndexRange={[10, 0]}>
          <div className="node-label">
            {exchange ? <b>{n.entity ?? n.labels[0]}</b> : n.kind === "victim" ? <b>You</b> : n.labels[0] && n.kind !== "wallet" ? n.labels[0] : short(n.address)}
          </div>
        </Html>
      )}
    </group>
  );
}

function Scene({ trace, hover, setHover }: { trace: TraceResult; hover: string | null; setHover: (a: string | null) => void }) {
  const nodes = useMemo(() => layout(trace), [trace]);
  const at = useMemo(() => new Map(nodes.map((n) => [n.address, n])), [nodes]);
  const maxAmt = Math.max(...trace.edges.map((e) => e.usd ?? e.amount), 1e-9);
  const curves = useMemo(
    () =>
      trace.edges.flatMap((e) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        if (!a || !b || a === b) return [];
        const weight = Math.sqrt((e.usd ?? e.amount) / maxAmt);
        const target = b.kind;
        const color = new THREE.Color(target.startsWith("exchange") ? "#ffd8a0" : "#ff9a6a").multiplyScalar(2.4);
        return [{ curve: curveFor(a.pos, b.pos), weight, color, key: `${e.txHash}-${e.from}-${e.to}` }];
      }),
    [trace, at, maxAmt],
  );
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = Math.sin(clock.elapsedTime * 0.12) * 0.18;
  });
  return (
    <group ref={group}>
      {curves.map((c) => (
        <Line key={c.key} points={c.curve.getPoints(40)} color="#ffb98a" lineWidth={1 + c.weight * 2.5} transparent opacity={0.28} />
      ))}
      <Flow curves={curves} />
      {nodes.map((n) => (
        <Orb key={n.address} n={n} active={hover === n.address} onHover={setHover} dense={nodes.length > 18} />
      ))}
    </group>
  );
}

export default function TraceGraph({ trace, onHover }: { trace: TraceResult; onHover?: (n: TraceNode | null) => void }) {
  const [hover, setHoverState] = useState<string | null>(null);
  const setHover = (a: string | null) => {
    setHoverState(a);
    onHover?.(a ? trace.nodes.find((n) => n.address === a) ?? null : null);
    document.body.style.cursor = a ? "pointer" : "";
  };
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.6, 8.5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
      <Scene trace={trace} hover={hover} setHover={setHover} />
      <OrbitControls enableZoom={false} enablePan={false} enableDamping dampingFactor={0.06} rotateSpeed={0.5} minPolarAngle={Math.PI / 3} maxPolarAngle={(2 * Math.PI) / 3} />
      <EffectComposer>
        <Bloom intensity={1.1} luminanceThreshold={0.6} luminanceSmoothing={0.3} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
