import { Component, ElementRef, effect, input, signal, viewChild } from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Matrix4,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

type StagePose = {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  objectX: number;
  objectY: number;
  rotationX: number;
  rotationY: number;
};

type StoryPose = StagePose & {
  cardX: number;
  cardY: number;
  cardZ: number;
  cardRotationX: number;
  cardRotationY: number;
  cardRotationZ: number;
  cardOpacity: number;
  scanGlow: number;
  displayMix: number;
};

type TimedStoryPose = StoryPose & {
  timelineProgress: number;
};

type ProductScene = {
  label: string;
  progress: number;
  focus: Vector3;
  camera: { x: number; y: number; z: number };
  object: { x: number; y: number; rotationX: number; rotationY: number };
  card: { x: number; y: number; z: number; rotationX: number; rotationY: number; rotationZ: number; opacity: number };
  scanGlow: number;
  displayMix: number;
};

const productFocusPoints = {
  // Normalized presentation targets, kept central so later fine-tuning stays low-friction.
  overview: new Vector3(0, 0.06, 0),
  nfc: new Vector3(-0.02, -0.18, -0.36),
  display: new Vector3(0, 0.64, -0.52),
  speaker: new Vector3(-0.06, -0.9, -0.28),
} as const;

const displayTextures = {
  ready: '/nfc_display.png',
  numberPicker: '/nfc_display_number.png',
} as const;

const cardTextures = {
  front: '/nfc_card_front.png',
  back: '/nfc_card_back.png',
} as const;

const cardGeometryConfig = {
  width: 0.74,
  height: 1.05,
  depth: 0.018,
  radius: 0.055,
  segments: 8,
} as const;

const cardMotion = {
  hidden: { x: -1.85, y: -0.56, z: 1.15, rotationX: -0.32, rotationY: -0.44, rotationZ: -0.18, opacity: 0 },
  appear: { x: -1.55, y: -0.5, z: 1.05, rotationX: -0.28, rotationY: -0.36, rotationZ: -0.12, opacity: 1 },
  heroCard: { x: -1.32, y: -0.4, z: 0.98, rotationX: -0.16, rotationY: -0.2, rotationZ: -0.06, opacity: 1 },
  frontPresentation: { x: -1.02, y: -0.16, z: 0.78, rotationX: -0.08, rotationY: -0.16, rotationZ: 0.05, opacity: 1 },
  backPresentation: { x: -0.72, y: -0.02, z: 0.64, rotationX: -0.04, rotationY: 2.64, rotationZ: 0.02, opacity: 1 },
  scanApproach: { x: -0.34, y: -0.1, z: 1.24, rotationX: -0.18, rotationY: 2.96, rotationZ: -0.08, opacity: 1 },
  scanStop: { x: -0.02, y: -0.08, z: 1.86, rotationX: -0.16, rotationY: 3.02, rotationZ: -0.03, opacity: 1 },
  scanExit: { x: 0.42, y: -0.74, z: 1.56, rotationX: -0.1, rotationY: 3.02, rotationZ: 0.04, opacity: 0 },
  final: { x: -1.14, y: -0.18, z: 0.74, rotationX: -0.08, rotationY: 2.72, rotationZ: -0.08, opacity: 0 },
} as const;

const desktopProductScenes: ProductScene[] = [
  {
    label: 'Overview',
    progress: 0,
    focus: productFocusPoints.overview,
    camera: { x: 0.2, y: 0.34, z: 7.25 },
    object: { x: 0.34, y: 0.03, rotationX: 0.18, rotationY: 2.62 },
    card: cardMotion.hidden,
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'NFC close-up',
    progress: 0.15,
    focus: productFocusPoints.nfc,
    camera: { x: 0.62, y: -0.02, z: 4.05 },
    object: { x: -0.38, y: 0.36, rotationX: -0.06, rotationY: 3.16 },
    card: cardMotion.hidden,
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'Card appears',
    progress: 0.22,
    focus: new Vector3(-0.72, -0.28, 0.28),
    camera: { x: -0.34, y: 0.1, z: 5.35 },
    object: { x: 0.76, y: 0.14, rotationX: 0.08, rotationY: 3.08 },
    card: cardMotion.appear,
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'Card hero',
    progress: 0.34,
    focus: new Vector3(-0.88, -0.3, 0.32),
    camera: { x: -0.42, y: 0.0, z: 4.85 },
    object: { x: 0.9, y: 0.1, rotationX: 0.04, rotationY: 3.16 },
    card: cardMotion.heroCard,
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'Card presentation front',
    progress: 0.42,
    focus: new Vector3(-0.62, -0.1, 0.32),
    camera: { x: -0.24, y: 0.16, z: 4.75 },
    object: { x: 0.82, y: 0.02, rotationX: 0.08, rotationY: 3.22 },
    card: cardMotion.frontPresentation,
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'Card presentation back',
    progress: 0.47,
    focus: new Vector3(-0.52, -0.06, 0.24),
    camera: { x: -0.14, y: 0.18, z: 4.55 },
    object: { x: 0.64, y: 0.0, rotationX: 0.1, rotationY: 3.2 },
    card: cardMotion.backPresentation,
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'Card flight',
    progress: 0.58,
    focus: productFocusPoints.nfc,
    camera: { x: 0.38, y: -0.02, z: 4.22 },
    object: { x: -0.18, y: 0.28, rotationX: -0.04, rotationY: 3.16 },
    card: cardMotion.scanApproach,
    scanGlow: 0.08,
    displayMix: 0,
  },
  {
    label: 'NFC scan',
    progress: 0.64,
    focus: productFocusPoints.nfc,
    camera: { x: 0.52, y: -0.04, z: 3.82 },
    object: { x: -0.32, y: 0.34, rotationX: -0.06, rotationY: 3.16 },
    card: cardMotion.scanStop,
    scanGlow: 1,
    displayMix: 0.78,
  },
  {
    label: 'Display lift',
    progress: 0.7,
    focus: new Vector3(-0.02, 0.24, -0.48),
    camera: { x: 0.2, y: 0.3, z: 3.94 },
    object: { x: -0.1, y: 0.06, rotationX: -0.02, rotationY: 3.15 },
    card: { ...cardMotion.scanExit, opacity: 0.16 },
    scanGlow: 0.36,
    displayMix: 1,
  },
  {
    label: 'Display response',
    progress: 0.76,
    focus: productFocusPoints.display,
    camera: { x: 0.04, y: 0.66, z: 3.62 },
    object: { x: 0.02, y: -0.14, rotationX: 0.02, rotationY: 3.14 },
    card: cardMotion.scanExit,
    scanGlow: 0,
    displayMix: 1,
  },
  {
    label: 'Speaker transition',
    progress: 0.84,
    focus: new Vector3(-0.04, -0.62, -0.3),
    camera: { x: 0.42, y: 0.72, z: 5.1 },
    object: { x: -0.44, y: 0.68, rotationX: -0.66, rotationY: 2.9 },
    card: { ...cardMotion.scanStop, opacity: 0 },
    scanGlow: 0,
    displayMix: 1,
  },
  {
    label: 'Speaker close-up',
    progress: 0.9,
    focus: productFocusPoints.speaker,
    camera: { x: 0.42, y: 0.72, z: 4.3 },
    object: { x: -0.46, y: 1.02, rotationX: -0.94, rotationY: 2.88 },
    card: { ...cardMotion.scanStop, opacity: 0 },
    scanGlow: 0,
    displayMix: 1,
  },
  {
    label: 'Final overview',
    progress: 1,
    focus: productFocusPoints.overview,
    camera: { x: 0.18, y: 0.42, z: 7.05 },
    object: { x: 0.08, y: 0.04, rotationX: 0.16, rotationY: 2.72 },
    card: cardMotion.final,
    scanGlow: 0,
    displayMix: 1,
  },
] as const satisfies ProductScene[];

const compactProductScenes: ProductScene[] = [
  {
    label: 'Overview',
    progress: 0,
    focus: productFocusPoints.overview,
    camera: { x: 0, y: 0.34, z: 8.35 },
    object: { x: 0.05, y: 0.16, rotationX: 0.18, rotationY: 2.62 },
    card: { ...cardMotion.hidden, x: -1.1 },
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'NFC close-up',
    progress: 0.15,
    focus: productFocusPoints.nfc,
    camera: { x: 0.24, y: 0.04, z: 6.35 },
    object: { x: -0.12, y: 0.34, rotationX: -0.06, rotationY: 3.16 },
    card: { ...cardMotion.hidden, x: -1.1 },
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'Card appears',
    progress: 0.22,
    focus: new Vector3(-0.42, -0.32, 0.28),
    camera: { x: -0.12, y: 0.04, z: 7.2 },
    object: { x: 0.34, y: 0.18, rotationX: 0.08, rotationY: 3.08 },
    card: { ...cardMotion.appear, x: -0.72, y: -0.64, z: 1.0 },
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'Card hero',
    progress: 0.34,
    focus: new Vector3(-0.46, -0.34, 0.28),
    camera: { x: -0.1, y: 0.0, z: 6.8 },
    object: { x: 0.42, y: 0.16, rotationX: 0.04, rotationY: 3.16 },
    card: { ...cardMotion.heroCard, x: -0.68, y: -0.6, z: 0.94 },
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'Card presentation',
    progress: 0.47,
    focus: new Vector3(-0.3, -0.08, 0.18),
    camera: { x: -0.04, y: 0.14, z: 6.35 },
    object: { x: 0.34, y: 0.08, rotationX: 0.08, rotationY: 3.2 },
    card: { ...cardMotion.backPresentation, x: -0.38, y: -0.18 },
    scanGlow: 0,
    displayMix: 0,
  },
  {
    label: 'Card flight',
    progress: 0.58,
    focus: productFocusPoints.nfc,
    camera: { x: 0.18, y: 0.02, z: 6.25 },
    object: { x: -0.08, y: 0.3, rotationX: -0.04, rotationY: 3.16 },
    card: { ...cardMotion.scanApproach, x: -0.18 },
    scanGlow: 0.08,
    displayMix: 0,
  },
  {
    label: 'NFC scan',
    progress: 0.64,
    focus: productFocusPoints.nfc,
    camera: { x: 0.24, y: 0.0, z: 5.9 },
    object: { x: -0.1, y: 0.34, rotationX: -0.06, rotationY: 3.16 },
    card: { ...cardMotion.scanStop, x: -0.02 },
    scanGlow: 1,
    displayMix: 0.78,
  },
  {
    label: 'Display lift',
    progress: 0.7,
    focus: new Vector3(-0.02, 0.24, -0.48),
    camera: { x: 0.12, y: 0.28, z: 6.08 },
    object: { x: -0.04, y: 0.14, rotationX: -0.02, rotationY: 3.15 },
    card: { ...cardMotion.scanExit, x: 0.18, y: -0.64, opacity: 0.14 },
    scanGlow: 0.32,
    displayMix: 1,
  },
  {
    label: 'Display response',
    progress: 0.76,
    focus: productFocusPoints.display,
    camera: { x: 0.04, y: 0.54, z: 6.1 },
    object: { x: 0.02, y: 0.06, rotationX: 0.04, rotationY: 3.14 },
    card: { ...cardMotion.scanExit, x: 0.24, y: -0.72 },
    scanGlow: 0,
    displayMix: 1,
  },
  {
    label: 'Speaker transition',
    progress: 0.84,
    focus: new Vector3(-0.04, -0.62, -0.3),
    camera: { x: 0.22, y: 0.64, z: 6.55 },
    object: { x: -0.22, y: 0.68, rotationX: -0.62, rotationY: 2.92 },
    card: { ...cardMotion.scanStop, opacity: 0 },
    scanGlow: 0,
    displayMix: 1,
  },
  {
    label: 'Speaker close-up',
    progress: 0.9,
    focus: productFocusPoints.speaker,
    camera: { x: 0.22, y: 0.64, z: 5.65 },
    object: { x: -0.22, y: 0.98, rotationX: -0.9, rotationY: 2.9 },
    card: { ...cardMotion.scanStop, opacity: 0 },
    scanGlow: 0,
    displayMix: 1,
  },
  {
    label: 'Final overview',
    progress: 1,
    focus: productFocusPoints.overview,
    camera: { x: 0, y: 0.34, z: 8.2 },
    object: { x: 0, y: 0.14, rotationX: 0.16, rotationY: 2.72 },
    card: { ...cardMotion.final, x: -0.62, y: -0.24 },
    scanGlow: 0,
    displayMix: 1,
  },
] as const satisfies ProductScene[];

const displayPlaneConfig = {
  rawCenter: new Vector3(-107.5, 98.802, 12.465),
  rawRight: new Vector3(-1, 0, 0),
  rawUp: new Vector3(0, 0.97437, -0.22495).normalize(),
  rawNormal: new Vector3(0, -0.22495, -0.97437).normalize(),
  rawWidth: 47,
  rawHeight: 35.25,
  rawNormalOffset: 1.08,
} as const;

@Component({
  selector: 'nfc-product-viewer',
  templateUrl: './product-viewer.component.html',
  styleUrl: './product-viewer.component.scss',
})
export class NfcProductViewerComponent {
  readonly scrollRoot = input<HTMLElement | null>(null);
  private readonly canvasHost = viewChild.required<ElementRef<HTMLDivElement>>('canvasHost');

  protected readonly loadError = signal<string | null>(null);
  protected readonly modelReady = signal(false);
  protected readonly reducedMotion = signal(false);
  protected readonly activeSection = signal(0);
  protected readonly progressSegments = [0, 1, 2, 3, 4, 5, 6];

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private readonly stage = new Group();
  private readonly modelGroup = new Group();
  private readonly cardGroup = new Group();
  private readonly scanGroup = new Group();
  private readonly lookAtTarget = new Vector3();
  private displayMaterial: MeshBasicMaterial | null = null;
  private displayNumberMaterial: MeshBasicMaterial | null = null;
  private displayDimMaterial: MeshBasicMaterial | null = null;
  private cardOpacityMaterials: Material[] = [];
  private nfcGlowMaterial: MeshBasicMaterial | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private mediaQueryListener: ((event: MediaQueryListEvent) => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private visibilityObserver: IntersectionObserver | null = null;
  private animationFrameId: number | null = null;
  private scrollTimeline: gsap.core.Timeline | null = null;
  private compactViewport = false;
  private stageVisible = true;
  private readonly pose: StoryPose = {
    cameraX: 0.22,
    cameraY: 0.42,
    cameraZ: 7.15,
    targetX: 0.06,
    targetY: 0.16,
    targetZ: 0,
    objectX: 0.48,
    objectY: 0.02,
    rotationX: 0.2,
    rotationY: 1.1,
    cardX: cardMotion.hidden.x,
    cardY: cardMotion.hidden.y,
    cardZ: cardMotion.hidden.z,
    cardRotationX: cardMotion.hidden.rotationX,
    cardRotationY: cardMotion.hidden.rotationY,
    cardRotationZ: cardMotion.hidden.rotationZ,
    cardOpacity: 0,
    scanGlow: 0,
    displayMix: 0,
  };
  private destroyed = false;

  constructor() {
    gsap.registerPlugin(ScrollTrigger);

    effect(() => {
      const root = this.scrollRoot();
      const reduceMotion = this.reducedMotion();
      if (!this.renderer || !root) {
        return;
      }
      this.configureScrollTimeline(root, reduceMotion);
    });
  }

  async ngAfterViewInit() {
    this.initializeReducedMotion();
    this.initializeScene();
    await this.loadModel();
    this.observeResize();
    this.observeVisibility();
    this.configureScrollTimelineIfReady();
    this.renderLoop();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.scrollTimeline?.kill();
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    if (this.mediaQuery && this.mediaQueryListener) {
      this.mediaQuery.removeEventListener('change', this.mediaQueryListener);
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.stage.traverse((child: Object3D) => this.disposeObjectResources(child));
    this.renderer?.dispose();
    const canvas = this.renderer?.domElement;
    if (canvas?.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
  }

  private initializeReducedMotion() {
    this.mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion.set(this.mediaQuery.matches);
    this.mediaQueryListener = (event) => this.reducedMotion.set(event.matches);
    this.mediaQuery.addEventListener('change', this.mediaQueryListener);
  }

  private initializeScene() {
    const host = this.canvasHost().nativeElement;
    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: window.innerWidth >= 900,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.4 : 1.85));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.fog = new Fog(new Color('rgb(5,6,6)'), 9, 19);
    const camera = new PerspectiveCamera(31, Math.max(host.clientWidth / Math.max(host.clientHeight, 1), 1), 0.1, 100);
    camera.position.set(this.pose.cameraX, this.pose.cameraY, this.pose.cameraZ);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.stage.add(this.modelGroup, this.cardGroup, this.scanGroup);
    scene.add(this.stage);

    const ambientLight = new AmbientLight(new Color('rgb(255,255,255)'), 2.15);
    const keyLight = new DirectionalLight(new Color('rgb(210,244,255)'), 3.2);
    keyLight.position.set(4.8, 4.8, 5.8);

    const rimLight = new DirectionalLight(new Color('rgb(52,211,153)'), 2.05);
    rimLight.position.set(-5.2, 2.7, -4.4);

    const fillLight = new DirectionalLight(new Color('rgb(251,191,36)'), 1.55);
    fillLight.position.set(1.2, -1.6, 5.2);

    const detailLight = new DirectionalLight(new Color('rgb(255,247,226)'), 2.35);
    detailLight.position.set(0.8, -3.4, 4.6);

    const speakerDetailLight = new DirectionalLight(new Color('rgb(125,211,252)'), 1.25);
    speakerDetailLight.position.set(-1.4, -2.8, 4.4);

    scene.add(ambientLight, keyLight, rimLight, fillLight, detailLight, speakerDetailLight);

    this.updateCamera();
  }

  private async loadModel() {
    try {
      const [materials, readyDisplayTexture, numberPickerTexture, cardFrontTexture, cardBackTexture] = await Promise.all([
        new MTLLoader().loadAsync('/nfc_reader.mtl'),
        new TextureLoader().loadAsync(displayTextures.ready),
        new TextureLoader().loadAsync(displayTextures.numberPicker),
        new TextureLoader().loadAsync(cardTextures.front),
        new TextureLoader().loadAsync(cardTextures.back),
      ]);
      if (this.destroyed) {
        return;
      }
      materials.preload();
      this.configureDisplayTexture(readyDisplayTexture);
      this.configureDisplayTexture(numberPickerTexture);
      this.configureCardTexture(cardFrontTexture);
      this.configureCardTexture(cardBackTexture);

      const object = await new OBJLoader().setMaterials(materials).loadAsync('/nfc_reader.obj');
      if (this.destroyed) {
        readyDisplayTexture.dispose();
        numberPickerTexture.dispose();
        cardFrontTexture.dispose();
        cardBackTexture.dispose();
        return;
      }
      this.modelGroup.clear();
      this.enhanceSpeakerMaterial(object);
      this.addDisplayPlane(object, readyDisplayTexture, numberPickerTexture);
      this.modelGroup.add(this.normalizeModel(object));
      this.createStoryObjects(cardFrontTexture, cardBackTexture);
      this.modelReady.set(true);
      this.updateCamera();
    } catch {
      this.loadError.set('Das OBJ-Modell konnte nicht geladen werden.');
    }
  }

  private normalizeModel(object: Object3D) {
    const bounds = new Box3().setFromObject(object);
    const size = bounds.getSize(new Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.85 / maxAxis;

    object.scale.setScalar(scale);

    const scaledBounds = new Box3().setFromObject(object);
    const centeredX = -(scaledBounds.min.x + scaledBounds.max.x) / 2;
    const centeredZ = -(scaledBounds.min.z + scaledBounds.max.z) / 2;
    const displayLift = -scaledBounds.min.y - (scaledBounds.max.y - scaledBounds.min.y) * 0.46;
    object.position.set(centeredX, displayLift, centeredZ);

    return object;
  }

  private configureDisplayTexture(texture: Texture) {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer?.capabilities.getMaxAnisotropy() ?? 1, 8);
    texture.needsUpdate = true;
  }

  private configureCardTexture(texture: Texture) {
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = Math.min(this.renderer?.capabilities.getMaxAnisotropy() ?? 1, 8);
    texture.needsUpdate = true;
  }

  private addDisplayPlane(object: Object3D, readyTexture: Texture, numberTexture: Texture) {
    const displayMaterial = new MeshBasicMaterial({
      map: readyTexture,
      transparent: true,
      side: DoubleSide,
      toneMapped: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.displayMaterial = displayMaterial;
    const displayPlane = new Mesh(
      new PlaneGeometry(displayPlaneConfig.rawWidth, displayPlaneConfig.rawHeight),
      displayMaterial,
    );
    displayPlane.name = 'Display texture overlay';
    displayPlane.renderOrder = 2;
    displayPlane.position.copy(
      displayPlaneConfig.rawCenter
        .clone()
        .add(displayPlaneConfig.rawNormal.clone().multiplyScalar(displayPlaneConfig.rawNormalOffset)),
    );
    displayPlane.quaternion.setFromRotationMatrix(
      new Matrix4().makeBasis(displayPlaneConfig.rawRight, displayPlaneConfig.rawUp, displayPlaneConfig.rawNormal),
    );
    object.add(displayPlane);

    const numberMaterial = new MeshBasicMaterial({
      map: numberTexture,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.displayNumberMaterial = numberMaterial;
    const numberPlane = displayPlane.clone();
    numberPlane.name = 'Display number texture overlay';
    numberPlane.material = numberMaterial;
    numberPlane.renderOrder = 3;
    numberPlane.position.add(displayPlaneConfig.rawNormal.clone().multiplyScalar(0.08));
    object.add(numberPlane);

    this.displayDimMaterial = new MeshBasicMaterial({
      color: new Color('rgb(0,0,0)'),
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const dimPlane = displayPlane.clone();
    dimPlane.name = 'Display texture fade overlay';
    dimPlane.material = this.displayDimMaterial;
    dimPlane.renderOrder = 4;
    dimPlane.position.add(displayPlaneConfig.rawNormal.clone().multiplyScalar(0.12));
    object.add(dimPlane);
  }

  private enhanceSpeakerMaterial(object: Object3D) {
    object.traverse((child) => {
      if (!(child instanceof Mesh) || !child.name.toLowerCase().includes('laut')) {
        return;
      }
      child.material = new MeshPhysicalMaterial({
        color: new Color('rgb(4,6,6)'),
        roughness: 0.76,
        metalness: 0,
        clearcoat: 0.3,
        clearcoatRoughness: 0.46,
        emissive: new Color('rgb(0,18,20)'),
        emissiveIntensity: 0.42,
      });
    });
  }

  private createStoryObjects(cardFrontTexture: Texture, cardBackTexture: Texture) {
    this.cardGroup.clear();
    this.scanGroup.clear();
    this.cardOpacityMaterials = [];
    this.cardGroup.add(this.createCard(cardFrontTexture, cardBackTexture));
    this.createScanEffect();
    this.applyStoryPose();
  }

  private createCard(cardFrontTexture: Texture, cardBackTexture: Texture) {
    const group = new Group();
    group.name = 'NFC card';
    group.renderOrder = 20;

    const edgeMaterial = new MeshPhysicalMaterial({
      color: new Color('rgb(255,255,255)'),
      roughness: 0.42,
      metalness: 0.02,
      clearcoat: 0.32,
      clearcoatRoughness: 0.28,
      transparent: true,
      depthTest: false,
    });
    const frontMaterial = new MeshBasicMaterial({
      map: cardFrontTexture,
      transparent: true,
      toneMapped: false,
      depthTest: false,
    });
    const backMaterial = new MeshBasicMaterial({
      map: cardBackTexture,
      transparent: true,
      toneMapped: false,
      depthTest: false,
    });
    this.cardOpacityMaterials.push(edgeMaterial, frontMaterial, backMaterial);

    const card = new Mesh(this.createRoundedCardGeometry(), [frontMaterial, backMaterial, edgeMaterial]);
    card.name = 'NFC card single body';
    card.renderOrder = 20;
    group.add(card);
    return group;
  }

  private createRoundedCardGeometry() {
    const { width, height, depth, radius, segments } = cardGeometryConfig;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const halfDepth = depth / 2;
    const cornerRadius = Math.min(radius, halfWidth, halfHeight);
    const perimeter: Array<{ x: number; y: number }> = [];

    const addCorner = (centerX: number, centerY: number, startAngle: number, endAngle: number) => {
      for (let index = 0; index <= segments; index += 1) {
        const angle = startAngle + (endAngle - startAngle) * (index / segments);
        perimeter.push({
          x: centerX + Math.cos(angle) * cornerRadius,
          y: centerY + Math.sin(angle) * cornerRadius,
        });
      }
    };

    addCorner(halfWidth - cornerRadius, halfHeight - cornerRadius, 0, Math.PI / 2);
    addCorner(-halfWidth + cornerRadius, halfHeight - cornerRadius, Math.PI / 2, Math.PI);
    addCorner(-halfWidth + cornerRadius, -halfHeight + cornerRadius, Math.PI, Math.PI * 1.5);
    addCorner(halfWidth - cornerRadius, -halfHeight + cornerRadius, Math.PI * 1.5, Math.PI * 2);

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const addVertex = (x: number, y: number, z: number) => {
      positions.push(x, y, z);
      uvs.push((x + halfWidth) / width, (y + halfHeight) / height);
      return positions.length / 3 - 1;
    };

    const frontCenter = addVertex(0, 0, halfDepth);
    const frontStart = positions.length / 3;
    perimeter.forEach((point) => addVertex(point.x, point.y, halfDepth));

    const backCenter = addVertex(0, 0, -halfDepth);
    const backStart = positions.length / 3;
    perimeter.forEach((point) => addVertex(point.x, point.y, -halfDepth));

    const frontIndexStart = indices.length;
    perimeter.forEach((_, index) => {
      const nextIndex = (index + 1) % perimeter.length;
      indices.push(frontCenter, frontStart + index, frontStart + nextIndex);
    });

    const backIndexStart = indices.length;
    perimeter.forEach((_, index) => {
      const nextIndex = (index + 1) % perimeter.length;
      indices.push(backCenter, backStart + nextIndex, backStart + index);
    });

    const edgeIndexStart = indices.length;
    perimeter.forEach((_, index) => {
      const nextIndex = (index + 1) % perimeter.length;
      const frontCurrent = frontStart + index;
      const frontNext = frontStart + nextIndex;
      const backCurrent = backStart + index;
      const backNext = backStart + nextIndex;
      indices.push(frontCurrent, backCurrent, frontNext, frontNext, backCurrent, backNext);
    });

    const geometry = new BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.addGroup(frontIndexStart, perimeter.length * 3, 0);
    geometry.addGroup(backIndexStart, perimeter.length * 3, 1);
    geometry.addGroup(edgeIndexStart, perimeter.length * 6, 2);
    geometry.computeVertexNormals();
    return geometry;
  }

  private createScanEffect() {
    const glowMaterial = new MeshBasicMaterial({
      color: new Color('rgb(68,230,255)'),
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    this.nfcGlowMaterial = glowMaterial;
    const glow = new Mesh(new PlaneGeometry(0.86, 0.42), glowMaterial);
    glow.name = 'NFC scan area glow';
    glow.position.set(-0.06, -0.22, -0.28);
    glow.rotation.set(1.34, 0, 0);
    glow.renderOrder = 9;
    this.scanGroup.add(glow);
  }

  private observeResize() {
    this.resizeObserver = new ResizeObserver(() => {
      this.refreshViewport();
      ScrollTrigger.refresh();
    });
    this.resizeObserver.observe(this.canvasHost().nativeElement);
    this.refreshViewport();
  }

  private observeVisibility() {
    if (!('IntersectionObserver' in window)) {
      return;
    }
    const host = this.canvasHost().nativeElement;
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.stageVisible = entry?.isIntersecting ?? true;
      if (this.stageVisible && this.animationFrameId === null) {
        this.renderLoop();
      }
    });
    this.visibilityObserver.observe(host);
  }

  private refreshViewport() {
    if (!this.renderer || !this.camera) {
      return;
    }
    const host = this.canvasHost().nativeElement;
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.4 : 1.85));
    this.renderer.setSize(width, height);
    const nextCompactViewport = width < 760;
    const viewportChanged = nextCompactViewport !== this.compactViewport;
    this.compactViewport = nextCompactViewport;
    this.camera.aspect = width / height;
    this.camera.fov = this.compactViewport ? 49 : 31;
    this.camera.updateProjectionMatrix();
    if (viewportChanged) {
      this.configureScrollTimelineIfReady();
    }
  }

  private configureScrollTimelineIfReady() {
    const root = this.scrollRoot();
    if (!this.renderer || !root) {
      return;
    }
    this.configureScrollTimeline(root, this.reducedMotion());
  }

  private configureScrollTimeline(root: HTMLElement, reduceMotion: boolean) {
    this.scrollTimeline?.kill();
    this.activeSection.set(0);
    const compact = this.compactViewport;

    const segments = [
      ...(compact ? compactProductScenes : desktopProductScenes).map((scene) => this.sceneToPose(scene, reduceMotion)),
    ] satisfies TimedStoryPose[];

    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        scrub: reduceMotion ? 0.15 : 0.35,
        invalidateOnRefresh: true,
        onUpdate: (trigger) => {
          const nextSection = Math.min(6, Math.max(0, Math.floor(trigger.progress * 7.2)));
          this.activeSection.set(nextSection);
        },
      },
    });

    Object.assign(this.pose, segments[0]);
    this.updateCamera();

    segments.slice(1).forEach((segment, index) => {
      const previous = segments[index];
      const { timelineProgress, ...poseTarget } = segment;
      timeline.to(this.pose, {
        ...poseTarget,
        duration: Math.max(0.01, timelineProgress - previous.timelineProgress),
      });
    });

    this.scrollTimeline = timeline;
  }

  private sceneToPose(scene: ProductScene, reduceMotion: boolean): TimedStoryPose {
    return {
      timelineProgress: scene.progress,
      cameraX: scene.camera.x,
      cameraY: scene.camera.y,
      cameraZ: reduceMotion ? scene.camera.z + 0.6 : scene.camera.z,
      targetX: scene.focus.x,
      targetY: scene.focus.y,
      targetZ: scene.focus.z,
      objectX: scene.object.x,
      objectY: scene.object.y,
      rotationX: scene.object.rotationX,
      rotationY: scene.object.rotationY,
      cardX: scene.card.x,
      cardY: scene.card.y,
      cardZ: scene.card.z,
      cardRotationX: scene.card.rotationX,
      cardRotationY: scene.card.rotationY,
      cardRotationZ: scene.card.rotationZ,
      cardOpacity: scene.card.opacity,
      scanGlow: reduceMotion ? 0 : scene.scanGlow,
      displayMix: scene.displayMix,
    };
  }

  private updateCamera() {
    if (!this.camera) {
      return;
    }
    this.lookAtTarget.set(this.pose.targetX, this.pose.targetY, this.pose.targetZ);
    this.camera.position.set(this.pose.cameraX, this.pose.cameraY, this.pose.cameraZ);
    this.camera.lookAt(this.lookAtTarget);
  }

  private renderLoop = () => {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }
    if (!this.stageVisible) {
      this.animationFrameId = null;
      return;
    }

    const idleEnabled = !this.reducedMotion();
    const time = performance.now() * 0.001;
    const idleX = idleEnabled ? Math.sin(time * 0.62) * 0.018 : 0;
    const idleY = idleEnabled ? Math.cos(time * 0.88) * 0.024 : 0;
    const idleRotation = idleEnabled ? Math.sin(time * 0.33) * 0.045 : 0;

    this.modelGroup.scale.setScalar(this.compactViewport ? 0.78 : 1);
    this.modelGroup.position.set(this.pose.objectX + idleX, this.pose.objectY + idleY, 0);
    this.modelGroup.rotation.set(this.pose.rotationX, this.pose.rotationY + idleRotation, 0.02);
    this.applyStoryPose();

    this.lookAtTarget.set(
      this.pose.targetX,
      this.pose.targetY + (idleEnabled ? Math.cos(time * 0.4) * 0.02 : 0),
      this.pose.targetZ,
    );
    this.camera.position.set(
      this.pose.cameraX + (idleEnabled ? Math.sin(time * 0.4) * 0.06 : 0),
      this.pose.cameraY,
      this.pose.cameraZ,
    );
    this.camera.lookAt(this.lookAtTarget);

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  private disposeObjectResources(object: Object3D) {
    if (!(object instanceof Mesh)) {
      return;
    }
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material: Material) => {
      const materialWithMap = material as Material & { map?: Texture | null };
      materialWithMap.map?.dispose();
      material.dispose();
    });
  }

  private applyStoryPose() {
    this.cardGroup.position.set(this.pose.cardX, this.pose.cardY, this.pose.cardZ);
    this.cardGroup.rotation.set(this.pose.cardRotationX, this.pose.cardRotationY, this.pose.cardRotationZ);
    this.cardGroup.visible = this.pose.cardOpacity > 0.01;
    this.setMaterialOpacity(this.cardOpacityMaterials, this.pose.cardOpacity);

    const glowOpacity = Math.min(1, Math.max(0, this.pose.scanGlow));
    if (this.nfcGlowMaterial) {
      this.nfcGlowMaterial.opacity = glowOpacity * 0.14;
    }
    this.scanGroup.visible = glowOpacity > 0.01;

    const mix = Math.max(0, Math.min(1, this.pose.displayMix));
    const smoothMix = mix * mix * (3 - 2 * mix);
    if (this.displayMaterial) {
      this.displayMaterial.opacity = 1 - smoothMix;
    }
    if (this.displayNumberMaterial) {
      this.displayNumberMaterial.opacity = smoothMix;
    }
    if (this.displayDimMaterial) {
      this.displayDimMaterial.opacity = Math.sin(mix * Math.PI) * 0.26;
    }
  }

  private setMaterialOpacity(materials: Material[], opacity: number) {
    materials.forEach((material) => {
      material.opacity = opacity;
      material.transparent = true;
    });
  }
}
