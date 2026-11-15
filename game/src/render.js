// Rendering: scene, camera, renderer and the transient effects — tracers, muzzle
// flash light and explosions. All effect objects are pooled and reused; the hot
// loop allocates nothing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const TRACER_LIFE = 0.09;

export function createRender() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 55);
  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
  scene.add(camera);

  // Tracer pool: thin amber lines that fade in one frame budget.
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false });
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;
  const tracerMid = new THREE.Vector3();
  const tracerDir = new THREE.Vector3();

  function addTracer(from, to, colour) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_COUNT;
    tracerMid.copy(from).add(to).multiplyScalar(0.5);
    tracerDir.copy(to).sub(from);
    const len = tracerDir.length() || 0.001;
    t.mesh.position.copy(tracerMid);
    t.mesh.scale.set(1, 1, len);
    t.mesh.lookAt(to);
    t.mesh.material.color.set(colour || PALETTE.accent);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = TRACER_LIFE;
  }

  // Explosion: one reusable sphere + point light, scaled up over 0.5 s.
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 22);
  scene.add(boomLight);
  let boomLife = 0;

  function explode(pos) {
    boom.position.copy(pos);
    boom.position.y = Math.max(0.6, pos.y);
    boom.visible = true;
    boomLife = 0.55;
    boomLight.position.copy(boom.position);
  }

  // The planted spike: small amber device that blinks while the fuse runs.
  const spike = new THREE.Group();
  const spikeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.5, metalness: 0.5 }),
  );
  spikeBody.position.y = 0.1;
  const spikeLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.06, 0.1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  spikeLamp.position.y = 0.23;
  spike.add(spikeBody, spikeLamp);
  spike.visible = false;
  scene.add(spike);

  function step(dt, time) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = 1 - Math.max(0, boomLife) / 0.55;
      const r = 0.5 + k * 5.5;
      boom.scale.set(r, r, r);
      boom.material.opacity = Math.max(0, 0.85 - k);
      boomLight.intensity = Math.max(0, 60 * (1 - k));
      if (boomLife <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
    spikeLamp.material.color.setHex(Math.sin(time * 10) > 0 ? 0xf0a830 : 0xa33d2a);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    renderer, scene, camera,
    addTracer, explode, step,
    showSpike(x, z) {
      spike.position.set(x, 0, z);
      spike.visible = true;
    },
    hideSpike() {
      spike.visible = false;
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
