/**
 * Writes the figure asset as a binary glTF 2.0 file: one skinned mesh with the
 * custom vertex attributes described in `src/lib/three/figureAsset.ts`, and
 * the skeleton as a node hierarchy in its bind pose.
 */
import type { FigureBoneData } from '../../src/lib/three/figureAsset.ts';

export interface FigureMeshData {
  positions: Float32Array;
  indices: Uint16Array;
  skinIndex: Uint8Array;
  skinWeight: Uint8Array;
  muscleGroups: Uint8Array;
  muscleCover: Uint8Array;
  cavity: Uint8Array;
  bones: FigureBoneData[];
  inverseBindMatrices: Float32Array;
  /** Free-form metadata (source, licence) stored in the asset's `extras`. */
  extras: Record<string, unknown>;
}

const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const FLOAT = 5126;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

function pad4(length: number): number {
  return (length + 3) & ~3;
}

export function writeGlb(data: FigureMeshData): Buffer {
  const chunks: Buffer[] = [];
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  let byteLength = 0;

  const add = (
    array: ArrayBufferView,
    accessor: Record<string, unknown>,
    target: number | null,
    byteStride?: number,
  ): number => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const padded = Buffer.alloc(pad4(bytes.length));
    bytes.copy(padded);
    bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: bytes.length,
      ...(byteStride ? { byteStride } : {}),
      ...(target ? { target } : {}),
    });
    chunks.push(padded);
    byteLength += padded.length;
    accessors.push({ bufferView: bufferViews.length - 1, ...accessor });
    return accessors.length - 1;
  };

  const vertexCount = data.positions.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertexCount; i++) {
    for (let a = 0; a < 3; a++) {
      const value = data.positions[i * 3 + a] ?? 0;
      min[a] = Math.min(min[a] ?? 0, value);
      max[a] = Math.max(max[a] ?? 0, value);
    }
  }
  const attributes = {
    POSITION: add(
      data.positions,
      { componentType: FLOAT, count: vertexCount, type: 'VEC3', min, max },
      ARRAY_BUFFER,
    ),
    JOINTS_0: add(
      data.skinIndex,
      { componentType: UNSIGNED_BYTE, count: vertexCount, type: 'VEC4' },
      ARRAY_BUFFER,
    ),
    WEIGHTS_0: add(
      data.skinWeight,
      { componentType: UNSIGNED_BYTE, normalized: true, count: vertexCount, type: 'VEC4' },
      ARRAY_BUFFER,
    ),
    _MUSCLE_GROUPS: add(
      data.muscleGroups,
      { componentType: UNSIGNED_BYTE, count: vertexCount, type: 'VEC4' },
      ARRAY_BUFFER,
    ),
    _MUSCLE_COVER: add(
      data.muscleCover,
      { componentType: UNSIGNED_BYTE, normalized: true, count: vertexCount, type: 'VEC4' },
      ARRAY_BUFFER,
    ),
    // Single bytes need a 4-byte stride in a vertex buffer view.
    _CAVITY: add(
      (() => {
        const strided = new Uint8Array(vertexCount * 4);
        for (let i = 0; i < vertexCount; i++) strided[i * 4] = data.cavity[i] ?? 255;
        return strided;
      })(),
      { componentType: UNSIGNED_BYTE, normalized: true, count: vertexCount, type: 'SCALAR' },
      ARRAY_BUFFER,
      4,
    ),
  };
  const indices = add(
    data.indices,
    { componentType: UNSIGNED_SHORT, count: data.indices.length, type: 'SCALAR' },
    ELEMENT_ARRAY_BUFFER,
  );
  const inverseBindMatrices = add(
    data.inverseBindMatrices,
    { componentType: FLOAT, count: data.bones.length, type: 'MAT4' },
    null,
  );

  const boneIndex = new Map(data.bones.map((bone, index) => [bone.name, index]));
  const nodes: Record<string, unknown>[] = data.bones.map((bone) => {
    const children = data.bones
      .map((other, index) => (other.parent === bone.name ? index : -1))
      .filter((index) => index >= 0);
    return {
      name: bone.name,
      translation: bone.position,
      rotation: bone.quaternion,
      ...(children.length > 0 ? { children } : {}),
    };
  });
  const meshNode = nodes.length;
  nodes.push({ name: 'figure', mesh: 0, skin: 0 });
  const roots = data.bones.filter((bone) => bone.parent === null).map((b) => boneIndex.get(b.name));

  const json = {
    asset: { version: '2.0', generator: 'OpenRep scripts/figure/generate-figure.ts' },
    extras: data.extras,
    scene: 0,
    scenes: [{ nodes: [meshNode, ...roots] }],
    nodes,
    meshes: [{ name: 'figure', primitives: [{ attributes, indices, mode: 4 }] }],
    skins: [{ joints: data.bones.map((_, index) => index), inverseBindMatrices }],
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };

  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.alloc(pad4(jsonBytes.length), 0x20);
  jsonBytes.copy(jsonChunk);
  const binChunk = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const chunkHeader = (length: number, type: number) => {
    const out = Buffer.alloc(8);
    out.writeUInt32LE(length, 0);
    out.writeUInt32LE(type, 4);
    return out;
  };
  return Buffer.concat([
    header,
    chunkHeader(jsonChunk.length, 0x4e4f534a),
    jsonChunk,
    chunkHeader(binChunk.length, 0x004e4942),
    binChunk,
  ]);
}
