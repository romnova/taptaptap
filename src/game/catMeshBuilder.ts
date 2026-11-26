import * as THREE from 'three';
import { CAT_TIERS } from './catData';

let sharedShadowTex: THREE.CanvasTexture | null = null;

function getContactShadowTexture(): THREE.CanvasTexture {
  if (sharedShadowTex) return sharedShadowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(18, 24, 40, 0.42)');
  grad.addColorStop(0.55, 'rgba(18, 24, 40, 0.16)');
  grad.addColorStop(1, 'rgba(18, 24, 40, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  sharedShadowTex = tex;
  return tex;
}

export function createContactShadow(radius = 0.48): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.015;
  mesh.renderOrder = 1;
  return mesh;
}

export function createCatGroup(level: number): THREE.Group {
  const tier = CAT_TIERS[Math.max(0, Math.min(CAT_TIERS.length - 1, level - 1))];
  const root = new THREE.Group();
  root.userData.level = level;

  const model = new THREE.Group();
  model.name = 'catModel';
  root.add(model);

  const furMat = new THREE.MeshStandardMaterial({
    color: tier.bodyColor,
    roughness: 0.68,
    metalness: level >= 11 ? 0.18 : 0.04,
    flatShading: true,
  });

  const bellyMat = new THREE.MeshStandardMaterial({
    color: tier.bellyColor,
    roughness: 0.75,
    metalness: 0.02,
    flatShading: true,
  });

  const earInnerMat = new THREE.MeshStandardMaterial({
    color: tier.earInnerColor,
    roughness: 0.6,
    metalness: 0.02,
    flatShading: true,
  });

  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: tier.eyeColor,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 0.9,
    emissive: level === 6 || level >= 10 ? new THREE.Color(tier.eyeColor) : new THREE.Color(0x000000),
    emissiveIntensity: level === 6 || level >= 10 ? 0.45 : 0,
  });

  const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const accentMat = new THREE.MeshStandardMaterial({
    color: tier.accentColor,
    roughness: level >= 8 ? 0.22 : 0.42,
    metalness: level >= 8 ? 0.85 : 0.25,
    flatShading: true,
  });

  const noseMat = new THREE.MeshStandardMaterial({
    color: '#FF7E9D',
    roughness: 0.35,
    metalness: 0.05,
    flatShading: true,
  });

  // 1. Paws (4 grounded stubby paws sitting flush at y=0)
  const pawGeo = new THREE.CylinderGeometry(0.08, 0.095, 0.14, 6);
  const pawOffsets: [number, number, number][] = [
    [-0.14, 0.07, 0.18],
    [0.14, 0.07, 0.18],
    [-0.16, 0.07, -0.14],
    [0.16, 0.07, -0.14],
  ];
  pawOffsets.forEach(([x, y, z]) => {
    const paw = new THREE.Mesh(pawGeo, bellyMat);
    paw.position.set(x, y, z);
    paw.castShadow = true;
    paw.receiveShadow = true;
    model.add(paw);
  });

  // 2. Primary Torso (tapered faceted PS2 cylinder)
  const bodyGeo = new THREE.CylinderGeometry(0.22, 0.29, 0.44, 7);
  const body = new THREE.Mesh(bodyGeo, furMat);
  body.position.set(0, 0.29, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  model.add(body);

  // 3. Belly Patch
  const bellyGeo = new THREE.CylinderGeometry(0.14, 0.19, 0.34, 6);
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.set(0, 0.27, 0.11);
  belly.scale.set(0.9, 1, 0.6);
  model.add(belly);

  // 4. Head Group (so head can nod/tilt during idle & petting)
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.set(0, 0.62, 0.05);
  model.add(headGroup);

  const headGeo = new THREE.DodecahedronGeometry(0.28, 0);
  const head = new THREE.Mesh(headGeo, furMat);
  head.scale.set(1.12, 0.94, 1.0);
  head.castShadow = true;
  head.receiveShadow = true;
  headGroup.add(head);

  // 5. Cheeks / Muzzle
  const muzzleGeo = new THREE.BoxGeometry(0.24, 0.12, 0.12);
  const muzzle = new THREE.Mesh(muzzleGeo, bellyMat);
  muzzle.position.set(0, -0.05, 0.22);
  headGroup.add(muzzle);

  // 6. Nose
  const noseGeo = new THREE.ConeGeometry(0.036, 0.04, 3);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.rotation.x = Math.PI;
  nose.position.set(0, -0.015, 0.29);
  headGroup.add(nose);

  // 7. Eyes + Specular Catchlight
  const eyeGeo = new THREE.BoxGeometry(0.068, 0.078, 0.045);
  const catchGeo = new THREE.BoxGeometry(0.022, 0.022, 0.015);
  [-0.115, 0.115].forEach((ex) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, 0.04, 0.245);
    headGroup.add(eye);

    const catchlight = new THREE.Mesh(catchGeo, highlightMat);
    catchlight.position.set(ex + 0.015, 0.06, 0.268);
    headGroup.add(catchlight);
  });

  // 8. Ears (Left & Right 4-sided PS2 pyramids + inner ear)
  const earGeo = new THREE.ConeGeometry(0.11, 0.22, 4);
  const innerEarGeo = new THREE.ConeGeometry(0.065, 0.14, 3);
  [-1, 1].forEach((side) => {
    const earPivot = new THREE.Group();
    earPivot.position.set(side * 0.18, 0.21, 0.0);
    earPivot.rotation.z = -side * 0.28;
    earPivot.rotation.y = Math.PI / 4;

    const ear = new THREE.Mesh(earGeo, furMat);
    ear.position.y = 0.08;
    ear.castShadow = true;
    earPivot.add(ear);

    const inner = new THREE.Mesh(innerEarGeo, earInnerMat);
    inner.position.set(0, 0.065, 0.042);
    inner.rotation.y = -Math.PI / 4;
    earPivot.add(inner);

    headGroup.add(earPivot);
  });

  // 9. Tail Group (pivoted at rump for smooth wagging!)
  const tailGroup = new THREE.Group();
  tailGroup.name = 'tailGroup';
  tailGroup.position.set(0, 0.19, -0.24);
  model.add(tailGroup);

  const tailSeg1Geo = new THREE.CylinderGeometry(0.045, 0.055, 0.26, 6);
  const tailSeg1 = new THREE.Mesh(tailSeg1Geo, furMat);
  tailSeg1.position.set(0, 0.1, -0.08);
  tailSeg1.rotation.x = -0.65;
  tailSeg1.castShadow = true;
  tailGroup.add(tailSeg1);

  const tailTipGeo = new THREE.DodecahedronGeometry(0.065, 0);
  const tailTip = new THREE.Mesh(tailTipGeo, level >= 3 ? bellyMat : furMat);
  tailTip.position.set(0, 0.24, -0.17);
  tailGroup.add(tailTip);

  // 10. Level-Specific PS2 Accessories & Silhouette Evolution
  addCatAccessory(tier.accessory, model, headGroup, accentMat, bellyMat, furMat);

  // Apply tier scale (grounded at y=0)
  model.scale.setScalar(tier.scale);

  // Contact shadow disc directly beneath cat
  const shadow = createContactShadow(0.45 * tier.scale);
  root.add(shadow);

  return root;
}

function addCatAccessory(
  accessory: string,
  model: THREE.Group,
  headGroup: THREE.Group,
  accentMat: THREE.Material,
  bellyMat: THREE.Material,
  furMat: THREE.Material,
): void {
  const goldMat = new THREE.MeshStandardMaterial({
    color: '#FFD147',
    roughness: 0.2,
    metalness: 0.88,
    flatShading: true,
  });

  if (accessory === 'collar') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.032, 6, 10), accentMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.47, 0.02);
    model.add(collar);

    const bell = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), goldMat);
    bell.position.set(0, 0.43, 0.23);
    model.add(bell);
  } else if (accessory === 'scarf') {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.05, 6, 10), accentMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0, 0.47, 0.02);
    model.add(scarf);

    const tailScarf = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.22, 0.04), accentMat);
    tailScarf.position.set(0.12, 0.36, 0.22);
    tailScarf.rotation.z = -0.25;
    model.add(tailScarf);
  } else if (accessory === 'ruff') {
    const ruff = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.11, 8), bellyMat);
    ruff.position.set(0, 0.47, 0.02);
    model.add(ruff);
  } else if (accessory === 'kabuto') {
    const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.32, 0.12, 6), accentMat);
    helmet.position.set(0, 0.18, 0);
    headGroup.add(helmet);

    const crestLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), goldMat);
    crestLeft.position.set(-0.08, 0.31, 0.2);
    crestLeft.rotation.z = 0.45;
    headGroup.add(crestLeft);

    const crestRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), goldMat);
    crestRight.position.set(0.08, 0.31, 0.2);
    crestRight.rotation.z = -0.45;
    headGroup.add(crestRight);
  } else if (accessory === 'visor') {
    const visorMat = new THREE.MeshStandardMaterial({
      color: '#00F5D4',
      emissive: '#00D2D3',
      emissiveIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.6,
      flatShading: true,
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.14), visorMat);
    visor.position.set(0, 0.04, 0.23);
    headGroup.add(visor);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.22, 5), goldMat);
    antenna.position.set(0.22, 0.22, 0);
    headGroup.add(antenna);
  } else if (accessory === 'astro') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 12), accentMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.47, 0.02);
    model.add(ring);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.14), accentMat);
    pack.position.set(0, 0.32, -0.25);
    model.add(pack);
  } else if (accessory === 'maneki') {
    const bib = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 6, 10), accentMat);
    bib.rotation.x = Math.PI / 2;
    bib.position.set(0, 0.47, 0.02);
    model.add(bib);

    const koban = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.04), goldMat);
    koban.position.set(0, 0.31, 0.28);
    model.add(koban);
  } else if (accessory === 'crown') {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.14, 6), goldMat);
    crown.position.set(0, 0.3, 0);
    headGroup.add(crown);

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), accentMat);
    gem.position.set(0, 0.39, 0.1);
    headGroup.add(gem);
  } else if (accessory === 'spirit') {
    const secondTail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 6), accentMat);
    secondTail.position.set(0.14, 0.28, -0.26);
    secondTail.rotation.x = -0.6;
    secondTail.rotation.z = -0.4;
    model.add(secondTail);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.024, 6, 12), accentMat);
    halo.position.set(0, 0.32, -0.14);
    halo.rotation.x = 0.25;
    headGroup.add(halo);
  } else if (accessory === 'crystal') {
    [-0.36, 0.36].forEach((sx) => {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), accentMat);
      shard.scale.set(0.7, 1.8, 0.7);
      shard.position.set(sx, 0.52, -0.05);
      shard.rotation.z = sx > 0 ? -0.3 : 0.3;
      model.add(shard);
    });
  } else if (accessory === 'deity') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.032, 6, 14), goldMat);
    halo.position.set(0, 0.24, -0.18);
    halo.name = 'floatingOrbit';
    headGroup.add(halo);

    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.04), furMat);
      wing.position.set(side * 0.36, 0.44, -0.16);
      wing.rotation.z = side * 0.38;
      wing.rotation.y = -side * 0.25;
      model.add(wing);
    });

    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), goldMat);
    crown.position.set(0, 0.36, 0);
    headGroup.add(crown);
  }
}

export function createCrateGroup(): THREE.Group {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.name = 'catModel';
  root.add(model);

  const boxMat = new THREE.MeshStandardMaterial({
    color: '#F4A261',
    roughness: 0.72,
    metalness: 0.05,
    flatShading: true,
  });

  const ribbonMat = new THREE.MeshStandardMaterial({
    color: '#E63946',
    roughness: 0.38,
    metalness: 0.18,
    flatShading: true,
  });

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.48, 0.56), boxMat);
  box.position.y = 0.24;
  box.castShadow = true;
  box.receiveShadow = true;
  model.add(box);

  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.1, 0.61), boxMat);
  lid.position.y = 0.49;
  lid.castShadow = true;
  model.add(lid);

  const ribX = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.56, 0.11), ribbonMat);
  ribX.position.y = 0.28;
  model.add(ribX);

  const ribZ = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.63), ribbonMat);
  ribZ.position.y = 0.28;
  model.add(ribZ);

  const bow = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), ribbonMat);
  bow.position.y = 0.61;
  bow.scale.set(1.2, 0.7, 1.2);
  model.add(bow);

  const shadow = createContactShadow(0.46);
  root.add(shadow);

  return root;
}

export function createGoldenMouseGroup(): THREE.Group {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.name = 'mouseModel';
  root.add(model);

  const goldMat = new THREE.MeshStandardMaterial({
    color: '#FFD147',
    roughness: 0.22,
    metalness: 0.85,
    emissive: '#FF9F1C',
    emissiveIntensity: 0.18,
    flatShading: true,
  });

  const pinkMat = new THREE.MeshStandardMaterial({
    color: '#FF7E9D',
    roughness: 0.5,
    metalness: 0.05,
    flatShading: true,
  });

  const eyeMat = new THREE.MeshBasicMaterial({ color: '#FF2A5F' });

  // 1. Body (sleek low-poly wedge)
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), goldMat);
  body.scale.set(0.85, 0.72, 1.35);
  body.position.set(0, 0.16, 0);
  body.castShadow = true;
  model.add(body);

  // 2. Pointed Snout + Nose
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 5), goldMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.14, 0.31);
  model.add(snout);

  const nose = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), pinkMat);
  nose.position.set(0, 0.14, 0.42);
  model.add(nose);

  // 3. Round Mouse Ears
  const earGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.03, 7);
  [-0.12, 0.12].forEach((ex) => {
    const ear = new THREE.Mesh(earGeo, pinkMat);
    ear.rotation.x = Math.PI / 2 - 0.35;
    ear.rotation.z = ex > 0 ? -0.35 : 0.35;
    ear.position.set(ex, 0.28, 0.15);
    model.add(ear);
  });

  // 4. Glowing Ruby Eyes
  const eyeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  [-0.075, 0.075].forEach((ex) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, 0.19, 0.23);
    model.add(eye);
  });

  // 5. Spinning Wind-up Key on its back
  const keyGroup = new THREE.Group();
  keyGroup.name = 'windupKey';
  keyGroup.position.set(0, 0.32, -0.05);
  model.add(keyGroup);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 5), goldMat);
  stem.position.y = 0.06;
  keyGroup.add(stem);

  const loopL = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.02, 5, 8), goldMat);
  loopL.position.set(-0.065, 0.14, 0);
  keyGroup.add(loopL);

  const loopR = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.02, 5, 8), goldMat);
  loopR.position.set(0.065, 0.14, 0);
  keyGroup.add(loopR);

  // 6. Tail
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.34, 5), pinkMat);
  tail.rotation.x = -Math.PI / 2 + 0.3;
  tail.position.set(0, 0.14, -0.38);
  model.add(tail);

  // 7. Generous invisible tap hitbox for effortless catching
  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 8, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.set(0, 0.22, 0.05);
  hitbox.name = 'mouseHitbox';
  root.add(hitbox);

  const shadow = createContactShadow(0.38);
  root.add(shadow);

  return root;
}

export function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    }
  });
}
