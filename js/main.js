import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

// Indirizzo a cui arrivano le prenotazioni.
const CONTATTO = 'kamicustomwear@gmail.com';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);
history.scrollRestoration = 'manual'; // con la galleria fissata, ripartire da metà pagina sfasa i trigger

/* Scroll morbido */
let lenis = null;
if (!reduce) {
  lenis = new Lenis({ lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    if (a.dataset.idea && !form.elements.idea.value) form.elements.idea.value = a.dataset.idea;
    if (lenis) { e.preventDefault(); lenis.scrollTo(target, { duration: 1.4 }); }
  });
});

/* Luce calda che segue il cursore, solo con mouse o trackpad */
{
  const lamp = document.querySelector('.lamp');
  if (!reduce && matchMedia('(pointer: fine)').matches) {
    const lx = gsap.quickTo(lamp, 'x', { duration: 1.2, ease: 'power3' });
    const ly = gsap.quickTo(lamp, 'y', { duration: 1.2, ease: 'power3' });
    addEventListener('pointermove', (e) => { lx(e.clientX); ly(e.clientY); lamp.classList.add('on'); });
    document.documentElement.addEventListener('pointerleave', () => lamp.classList.remove('on'));
  }
}

/* WebGL */
function makeRenderer(canvas) {
  try {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    return r;
  } catch {
    document.documentElement.classList.add('no-webgl');
    return null;
  }
}
const loader = new THREE.TextureLoader();
const load = (src) => loader.loadAsync(src).then((t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
});
// Rendering solo quando la sezione è sullo schermo.
function whenVisible(el, cb) {
  new IntersectionObserver(([e]) => cb(e.isIntersecting)).observe(el);
}

/* ---------- Hero: i jeans in 3D ---------- */
const hero = document.querySelector('.hero');
const intro = { v: reduce ? 1 : 0 };
const heroScroll = { p: 0 };

(async function heroScene() {
  const canvas = document.getElementById('jeans3d');
  const renderer = makeRenderer(canvas);
  if (!renderer) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.z = 9;

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffe6d6, 1.6); // luce calda da lampada
  key.position.set(-3, 2, 5);
  const rim = new THREE.DirectionalLight(0xcee5ff, 3); // azzurro
  rim.position.set(4, 1, -3);
  const fill = new THREE.DirectionalLight(0xcee5ff, 1.2); // azzurro
  fill.position.set(3, -2, 3);
  scene.add(key, rim, fill);

  const [front, back] = await Promise.all([load('assets/jeans-fronte.webp'), load('assets/jeans-retro.webp')]);

  // Due superfici curve (davanti e dietro) che si toccano ai bordi: danno volume ai jeans.
  const H = 3.2;
  const W = H * (front.image.width / front.image.height);
  const bulge = 0.22;
  const curved = (w, h) => {
    const g = new THREE.PlaneGeometry(w, h, 40, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (2 * p.getX(i)) / w;
      p.setZ(i, bulge * (1 - u * u));
    }
    g.computeVertexNormals();
    return g;
  };
  const mat = (map) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.9, metalness: 0 });

  const jeans = new THREE.Group();
  const frontMesh = new THREE.Mesh(curved(W, H), mat(front));
  const backH = W * (back.image.height / back.image.width);
  // Il retro sfuma verso l'orlo: serve il blending, non il taglio netto di alphaTest.
  const backMesh = new THREE.Mesh(curved(W, backH), Object.assign(mat(back), { alphaTest: 0.02, transparent: true }));
  backMesh.rotation.y = Math.PI;
  backMesh.position.y = H / 2 - backH / 2 + 0.02; // allineato alla vita
  jeans.add(frontMesh, backMesh);
  scene.add(jeans);

  // Pulviscolo che fluttua nella luce, come in un laboratorio.
  const dustCount = innerWidth > 900 ? 260 : 120;
  const dustPos = new Float32Array(dustCount * 3);
  const seeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos.set([(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5], i * 3);
    seeds[i] = Math.random() * 100;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const sctx = sprite.getContext('2d');
  const grd = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  sctx.fillStyle = grd;
  sctx.fillRect(0, 0, 64, 64);
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(sprite), color: 0xf0d6c8, size: 0.07,
    transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);
  const driftDust = (t) => {
    const p = dustGeo.attributes.position;
    for (let i = 0; i < dustCount; i++) {
      const s = seeds[i];
      let y = p.getY(i) + 0.0012 + Math.sin(t * 0.4 + s) * 0.0006;
      if (y > 3.5) y = -3.5;
      p.setXY(i, p.getX(i) + Math.sin(t * 0.25 + s) * 0.0012, y);
    }
    p.needsUpdate = true;
  };

  // Trascinamento
  let base = 0, drag = 0, dragging = false, lastX = 0, rot = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    drag += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  let layout = { x: 0, y: 0, s: 1 };
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visW = visH * camera.aspect;
    const wide = innerWidth > 900;
    const s = Math.min((visH * (wide ? 0.82 : 0.86)) / H, (visW * (wide ? 0.4 : 0.8)) / W);
    layout = { x: wide ? visW * 0.2 : 0, y: wide ? 0 : -visH * 0.02, s };
  }
  addEventListener('resize', resize);
  resize();

  let visible = true;
  whenVisible(hero, (v) => { visible = v; });

  const clock = new THREE.Clock();
  gsap.ticker.add(() => {
    if (!visible) return;
    const t = clock.getElapsedTime();
    const sway = reduce || dragging ? 0 : Math.sin(t * 0.6) * 0.28;
    const target = base + drag + sway + heroScroll.p * Math.PI - (1 - intro.v) * Math.PI * 1.25;
    rot += (target - rot) * (reduce ? 1 : 0.08);
    jeans.rotation.y = rot;
    jeans.rotation.x = Math.sin(t * 0.8) * (reduce ? 0 : 0.03);
    const s = layout.s * (0.82 + 0.18 * intro.v);
    jeans.scale.setScalar(s);
    jeans.position.set(layout.x, layout.y - (1 - intro.v) * 0.6 + heroScroll.p * 0.8 + (reduce ? 0 : Math.sin(t * 1.1) * 0.04), 0);
    if (!reduce) {
      driftDust(t);
      key.intensity = 1.6 + Math.sin(t * 0.9) * 0.08 + Math.sin(t * 2.3) * 0.04; // la luce respira
    }
    dust.position.y = heroScroll.p * 1.5;
    renderer.render(scene, camera);
  });

  gsap.to(intro, { v: 1, duration: reduce ? 0 : 2, ease: 'expo.out', delay: 0.3 });
})();

/* Sequenza d'ingresso: pennellata, titolo, testi */
{
  const path = document.querySelector('.stroke-path');
  const len = path.getTotalLength();
  gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.to(path, { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut' }, 0)
    .from('h1 .line > span', { yPercent: 110, duration: 1.2, stagger: 0.1 }, 0.25)
    .from('.lede, .actions, .turn', { autoAlpha: 0, y: 18, duration: 1, stagger: 0.08 }, 0.8);
  if (reduce) tl.progress(1);

  ScrollTrigger.create({
    trigger: hero, start: 'top top', end: 'bottom top', scrub: true,
    onUpdate: (st) => { heroScroll.p = st.progress; },
  });
  if (!reduce) {
    gsap.to('.stroke', { yPercent: -18, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero-copy', { y: -80, autoAlpha: 0.2, ease: 'none', scrollTrigger: { trigger: hero, start: '30% top', end: 'bottom top', scrub: true } });
  }
}

/* ---------- Katana sullo sfondo: compare dopo l'hero e gira con lo scroll ---------- */
// "Kami" inciso sulle due facce della lama, vicino alla tsuba: decal proiettato sulla
// superficie curva, con ombra in alto e luce in basso per dare il sottorilievo.
// Va chiamata con la katana ancora senza rotazione/posizione (spazio della katana = mondo).
async function engraveName(blade, env) {
  const font = '"Great Vibes", cursive';
  await document.fonts.load(`200px ${font}`).catch(() => {});
  // Canvas ritagliato sulla scritta, così riempie tutta l'incisione.
  const c = document.createElement('canvas');
  let g = c.getContext('2d');
  g.font = `200px ${font}`;
  const m = g.measureText('KAMI');
  const pad = 16;
  c.width = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + pad * 2;
  c.height = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + pad * 2;
  g = c.getContext('2d');
  g.font = `200px ${font}`;
  const text = (dx, dy, color) => {
    g.fillStyle = color;
    g.fillText('KAMI', pad + m.actualBoundingBoxLeft + dx, pad + m.actualBoundingBoxAscent + dy);
  };
  text(0, -5, 'rgba(0,0,0,0.95)'); // bordo superiore in ombra
  text(0, 5, 'rgba(255,255,255,0.85)'); // bordo inferiore che prende luce
  text(0, 0, '#15191e'); // fondo dell'incisione
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, metalness: 0.6, roughness: 0.55, envMap: env,
    polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false,
  });

  blade.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(blade);
  const len = box.max.x - box.min.x, thick = box.max.z - box.min.z;
  const ray = new THREE.Raycaster();
  // Centro della faccia a distanza x dalla tsuba (lato +x), visto dal lato `side` (+1 davanti, -1 dietro).
  const hitAt = (x, side) => {
    const ys = [];
    for (let y = box.min.y; y <= box.max.y; y += (box.max.y - box.min.y) / 60) {
      ray.set(new THREE.Vector3(x, y, side * 10), new THREE.Vector3(0, 0, -side));
      const h = ray.intersectObject(blade)[0];
      if (h) ys.push(h.point);
    }
    if (!ys.length) return null;
    const mid = ys[Math.floor(ys.length / 2)];
    mid.width = ys[ys.length - 1].y - ys[0].y; // larghezza reale della lama in quel punto
    return mid;
  };
  const inv = blade.matrixWorld.clone().invert();
  for (const side of [1, -1]) {
    const x = box.max.x - len * 0.2;
    const p = hitAt(x, side), q = hitAt(x - len * 0.05, side);
    if (!p || !q) continue;
    const width = p.width * 0.85;
    const a = Math.atan2(p.y - q.y, p.x - q.x); // inclinazione della lama in quel punto
    const rot = side > 0 ? new THREE.Euler(0, 0, a) : new THREE.Euler(0, Math.PI, -a);
    const at = p.clone().setZ(p.z + side * thick * 0.3);
    const geo = new DecalGeometry(blade, at, rot, new THREE.Vector3(width * c.width / c.height, width, thick));
    geo.applyMatrix4(inv);
    blade.add(new THREE.Mesh(geo, mat));
  }
}

(async function katanaScene() {
  const canvas = document.getElementById('katana3d');
  const renderer = makeRenderer(canvas);
  if (!renderer) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.z = 16;
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key = new THREE.DirectionalLight(0xffe6d6, 1.6);
  key.position.set(3, 2, 5);
  const rim = new THREE.DirectionalLight(0xcee5ff, 3); // azzurro, come nell'hero
  rim.position.set(-4, 3, -2);
  scene.add(key, rim);

  const { scene: model } = await new GLTFLoader().loadAsync('assets/katana.glb');
  // Elsa in azzurro acceso (il --blu del sito sparisce al 35% di opacità):
  // tsuba "Circle.004" metallo lucido, impugnatura "Cube.*" con la trama di tela originale.
  const hilt = '#4fb4ff';
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment()).texture;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'Plane') { o.material.envMap = env; return; } // lama: riflessi d'acciaio
    o.material = o.material.clone();
    o.material.color.set(hilt);
    o.material.emissive.set(hilt);
    if (o.name === 'Circle.004') {
      o.material.metalnessMap = o.material.roughnessMap = o.material.map = null;
      o.material.metalness = 1;
      o.material.roughness = 0.2;
      o.material.envMap = env;
      o.material.emissiveIntensity = 0.25;
    } else {
      o.material.emissiveMap = o.material.map;
      o.material.emissiveIntensity = 0.9;
    }
  });
  // Centrata e messa in orizzontale, qualunque sia l'asse lungo del modello.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const align = new THREE.Group();
  align.add(model);
  const long = Math.max(size.x, size.y, size.z);
  // Assi misurati sulla lama: lunghezza -> x, larghezza -> y, spessore -> z,
  // così con il giro a 0 la faccia larga (dove andrà il nome) guarda la camera.
  const blade = new THREE.Box3().setFromObject(model.getObjectByName('Plane')).getSize(new THREE.Vector3());
  const axes = [0, 1, 2].sort((a, b) => blade.getComponent(b) - blade.getComponent(a));
  const unit = (i) => new THREE.Vector3().setComponent(i, 1);
  const L = unit(axes[0]), W = unit(axes[1]), T = new THREE.Vector3().crossVectors(L, W);
  align.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(L, W, T).transpose());
  const katana = new THREE.Group();
  katana.add(align);
  katana.scale.setScalar(7 / long);
  scene.add(katana);
  await engraveName(katana.getObjectByName('Plane'), env);

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const page = { p: 0 };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (st) => { page.p = st.progress; } });
  // Nello spazio vuoto .katana-stage la katana viene avanti, piena e al centro.
  const stage = { p: 0, center: 0 };
  ScrollTrigger.create({
    trigger: '.katana-stage', start: 'top bottom', end: 'bottom top',
    onUpdate: (st) => { stage.p = st.progress; },
    // progresso di pagina in cui lo spazio è centrato: lì il giro mostra il fianco della lama
    onRefresh: (st) => { stage.center = (st.start + st.end) / 2 / ScrollTrigger.maxScroll(window); },
  });
  const lerp = THREE.MathUtils.lerp;

  let cur = 0;
  let f = 0;
  const clock = new THREE.Clock();
  gsap.ticker.add(() => {
    // Invisibile nell'hero, poi sale piano e resta in secondo piano.
    // f: primo piano nello spazio vuoto, con rampa lunga e smorzata per entrare/uscire senza scatti.
    const fTarget = THREE.MathUtils.smootherstep(Math.min(stage.p, 1 - stage.p), 0, 0.4);
    f += (fTarget - f) * (reduce ? 1 : 0.05);
    const op = lerp(THREE.MathUtils.smoothstep(heroScroll.p, 0.55, 1) * 0.35, 1, f);
    canvas.style.opacity = op;
    if (op === 0) return;
    const t = clock.getElapsedTime();
    cur += ((reduce ? 0.3 : page.p) - cur) * (reduce ? 1 : 0.06);
    const float = reduce ? 0 : Math.sin(t * 0.5) * 0.15;
    // Il giro (y) segue solo lo scroll, sempre nello stesso verso; in primo piano cambia solo l'inclinazione.
    katana.rotation.set(
      lerp(0.35 + Math.sin(cur * Math.PI) * 0.3, 0, f),
      (cur - stage.center) * Math.PI * 3, // 0 = di fianco, al centro dello spazio vuoto
      lerp(-0.45 + Math.sin(cur * Math.PI * 2) * 0.35, -0.3, f),
    );
    katana.position.set(
      // in primo piano: vicina, con l'incisione (verso la tsuba) al centro dello schermo
      lerp(Math.sin(cur * Math.PI * 2) * 2.2, -1.4, f),
      lerp(Math.cos(cur * Math.PI * 1.5) * 0.8, 0.4, f) + float,
      lerp(-2, camera.aspect < 1 ? 0 : 7, f),
    );
    renderer.render(scene, camera);
  });
})();

/* ---------- Lavori: cartelle che si aprono in un anello ---------- */
// Ogni foto ondeggia come stoffa; aperta la cartella si curva sull'anello,
// si avvicina quando è al centro e si piega con la velocità di rotazione.
const RING_VERT = `
  uniform mat3 uvTransform;
  uniform float uTime, uVel, uFocus, uPhase, uCurve, uR;
  varying vec2 vUv, vRaw;
  varying float vShade;
  void main() {
    vRaw = uv;
    vUv = (uvTransform * vec3(uv, 1.0)).xy;
    vec3 p = position;
    float ang = p.x / uR;
    p = mix(p, vec3(uR * sin(ang), p.y, uR * cos(ang) - uR), uCurve);
    float arc = sin(uv.x * 3.14159);
    float wave = sin(uv.y * 4.0 + uTime * 1.3 + uPhase) * arc;
    p.z += wave * 0.04 * (1.0 + abs(uVel) * 6.0);
    p.y += arc * uVel * 0.22 + sin(uTime * 0.7 + uPhase) * 0.05 * (1.0 - uFocus);
    vShade = 0.9 + 0.1 * wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const RING_FRAG = `
  uniform sampler2D map;
  uniform float uTime, uVel, uFocus, uDim, uAlpha;
  varying vec2 vUv, vRaw;
  varying float vShade;
  void main() {
    vec2 off = vec2(uVel * 0.009, 0.0);
    vec3 c = vec3(texture2D(map, vUv + off).r, texture2D(map, vUv).g, texture2D(map, vUv - off).b);
    // Riflesso che attraversa lentamente l'immagine al centro.
    float sweep = fract(uTime * 0.12) * 3.0 - 1.0;
    c += uFocus * 0.07 * smoothstep(0.18, 0.0, abs(vRaw.x + vRaw.y * 0.4 - sweep));
    gl_FragColor = vec4(c * uDim * vShade, uAlpha);
    #include <colorspace_fragment>
  }`;

(async function worksScene() {
  const section = document.querySelector('.works');
  const canvas = document.getElementById('ring3d');
  const foldersEl = section.querySelector('.folders');
  const folderBtns = [...foldersEl.querySelectorAll('button')];
  const viewer = section.querySelector('.viewer');
  const items = [...section.querySelectorAll('.works-list li')];
  const groupLabel = viewer.querySelector('.viewer-group');
  const nowEl = viewer.querySelector('.now');
  const totEl = viewer.querySelector('.tot');

  const renderer = makeRenderer(canvas);
  if (!renderer) {
    foldersEl.hidden = true;
    viewer.hidden = false;
    items.forEach((li) => li.classList.add('on'));
    return;
  }

  const [worn, side, fronte, retro, ...nero] = await Promise.all([
    'assets/indossati.jpg', 'assets/dettaglio-fianco.jpg', 'assets/fronte.jpg', 'assets/retro.jpg',
    'assets/modello-gira.jpg', 'assets/modello-gamba.jpg', 'assets/modello-tasca.jpg', 'assets/modello-calcio.jpg',
    'assets/modello-retro.jpg', 'assets/nero-braccio.jpg',
  ].map(load));
  // Ritaglio in pixel sull'immagine originale, formato 3:4.
  const crop = (tex, x, y, w, h) => {
    const t = tex.clone();
    const iw = tex.image.width, ih = tex.image.height;
    t.repeat.set(w / iw, h / ih);
    t.offset.set(x / iw, 1 - (y + h) / ih);
    t.needsUpdate = true;
    return t;
  };
  // Stesso ordine dei <li> di ogni cartella; la prima foto è la copertina.
  const groups = [
    [crop(fronte, 0, 97, 1055, 1407), crop(fronte, 160, 400, 330, 440), side, crop(fronte, 620, 900, 400, 533), retro, worn],
    nero,
  ];
  const itemsBy = groups.map((_, g) => items.filter((li) => Number(li.dataset.group) === g));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const R = 4.2, step = 0.5, CW = 1.5, CH = 2;
  const geo = new THREE.PlaneGeometry(CW, CH, 24, 12);
  const cards = [];
  groups.forEach((maps, g) => maps.forEach((map, k) => {
    map.updateMatrix();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: map }, uvTransform: { value: map.matrix }, uR: { value: R }, uCurve: { value: 0 },
        uTime: { value: 0 }, uVel: { value: 0 }, uFocus: { value: 0 }, uDim: { value: 1 }, uAlpha: { value: 0 },
        uPhase: { value: (g * 6 + k) * 1.7 },
      },
      vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      side: THREE.DoubleSide, transparent: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { g, k };
    scene.add(mesh);
    // Stato corrente: parte sotto e trasparente, così le cartelle salgono all'arrivo.
    cards.push({ mesh, g, k, n: maps.length, s: { x: 0, y: -3, z: R, ry: 0, rz: 0, sc: 0.8, curve: 0, alpha: 0, dim: 1, focus: 0 } });
  }));

  let spacing = 2, stackScale = 0.8;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(CH / (0.58 * 2 * tan), CW / (0.62 * 2 * tan * camera.aspect));
    camera.position.set(0, 0, R + dist);
    const visH = 2 * dist * tan, visW = visH * camera.aspect;
    spacing = visW / groups.length; // centri delle pile allineati alle etichette sotto
    stackScale = Math.min(0.85, (spacing * 0.6) / CW, (visH * 0.44) / CH);
  }
  addEventListener('resize', resize);
  resize();

  const mouse = { x: 0, y: 0 };
  if (matchMedia('(pointer: fine)').matches) addEventListener('pointermove', (e) => {
    mouse.x = e.clientX / innerWidth - 0.5;
    mouse.y = e.clientY / innerHeight - 0.5;
  });

  let open = -1, hover = -1, target = 0, current = 0, vel = 0, active = -1, since = -10;
  const clock = new THREE.Clock();
  const last = () => (open < 0 ? 0 : groups[open].length - 1);
  const go = (k) => { target = THREE.MathUtils.clamp(k, 0, last()); };

  function showItem(idx) {
    items.forEach((li) => li.classList.remove('on'));
    itemsBy[open][idx].classList.add('on');
    nowEl.textContent = idx + 1;
    active = idx;
  }
  function openGroup(g, fromKeyboard) {
    open = g; hover = -1; target = current = 0; vel = 0;
    since = clock.getElapsedTime();
    groupLabel.textContent = folderBtns[g].querySelector('.f-name').textContent;
    totEl.textContent = groups[g].length;
    showItem(0);
    foldersEl.hidden = true;
    viewer.hidden = false;
    if (fromKeyboard) viewer.querySelector('.next').focus({ preventScroll: true });
  }
  function closeGroup() {
    const g = open;
    const hadFocus = viewer.contains(document.activeElement);
    open = -1;
    since = clock.getElapsedTime();
    viewer.hidden = true;
    foldersEl.hidden = false;
    if (hadFocus) folderBtns[g].focus({ preventScroll: true });
  }

  folderBtns.forEach((b, g) => {
    b.addEventListener('click', (e) => openGroup(g, e.detail === 0));
    b.addEventListener('pointerenter', () => { hover = g; });
    b.addEventListener('pointerleave', () => { hover = -1; });
    b.addEventListener('focus', () => { hover = g; });
    b.addEventListener('blur', () => { hover = -1; });
  });
  viewer.querySelector('.prev').addEventListener('click', () => go(Math.round(target) - 1));
  viewer.querySelector('.next').addEventListener('click', () => go(Math.round(target) + 1));
  viewer.querySelector('.shut').addEventListener('click', closeGroup);

  let visible = false;
  whenVisible(section, (v) => { visible = v; });
  addEventListener('keydown', (e) => {
    if (open < 0 || !visible) return;
    if (e.key === 'ArrowRight') go(Math.round(target) + 1);
    else if (e.key === 'ArrowLeft') go(Math.round(target) - 1);
    else if (e.key === 'Escape') closeGroup();
  });

  // Clic sulle foto: apre la cartella o porta al centro la foto cliccata; trascinando si sfoglia.
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(cards.filter((c) => c.s.alpha > 0.5).map((c) => c.mesh))[0];
    return hit ? hit.object.userData : null;
  };
  let down = null;
  const endDrag = () => { if (down && down.drag) go(Math.round(target)); down = null; };
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, t: target, drag: false }; });
  canvas.addEventListener('pointermove', (e) => {
    if (down) {
      const dx = e.clientX - down.x;
      if (open >= 0 && Math.abs(dx) > 5) {
        down.drag = true;
        target = THREE.MathUtils.clamp(down.t - dx / (canvas.clientWidth * 0.22), 0, last());
      }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const hit = pick(e);
    if (open < 0) hover = hit ? hit.g : -1;
    canvas.style.cursor = hit && (open < 0 || hit.g === open) ? 'pointer' : '';
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    if (down.drag) return endDrag();
    down = null;
    const hit = pick(e);
    if (!hit) return;
    if (open < 0) openGroup(hit.g, false);
    else if (hit.g === open) go(hit.k);
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { endDrag(); if (open < 0) hover = -1; });

  // Dove deve stare ogni foto: in pila nella sua cartella, sull'anello, o fuori scena.
  const aim = { x: 0, y: 0, z: 0, ry: 0, rz: 0, sc: 1, curve: 0, alpha: 1, dim: 1, focus: 0 };
  function place(c) {
    const cx = (c.g - (groups.length - 1) / 2) * spacing;
    if (open === c.g) {
      const d = Math.abs(c.k - current);
      const f = 1 - Math.min(1, d) ** 2;
      const a = (c.k - current) * step, r = R + f * 0.35;
      Object.assign(aim, {
        x: r * Math.sin(a), y: 0, z: r * Math.cos(a), ry: a, rz: 0, sc: 1, curve: 1,
        alpha: 1 - THREE.MathUtils.smoothstep(d, 2.2, 3.6), dim: 1 - Math.min(1, d) * 0.85, focus: f,
      });
    } else if (open >= 0) {
      Object.assign(aim, { x: cx, y: -4, z: R - 1, ry: 0, rz: 0, sc: stackScale, curve: 0, alpha: 0, dim: 1, focus: 0 });
    } else {
      const fan = hover === c.g ? 1 : 0;
      const o = c.k - (c.n - 1) / 2;
      Object.assign(aim, {
        x: cx + o * (0.03 + fan * 0.12) * stackScale,
        y: 0.04 + (c.k * 0.025 + fan * 0.08) * stackScale * 2,
        z: R - c.k * 0.06, ry: 0, rz: -o * (0.035 + fan * 0.05), sc: stackScale, curve: 0, alpha: 1,
        dim: (1 - c.k * 0.08) * (hover >= 0 && hover !== c.g ? 0.55 : 1), focus: 0,
      });
    }
  }

  gsap.ticker.add(() => {
    if (!visible) return;
    const t = clock.getElapsedTime();
    const prev = current;
    current += (target - current) * (reduce ? 1 : 0.09);
    vel += (THREE.MathUtils.clamp((current - prev) * 7, -1, 1) - vel) * 0.12;
    // Subito dopo un'apertura o chiusura le foto partono una dopo l'altra.
    const stagger = Math.max(0, 1 - (t - since) / 1.4);
    cards.forEach((c) => {
      place(c);
      const k = reduce ? 1 : 0.09 / (1 + c.k * 0.35 * stagger);
      const s = c.s;
      for (const key in aim) s[key] += (aim[key] - s[key]) * k;
      c.mesh.visible = s.alpha > 0.01;
      c.mesh.position.set(s.x, s.y, s.z);
      c.mesh.rotation.set(0, s.ry, s.rz);
      c.mesh.scale.setScalar(s.sc);
      const u = c.mesh.material.uniforms;
      u.uTime.value = reduce ? 0 : t;
      u.uVel.value = reduce || open !== c.g ? 0 : vel;
      u.uCurve.value = s.curve;
      u.uAlpha.value = s.alpha;
      u.uDim.value = s.dim;
      u.uFocus.value = s.focus;
    });
    if (open >= 0) {
      const idx = Math.min(last(), Math.max(0, Math.round(current)));
      if (idx !== active) showItem(idx);
    }
    camera.position.x = reduce ? 0 : mouse.x * 0.3;
    camera.position.y = reduce ? 0 : -mouse.y * 0.15;
    camera.lookAt(0, 0, R);
    renderer.render(scene, camera);
  });
})();

/* ---------- Processo: la linea d'inchiostro segue lo scroll ---------- */
gsap.fromTo('.steps-line', { scaleY: 0 }, {
  scaleY: 1, ease: 'none', transformOrigin: 'top',
  scrollTrigger: { trigger: '.steps', start: 'top 60%', end: 'bottom 60%', scrub: true },
});
const stageFigs = document.querySelectorAll('.step-stage figure');
const showStep = (i) => stageFigs.forEach((f, k) => f.classList.toggle('on', k <= i));
document.querySelectorAll('.steps li').forEach((li, i) => {
  ScrollTrigger.create({ trigger: li, start: 'top 60%', toggleClass: 'on' });
  ScrollTrigger.create({
    trigger: li, start: 'top 60%', end: 'bottom 60%',
    onEnter: () => showStep(i), onEnterBack: () => showStep(i), onLeaveBack: () => showStep(Math.max(0, i - 1)),
  });
});

// Da vicino: la striscia scorre in orizzontale mentre si scende (su mobile si sfoglia a mano).
if (!reduce && innerWidth > 900) {
  const strip = document.querySelector('.strip');
  gsap.fromTo(strip, { x: () => innerWidth * 0.15 }, {
    x: () => -(strip.scrollWidth - innerWidth) - innerWidth * 0.05, ease: 'none',
    scrollTrigger: { trigger: '.close', start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
  });
}
if (!reduce) {
  gsap.from('.piece-back', {
    yPercent: 25, rotate: 4, ease: 'none',
    scrollTrigger: { trigger: '.piece', start: 'top bottom', end: 'bottom top', scrub: true },
  });
}

// Paio nero: le foto si aprono dal basso e le colonne scorrono a velocità diverse.
if (!reduce) {
  gsap.utils.toArray('.mosaic figure').forEach((fig) => {
    gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 88%' } })
      .from(fig, { clipPath: 'inset(100% 0 0 0)', duration: 1.3, ease: 'expo.out' })
      .from(fig.querySelector('img'), { scale: 1.35, duration: 1.6, ease: 'expo.out' }, 0);
  });
  if (innerWidth > 900) {
    document.querySelectorAll('.mosaic .col').forEach((col) => {
      gsap.to(col, { y: -Number(col.dataset.speed), ease: 'none', scrollTrigger: { trigger: '.mosaic', start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }
}

/* ---------- Prenotazione ---------- */
const form = document.getElementById('booking');
const done = form.querySelector('.done');
document.querySelector('.foot .mail').href = `mailto:${CONTATTO}`;

form.addEventListener('input', (e) => {
  if (e.target.getAttribute('aria-invalid') === 'true' && e.target.checkValidity()) {
    e.target.removeAttribute('aria-invalid');
    e.target.parentElement.querySelector('.err').hidden = true;
  }
});

// Invio diretto tramite FormSubmit: nessuna app di posta, la richiesta arriva a CONTATTO.
const sendBtn = form.querySelector('button[type="submit"]');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sendBtn.disabled) return;
  let firstBad = null;
  form.querySelectorAll('[required]').forEach((input) => {
    const ok = input.value.trim() !== '' && input.checkValidity();
    if (ok) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
    input.parentElement.querySelector('.err').hidden = ok;
    if (!ok && !firstBad) firstBad = input;
  });
  if (firstBad) { firstBad.focus(); return; }

  const d = Object.fromEntries(new FormData(form));
  if (d._honey) return;
  const payload = {
    _subject: 'Richiesta su misura',
    _replyto: d.email,
    _template: 'table',
    Nome: d.nome,
    Email: d.email,
    Capo: d.capo,
    Idea: d.idea || '-',
    Note: d.note || '-',
  };

  sendBtn.disabled = true;
  sendBtn.textContent = 'Invio in corso…';
  done.textContent = '';
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${CONTATTO}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || String(out.success) !== 'true') throw new Error(out.message || res.status);
    form.reset();
    done.textContent = 'Richiesta inviata. Ti scrivo presto per parlare della tua idea.';
  } catch {
    done.innerHTML = `Invio non riuscito. Riprova tra poco o scrivimi a <a href="mailto:${CONTATTO}">${CONTATTO}</a>.`;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Invia la richiesta';
  }
});
