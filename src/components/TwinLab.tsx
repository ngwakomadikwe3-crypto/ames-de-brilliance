'use client';
// The twin lab: the parametric head with one slider per morph axis (opposing targets merged into one -1..1 slider),
// live on the model, so every target can be checked alone before any scan solve uses it. Clay or skin, wireframe,
// the MakeHuman default (all weights 0) or the average adult, the saved twin's weights, the sane-range limit shown on
// each slider, and a contact sheet that renders every target alone at 0.5 and 1.0. Not linked from the shop.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PMREMGenerator, RepeatWrapping,
  Scene, SRGBColorSpace, TextureLoader, Vector3, WebGLRenderer, type Material,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { loadPortraitHead, bakeIdentity, meshPointsMm, anchoredPoints, eyeCentres, LIP_ZONES_URL } from '../lib/portrait-head';
import { identityAxes, sanitizeWeights, type Axis } from '../lib/portrait-weights';
import { SKIN_ENV_YAW, portraitSkinV2, teethMaterial, tongueMaterial, lipBoxFrom, portraitEyeTextured, EYE_TEXTURE_URL } from '../lib/portrait-materials';
import { eyeAndMouthDetails } from '../lib/portrait-eyes';
import { growFeatures, disposeFeatures } from '../lib/portrait-features';
import { readTwin, twinTones, harmonisedFaceTones } from '../lib/twin-profile';
import { flag } from '../lib/twin-flags';
import type { FaceRefine } from '../lib/face-refine';
import type { OutlineRefine } from '../lib/face-outline';

type Head = Awaited<ReturnType<typeof loadPortraitHead>>;
const AVERAGE_MACROS = ['afr-female', 'afr-male', 'asi-female', 'asi-male', 'cau-female', 'cau-male'].map(n => `id:base-${n}`);

export default function TwinLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [head, setHead] = useState<Head | null>(null);
  const [axes, setAxes] = useState<Record<string, number>>({}), [ex, setEx] = useState<Record<string, number>>({});
  const [look, setLook] = useState<'clay' | 'skin'>('clay'), [wire, setWire] = useState(false), [macros, setMacros] = useState<'average' | 'zero'>('average');
  const [refineOn, setRefineOn] = useState(false), refineRef = useRef<FaceRefine | OutlineRefine | null>(null);
  const [layer, setLayer] = useState(2), [filter, setFilter] = useState(''), [sheet, setSheet] = useState<string | null>(null), [busy, setBusy] = useState('');
  const api = useRef<{ apply: (w: Record<string, number>, e: Record<string, number>) => void; look: (l: 'clay' | 'skin', wire: boolean) => void; layer: (n: number) => void; yaw: (y: number) => void; snap: () => string } | null>(null);

  const ids = useMemo(() => head ? head.meta.identity.filter(n => !/head-scale-/.test(n)) : [], [head]);
  const axisList = useMemo(() => identityAxes(ids), [ids]);
  // the weights the mesh gets: one value per axis, split back into its targets, then the rules (portrait-weights.ts)
  const weights = useMemo(() => {
    const w: Record<string, number> = {};
    for (const a of axisList) { const v = axes[a.id] ?? 0; if (v > 0) w[a.pos] = v; else if (v < 0 && a.neg) w[a.neg] = -v; }
    if (macros === 'zero' && !AVERAGE_MACROS.some(m => w[m])) return w;                           // raw: the MakeHuman base mesh itself
    return head ? sanitizeWeights(w, ids) : w;
  }, [axes, axisList, macros, ids, head]);

  useEffect(() => {
    const c = canvas.current!; let stopped = false, raf = 0;
    const r = new WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
    r.outputColorSpace = SRGBColorSpace; r.toneMapping = ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    const scene = new Scene(); scene.background = new Color('#0c3b2e');
    const cam = new PerspectiveCamera(22, 1, 10, 6000);
    // the same light as the try-on (frontal key from above, soft fills both sides)
    const key = new DirectionalLight('#fff4ea', 1.8); key.position.set(0, 520, 640);
    for (const x of [-1, 1]) { const fill = new DirectionalLight('#fff4ea', 0.22); fill.position.set(x * 460, 160, 380); scene.add(fill); }   // a soft fill from both sides
    const rim = new DirectionalLight('#dfe9ff', 1.0); rim.position.set(320, 460, -520);
    scene.add(key, rim, new AmbientLight('#ffffff', 0.18));
    // ?lights=0: image-based light only (the relight test: the twin under an HDR alone)
    if (new URLSearchParams(location.search).get('lights') === '0') scene.traverse(o => { if ((o as DirectionalLight).isLight) o.visible = false; });
    const frame = new Group(); scene.add(frame);
    let yaw = 0.25, dist = 900;
    c.addEventListener('wheel', e => { e.preventDefault(); dist = Math.max(180, Math.min(1400, dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
    (async () => {
      const H = await loadPortraitHead(); if (stopped) return;
      frame.add(H.head); bakeIdentity(H.head, {});
      const clay = new MeshStandardMaterial({ color: '#c7a184', roughness: 0.62 });
      const detail = new TextureLoader().load('/hand-twin/skin-detail.jpg'); detail.wrapS = detail.wrapT = RepeatWrapping;
      const pts = meshPointsMm(H.skin, H.head), lm = anchoredPoints(pts, H.anchors), eyes = eyeCentres(H.parts, H.head);
      const skin = portraitSkinV2({ tones: { base: '#b98466' }, env: null, detail, lipZones: new TextureLoader().load(LIP_ZONES_URL), lipRect: H.meta.lips.uvRect, lipRangeMm: H.meta.lips.rangeMm,
        anchors: { eyeY: (eyes.left[1] + eyes.right[1]) / 2, noseY: lm[1][1], mouthY: lm[13][1], chinY: lm[152][1], chestY: -1e4 }, lipBox: lipBoxFrom(lm) });
      skin.material.transparent = false;
      skin.uniforms.uKeyDir.value.copy(key.position).normalize();
      // the skin carries the same HDR as the jewellery, turned so the tent's main light faces the face (both cheeks even)
      const envForSkin = (env: import('three').Texture) => { const q = new URLSearchParams(location.search);
        skin.material.envMap = q.get('env') === '0' ? null : env; skin.material.envMapIntensity = 0.45;
        skin.material.envMapRotation.y = q.get('envyaw') ? Number(q.get('envyaw')) : SKIN_ENV_YAW; skin.material.needsUpdate = true; };
      // the saved twin's own skin: its tones, and its photo map (Layer B)
      const twinFace = readTwin()?.face;
      if (twinFace) {
        skin.setTones(harmonisedFaceTones(twinFace, twinTones()?.face ?? twinFace.tones.cheeks ?? twinFace.tones.base));   // exactly as the try-on
        if (twinFace.skinMap && twinFace.skinConf && twinFace.skinRect) {
          const tl = (u: string) => { const t = new TextureLoader().load(u); t.flipY = false; return t; };
          skin.useSkinMap(tl(twinFace.skinMap), tl(twinFace.skinConf), twinFace.skinRect);
          // System 2's texture stack under the same A / A+B / A+B+C switch (B = the skin map, v2 when the twin has one and ?flags=+skin-v2)
          if (twinFace.skinV2 && flag('skin-v2')) skin.useSkinV2(tl(twinFace.skinV2.map), tl(twinFace.skinV2.conf), tl(twinFace.skinV2.maps), twinFace.skinV2.rect, eyeCentres(H.parts, H.head));
          (window as unknown as { __skinU?: unknown }).__skinU = skin.uniforms;   // (dev page: for checks)
        }
      }
      const own = new Map<Mesh, Material>();
      for (const [name, m] of Object.entries(H.parts)) {
        if (name === 'head skin') own.set(m, skin.material);
        else if (name.startsWith('eye')) { const t = new TextureLoader().load(EYE_TEXTURE_URL); t.flipY = false; t.colorSpace = SRGBColorSpace; own.set(m, portraitEyeTextured({ env: null, iris: '#4a3222', map: t })); }
        else if (name.startsWith('teeth')) own.set(m, teethMaterial(null)); else own.set(m, tongueMaterial(null));
        m.material = clay;
      }
      let details: Group | null = null, features: ReturnType<typeof growFeatures> | null = null;
      const hairCol = new Color(readTwin()?.face?.hairColor ?? '#2a1d15');
      const target = new Vector3(0, (eyes.left[1] + eyes.right[1]) / 2 - 30, 40);
      new HDRLoader().load(`/ames-engine/environments/${new URLSearchParams(location.search).get('hdr') ?? 'jewellery-tent-v3'}.hdr`, hdr => { const env = new PMREMGenerator(r).fromEquirectangular(hdr).texture; const qq = new URLSearchParams(location.search); scene.environment = env; scene.environmentIntensity = qq.get('env') === '0' ? 0 : qq.get('lights') === '0' ? 1.4 : 0.45; envForSkin(env); });
      let mode: 'clay' | 'skin' = 'clay', wireOn = false;
      const dress = () => { for (const [m, mat] of own) { m.material = mode === 'skin' ? mat : clay; } clay.wireframe = wireOn; if (details) details.visible = mode === 'skin'; if (features) features.brows.visible = features.lashes.visible = mode === 'skin'; };
      api.current = {
        apply: (w, e) => {
          bakeIdentity(H.head, w, refineRef.current);   // System 1, when switched on
          const p2 = meshPointsMm(H.skin, H.head), lm2 = anchoredPoints(p2, H.anchors), e2 = eyeCentres(H.parts, H.head);
          if (details) frame.remove(details);
          details = eyeAndMouthDetails(lm2, e2, 12, null); frame.add(details);
          // the locked features: regrown for the new shape, shown in skin views at every layer (portrait-features.ts)
          disposeFeatures(features); features = growFeatures(H.skin, frame, p2, lm2, e2, hairCol);
          skin.uniforms.uLipBox.value.copy(lipBoxFrom(lm2));
          // brow centrelines (as the try-on sets them): System 2's brow protection is measured here too; the tint stays off
          [[[107, 55], [66, 65], [105, 52], [63, 53], [70, 46]], [[336, 285], [296, 295], [334, 282], [293, 283], [300, 276]]].flat()
            .forEach(([u, l], i) => (skin.uniforms.uBrow.value as Vector3[])[i].set((lm2[u][0] + lm2[l][0]) / 2, (lm2[u][1] + lm2[l][1]) / 2, (lm2[u][2] + lm2[l][2]) / 2));
          (skin.uniforms.uEyeC.value as Vector3[]).forEach((v, i) => v.set(...(i ? e2.right : e2.left)));   // System 2's protected eyes, in the same frame as the lips
          target.y = (e2.left[1] + e2.right[1]) / 2 - 30;
          skin.uniforms.uY.value.set((e2.left[1] + e2.right[1]) / 2, lm2[1][1], lm2[13][1], lm2[152][1]);   // the zones follow the face's shape
          for (const m of Object.values(H.parts)) { const d = m.morphTargetDictionary, inf = m.morphTargetInfluences; if (d && inf) for (const k in d) inf[d[k]] = e[k] ?? 0; }
          dress();
        },
        look: (l, wf) => { mode = l; wireOn = wf; dress(); },
        layer: n => { skin.uniforms.uLayer.value = n; },
        yaw: y => { yaw = y; },
        snap: () => { r.render(scene, cam); return c.toDataURL('image/jpeg', 0.85); },
      };
      setHead(H); (window as unknown as { __twinLab: unknown }).__twinLab = { scene, H, cam }; (window as unknown as { __twinLabApi: unknown }).__twinLabApi = api.current;   // for automated checks
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const w = c.clientWidth, h = c.clientHeight; if (c.width !== w || c.height !== h) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
        // closer in: centre on the eyes and mouth
        const tz = dist < 600 ? target.clone().setY(target.y + 26 * (1 - (dist - 180) / 420)) : target;
        cam.position.set(tz.x + Math.sin(yaw) * dist, tz.y + 40 * dist / 900, tz.z + Math.cos(yaw) * dist); cam.lookAt(tz);
        frame.updateMatrixWorld(true); skin.uniforms.uToHead.value.copy(frame.matrixWorld).invert();
        r.render(scene, cam);
      };
      tick();
    })().catch(e => console.error("twin lab:", e));
    return () => { stopped = true; cancelAnimationFrame(raf); r.dispose(); };
  }, []);

  useEffect(() => { refineRef.current = refineOn ? readTwin()?.face?.refine ?? null : null; api.current?.apply(weights, ex); }, [weights, ex, head, refineOn]);
  // link presets (?twin=1 the saved twin, ?smile=1 the placement smile at its peak, ?look=skin, ?yaw=0): for checks
  useEffect(() => {
    if (!head) return; const q = new URLSearchParams(location.search), t = readTwin()?.face;
    const id = setTimeout(() => {
    if (q.get('twin') && t) { const v: Record<string, number> = {}; for (const a of axisList) v[a.id] = (t.weights[a.pos] ?? 0) - (a.neg ? t.weights[a.neg] ?? 0 : 0); setAxes(v); }
    if (q.get('smile')) setEx({ 'ex:smile': 0.85, 'ex:cheeks-up': 0.3, 'ex:squint': 0.12, 'ex:part': 0.15, 'ex:brows-soft': 0.2 });
    if (q.get('look') === 'skin') setLook('skin');
    if (q.get('twin') && t?.refine && q.get('refine') !== '0') setRefineOn(true);
    if (q.get('layer')) setLayer(Number(q.get('layer')));
    if (q.get('yaw')) api.current?.yaw(Number(q.get('yaw')));
    }, 0);
    return () => clearTimeout(id);
  }, [head, axisList]);
  useEffect(() => { api.current?.look(look, wire); }, [look, wire, head]);
  useEffect(() => { api.current?.layer(layer); }, [layer, head]);

  async function contactSheet() {
    if (!head || !api.current) return;
    const list: { label: string; w: Record<string, number>; e: Record<string, number> }[] = [];
    for (const a of axisList) for (const s of a.neg ? [-1, 1] : [1]) list.push({ label: (s < 0 ? '−' : '+') + a.label, w: { [s < 0 ? a.neg! : a.pos]: 1 }, e: {} });
    for (const n of head.meta.expressions) list.push({ label: n, w: {}, e: { [n]: 1 } });
    const cell = Number(new URLSearchParams(location.search).get('cell') ?? 150), only = new URLSearchParams(location.search).get('only'), cols = 3;
    if (only) list.splice(0, list.length, ...list.filter(it => only.split(',').some(o => it.label.includes(o))));
    const rowsPerPage = list.length;
    const out = document.createElement('canvas'); out.width = cell * (cols + 1) + 10; out.height = cell * rowsPerPage;
    const ctx = out.getContext('2d')!; ctx.fillStyle = '#062a21'; ctx.fillRect(0, 0, out.width, out.height); ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
    for (let i = 0; i < list.length; i++) {
      setBusy(`${i + 1} / ${list.length}`);
      const it = list[i];
      ctx.fillText(it.label, 6, i * cell + cell / 2);
      const shots: [number, number][] = [[0.5, 0], [1, 0], [1, 1.1]];        // 0.5 and 1.0 front, 1.0 in profile
      for (let k = 0; k < shots.length; k++) {
        const [amt, y] = shots[k];
        const scale = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([n, v]) => [n, v * amt]));
        api.current.apply(scale(it.w), scale(it.e)); api.current.yaw(y);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const im = new Image(); im.src = api.current.snap(); await im.decode();
        const s = Math.min(im.width, im.height); ctx.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, cell * (k + 1) + 10, i * cell, cell, cell);
      }
    }
    api.current.apply(weights, ex); api.current.yaw(0.25); setBusy('');
    setSheet(out.toDataURL('image/jpeg', 0.8));
  }

  const twin = typeof window === 'undefined' ? null : readTwin();
  const slider = (a: Axis) => {
    const lim = head ? Math.max(head.limits[a.pos] ?? 1, a.neg ? head.limits[a.neg] ?? 1 : 0) : 1;
    return <label key={a.id} className="block text-[11px]">
      <span className="flex justify-between"><span>{a.label}</span><span className="opacity-70">{(axes[a.id] ?? 0).toFixed(2)}{lim < 1 ? ` · sane ±${lim.toFixed(2)}` : ''}</span></span>
      <input type="range" min={a.neg ? -1 : 0} max={1} step={0.01} value={axes[a.id] ?? 0} onChange={e => setAxes(v => ({ ...v, [a.id]: Number(e.target.value) }))} className="w-full" style={{ accentColor: '#fff' }} data-axis={a.id} />
    </label>;
  };
  return <div className="flex h-[100dvh] flex-col bg-[#062a21] text-white md:flex-row" data-twin-lab>
    <div className="relative min-h-[50vh] flex-1">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div className="absolute left-3 top-3 flex flex-wrap gap-2 text-xs">
        {(['clay', 'skin'] as const).map(l => <button key={l} type="button" aria-pressed={look === l} onClick={() => setLook(l)} className="ames-pill rounded-full px-3 py-1">{l}</button>)}
        <button type="button" aria-pressed={wire} onClick={() => setWire(w => !w)} className="ames-pill rounded-full px-3 py-1">wireframe</button>
        {/* System 1: the saved twin's per-vertex refinement on top of the morph solve */}
        {twin?.face?.refine && <button type="button" aria-pressed={refineOn} onClick={() => setRefineOn(v => !v)} className="ames-pill rounded-full px-3 py-1" data-lab-refine>refine</button>}
        {/* the skin's layers, to isolate a regression in one tap: A base skin, B the scan photo, C lips, teeth and features */}
        {(['A', 'A+B', 'A+B+C'] as const).map((l, i) => <button key={l} type="button" aria-pressed={look === 'skin' && layer === i} onClick={() => { setLook('skin'); setLayer(i); }} className="ames-pill rounded-full px-3 py-1" data-layer={l}>{l}</button>)}
      </div>
      {busy && <p className="absolute bottom-3 left-3 text-xs">Contact sheet {busy}</p>}
    </div>
    <div className="max-h-[50vh] w-full overflow-y-auto p-4 md:max-h-none md:w-[360px]">
      <p style={{ fontFamily: 'var(--font-satoshi)', fontSize: 18 }}>Twin lab</p>
      <div className="my-3 flex flex-wrap gap-2 text-xs">
        <button type="button" className="ames-pill rounded-full px-3 py-1" onClick={() => { setAxes({}); setEx({}); setMacros('zero'); }} data-lab-zero>All 0 (MakeHuman base)</button>
        <button type="button" className="ames-pill rounded-full px-3 py-1" onClick={() => { setAxes({}); setEx({}); setMacros('average'); }}>Average adult</button>
        {twin?.face && <button type="button" className="ames-pill rounded-full px-3 py-1" onClick={() => {
          const v: Record<string, number> = {}; for (const a of axisList) v[a.id] = (twin.face!.weights[a.pos] ?? 0) - (a.neg ? twin.face!.weights[a.neg] ?? 0 : 0); setAxes(v); setMacros('average'); }}>My twin</button>}
        <button type="button" className="ames-pill rounded-full px-3 py-1" disabled={!head || !!busy} onClick={() => void contactSheet()} data-lab-sheet>Contact sheet</button>
      </div>
      <input placeholder="Filter (nose, chin, smile…)" value={filter} onChange={e => setFilter(e.target.value)} className="mb-3 w-full rounded bg-black/30 px-2 py-1 text-xs" />
      <p className="mb-1 text-xs opacity-80">Expressions</p>
      {head?.meta.expressions.filter(n => n.includes(filter)).map(n => <label key={n} className="block text-[11px]"><span className="flex justify-between"><span>{n.slice(3)}</span><span className="opacity-70">{(ex[n] ?? 0).toFixed(2)}</span></span>
        <input type="range" min={0} max={1} step={0.01} value={ex[n] ?? 0} onChange={e => setEx(v => ({ ...v, [n]: Number(e.target.value) }))} className="w-full" style={{ accentColor: '#fff' }} data-ex={n} /></label>)}
      <p className="mb-1 mt-3 text-xs opacity-80">Identity ({axisList.length} axes)</p>
      {axisList.filter(a => a.label.includes(filter)).map(slider)}
      {sheet && <a href={sheet} download="twin-contact-sheet.jpg" className="mt-3 block text-xs underline" data-lab-sheet-link>Download the contact sheet</a>}
    </div>
  </div>;
}
