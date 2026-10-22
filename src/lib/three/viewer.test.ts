import type { DirectionalLight, Light, WebGLRenderTarget } from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** The renderers the viewer created (three's WebGLRenderer needs a real WebGL context). */
const renderers = vi.hoisted(() => [] as { dispose: () => void; forceContextLoss: () => void }[]);

vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    shadowMap = { enabled: false, type: three.PCFShadowMap };
    toneMapping = three.NoToneMapping;
    toneMappingExposure = 1;
    setPixelRatio = vi.fn();
    setClearColor = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();
    constructor() {
      renderers.push(this);
    }
  }
  class FakePMREMGenerator {
    fromScene() {
      return { texture: new three.Texture() };
    }
    dispose() {}
  }
  return { ...three, WebGLRenderer: FakeRenderer, PMREMGenerator: FakePMREMGenerator };
});

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = { set: () => {}, copy: () => {} };
    addEventListener() {}
    update() {
      return false;
    }
    dispose() {}
  },
}));

class FakeObserver {
  observe() {}
  disconnect() {}
}

describe('ExerciseViewer.dispose', () => {
  beforeAll(() => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('ResizeObserver', FakeObserver);
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('frees the lights, the shadow map and the WebGL context', async () => {
    const { ExerciseViewer } = await import('./viewer.ts');
    const canvas = { clientWidth: 300, clientHeight: 200 } as HTMLCanvasElement;
    const viewer = new ExerciseViewer(canvas);
    const renderer = renderers.at(-1)!;

    const lights: Light[] = [];
    viewer.scene.traverse((object) => {
      if ((object as Light).isLight) lights.push(object as Light);
    });
    const caster = lights.find((light) => light.castShadow) as DirectionalLight;
    // The shadow map exists once a frame was rendered with shadows.
    const shadowMap = { dispose: vi.fn() };
    caster.shadow.map = shadowMap as unknown as WebGLRenderTarget;
    const lightDisposals = lights.map((light) => vi.spyOn(light, 'dispose'));

    viewer.dispose();

    expect(shadowMap.dispose).toHaveBeenCalled();
    for (const disposal of lightDisposals) expect(disposal).toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalled();
    expect(renderer.forceContextLoss).toHaveBeenCalled();
  });
});
