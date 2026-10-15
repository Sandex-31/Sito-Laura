import * as THREE from 'three';

// Indirizzo a cui arrivano le prenotazioni: sostituiscilo con l'email di Laura.
const CONTATTO = 'ciao@example.com';

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
    if (a.dataset.mode) setMode(a.dataset.mode);
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
  const rim = new THREE.DirectionalLight(0xb0445b, 3); // bordeaux
  rim.position.set(4, 1, -3);
  const fill = new THREE.DirectionalLight(0x8fa3bc, 1.2); // dusty blue
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

  // Trascinamento e pulsanti fronte/retro
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

  const faceButtons = document.querySelectorAll('.turn button');
  faceButtons.forEach((b) => b.addEventListener('click', () => {
    const face = Number(b.dataset.face);
    const total = base + drag;
    const turns = Math.round((total - face * Math.PI) / (2 * Math.PI));
    base = turns * 2 * Math.PI + face * Math.PI;
    drag = 0;
  }));
  const updatePressed = (angle) => {
    const showingBack = Math.cos(angle) < 0;
    faceButtons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.face) === Number(showingBack))));
  };

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
    updatePressed(rot);
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

/* ---------- Galleria ad anello ---------- */
(async function ringScene() {
  const canvas = document.getElementById('ring3d');
  const items = document.querySelectorAll('.works-list li');
  const count = document.querySelector('.works-count .now');
  const n = items.length;
  items[0].classList.add('on');

  const renderer = makeRenderer(canvas);
  if (!renderer) { items.forEach((li) => li.classList.add('on')); return; }

  // Il pin va creato prima di ogni await: i trigger più in basso devono contarne lo spazio.
  let target = 0, current = 0, active = 0;
  ScrollTrigger.create({
    trigger: '.works', pin: '.works-pin', start: 'top top',
    end: () => '+=' + innerHeight * (n - 1) * 0.75,
    scrub: true,
    onUpdate: (st) => { target = st.progress * (n - 1); },
  });

  const [worn, side, fronte, retro] = await Promise.all(
    ['assets/indossati.jpg', 'assets/dettaglio-fianco.jpg', 'assets/fronte.jpg', 'assets/retro.jpg'].map(load),
  );
  // Ritaglio in pixel sull'immagine originale, formato 3:4.
  const crop = (tex, x, y, w, h) => {
    const t = tex.clone();
    const iw = tex.image.width, ih = tex.image.height;
    t.repeat.set(w / iw, h / ih);
    t.offset.set(x / iw, 1 - (y + h) / ih);
    t.needsUpdate = true;
    return t;
  };
  const maps = [
    worn,
    crop(fronte, 160, 400, 330, 440),   // Sukuna
    side,
    crop(fronte, 620, 900, 400, 533),   // glifi
    retro,
    crop(fronte, 0, 97, 1055, 1407),    // paio intero
  ];

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const R = 4.2, step = 0.5, CW = 1.5, CH = 2;
  const ring = new THREE.Group();
  const mats = maps.map((map, i) => {
    const g = new THREE.PlaneGeometry(CW, CH, 24, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const a = i * step + p.getX(k) / R;
      p.setXYZ(k, R * Math.sin(a), p.getY(k), R * Math.cos(a));
    }
    const m = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
    ring.add(new THREE.Mesh(g, m));
    return m;
  });
  scene.add(ring);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(CH / (0.58 * 2 * tan), CW / (0.62 * 2 * tan * camera.aspect));
    camera.position.set(0, 0, R + dist);
  }
  addEventListener('resize', resize);
  resize();


  const mouse = { x: 0, y: 0 };
  if (matchMedia('(pointer: fine)').matches) addEventListener('pointermove', (e) => {
    mouse.x = e.clientX / innerWidth - 0.5;
    mouse.y = e.clientY / innerHeight - 0.5;
  });

  let visible = false;
  whenVisible(document.querySelector('.works'), (v) => { visible = v; });

  gsap.ticker.add(() => {
    if (!visible) return;
    current += (target - current) * (reduce ? 1 : 0.09);
    ring.rotation.y = -current * step;
    ring.rotation.x = reduce ? 0 : mouse.y * 0.06;
    camera.position.x = reduce ? 0 : mouse.x * 0.3;
    camera.lookAt(0, 0, R);
    mats.forEach((m, i) => m.color.setScalar(1 - Math.min(1, Math.abs(i - current)) * 0.88));

    const idx = Math.min(n - 1, Math.max(0, Math.round(current)));
    if (idx !== active) {
      items[active].classList.remove('on');
      items[idx].classList.add('on');
      count.textContent = idx + 1;
      active = idx;
    }
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

/* ---------- Prenotazione ---------- */
const form = document.getElementById('booking');
const done = form.querySelector('.done');
document.querySelector('.foot .mail').href = `mailto:${CONTATTO}`;

function setMode(mode) {
  form.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
  form.querySelectorAll('.only-pezzo').forEach((el) => { el.hidden = mode !== 'pezzo'; });
  form.querySelectorAll('.only-custom').forEach((el) => { el.hidden = mode !== 'custom'; });
  done.textContent = '';
  ScrollTrigger.refresh();
}
form.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => setMode(r.value)));

form.addEventListener('input', (e) => {
  if (e.target.getAttribute('aria-invalid') === 'true' && e.target.checkValidity()) {
    e.target.removeAttribute('aria-invalid');
    e.target.parentElement.querySelector('.err').hidden = true;
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
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
  const custom = d.mode === 'custom';
  const subject = custom ? 'Richiesta design su misura' : 'Prenotazione: il paio Jujutsu';
  const lines = [
    `Nome: ${d.nome}`,
    `Email: ${d.email}`,
    ...(custom
      ? [`Capo: ${d.capo}`, `Capo proprio: ${d.capo_proprio}`, `Idea: ${d.idea || '-'}`]
      : [`Taglia: ${d.taglia || 'da definire'}`]),
    `Note: ${d.note || '-'}`,
  ];
  location.href = `mailto:${CONTATTO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  done.textContent = custom
    ? 'Richiesta pronta nella tua app di posta. Allega le immagini di riferimento e premi invia.'
    : 'Richiesta pronta nella tua app di posta. Premi invia e ti rispondo per confermare.';
});
