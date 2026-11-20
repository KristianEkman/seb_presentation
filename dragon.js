// The Terminal Depth dragon (models/dragon.glb, copied from the game) perched in a corner of its slide.
// Click it, or press D on that slide, and it takes off, flies a lap over the slide and lands again.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const stage = document.querySelector("[data-dragon]");
if (stage) {
  const slide = stage.closest(".slide");

  // Scene units are the model's metres (the dragon is about 2.4 long and 1.7 tall at scale 1).
  const SCALE = 1.0;
  const PERCH = new THREE.Vector3(3.9, -2.9, 0);  // ground point where it sits (bottom right)
  const FACING = new THREE.Vector3(-1, 0, 0);     // sits looking left, towards the text
  const YAW_FIX = 0;                              // turn the model if it flies sideways or backwards (radians)
  const RISE = 1.0 * SCALE;                       // height the takeoff/land clips climb/drop inside the clip
  const TAKEOFF_HOLD = 0.75;                      // seconds of takeoff with the hind feet still planted
  const LAND_SPEED = 3.0;                         // forward speed as the landing clip starts
  const LAND_STOP = 1.0;                          // seconds of landing it still moves forward
  const FLY_SPEED = 4.2;                          // cruise speed along the lap, units per second
  const SPEED_UP = 2.5;                           // units after takeoff over which it accelerates to cruise
  const SLOW_DOWN = 3.5;                          // units before landing over which it slows to LAND_SPEED
  const TURN_RATE = 5;                            // how quickly the heading follows the path (higher = snappier)
  const BLEND = 0.4;
  const HANDOFF_BLEND = 0.35;                     // crossfade takeoff → fly and glide → land

  const landRun = LAND_SPEED * LAND_STOP * 0.5;   // distance covered while decelerating to a stop
  const takeoffRun = 0.8;
  const takeoffPush = 1.7 - TAKEOFF_HOLD;         // seconds of takeoff it moves forward (clip is 1.7 s)
  const takeoffExitSpeed = (2 * takeoffRun) / takeoffPush;   // speed at the end of the t² push-off
  const lapStart = PERCH.clone().addScaledVector(FACING, takeoffRun).setY(PERCH.y + RISE);
  const lapEnd = PERCH.clone().addScaledVector(FACING, -landRun).setY(PERCH.y + RISE);
  const at = (p, ahead, up) => p.clone().addScaledVector(FACING, ahead).add(new THREE.Vector3(0, up, 0));

  // The lap: up and left over the slide, out towards the audience, round the back and in from the right.
  // It leaves straight ahead with a gentle climb and comes in level along FACING, so the takeoff and
  // landing clips join it without a turn.
  const lap = new THREE.CatmullRomCurve3([
    lapStart,
    at(lapStart, 1.6, 0.35),
    new THREE.Vector3(-2.5, 1.6, -3),
    new THREE.Vector3(-5.5, 1.2, 0),
    new THREE.Vector3(-3, -0.4, 3.5),
    new THREE.Vector3(1.5, 1.8, 2),
    new THREE.Vector3(6.5, 2.2, -2.5),
    new THREE.Vector3(8.4, 0.8, -1.2),
    at(lapEnd, -2.6, 0.15),
    at(lapEnd, -1.3, 0),
    lapEnd,
  ], false, "centripetal");
  const lapLength = lap.getLength();

  // Speed at a distance along the lap: eases up from the takeoff speed, cruises, eases down to the landing speed.
  const smooth = THREE.MathUtils.smoothstep;
  const lapSpeed = (s) => Math.min(
    THREE.MathUtils.lerp(takeoffExitSpeed, FLY_SPEED, smooth(s, 0, SPEED_UP)),
    THREE.MathUtils.lerp(LAND_SPEED, FLY_SPEED, smooth(lapLength - s, 0, SLOW_DOWN)),
  );

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  camera.position.set(0, 0.5, 12);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f80, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(-4, 8, 6);
  scene.add(sun);

  const root = new THREE.Group();   // position + heading
  const bank = new THREE.Group();   // roll in turns
  root.add(bank);
  scene.add(root);

  let model, mixer, actions = {}, current = null;
  let phase = "loading", phaseTime = 0, lapS = 0;

  function play(name, fade = BLEND) {
    const next = actions[name];
    if (!next || next === current) return;
    next.reset().play();
    if (current) current.crossFadeTo(next, fade, false);
    current = next;
  }

  // The heading the dragon turns towards; root.quaternion eases to it every frame (see turnTowardsHeading).
  const heading = new THREE.Quaternion();
  const lookM = new THREE.Matrix4();
  const ORIGIN = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function face(dir) {
    const flat = new THREE.Vector3(dir.x, dir.y * 0.5, dir.z).normalize();
    heading.setFromRotationMatrix(lookM.lookAt(flat, ORIGIN, UP));   // +Z (glTF's forward) along dir
  }
  function turnTowardsHeading(dt) {
    root.quaternion.slerp(heading, 1 - Math.exp(-TURN_RATE * dt));
  }

  function perch() {
    phase = "perched";
    root.position.copy(PERCH);
    face(FACING);
    root.quaternion.copy(heading);
    bank.rotation.z = 0;
    // Sit on the landing clip's last frame.
    for (const a of Object.values(actions)) a.stop();
    current = actions.land;
    current.reset().play();
    current.time = current.getClip().duration;
    mixer.update(0);
  }

  function fly() {
    if (phase !== "perched") return;
    phase = "takeoff";
    phaseTime = 0;
    play("takeoff", 0.15);
  }

  new GLTFLoader().load("models/dragon.glb", (gltf) => {
    model = gltf.scene;
    model.scale.setScalar(SCALE);
    model.rotation.y = YAW_FIX;
    model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    bank.add(model);
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const a = mixer.clipAction(clip);
      if (clip.name === "takeoff" || clip.name === "land") {
        a.setLoop(THREE.LoopOnce);
        a.clampWhenFinished = true;
      }
      actions[clip.name] = a;
    }
    perch();
  });

  const tangent = new THREE.Vector3();
  const prevTangent = new THREE.Vector3();

  function step(dt) {
    phaseTime += dt;
    if (phase === "takeoff") {
      // Hind feet planted, then it pushes off forward; the clip itself does the climb.
      const t = Math.max(0, phaseTime - TAKEOFF_HOLD) / (actions.takeoff.getClip().duration - TAKEOFF_HOLD);
      root.position.copy(PERCH).addScaledVector(FACING, takeoffRun * Math.min(1, t) ** 2);
      if (phaseTime >= actions.takeoff.getClip().duration) {
        // The takeoff clip ends exactly RISE above the fly pose, so the lap starts RISE up at the same spot.
        phase = "lap";
        phaseTime = 0;
        lapS = 0;
        play("fly", HANDOFF_BLEND);
        return step(0);   // place it by the new phase this same frame, so the handoff offset applies to it
      }
    } else if (phase === "lap") {
      lapS = Math.min(lapLength, lapS + lapSpeed(lapS) * dt);
      const u = lapS / lapLength;
      root.position.copy(lap.getPointAt(u));
      lap.getTangentAt(u, tangent);
      face(tangent);
      // Bank into turns and pick the clip: flap when climbing, glide otherwise, glide on the way in.
      const turn = prevTangent.lengthSq() && dt ? prevTangent.clone().cross(tangent).y / dt : 0;
      bank.rotation.z = THREE.MathUtils.lerp(bank.rotation.z, THREE.MathUtils.clamp(-turn * 0.25, -0.6, 0.6), 1 - Math.exp(-5 * dt));
      prevTangent.copy(tangent);
      if (lapLength - lapS < SLOW_DOWN + 1) play("glide");
      else if (tangent.y > 0.12) play("fly");
      else if (tangent.y < -0.05) play(turn > 0.4 ? "glide_left" : turn < -0.4 ? "glide_right" : "glide");
      if (lapS >= lapLength) {
        // The land clip starts exactly RISE above the glide pose, at LAND_SPEED, already facing FACING.
        phase = "land";
        phaseTime = 0;
        prevTangent.set(0, 0, 0);
        face(FACING);
        play("land", HANDOFF_BLEND);
        return step(0);   // place it by the new phase this same frame, so the handoff offset applies to it
      }
    } else if (phase === "land") {
      // Root drops to the ground; the clip comes down from RISE. Slide forward to a stop on the perch.
      const t = Math.min(1, phaseTime / LAND_STOP);
      const run = landRun * (1 - (1 - t) ** 2);
      root.position.copy(PERCH).addScaledVector(FACING, run - landRun);
      bank.rotation.z *= Math.exp(-6 * dt);
      if (phaseTime >= actions.land.getClip().duration) phase = "perched";
    }
    turnTowardsHeading(dt);
  }

  // The takeoff clip ends, and the land clip starts, with the body RISE above the fly/glide pose, so the
  // root steps by RISE at each handoff. The crossfade blends the clips' poses gradually, so shift the root
  // by RISE times the outgoing/incoming clip's weight; the visible body then doesn't move at all.
  const weight = (a) => (a.enabled ? a.getEffectiveWeight() : 0);
  function matchHandoffBlend() {
    if (phase === "lap") root.position.y -= RISE * weight(actions.takeoff);
    else if (phase === "land") root.position.y += RISE * (1 - weight(actions.land));
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  // Clicking the dragon starts the flight (and doesn't advance the slide).
  const raycaster = new THREE.Raycaster();
  document.addEventListener("click", (e) => {
    if (!model || !slide.classList.contains("active")) return;
    const r = stage.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(model, true).length) {
      e.stopPropagation();
      fly();
    }
  }, true);
  document.addEventListener("keydown", (e) => {
    if ((e.key === "d" || e.key === "D") && slide.classList.contains("active")) fly();
  });

  // Reset to the perch whenever the slide is left; only render while it's showing.
  let wasActive = false;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const active = slide.classList.contains("active");
    if (!active) {
      if (wasActive && mixer) perch();
      wasActive = false;
      return;
    }
    if (!wasActive) resize();
    wasActive = true;
    if (!mixer) return;
    if (phase !== "perched") {
      step(dt);
      mixer.update(dt);
      matchHandoffBlend();
    }
    renderer.render(scene, camera);
  });
}
