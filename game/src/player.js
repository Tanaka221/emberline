// Player movement: acceleration, friction, gravity, crouch and jump, resolved as
// a box against the world's colliders one axis at a time (starter physics, kept).
// It works on state.player directly; main.js owns the camera.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders, state) {
  const p = state.player;
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    p.yaw -= dx * sensitivity;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    p.pitch = Math.min(1.45, p.pitch + pitchKick);
    p.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !p.crouching) {
      p.crouching = true;
      p.height = CROUCH_HEIGHT;
    } else if (!crouching && p.crouching && !overlaps(p.position.x, p.position.y, p.position.z, STAND_HEIGHT, 0.02)) {
      p.crouching = false;
      p.height = STAND_HEIGHT;
    }
    const eyeTarget = p.crouching ? CROUCH_EYE : STAND_EYE;
    p.eye += (eyeTarget - p.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(p.yaw);
      const cos = Math.cos(p.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = p.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (p.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    p.velocity.x += (wish.x * speed - p.velocity.x) * blend;
    p.velocity.z += (wish.z * speed - p.velocity.z) * blend;
    if (p.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      p.velocity.x *= damp;
      p.velocity.z *= damp;
    }

    if (keys.has('Space') && p.onGround) {
      p.velocity.y = JUMP_SPEED;
      p.onGround = false;
    }
    p.velocity.y -= GRAVITY * dt;

    const nextX = p.position.x + p.velocity.x * dt;
    if (!overlaps(nextX, p.position.y, p.position.z, p.height, 0.04)) p.position.x = nextX;
    else p.velocity.x = 0;
    const nextZ = p.position.z + p.velocity.z * dt;
    if (!overlaps(p.position.x, p.position.y, nextZ, p.height, 0.04)) p.position.z = nextZ;
    else p.velocity.z = 0;

    p.position.y += p.velocity.y * dt;
    p.onGround = false;
    const hit = overlaps(p.position.x, p.position.y, p.position.z, p.height, 0);
    if (hit && p.velocity.y <= 0) {
      p.position.y = hit.max.y;
      p.velocity.y = 0;
      p.onGround = true;
    } else if (hit) {
      p.position.y = hit.min.y - p.height;
      p.velocity.y = 0;
    }
    if (p.position.y < 0) {
      p.position.y = 0;
      p.velocity.y = 0;
      p.onGround = true;
    }
    p.velocity.y = Math.max(-30, p.velocity.y);
  }

  return {
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(p.velocity.x, p.velocity.z);
    },
    reset(x, z, yaw) {
      p.position.x = x;
      p.position.y = 0;
      p.position.z = z;
      p.velocity.x = 0;
      p.velocity.y = 0;
      p.velocity.z = 0;
      p.yaw = yaw;
      p.pitch = 0;
      p.health = 100;
      p.armour = 50;
      p.alive = true;
      p.hasSpike = true;
      p.crouching = false;
      p.height = STAND_HEIGHT;
      p.eye = STAND_EYE;
      p.flashBlind = 0;
      p.bloom = 0;
    },
  };
}
