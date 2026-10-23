import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSCLES } from '../schema/common.ts';
import { FIGURE_BONES, NO_MUSCLE, parseFigureAsset } from './figureAsset.ts';
import { createRig, JOINT_NAMES } from './rig.ts';

const url = new URL('./assets/figure.glb', import.meta.url);
const file = readFileSync(url);
const asset = parseFigureAsset(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
);

describe('figure asset', () => {
  it('adds no more than about 10 MB to the app', () => {
    expect(statSync(url).size).toBeLessThan(10 * 1024 * 1024);
  });

  it('is skinned to the animation rig: same joints, same offsets', () => {
    expect(asset.bones.map((bone) => bone.name)).toEqual(FIGURE_BONES.map((bone) => bone.name));
    const rig = createRig();
    for (const name of JOINT_NAMES) {
      if (name === 'pelvis') continue;
      const bone = asset.bones.find((candidate) => candidate.name === name);
      const offset = rig.joints[name].position;
      expect(bone?.position[0], `${name}.x`).toBeCloseTo(offset.x, 4);
      expect(bone?.position[1], `${name}.y`).toBeCloseTo(offset.y, 4);
      expect(bone?.position[2], `${name}.z`).toBeCloseTo(offset.z, 4);
    }
  });

  it('has normalised skin weights on every vertex', () => {
    for (let v = 0; v < asset.vertexCount; v++) {
      let sum = 0;
      for (let i = 0; i < 4; i++) sum += asset.skinWeight[v * 4 + i] ?? 0;
      if (sum !== 255) expect.fail(`vertex ${v}: weights sum to ${sum}`);
    }
  });

  it('paints every muscle group fully over part of the body', () => {
    const covered = new Map<number, number>();
    for (let i = 0; i < asset.muscleGroups.length; i++) {
      const group = asset.muscleGroups[i] ?? NO_MUSCLE;
      if (group !== NO_MUSCLE && (asset.muscleCover[i] ?? 0) > 240) {
        covered.set(group, (covered.get(group) ?? 0) + 1);
      }
    }
    for (const [index, muscle] of MUSCLES.entries()) {
      expect(covered.get(index) ?? 0, muscle).toBeGreaterThan(100);
    }
  });
});
