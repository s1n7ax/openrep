/**
 * The 3D exercise scene: renderer, lights, floor with a soft contact shadow,
 * orbit controls, the figure with muscle glow and the props, and the playback
 * loop. Renders continuously only while an animation plays and the canvas is
 * visible; otherwise it renders on demand (camera moves, resize, `setTime`).
 */
import {
  Box3,
  CircleGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  RGBAFormat,
  Scene,
  ShadowMaterial,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Muscle } from '../schema/common.ts';
import type { Animation } from '../schema/animation.ts';
import { AnimationSampler, createSampledPose } from './animation.ts';
import { createFigure, type Figure } from './figure.ts';
import { attachMuscles, type MuscleOverlays } from './muscles.ts';
import { applyPose, createPoseResult } from './pose.ts';
import { createProps, type PropsController } from './props.ts';
import { STILL_POSE } from './stillPose.ts';

export type ViewPreset = 'default' | 'front' | 'side' | 'back' | 'top';

/** Camera directions (from the target) of the view presets. */
const VIEW_DIRECTIONS: Record<ViewPreset, Vector3> = {
  default: new Vector3(0.72, 0.36, 1).normalize(),
  front: new Vector3(0, 0.2, 1).normalize(),
  side: new Vector3(1, 0.22, 0.32).normalize(),
  back: new Vector3(-0.5, 0.35, -1).normalize(),
  top: new Vector3(0.35, 1.6, 0.6).normalize(),
};

const FOV = 30;
const FLOOR_RADIUS = 3;

export interface ViewerOptions {
  /** Called after every rendered frame with the total frame count. */
  onFrame?: (frames: number) => void;
}

export interface ExerciseContent {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  /** The looping movement, or null for a still figure. */
  animation: Pick<Animation, 'durationSec' | 'keyframes' | 'props' | 'camera'> | null;
}

/** A radial falloff texture for the floor disc (opaque centre, transparent rim). */
function floorTexture(): DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const t = Math.min(1, Math.max(0, (r - 0.25) / 0.75));
      const alpha = 1 - t * t * (3 - 2 * t);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class ExerciseViewer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.05, 60);
  readonly controls: OrbitControls;
  private readonly figure: Figure;
  private readonly muscles: MuscleOverlays;
  private props: PropsController | null = null;
  private sampler: AnimationSampler;
  private animated = false;
  private readonly pose = createSampledPose();
  private readonly poseResult = createPoseResult();
  private readonly floorMaterial: MeshBasicMaterial;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;

  private playing = true;
  private fixedTime: number | null = null;
  private time = 0;
  private lastTimestamp: number | null = null;
  private frameRequest: number | null = null;
  private renderPending = false;
  private visible = true;
  private frames = 0;
  private framedTarget = new Vector3(0, 0.9, 0);
  private framedDistance = 4;
  private viewPreset: ViewPreset = 'default';
  private viewZoom = 1;
  private viewFocus: Vector3 | null = null;
  private customCamera: { position: Vector3; target: Vector3 } | null = null;
  private disposed = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly options: ViewerOptions;

  constructor(canvas: HTMLCanvasElement, options: ViewerOptions = {}) {
    this.canvas = canvas;
    this.options = options;
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    this.renderer = renderer;

    const pmrem = new PMREMGenerator(renderer);
    const environment = new RoomEnvironment();
    const envTexture = pmrem.fromScene(environment, 0.04).texture;
    environment.dispose();
    pmrem.dispose();
    this.scene.environment = envTexture;
    this.scene.environmentIntensity = 0.36;
    this.disposables.push(envTexture);

    const hemisphere = new HemisphereLight('#eef3ff', '#3b352f', 0.55);
    this.scene.add(hemisphere);
    const key = new DirectionalLight('#fffaf4', 2.0);
    key.position.set(2.2, 5, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -2.4;
    key.shadow.camera.right = 2.4;
    key.shadow.camera.top = 2.4;
    key.shadow.camera.bottom = -2.4;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 12;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key, key.target);
    const rim = new DirectionalLight('#a8c6ff', 1.5);
    rim.position.set(-3, 2.6, -3.5);
    this.scene.add(rim);
    const fill = new DirectionalLight('#ffe9d6', 0.35);
    fill.position.set(-2.5, 1.2, 2.5);
    this.scene.add(fill);
    // Disposing the key light frees its 2048² shadow map.
    this.disposables.push(hemisphere, key, rim, fill);

    // Floor: a soft disc that fades out, plus a shadow catcher.
    const floorGeometry = new CircleGeometry(FLOOR_RADIUS, 96);
    floorGeometry.rotateX(-Math.PI / 2);
    const texture = floorTexture();
    this.floorMaterial = new MeshBasicMaterial({
      color: new Color('#8d96a3'),
      map: texture,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const floor = new Mesh(floorGeometry, this.floorMaterial);
    floor.renderOrder = -2;
    const shadowMaterial = new ShadowMaterial({
      color: '#0b0d12',
      opacity: 0.42,
      depthWrite: false,
    });
    const shadowCatcher = new Mesh(floorGeometry, shadowMaterial);
    shadowCatcher.receiveShadow = true;
    shadowCatcher.position.y = 0.0005;
    shadowCatcher.renderOrder = -1;
    this.scene.add(floor, shadowCatcher);
    this.disposables.push(floorGeometry, texture, this.floorMaterial, shadowMaterial);

    this.figure = createFigure();
    this.scene.add(this.figure.group);
    this.muscles = attachMuscles(this.figure);
    this.sampler = new AnimationSampler(STILL_POSE);

    const controls = new OrbitControls(this.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = false;
    controls.rotateSpeed = 0.8;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.addEventListener('change', () => this.requestRender());
    this.controls = controls;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting);
      this.updateLoop();
    });
    this.intersectionObserver.observe(canvas);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
  }

  private readonly onVisibilityChange = () => this.updateLoop();

  /** Shows an exercise: muscle glow plus its animation (or a still figure). */
  setContent(content: ExerciseContent): void {
    this.muscles.setGlow(content.primary, content.secondary);
    this.props?.group.removeFromParent();
    this.props?.dispose();
    this.props = null;
    const animation = content.animation;
    this.animated = animation !== null;
    this.sampler = new AnimationSampler(animation ?? STILL_POSE);
    if (animation) {
      this.sampler.sample(0, this.pose);
      this.props = createProps(animation.props, this.pose.pelvisPosition.clone());
      this.scene.add(this.props.group);
    }
    this.customCamera = animation?.camera
      ? {
          position: new Vector3(...animation.camera.position),
          target: new Vector3(...animation.camera.target),
        }
      : null;
    this.time = 0;
    this.lastTimestamp = null;
    this.frameContent();
    this.resetView();
    this.updateLoop();
  }

  /** Whether the content loops a movement. */
  get isAnimated(): boolean {
    return this.animated;
  }

  get frameCount(): number {
    return this.frames;
  }

  play(): void {
    this.playing = true;
    this.updateLoop();
  }

  pause(): void {
    this.playing = false;
    this.updateLoop();
  }

  /** Freezes the movement at loop time t (0–1), or resumes playback with null. */
  setTime(t: number | null): void {
    this.fixedTime = t;
    if (t !== null) this.time = t;
    this.lastTimestamp = null;
    this.requestRender();
    this.updateLoop();
  }

  /** Back to the initial camera of the current view preset. */
  resetView(): void {
    const target = (this.viewFocus ?? this.customCamera?.target ?? this.framedTarget).clone();
    let position: Vector3;
    if (this.customCamera && this.viewPreset === 'default' && !this.viewFocus) {
      // The animation's camera sets the angle; move back if the canvas is too narrow to fit.
      const offset = this.customCamera.position.clone().sub(this.customCamera.target);
      const distance = Math.max(offset.length(), this.framedDistance) / this.viewZoom;
      position = target.clone().addScaledVector(offset.normalize(), distance);
    } else {
      position = target
        .clone()
        .addScaledVector(VIEW_DIRECTIONS[this.viewPreset], this.framedDistance / this.viewZoom);
    }
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    const distance = position.distanceTo(target);
    this.controls.minDistance = Math.min(distance * 0.45, 1.2);
    this.controls.maxDistance = Math.max(distance * 2, 3);
    this.controls.update();
    this.requestRender();
  }

  /**
   * Chooses the camera direction; `zoom` > 1 moves closer and `focus` (world
   * point) replaces the framed target — used by review tooling.
   */
  setView(
    preset: ViewPreset,
    zoom = 1,
    focus: readonly [number, number, number] | null = null,
  ): void {
    this.viewPreset = preset;
    this.viewZoom = zoom > 0 ? zoom : 1;
    this.viewFocus = focus ? new Vector3(...focus) : null;
    this.resetView();
  }

  /**
   * Fits the camera to the figure over the whole loop, plus the props near it
   * (long bars and large machines may run out of the frame).
   */
  private frameContent(): void {
    const figureBox = new Box3();
    const propsBox = new Box3();
    const part = new Box3();
    const samples = this.animated ? [0, 0.25, 0.5, 0.75] : [0];
    for (const t of samples) {
      this.applyAt(t);
      figureBox.union(part.setFromObject(this.figure.group, true));
      if (this.props) propsBox.union(part.setFromObject(this.props.group, true));
    }
    const box = figureBox.clone();
    if (!propsBox.isEmpty()) box.union(propsBox.intersect(figureBox.clone().expandByScalar(0.3)));
    const sphere = box.getBoundingSphere(new Sphere());
    this.framedTarget.copy(sphere.center);
    this.framedTarget.y = Math.max(0.35, sphere.center.y);
    const halfFov = ((FOV / 2) * Math.PI) / 180;
    const aspect = Math.max(this.camera.aspect, 0.5);
    const fit = sphere.radius / Math.sin(halfFov) / Math.min(1, aspect);
    this.framedDistance = Math.max(1.6, fit * 0.92);
    this.applyAt(this.time);
  }

  private applyAt(t: number): void {
    this.sampler.sample(t, this.pose);
    applyPose(this.figure.rig, this.pose, this.props?.poseContext, this.poseResult);
    this.figure.applyPoseResult(this.poseResult);
    this.props?.update(this.figure.rig);
  }

  private resize(): void {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private get shouldAnimate(): boolean {
    return (
      this.animated &&
      this.playing &&
      this.fixedTime === null &&
      this.visible &&
      document.visibilityState !== 'hidden' &&
      !this.disposed
    );
  }

  private updateLoop(): void {
    if (this.shouldAnimate) this.schedule();
  }

  private requestRender(): void {
    this.renderPending = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.frameRequest !== null || this.disposed) return;
    this.frameRequest = requestAnimationFrame((timestamp) => {
      this.frameRequest = null;
      this.tick(timestamp);
    });
  }

  private tick(timestamp: number): void {
    const animate = this.shouldAnimate;
    if (animate) {
      if (this.lastTimestamp !== null) {
        const delta = Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
        this.time = (this.time + delta / this.sampler.durationSec) % 1;
      }
      this.lastTimestamp = timestamp;
    } else {
      this.lastTimestamp = null;
    }
    const cameraMoved = this.controls.update();
    if (animate || cameraMoved || this.renderPending) {
      this.renderPending = false;
      this.frame();
    }
    if (animate || cameraMoved) this.schedule();
  }

  private frame(): void {
    if (this.disposed) return;
    this.applyAt(this.fixedTime ?? this.time);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.options.onFrame?.(this.frames);
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.controls.dispose();
    this.props?.dispose();
    this.muscles.dispose();
    this.figure.dispose();
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
    // Release the WebGL context now rather than whenever the canvas is
    // garbage-collected: WebViews allow only a few live contexts, and every
    // exercise page creates one.
    this.renderer.forceContextLoss();
  }
}
