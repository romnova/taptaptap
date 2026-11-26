import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BOARD_SIZE, BOARD_THEMES } from './catData';
import {
  createCatGroup,
  createCrateGroup,
  createGoldenMouseGroup,
  disposeObject3D,
} from './catMeshBuilder';
import { AsmrToyMode, BoardSlot, BoardThemeId } from './types';

interface SlotVisual {
  id: string;
  kind: 'cat' | 'crate';
  level: number;
  group: THREE.Group;
  springY: number;
  springVel: number;
  squash: number;
  bobPhase: number;
  targetPos: THREE.Vector3;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

export interface SceneCallbacks {
  onSlotTap: (index: number, screenPos: { x: number; y: number }) => void;
  onSlotMoveOrMerge: (
    fromIndex: number,
    toIndex: number,
    screenPos: { x: number; y: number },
  ) => void;
  onMouseCaught: (screenPos: { x: number; y: number }) => void;
  onAsmrTap: (mode: AsmrToyMode, screenPos: { x: number; y: number }) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

const TILE_SPACING = 1.32;
const GRID_OFFSET = 1.5 * TILE_SPACING;
const _vec2 = new THREE.Vector2();
const _vec3 = new THREE.Vector3();
const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.35);

export function getTileWorldPos(index: number, out = new THREE.Vector3()): THREE.Vector3 {
  const row = Math.floor(index / 4);
  const col = index % 4;
  return out.set(col * TILE_SPACING - GRID_OFFSET, 0, row * TILE_SPACING - GRID_OFFSET);
}

export class SceneController {
  private container: HTMLElement;
  private callbacks: SceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;
  private paused = false;

  private boardGroup = new THREE.Group();
  private boardBaseMesh!: THREE.Mesh;
  private tileMeshes: THREE.Mesh[] = [];
  private hitBoxes: THREE.Mesh[] = [];
  private ringMeshes: THREE.Mesh[] = [];
  private slots: (SlotVisual | null)[] = Array(BOARD_SIZE).fill(null);
  private particles: BurstParticle[] = [];
  private shockwaves: ShockwaveRing[] = [];

  private raycaster = new THREE.Raycaster();
  private dragState: {
    active: boolean;
    fromIndex: number;
    hoveredIndex: number;
    startX: number;
    startY: number;
    moved: boolean;
    worldPos: THREE.Vector3;
    prevWorldPos: THREE.Vector3;
  } = {
    active: false,
    fromIndex: -1,
    hoveredIndex: -1,
    startX: 0,
    startY: 0,
    moved: false,
    worldPos: new THREE.Vector3(),
    prevWorldPos: new THREE.Vector3(),
  };

  private camTargetPos = new THREE.Vector3(0, 6.2, 6.2);
  private camCurrentPos = new THREE.Vector3(0, 6.2, 6.2);
  private camLookTarget = new THREE.Vector3(0, 0.25, 0.15);
  private cameraMode: 'iso' | 'front' = 'iso';
  private shakeIntensity = 0;
  private ps2Filter = false;
  private feverActive = false;
  private zoomiesActive = false;
  private flashSaleActive = false;
  private boardRimMat!: THREE.MeshStandardMaterial;
  private incomeSparkTimer = 0;

  private currentBoardData: (BoardSlot | null)[] = Array(BOARD_SIZE).fill(null);

  private activeMouse: {
    group: THREE.Group;
    hitbox: THREE.Object3D;
    waypoints: THREE.Vector3[];
    segIndex: number;
    segProgress: number;
    speed: number;
    lifeLeft: number;
  } | null = null;

  // 3D PS2 ASMR Side Station (Soap Slicer & Kinetic Pop-Blocks)
  private asmrMode: AsmrToyMode = 'soap';
  private asmrGroup = new THREE.Group();
  private asmrTargetPos = new THREE.Vector3(-4.2, 0, -0.15);
  private asmrPlinth!: THREE.Mesh;
  private asmrHitbox!: THREE.Mesh;
  private soapGroup = new THREE.Group();
  private soapBar!: THREE.Mesh;
  private soapBlade!: THREE.Group;
  private soapSliceProgress = 0;
  private soapSliceSpeed = 0.72;
  private soapManualBoost = 0;
  private popGroup = new THREE.Group();
  private popBlocks: THREE.Mesh[] = [];
  private popPulse = 0;
  private popStep = 0;

  // Fish & Coin Rain Mini-Event
  private fishRainActive = false;
  private fishRainTimer = 0;

  constructor(
    container: HTMLElement,
    initialThemeId: BoardThemeId,
    callbacks: SceneCallbacks,
  ) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyPixelRatio();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    const aspect = width / Math.max(1, height);
    this.camera = new THREE.PerspectiveCamera(aspect < 0.9 ? 48 : 38, aspect, 0.1, 80);
    this.updateCameraPreset(aspect);
    this.camCurrentPos.copy(this.camTargetPos);
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camLookTarget);

    // Studio environment reflections for metallic crowns/gold/visors
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.setupLighting();
    this.buildBoard();
    this.buildAsmrStation();
    this.setTheme(initialThemeId);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.startLoop();
  }

  private applyPixelRatio(): void {
    if (this.ps2Filter) {
      this.renderer.setPixelRatio(this.isSoftwareGl ? 0.55 : 0.6);
      this.renderer.domElement.style.imageRendering = 'pixelated';
    } else {
      this.renderer.setPixelRatio(
        this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      );
      this.renderer.domElement.style.imageRendering = 'auto';
    }
  }

  public setPs2Filter(enabled: boolean): void {
    this.ps2Filter = enabled;
    this.applyPixelRatio();
  }

  public setFeverMode(active: boolean): void {
    this.feverActive = active;
  }

  public setFishRain(active: boolean): void {
    this.fishRainActive = active;
  }

  public setZoomiesMode(active: boolean): void {
    this.zoomiesActive = active;
  }

  public setFlashSaleMode(active: boolean): void {
    this.flashSaleActive = active;
  }

  public setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      this.dragState.active = false;
      this.dragState.fromIndex = -1;
      this.dragState.hoveredIndex = -1;
      this.dragState.moved = false;
      this.renderer.domElement.style.cursor = 'default';
      this.clock.stop();
    } else {
      this.clock.start();
      this.clock.getDelta();
    }
  }

  public setAsmrMode(mode: AsmrToyMode): void {
    this.asmrMode = mode;
    this.asmrGroup.visible = mode !== 'off';
    this.soapGroup.visible = mode === 'soap';
    this.popGroup.visible = mode === 'pop';
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.updateCameraPreset(w / Math.max(1, h));
  }

  public toggleCameraAngle(): 'iso' | 'front' {
    this.cameraMode = this.cameraMode === 'iso' ? 'front' : 'iso';
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.updateCameraPreset(w / Math.max(1, h));
    return this.cameraMode;
  }

  private updateCameraPreset(aspect: number): void {
    const asmrOn = this.asmrMode !== 'off';
    const isPortrait = aspect < 0.95;

    if (isPortrait) {
      // Portrait smartphones (iPhone / Android): larger ASMR station sits cleanly above the 4x4 board
      this.asmrTargetPos.set(0, 0, -4.65);
      this.asmrGroup.scale.setScalar(1.38);
      const lift = aspect < 0.65 ? 2.65 : 1.95;
      if (this.cameraMode === 'iso') {
        this.camTargetPos.set(
          0,
          6.5 + lift * 0.95,
          6.35 + lift * 0.9,
        );
        this.camLookTarget.set(0, 0.15, asmrOn ? -0.7 : 0.15);
      } else {
        this.camTargetPos.set(2.4, 5.4 + lift * 0.85, 5.9 + lift * 0.85);
        this.camLookTarget.set(0, 0.2, asmrOn ? -0.6 : 0.1);
      }
    } else {
      // Landscape laptops & desktop PCs: large ASMR station sits prominently on the left flank
      this.asmrTargetPos.set(-4.75, 0, 0.2);
      this.asmrGroup.scale.setScalar(1.44);
      const sideOffset = asmrOn ? (aspect < 1.35 ? -1.15 : -0.95) : 0;
      const zoomOut = asmrOn && aspect < 1.35 ? 1.35 : 0.25;
      if (this.cameraMode === 'iso') {
        this.camTargetPos.set(sideOffset, 6.2 + zoomOut * 0.8, 6.1 + zoomOut * 0.8);
        this.camLookTarget.set(sideOffset, 0.2, 0.2);
      } else {
        this.camTargetPos.set(
          2.6 + sideOffset,
          5.1 + zoomOut * 0.7,
          5.7 + zoomOut * 0.7,
        );
        this.camLookTarget.set(sideOffset, 0.25, 0.1);
      }
    }
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight('#F4F8FF', '#7A869F', 0.82);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#FFF5E4', 1.65);
    keyLight.position.set(5.5, 9.5, 6.2);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 26;
    const d = 4.6;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#B8D4FF', 0.72);
    rimLight.position.set(-5.0, 4.2, -5.5);
    this.scene.add(rimLight);
  }

  private buildBoard(): void {
    this.scene.add(this.boardGroup);

    // Wide studio ground plane so board sits in cohesive infinite space
    const groundGeo = new THREE.PlaneGeometry(42, 42);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#DCE2ED',
      roughness: 0.94,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.26;
    ground.receiveShadow = true;
    ground.name = 'studioGround';
    this.boardGroup.add(ground);

    // Minimalist chamfered PS2 diorama plinth
    const baseGeo = new THREE.BoxGeometry(5.8, 0.28, 5.8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: '#C8D0DF',
      roughness: 0.52,
      metalness: 0.14,
      flatShading: true,
    });
    this.boardBaseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.boardBaseMesh.position.y = -0.14;
    this.boardBaseMesh.receiveShadow = true;
    this.boardBaseMesh.castShadow = true;
    this.boardGroup.add(this.boardBaseMesh);

    // Glowing PS2-style perimeter rim strips for live event/process visualization
    this.boardRimMat = new THREE.MeshStandardMaterial({
      color: '#4E7BFF',
      emissive: '#4E7BFF',
      emissiveIntensity: 0.18,
      roughness: 0.35,
      metalness: 0.25,
      flatShading: true,
    });
    const rimSpecs: Array<[number, number, number, number, number, number]> = [
      [5.96, 0.08, 0.09, 0, -0.02, -2.94],
      [5.96, 0.08, 0.09, 0, -0.02, 2.94],
      [0.09, 0.08, 5.96, -2.94, -0.02, 0],
      [0.09, 0.08, 5.96, 2.94, -0.02, 0],
    ];
    for (const [w, h, d, x, y, z] of rimSpecs) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.boardRimMat);
      strip.position.set(x, y, z);
      this.boardGroup.add(strip);
    }

    // 16 individual pedestal tiles + invisible raycast hitboxes + merge highlight rings
    const tileGeo = new THREE.BoxGeometry(1.16, 0.08, 1.16);
    const hitGeo = new THREE.BoxGeometry(1.28, 0.6, 1.28);
    const ringGeo = new THREE.RingGeometry(0.42, 0.53, 24);
    ringGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < BOARD_SIZE; i++) {
      const pos = getTileWorldPos(i);
      const isAlt = (Math.floor(i / 4) + (i % 4)) % 2 === 1;

      const tileMat = new THREE.MeshStandardMaterial({
        color: isAlt ? '#ECEFF6' : '#F7F9FC',
        roughness: 0.58,
        metalness: 0.06,
        flatShading: true,
      });
      const tile = new THREE.Mesh(tileGeo, tileMat);
      tile.position.set(pos.x, -0.01, pos.z);
      tile.receiveShadow = true;
      tile.userData.isAlt = isAlt;
      this.boardGroup.add(tile);
      this.tileMeshes.push(tile);

      // Highlight ring (offset by +0.032 above tile to avoid Z-fighting)
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#4E7BFF',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(pos.x, 0.036, pos.z);
      ring.renderOrder = 2;
      this.boardGroup.add(ring);
      this.ringMeshes.push(ring);

      // Invisible hit-box for effortless picking & dropping
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.set(pos.x, 0.28, pos.z);
      hit.userData.slotIndex = i;
      this.boardGroup.add(hit);
      this.hitBoxes.push(hit);
    }
  }

  private buildAsmrStation(): void {
    this.asmrGroup.position.copy(this.asmrTargetPos);
    this.boardGroup.add(this.asmrGroup);

    // Minimalist PS2 side plinth
    const plinthGeo = new THREE.BoxGeometry(1.95, 0.22, 1.95);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: '#C8D0DF',
      roughness: 0.52,
      metalness: 0.12,
      flatShading: true,
    });
    this.asmrPlinth = new THREE.Mesh(plinthGeo, plinthMat);
    this.asmrPlinth.position.y = -0.11;
    this.asmrPlinth.receiveShadow = true;
    this.asmrPlinth.castShadow = true;
    this.asmrGroup.add(this.asmrPlinth);

    const trayGeo = new THREE.BoxGeometry(1.68, 0.06, 1.68);
    const trayMat = new THREE.MeshStandardMaterial({
      color: '#F7F9FC',
      roughness: 0.6,
      metalness: 0.04,
      flatShading: true,
    });
    const tray = new THREE.Mesh(trayGeo, trayMat);
    tray.position.y = 0.02;
    tray.receiveShadow = true;
    tray.name = 'asmrTray';
    this.asmrGroup.add(tray);

    // Hitbox for tapping ASMR toy
    this.asmrHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.3, 1.9),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.asmrHitbox.position.y = 0.55;
    this.asmrGroup.add(this.asmrHitbox);

    // 1. SOAP SLICER SUB-GROUP (Chunky, vibrant 3-layer pastel soap bar)
    this.asmrGroup.add(this.soapGroup);

    const soapMat = new THREE.MeshStandardMaterial({
      color: '#FF85A9',
      roughness: 0.34,
      metalness: 0.04,
      flatShading: true,
    });
    this.soapBar = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.54, 1.12), soapMat);
    this.soapBar.position.set(0, 0.32, -0.12);
    this.soapBar.castShadow = true;
    this.soapGroup.add(this.soapBar);

    // Mint middle stripe + cream top layer on the soap bar
    const soapMid = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, 0.14, 1.14),
      new THREE.MeshStandardMaterial({
        color: '#8CE9D8',
        roughness: 0.36,
        metalness: 0.04,
        flatShading: true,
      }),
    );
    soapMid.position.set(0, 0.08, 0);
    this.soapBar.add(soapMid);

    const soapTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, 0.13, 1.14),
      new THREE.MeshStandardMaterial({
        color: '#FFF3B0',
        roughness: 0.36,
        metalness: 0.04,
        flatShading: true,
      }),
    );
    soapTop.position.set(0, 0.24, 0);
    this.soapBar.add(soapTop);

    // Gleaming Slicer Blade + Handle
    this.soapBlade = new THREE.Group();
    this.soapBlade.position.set(0, 0.98, 0.42);
    const bladeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 0.28, 0.04),
      new THREE.MeshStandardMaterial({
        color: '#E2E8F0',
        roughness: 0.16,
        metalness: 0.9,
        flatShading: true,
      }),
    );
    this.soapBlade.add(bladeMesh);

    const handleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.32, 0.11, 0.11),
      new THREE.MeshStandardMaterial({
        color: '#3B66F5',
        roughness: 0.38,
        metalness: 0.22,
        flatShading: true,
      }),
    );
    handleMesh.position.y = 0.16;
    this.soapBlade.add(handleMesh);
    this.soapGroup.add(this.soapBlade);

    // 2. KINETIC POP-IT BLOCKS SUB-GROUP
    this.asmrGroup.add(this.popGroup);
    this.popGroup.visible = false;
    const popColors = ['#FF8FA3', '#FFD166', '#4ECDC4', '#74C0FC', '#B197FC'];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const idx = r * 3 + c;
        const block = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.22, 0.26, 8),
          new THREE.MeshStandardMaterial({
            color: popColors[idx % popColors.length],
            roughness: 0.32,
            metalness: 0.08,
            flatShading: true,
          }),
        );
        block.position.set((c - 1) * 0.48, 0.17, (r - 1) * 0.48);
        block.castShadow = true;
        block.userData.phase = idx * 0.55;
        this.popGroup.add(block);
        this.popBlocks.push(block);
      }
    }
  }

  private spawnSoapSliceCubes(): void {
    const origin = this.asmrGroup.position;
    const scale = this.asmrGroup.scale.x;
    const colors = ['#FF85A9', '#FFF3B0', '#8CE9D8', '#FFBCD1'];
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 * scale, 0.19 * scale, 0.19 * scale),
        new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          roughness: 0.38,
          metalness: 0.04,
          flatShading: true,
          transparent: true,
          opacity: 1,
        }),
      );
      mesh.position.set(
        origin.x + (i - 3.5) * 0.16 * scale,
        (0.42 + (i % 2) * 0.18) * scale,
        origin.z + 0.48 * scale,
      );
      this.boardGroup.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          (i - 3.5) * 0.55 + (Math.random() - 0.5) * 0.45,
          1.7 + Math.random() * 0.9,
          1.15 + Math.random() * 0.75,
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
        ),
        life: 0,
        maxLife: 0.95,
      });
    }
  }

  public setTheme(themeId: BoardThemeId): void {
    const theme = BOARD_THEMES.find((t) => t.id === themeId) || BOARD_THEMES[0];
    this.scene.background = new THREE.Color(theme.bgHex);
    this.scene.fog = new THREE.FogExp2(theme.fogHex, 0.034);

    const ground = this.boardGroup.getObjectByName('studioGround') as THREE.Mesh | undefined;
    if (ground) {
      (ground.material as THREE.MeshStandardMaterial).color.set(theme.bgHex);
    }

    (this.boardBaseMesh.material as THREE.MeshStandardMaterial).color.set(theme.boardBaseHex);
    (this.asmrPlinth.material as THREE.MeshStandardMaterial).color.set(theme.boardBaseHex);
    this.boardRimMat.color.set(theme.rimHex);
    this.boardRimMat.emissive.set(theme.rimHex);

    const tray = this.asmrGroup.getObjectByName('asmrTray') as THREE.Mesh | undefined;
    if (tray) {
      (tray.material as THREE.MeshStandardMaterial).color.set(theme.tileHex);
    }

    this.tileMeshes.forEach((tile) => {
      const mat = tile.material as THREE.MeshStandardMaterial;
      mat.color.set(tile.userData.isAlt ? theme.tileAltHex : theme.tileHex);
    });
  }

  public syncBoard(board: (BoardSlot | null)[]): void {
    this.currentBoardData = board;
    for (let i = 0; i < BOARD_SIZE; i++) {
      const next = board[i];
      const current = this.slots[i];

      if (!next && current) {
        this.boardGroup.remove(current.group);
        disposeObject3D(current.group);
        this.slots[i] = null;
      } else if (
        next &&
        (!current ||
          current.id !== next.id ||
          current.level !== next.level ||
          current.kind !== next.kind)
      ) {
        if (current) {
          this.boardGroup.remove(current.group);
          disposeObject3D(current.group);
        }
        const group =
          next.kind === 'crate' ? createCrateGroup() : createCatGroup(next.level);
        const targetPos = getTileWorldPos(i);
        group.position.copy(targetPos);
        group.scale.setScalar(0.15);
        this.boardGroup.add(group);

        this.slots[i] = {
          id: next.id,
          kind: next.kind,
          level: next.level,
          group,
          springY: 0.45,
          springVel: 0,
          squash: 1.25,
          bobPhase: Math.random() * Math.PI * 2,
          targetPos: targetPos.clone(),
        };
      }
    }
  }

  public triggerMergeEffect(index: number, newLevel: number): void {
    const pos = getTileWorldPos(index);
    const count = Math.min(18, 9 + newLevel);
    const colors = ['#FFD147', '#FF6B6B', '#4ECDC4', '#FFFFFF'];

    for (let i = 0; i < count; i++) {
      const geo =
        i % 2 === 0
          ? new THREE.OctahedronGeometry(0.085, 0)
          : new THREE.BoxGeometry(0.09, 0.09, 0.03);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, 0.48, pos.z);
      this.boardGroup.add(mesh);

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.6 + Math.random() * 1.9;
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          2.2 + Math.random() * 1.8,
          Math.sin(angle) * speed,
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
        ),
        life: 0,
        maxLife: 0.55 + Math.random() * 0.25,
      });
    }

    this.spawnShockwave(pos.x, pos.z, newLevel >= 6 ? '#FFD147' : '#10B981', 2.2);
    this.shakeIntensity = Math.min(0.14, 0.04 + newLevel * 0.008);
  }

  private spawnShockwave(x: number, z: number, colorHex: string, maxScale = 2.0): void {
    const geo = new THREE.RingGeometry(0.28, 0.42, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.06, z);
    mesh.renderOrder = 3;
    this.boardGroup.add(mesh);
    this.shockwaves.push({
      mesh,
      life: 0,
      maxLife: 0.42,
      maxScale,
    });
  }

  public triggerTapBounce(index: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    slot.springVel = 4.2;
    slot.squash = 1.22;

    // Emit cute petting sparkles above the cat
    const pos = getTileWorldPos(index);
    const colors = ['#FF85A9', '#FFD147', '#FFFFFF'];
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06, 0),
        new THREE.MeshBasicMaterial({
          color: colors[i % colors.length],
          transparent: true,
          opacity: 1,
        }),
      );
      mesh.position.set(pos.x, 0.85, pos.z);
      this.boardGroup.add(mesh);
      const ang = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(ang) * 0.85, 1.9 + Math.random() * 0.6, Math.sin(ang) * 0.85),
        rotVel: new THREE.Vector3(5, 7, 5),
        life: 0,
        maxLife: 0.44,
      });
    }
  }

  public triggerCrateDropEffect(indices: number[]): void {
    const colors = ['#4ECDC4', '#FFD147', '#FFFFFF'];
    for (const idx of indices) {
      const pos = getTileWorldPos(idx);
      this.spawnShockwave(pos.x, pos.z, '#4ECDC4', 1.65);
      for (let i = 0; i < 6; i++) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.08, 0.08),
          new THREE.MeshBasicMaterial({
            color: colors[i % colors.length],
            transparent: true,
            opacity: 1,
          }),
        );
        mesh.position.set(pos.x, 0.55, pos.z);
        this.boardGroup.add(mesh);
        const angle = (i / 6) * Math.PI * 2;
        this.particles.push({
          mesh,
          vel: new THREE.Vector3(Math.cos(angle) * 1.35, 1.9, Math.sin(angle) * 1.35),
          rotVel: new THREE.Vector3(5, 7, 5),
          life: 0,
          maxLife: 0.48,
        });
      }
    }
  }

  public spawnGoldenMouse(): boolean {
    if (this.activeMouse) return false;
    const group = createGoldenMouseGroup();
    const hitbox = group.getObjectByName('mouseHitbox') || group;

    // Generate a lively criss-crossing path across the 4x4 board
    const waypoints: THREE.Vector3[] = [];
    const entrySide = Math.random() < 0.5 ? -1 : 1;
    waypoints.push(new THREE.Vector3(entrySide * 3.1, 0.04, (Math.random() - 0.5) * 3.2));
    for (let i = 0; i < 6; i++) {
      waypoints.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 4.0,
          0.04,
          (Math.random() - 0.5) * 4.0,
        ),
      );
    }
    waypoints.push(new THREE.Vector3(-entrySide * 3.4, 0.04, (Math.random() - 0.5) * 3.2));

    group.position.copy(waypoints[0]);
    this.boardGroup.add(group);

    this.activeMouse = {
      group,
      hitbox,
      waypoints,
      segIndex: 0,
      segProgress: 0,
      speed: 2.35,
      lifeLeft: 10.5,
    };
    return true;
  }

  public isMouseActive(): boolean {
    return this.activeMouse !== null;
  }

  private removeGoldenMouse(withBurst: boolean): void {
    if (!this.activeMouse) return;
    const pos = this.activeMouse.group.position.clone();
    this.boardGroup.remove(this.activeMouse.group);
    disposeObject3D(this.activeMouse.group);
    this.activeMouse = null;

    if (withBurst) {
      const colors = ['#FFD147', '#FFF3B0', '#FF9F1C', '#FFFFFF'];
      for (let i = 0; i < 20; i++) {
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.095, 0),
          new THREE.MeshBasicMaterial({
            color: colors[i % colors.length],
            transparent: true,
            opacity: 1,
          }),
        );
        mesh.position.set(pos.x, 0.35, pos.z);
        this.boardGroup.add(mesh);
        const angle = (i / 20) * Math.PI * 2;
        const spd = 2.0 + Math.random() * 2.2;
        this.particles.push({
          mesh,
          vel: new THREE.Vector3(
            Math.cos(angle) * spd,
            2.6 + Math.random() * 1.9,
            Math.sin(angle) * spd,
          ),
          rotVel: new THREE.Vector3(8, 8, 8),
          life: 0,
          maxLife: 0.65,
        });
      }
      this.spawnShockwave(pos.x, pos.z, '#FFD147', 2.4);
      this.shakeIntensity = 0.09;
    }
  }

  public projectSlotToScreen(index: number): { x: number; y: number } {
    const pos = getTileWorldPos(index, _vec3);
    pos.y += 0.95;
    pos.project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((pos.x + 1) / 2) * rect.width,
      y: rect.top + ((-pos.y + 1) / 2) * rect.height,
    };
  }

  private updatePointerNdc(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _vec2.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _vec2.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastSlotIndex(clientX: number, clientY: number): number {
    this.updatePointerNdc(clientX, clientY);
    this.raycaster.setFromCamera(_vec2, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitBoxes, false);
    if (hits.length > 0) {
      return hits[0].object.userData.slotIndex as number;
    }
    return -1;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.paused) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Check Golden Mouse catch FIRST!
    if (this.activeMouse) {
      this.updatePointerNdc(e.clientX, e.clientY);
      this.raycaster.setFromCamera(_vec2, this.camera);
      const mouseHits = this.raycaster.intersectObject(this.activeMouse.hitbox, false);
      if (mouseHits.length > 0) {
        const pos = this.activeMouse.group.position.clone();
        pos.y += 0.5;
        pos.project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        const screenPos = {
          x: rect.left + ((pos.x + 1) / 2) * rect.width,
          y: rect.top + ((-pos.y + 1) / 2) * rect.height,
        };
        this.removeGoldenMouse(true);
        this.callbacks.onMouseCaught(screenPos);
        return;
      }
    }

    // Check ASMR Side Station tap!
    if (this.asmrMode !== 'off') {
      this.updatePointerNdc(e.clientX, e.clientY);
      this.raycaster.setFromCamera(_vec2, this.camera);
      const asmrHits = this.raycaster.intersectObject(this.asmrHitbox, false);
      if (asmrHits.length > 0) {
        if (this.asmrMode === 'soap') {
          this.soapManualBoost = 1.6;
          this.soapSliceProgress = Math.max(this.soapSliceProgress, 0.72);
        } else {
          this.popPulse = 1.0;
          this.popStep++;
        }
        const pos = this.asmrGroup.position.clone();
        pos.y += 0.9;
        pos.project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.callbacks.onAsmrTap(this.asmrMode, {
          x: rect.left + ((pos.x + 1) / 2) * rect.width,
          y: rect.top + ((-pos.y + 1) / 2) * rect.height,
        });
        return;
      }
    }

    const idx = this.raycastSlotIndex(e.clientX, e.clientY);
    if (idx < 0) return;

    const slot = this.slots[idx];
    if (!slot) return;

    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.dragState.active = true;
    this.dragState.fromIndex = idx;
    this.dragState.hoveredIndex = idx;
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.moved = false;

    this.updatePointerNdc(e.clientX, e.clientY);
    this.raycaster.setFromCamera(_vec2, this.camera);
    this.raycaster.ray.intersectPlane(_dragPlane, this.dragState.worldPos);
    this.dragState.prevWorldPos.copy(this.dragState.worldPos);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragState.active) {
      if (this.activeMouse) {
        this.updatePointerNdc(e.clientX, e.clientY);
        this.raycaster.setFromCamera(_vec2, this.camera);
        if (this.raycaster.intersectObject(this.activeMouse.hitbox, false).length > 0) {
          this.renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      if (this.asmrMode !== 'off') {
        this.updatePointerNdc(e.clientX, e.clientY);
        this.raycaster.setFromCamera(_vec2, this.camera);
        if (this.raycaster.intersectObject(this.asmrHitbox, false).length > 0) {
          this.renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      const hoverIdx = this.raycastSlotIndex(e.clientX, e.clientY);
      this.renderer.domElement.style.cursor =
        hoverIdx >= 0 && this.slots[hoverIdx] ? 'grab' : 'default';
      return;
    }

    const dx = e.clientX - this.dragState.startX;
    const dy = e.clientY - this.dragState.startY;
    if (!this.dragState.moved && dx * dx + dy * dy > 64) {
      // Only cats can be dragged; crates unwrap on tap
      const fromSlot = this.slots[this.dragState.fromIndex];
      if (fromSlot && fromSlot.kind === 'cat') {
        this.dragState.moved = true;
        this.renderer.domElement.style.cursor = 'grabbing';
      }
    }

    if (this.dragState.moved) {
      this.updatePointerNdc(e.clientX, e.clientY);
      this.raycaster.setFromCamera(_vec2, this.camera);
      this.dragState.prevWorldPos.copy(this.dragState.worldPos);
      this.raycaster.ray.intersectPlane(_dragPlane, this.dragState.worldPos);
      this.dragState.hoveredIndex = this.raycastSlotIndex(e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragState.active) return;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    }

    const { fromIndex, moved } = this.dragState;
    const dropIdx = moved ? this.raycastSlotIndex(e.clientX, e.clientY) : fromIndex;

    this.dragState.active = false;
    this.dragState.fromIndex = -1;
    this.dragState.hoveredIndex = -1;
    this.dragState.moved = false;
    this.renderer.domElement.style.cursor = 'default';

    if (!moved) {
      const screenPos = this.projectSlotToScreen(fromIndex);
      this.callbacks.onSlotTap(fromIndex, screenPos);
    } else if (dropIdx >= 0 && dropIdx !== fromIndex) {
      const screenPos = this.projectSlotToScreen(dropIdx);
      this.callbacks.onSlotMoveOrMerge(fromIndex, dropIdx, screenPos);
    }
  };

  private onResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);
    this.camera.fov = aspect < 0.9 ? 48 : 38;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.updateCameraPreset(aspect);
    this.renderer.setSize(w, h);
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost?.();
  };

  private onContextRestored = (): void => {
    this.callbacks.onContextRestored?.();
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
    window.addEventListener('resize', this.onResize);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      if (!this.paused) {
        const dt = Math.min(0.05, this.clock.getDelta());
        const elapsed = this.clock.elapsedTime;
        this.updateScene(dt, elapsed);
        this.renderer.render(this.scene, this.camera);
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateScene(dt: number, elapsed: number): void {
    // Camera smooth damping + micro-shake
    this.camCurrentPos.x = THREE.MathUtils.damp(this.camCurrentPos.x, this.camTargetPos.x, 7, dt);
    this.camCurrentPos.y = THREE.MathUtils.damp(this.camCurrentPos.y, this.camTargetPos.y, 7, dt);
    this.camCurrentPos.z = THREE.MathUtils.damp(this.camCurrentPos.z, this.camTargetPos.z, 7, dt);

    this.camera.position.copy(this.camCurrentPos);
    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 14, dt);
    }
    this.camera.lookAt(this.camLookTarget);

    // Update tile highlight rings
    const draggedSlot =
      this.dragState.active && this.dragState.moved
        ? this.currentBoardData[this.dragState.fromIndex]
        : null;

    for (let i = 0; i < BOARD_SIZE; i++) {
      const ring = this.ringMeshes[i];
      const mat = ring.material as THREE.MeshBasicMaterial;
      let targetOpacity = 0;
      let targetScale = 1;
      if (draggedSlot) {
        const candidate = this.currentBoardData[i];
        if (i === this.dragState.hoveredIndex && i !== this.dragState.fromIndex) {
          if (
            candidate &&
            candidate.kind === 'cat' &&
            candidate.level === draggedSlot.level &&
            draggedSlot.level < 12
          ) {
            mat.color.set('#10B981'); // Valid merge!
            targetOpacity = 0.94;
            targetScale = 1.12 + Math.sin(elapsed * 12) * 0.05;
          } else {
            mat.color.set('#3B82F6'); // Swap or move
            targetOpacity = 0.72;
            targetScale = 1.04;
          }
        } else if (
          i !== this.dragState.fromIndex &&
          candidate &&
          candidate.kind === 'cat' &&
          candidate.level === draggedSlot.level &&
          draggedSlot.level < 12
        ) {
          // Pulse hint on matching merge partner!
          mat.color.set('#F59E0B');
          targetOpacity = 0.35 + Math.sin(elapsed * 7) * 0.2;
          targetScale = 1.03 + Math.sin(elapsed * 7) * 0.04;
        }
      }

      ring.scale.setScalar(THREE.MathUtils.damp(ring.scale.x, targetScale, 16, dt));
      mat.opacity = THREE.MathUtils.damp(mat.opacity, targetOpacity, 16, dt);
    }

    // Update cats & crates animations
    for (let i = 0; i < BOARD_SIZE; i++) {
      const slot = this.slots[i];
      if (!slot) continue;

      const isDragged =
        this.dragState.active && this.dragState.moved && this.dragState.fromIndex === i;

      // Spawn/tap spring
      slot.springVel += -slot.springY * 140 * dt;
      slot.springVel *= Math.exp(-12 * dt);
      slot.springY += slot.springVel * dt;
      if (Math.abs(slot.springY) < 0.001 && Math.abs(slot.springVel) < 0.005) {
        slot.springY = 0;
        slot.springVel = 0;
      }

      slot.squash = THREE.MathUtils.damp(slot.squash, 1, 12, dt);

      if (isDragged) {
        slot.group.position.x = THREE.MathUtils.damp(
          slot.group.position.x,
          this.dragState.worldPos.x,
          24,
          dt,
        );
        slot.group.position.z = THREE.MathUtils.damp(
          slot.group.position.z,
          this.dragState.worldPos.z,
          24,
          dt,
        );
        slot.group.position.y = THREE.MathUtils.damp(slot.group.position.y, 0.58, 18, dt);

        const vx = (this.dragState.worldPos.x - this.dragState.prevWorldPos.x) * 4;
        const vz = (this.dragState.worldPos.z - this.dragState.prevWorldPos.z) * 4;
        slot.group.rotation.z = THREE.MathUtils.damp(
          slot.group.rotation.z,
          THREE.MathUtils.clamp(-vx, -0.35, 0.35),
          14,
          dt,
        );
        slot.group.rotation.x = THREE.MathUtils.damp(
          slot.group.rotation.x,
          THREE.MathUtils.clamp(vz, -0.35, 0.35),
          14,
          dt,
        );
      } else {
        slot.group.position.x = THREE.MathUtils.damp(
          slot.group.position.x,
          slot.targetPos.x,
          16,
          dt,
        );
        slot.group.position.z = THREE.MathUtils.damp(
          slot.group.position.z,
          slot.targetPos.z,
          16,
          dt,
        );
        slot.group.position.y = THREE.MathUtils.damp(
          slot.group.position.y,
          Math.max(0, slot.springY),
          18,
          dt,
        );
        slot.group.rotation.z = THREE.MathUtils.damp(slot.group.rotation.z, 0, 12, dt);
        slot.group.rotation.x = THREE.MathUtils.damp(slot.group.rotation.x, 0, 12, dt);
      }

      // Scale pop-in + squash/stretch
      const invSqrt = 1 / Math.sqrt(Math.max(0.5, slot.squash));
      slot.group.scale.x = THREE.MathUtils.damp(slot.group.scale.x, invSqrt, 14, dt);
      slot.group.scale.z = THREE.MathUtils.damp(slot.group.scale.z, invSqrt, 14, dt);
      slot.group.scale.y = THREE.MathUtils.damp(slot.group.scale.y, slot.squash, 14, dt);

      // Idle breathing, tail wag, zoomies, and mouse head-tracking
      const model = slot.group.getObjectByName('catModel');
      if (model) {
        const energized = this.feverActive || this.zoomiesActive;
        const speed = energized ? 5.6 : 2.5;
        const t = elapsed * speed + slot.bobPhase;
        if (slot.kind === 'cat') {
          const hopAmp = energized ? 0.062 : 0.018;
          model.position.y = Math.max(0, Math.sin(t) * hopAmp);
          const head = model.getObjectByName('headGroup');
          if (head) {
            if (this.activeMouse) {
              const dx = this.activeMouse.group.position.x - slot.group.position.x;
              const dz = this.activeMouse.group.position.z - slot.group.position.z;
              const targetYaw = THREE.MathUtils.clamp(Math.atan2(dx, dz) * 0.55, -0.7, 0.7);
              head.rotation.y = THREE.MathUtils.damp(head.rotation.y, targetYaw, 10, dt);
              head.rotation.z = Math.sin(t * 1.4) * 0.09;
            } else {
              head.rotation.z = Math.sin(t * 0.7) * 0.045;
              head.rotation.y = Math.sin(t * 0.4) * 0.08;
            }
          }
          const tail = model.getObjectByName('tailGroup');
          if (tail) {
            tail.rotation.y = Math.sin(t * 1.9) * (energized ? 0.58 : 0.35);
          }
          const orbit = model.getObjectByName('floatingOrbit');
          if (orbit) {
            orbit.rotation.z = elapsed * (energized ? 2.8 : 1.6);
          }
        } else {
          // Crate playful hop
          model.rotation.y = Math.sin(t * 0.8) * 0.14;
          model.position.y = Math.abs(Math.sin(t * 1.4)) * 0.05;
        }
      }
    }

    // Visualize live event aura on the 3D board rim
    if (this.boardRimMat) {
      if (this.feverActive) {
        this.boardRimMat.emissive.set('#F97316');
        this.boardRimMat.emissiveIntensity = 0.85 + Math.sin(elapsed * 8) * 0.3;
      } else if (this.fishRainActive) {
        this.boardRimMat.emissive.set('#0EA5E9');
        this.boardRimMat.emissiveIntensity = 0.75 + Math.sin(elapsed * 6) * 0.25;
      } else if (this.zoomiesActive) {
        this.boardRimMat.emissive.set('#EC4899');
        this.boardRimMat.emissiveIntensity = 0.8 + Math.sin(elapsed * 9) * 0.28;
      } else if (this.flashSaleActive) {
        this.boardRimMat.emissive.set('#10B981');
        this.boardRimMat.emissiveIntensity = 0.7 + Math.sin(elapsed * 5) * 0.2;
      } else {
        this.boardRimMat.emissive.copy(this.boardRimMat.color);
        this.boardRimMat.emissiveIntensity = 0.14;
      }
    }

    // Passive income 3D coin glint visualization rising from active cats
    const sparkInterval = this.feverActive || this.zoomiesActive ? 0.32 : 0.68;
    this.incomeSparkTimer += dt;
    if (this.incomeSparkTimer >= sparkInterval) {
      this.incomeSparkTimer = 0;
      const catIndices: number[] = [];
      for (let i = 0; i < BOARD_SIZE; i++) {
        if (this.slots[i]?.kind === 'cat') catIndices.push(i);
      }
      if (catIndices.length > 0) {
        const pick = catIndices[Math.floor(Math.random() * catIndices.length)];
        const pos = getTileWorldPos(pick);
        const glint = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.03, 8),
          new THREE.MeshBasicMaterial({
            color: '#FFD147',
            transparent: true,
            opacity: 0.95,
          }),
        );
        glint.rotation.x = Math.PI / 2;
        glint.position.set(
          pos.x + (Math.random() - 0.5) * 0.3,
          0.75,
          pos.z + (Math.random() - 0.5) * 0.3,
        );
        this.boardGroup.add(glint);
        this.particles.push({
          mesh: glint,
          vel: new THREE.Vector3(0, 2.35, 0),
          rotVel: new THREE.Vector3(0, 7, 0),
          life: 0,
          maxLife: 0.55,
        });
      }
    }

    // Update live 3D Golden Mouse runner
    if (this.activeMouse) {
      const m = this.activeMouse;
      m.lifeLeft -= dt;
      const fromPt = m.waypoints[m.segIndex];
      const toPt = m.waypoints[m.segIndex + 1];

      if (!toPt || m.lifeLeft <= 0) {
        this.removeGoldenMouse(false);
      } else {
        const segLen = Math.max(0.2, fromPt.distanceTo(toPt));
        m.segProgress += (m.speed * dt) / segLen;
        if (m.segProgress >= 1) {
          m.segProgress = 0;
          m.segIndex++;
        }
        const curFrom = m.waypoints[m.segIndex];
        const curTo = m.waypoints[m.segIndex + 1];
        if (!curTo) {
          this.removeGoldenMouse(false);
        } else {
          m.group.position.lerpVectors(curFrom, curTo, m.segProgress);
          const dx = curTo.x - curFrom.x;
          const dz = curTo.z - curFrom.z;
          const targetAngle = Math.atan2(dx, dz);
          m.group.rotation.y = targetAngle;

          const model = m.group.getObjectByName('mouseModel');
          if (model) {
            model.position.y = Math.abs(Math.sin(elapsed * 16)) * 0.06;
            const key = model.getObjectByName('windupKey');
            if (key) {
              key.rotation.y += dt * 11;
            }
          }
        }
      }
    }

    // Update 3D ASMR Station (Soap Slicer / Kinetic Pop-Blocks)
    this.asmrGroup.position.x = THREE.MathUtils.damp(
      this.asmrGroup.position.x,
      this.asmrTargetPos.x,
      8,
      dt,
    );
    this.asmrGroup.position.z = THREE.MathUtils.damp(
      this.asmrGroup.position.z,
      this.asmrTargetPos.z,
      8,
      dt,
    );

    if (this.asmrMode === 'soap') {
      this.soapManualBoost = THREE.MathUtils.damp(this.soapManualBoost, 0, 5, dt);
      const prevProg = this.soapSliceProgress;
      this.soapSliceProgress += (this.soapSliceSpeed + this.soapManualBoost) * dt;
      if (prevProg < 0.78 && this.soapSliceProgress >= 0.78) {
        this.spawnSoapSliceCubes();
      }
      if (this.soapSliceProgress >= 1) {
        this.soapSliceProgress -= 1;
      }

      // Blade drops cleanly at 0.62..0.88, then lifts smoothly
      let bladeY = 0.98;
      if (this.soapSliceProgress > 0.62 && this.soapSliceProgress < 0.88) {
        const t = (this.soapSliceProgress - 0.62) / 0.26;
        bladeY = 0.98 - Math.sin(t * Math.PI) * 0.76;
      }
      this.soapBlade.position.y = bladeY;

      // Soap bar creeps gently forward between slices
      const creep = Math.min(0.22, this.soapSliceProgress * 0.26);
      this.soapBar.position.z = -0.2 + creep;
    } else if (this.asmrMode === 'pop') {
      this.popPulse = THREE.MathUtils.damp(this.popPulse, 0, 6, dt);
      this.popBlocks.forEach((blk) => {
        const phase = (blk.userData.phase as number) || 0;
        const wave = Math.sin(elapsed * 3.4 + phase) * 0.085;
        const tapBounce = this.popPulse * 0.16;
        blk.position.y = 0.16 + Math.max(-0.05, wave) + tapBounce;
      });
    }

    // Fish & Coin Rain Mini-Event Particles
    if (this.fishRainActive) {
      this.fishRainTimer += dt;
      if (this.fishRainTimer >= 0.09) {
        this.fishRainTimer = 0;
        const isGold = Math.random() < 0.7;
        const mesh = new THREE.Mesh(
          isGold
            ? new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8)
            : new THREE.OctahedronGeometry(0.13, 0),
          new THREE.MeshBasicMaterial({
            color: isGold ? '#FFD147' : '#4ECDC4',
            transparent: true,
            opacity: 1,
          }),
        );
        mesh.position.set(
          (Math.random() - 0.5) * 4.8,
          4.2,
          (Math.random() - 0.5) * 4.8,
        );
        this.boardGroup.add(mesh);
        this.particles.push({
          mesh,
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, -1.2, (Math.random() - 0.5) * 0.5),
          rotVel: new THREE.Vector3(3, 6, 3),
          life: 0,
          maxLife: 1.05,
        });
      }
    }

    // Update merge burst particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.boardGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 6.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;
      const ratio = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(ratio);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio;
    }

    // Update expanding 3D shockwave rings
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.boardGroup.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const prog = s.life / s.maxLife;
      const eased = 1 - Math.pow(1 - prog, 2);
      s.mesh.scale.setScalar(0.5 + eased * s.maxScale);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.85;
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointercancel', this.onPointerUp);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);
    window.removeEventListener('resize', this.onResize);

    disposeObject3D(this.scene);
    this.renderer.dispose();
    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
