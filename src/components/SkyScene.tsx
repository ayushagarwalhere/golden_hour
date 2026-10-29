"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { usePrefs } from "@/lib/prefs";

/* A slow golden-hour sky: GLSL gradient + breathing sun + shimmering sea,
   with drifting light motes in 3D that part around the cursor. */

const skyVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

const skyFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform float uScroll;
uniform float uCalm;   // 0..1 — rises while we're "breathing" during a trace
uniform vec2 uMouse;
uniform vec2 uRes;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vUv;
  float horizon = 0.17 + uScroll * 0.04;
  float breathe = 0.5 + 0.5 * sin(uTime * 0.785398); // one 8-second breath
  vec2 sunPos = vec2(0.5 + uMouse.x * 0.025, horizon + 0.022 - uScroll * 0.05 + uMouse.y * 0.01);

  // --- sky ---
  float h = clamp((uv.y - horizon) / (1.0 - horizon), 0.0, 1.0);
  vec3 hz  = vec3(1.00, 0.80, 0.55);
  vec3 low = vec3(0.96, 0.50, 0.32);
  vec3 mid = vec3(0.45, 0.16, 0.26);
  vec3 top = vec3(0.09, 0.05, 0.12);
  vec3 col = mix(hz, low, smoothstep(0.0, 0.14, h));
  col = mix(col, mid, smoothstep(0.10, 0.55, h));
  col = mix(col, top, smoothstep(0.45, 1.0, h));
  col = mix(col, col * vec3(0.62, 0.56, 0.85), uScroll * 0.55); // dusk deepens as you scroll

  // long, slow cloud bands
  vec2 cuv = vec2(uv.x * uAspect * 1.2 + uTime * 0.006, uv.y * 7.0);
  float c = fbm(cuv + vec2(0.0, fbm(cuv * 0.5 + uTime * 0.01)));
  float band = smoothstep(0.52, 0.82, c) * smoothstep(horizon + 0.02, horizon + 0.3, uv.y) * (1.0 - smoothstep(0.7, 1.0, uv.y));
  col = mix(col, vec3(1.0, 0.70, 0.58), band * 0.28);

  // --- sun ---
  vec2 d = uv - sunPos; d.x *= uAspect;
  float r = length(d);
  vec3 sunCol = vec3(1.0, 0.85, 0.62);
  float glow = exp(-r * 5.5) * (0.5 + 0.18 * breathe + 0.15 * uCalm) + exp(-r * 16.0) * 0.55;
  col += sunCol * glow * 0.9;
  float rad = 0.052;
  float disc = smoothstep(rad, rad - 0.004, r) * smoothstep(horizon - 0.002, horizon + 0.003, uv.y);
  vec3 limb = mix(vec3(1.0, 0.98, 0.92), vec3(1.0, 0.74, 0.46), smoothstep(0.0, rad, r)); // brighter core, warm edge
  col = mix(col, limb * 1.08, disc);

  // --- sea ---
  if (uv.y < horizon) {
    float w = (horizon - uv.y) / horizon;
    vec3 sea = mix(vec3(0.86, 0.48, 0.34), vec3(0.06, 0.03, 0.08), smoothstep(0.0, 0.85, w));
    float ripples = fbm(vec2(uv.x * uAspect * 18.0 / (w + 0.25), uv.y * 90.0 / (w + 0.25) - uTime * 0.35));
    float column = exp(-abs(d.x) * (10.0 + w * 10.0));
    float glitter = smoothstep(0.55, 0.95, ripples) * column * (1.0 - w * 0.7);
    sea += sunCol * (column * 0.22 * (1.0 - w) + glitter * 0.9);
    sea += vec3(1.0, 0.6, 0.4) * smoothstep(0.03, 0.0, w) * 0.25; // haze on the horizon line
    col = sea;
  }

  col += (hash(uv * uRes + fract(uTime)) - 0.5) * 0.03;          // film grain
  col *= 1.0 - 0.42 * pow(length((vUv - 0.5) * vec2(1.0, 1.15)), 2.2); // vignette
  gl_FragColor = vec4(col, 1.0);
}`;

const moteVert = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uPixelRatio;
uniform vec2 uMouse;
uniform float uAspect;
varying float vAlpha;
varying float vHue;
void main() {
  vec3 p = position;
  float t = uTime * (0.25 + aSeed.x * 0.5);
  p.x += sin(t * 0.6 + aSeed.y * 6.28) * 0.35;
  p.z += cos(t * 0.5 + aSeed.y * 3.1) * 0.25;
  p.y = mod(p.y + uTime * 0.04 * (0.4 + aSeed.x) + 3.0, 6.0) - 3.0;   // drift slowly upward, wrap
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 dm = (ndc - uMouse) * vec2(uAspect, 1.0);
  float infl = exp(-dot(dm, dm) * 14.0);
  clip.xy += normalize(dm + 1e-4) * infl * 0.12 * clip.w;            // part around the cursor
  gl_Position = clip;
  gl_PointSize = (2.0 + aSeed.z * 5.0) * uPixelRatio * (5.0 / -mv.z);
  float edge = smoothstep(3.0, 2.2, abs(p.y));
  vAlpha = (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (1.0 + aSeed.x) + aSeed.y * 40.0))) * edge * (0.4 + infl * 0.8);
  vHue = aSeed.w;
}`;

const moteFrag = /* glsl */ `
precision highp float;
varying float vAlpha;
varying float vHue;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  vec3 c = mix(vec3(1.0, 0.86, 0.6), vec3(1.0, 0.6, 0.45), vHue);
  gl_FragColor = vec4(c, a * a * vAlpha);
}`;

function useMouse() {
  const m = useRef(new THREE.Vector2());
  useEffect(() => {
    const on = (e: PointerEvent) => m.current.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    addEventListener("pointermove", on, { passive: true });
    return () => removeEventListener("pointermove", on);
  }, []);
  return m;
}

function Sky({ calm }: { calm: number }) {
  const mouse = useMouse();
  const { size, gl } = useThree();
  const smooth = useRef(new THREE.Vector2());
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uTime: { value: 0 },
          uAspect: { value: 1 },
          uScroll: { value: 0 },
          uCalm: { value: 0 },
          uMouse: { value: new THREE.Vector2() },
          uRes: { value: new THREE.Vector2(1, 1) },
        },
      }),
    [],
  );
  useFrame((state, dt) => {
    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uAspect.value = size.width / size.height;
    u.uRes.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
    smooth.current.lerp(mouse.current, 1 - Math.exp(-dt * 1.5));
    u.uMouse.value.copy(smooth.current);
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    u.uScroll.value += (Math.min(1, scrollY / max) - u.uScroll.value) * (1 - Math.exp(-dt * 3));
    u.uCalm.value += (calm - u.uCalm.value) * (1 - Math.exp(-dt * 1.2));
  });
  return (
    <mesh frustumCulled={false} renderOrder={-1} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

function Motes({ count }: { count: number }) {
  const mouse = useMouse();
  const { size, gl } = useThree();
  const smooth = useRef(new THREE.Vector2());
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 2] = -Math.random() * 9 + 1.5;
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: moteVert,
        fragmentShader: moteFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uMouse: { value: new THREE.Vector2(9, 9) }, uAspect: { value: 1 } },
      }),
    [],
  );
  useFrame((state, dt) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uPixelRatio.value = gl.getPixelRatio();
    mat.uniforms.uAspect.value = size.width / size.height;
    smooth.current.lerp(mouse.current, 1 - Math.exp(-dt * 6));
    mat.uniforms.uMouse.value.copy(smooth.current);
    // the camera sways a little toward the cursor — gentle parallax
    const cam = state.camera;
    cam.position.x += (smooth.current.x * 0.5 - cam.position.x) * (1 - Math.exp(-dt * 1.2));
    cam.position.y += (0.15 + smooth.current.y * 0.25 - cam.position.y) * (1 - Math.exp(-dt * 1.2));
    cam.lookAt(0, 0, -6);
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

export default function SkyScene({ calm = 0 }: { calm?: number }) {
  const { calm: calmMode } = usePrefs();
  const reduced = calmMode || (typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const mobile = typeof window !== "undefined" && innerWidth < 760;
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0 }}>
      <Canvas
        dpr={[1, mobile ? 1.25 : 1.6]}
        camera={{ position: [0, 0.15, 5], fov: 50 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        frameloop={reduced ? "demand" : "always"}
      >
        <Sky calm={calm} />
        <Motes count={mobile ? 500 : 1300} />
      </Canvas>
    </div>
  );
}
