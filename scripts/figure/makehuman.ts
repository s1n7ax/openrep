/**
 * The MakeHuman assets the figure is built from, and readers for their file
 * formats. MakeHuman's bundled assets (base mesh, targets, skeleton and
 * weights) are released under CC0 1.0 — see THIRD_PARTY_NOTICES.md.
 *
 * Every file is pinned by repository commit and SHA-256, downloaded once into
 * a cache directory and verified before use.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MAKEHUMAN_REPOSITORY = 'https://github.com/makehumancommunity/makehuman';
export const MAKEHUMAN_COMMIT = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482';
const RAW_BASE = `https://raw.githubusercontent.com/makehumancommunity/makehuman/${MAKEHUMAN_COMMIT}/makehuman/data/`;

/** Files used, relative to `makehuman/data/`, with their SHA-256. */
export const MAKEHUMAN_FILES: Readonly<Record<string, string>> = {
  '3dobjs/base.obj': '8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c',
  'rigs/default.mhskel': '99f179bce0aa850b45d4191a1d0d234c5851f881c057439470ded3bddf729a24',
  'rigs/default_weights.mhw': '0f3641d651ae3d00ad6b4ccee43142edb109d3bd909d27d9e4139ef1beed8625',
  'targets/macrodetails/african-male-young.target':
    '894abc1fbb3d28543a51fef16f89d5d4bdf9aa2e1534413339811a3d47818b7d',
  'targets/macrodetails/asian-male-young.target':
    'ed2e8c191cb6b87b4a2d97c80486acb2604fa549316c7aa2a738a5d5a14334dc',
  'targets/macrodetails/caucasian-male-young.target':
    '70e228ba7164737dae664454394536fc5935fa48d333c1a97d77e2dc6eacc5f5',
  'targets/macrodetails/universal-male-young-maxmuscle-averageweight.target':
    'c171ff9cc95e96273beb3e3b1969a01988c2d4982ebc6fe04bf81cf72ee3b295',
  'targets/macrodetails/universal-male-young-maxmuscle-minweight.target':
    '5873f11edc96fde72a79ec35fa1d292a6a1a594b5eadfd82d59faf48834561de',
  'targets/macrodetails/universal-male-young-averagemuscle-minweight.target':
    'fac0d53b7051f4d1f06230d0b419e916eb5bae5ce67c031a9998fdde05229755',
  'targets/macrodetails/proportions/male-young-maxmuscle-averageweight-idealproportions.target':
    'd9452857903d18a2100ca26105d5a61083e7064fbe16f035863446728755ec20',
  'targets/macrodetails/proportions/male-young-maxmuscle-minweight-idealproportions.target':
    'd9452857903d18a2100ca26105d5a61083e7064fbe16f035863446728755ec20',
  'targets/measure/measure-shoulder-dist-decr.target':
    '15034d390da69ce7a3e46dfee0e248d0649bf6fc0bfec575b4cacf48b7a1ba5a',
  'targets/measure/measure-upperarm-length-incr.target':
    '274fef021ec84e4f646e82aa1df39fe9cc781fc872f0159ee815a04f970248a9',
  'targets/measure/measure-lowerarm-length-decr.target':
    '87287a1546234e55b7081192659a335af0ac0ff88bdebb732577352a088d87fa',
  'targets/measure/measure-lowerleg-height-decr.target':
    '267a461a42209dc1547fba016179646d38f9148fa177867e234b6018a404e98a',
  'targets/measure/measure-napetowaist-dist-incr.target':
    '3e26eb2b0a52f8ce874cfa2f307f47606f6909f8a68c7f49b50123bf1d94ecb0',
  'targets/measure/measure-neck-height-decr.target':
    'dd7e5fc0cb52cc4b43521b6386bb2503bf46f19d469269a5b0dd0c6d217d1ed6',
  'targets/torso/torso-muscle-pectoral-incr.target':
    '0299c687b73a5e217d00273da99acb8a983c8a83640177062fdc27d20bdce77b',
  'targets/torso/torso-muscle-dorsi-incr.target':
    'a9eb27874c600716c4ac058caf922671c6556427f00373d0d31c7615d31ded56',
  'targets/torso/torso-vshape-incr.target':
    '9d0ac9eec39a14d51d7db50e48292b3db67aed9b91e654b379f4dbe348644684',
  'targets/stomach/stomach-pregnant-decr.target':
    'c312c72444527d7db00e84a144d15ea7a9ebe43dfdd6673936ddac3c46a75e1b',
  'targets/armslegs/l-upperarm-muscle-incr.target':
    '61440e900b9e65748005e837b129abd48b1cd8fb98a653a2288a1bd3ace810d7',
  'targets/armslegs/r-upperarm-muscle-incr.target':
    'cf81df0a8d38bd66742d017dbcfe77f180659dfd61ed3fc94cb25751ccd4417b',
  'targets/armslegs/l-upperarm-shoulder-muscle-incr.target':
    '0d1994d9d45b5f7b5d4884262514fee53c6fd111bce1cc931a6fcb69f60aa8b6',
  'targets/armslegs/r-upperarm-shoulder-muscle-incr.target':
    '33d8d39af985071484836ebda826ab50332408256b1e6d2ab2240d480fd00295',
  'targets/armslegs/l-lowerarm-muscle-incr.target':
    '68511185971789f16fc625788f6abd61bfee61d5580b015745ad4fa7faa83d6b',
  'targets/armslegs/r-lowerarm-muscle-incr.target':
    'f4c207478c621e2ac9c0c1e6e1e67803e25a7ee083fe2aa8e31cf831d20d1ab3',
  'targets/armslegs/l-upperleg-muscle-incr.target':
    'f5804422cee551ab197a7e41b4d1a9c25d5f7c2d8277e0615c1b61341bc65647',
  'targets/armslegs/r-upperleg-muscle-incr.target':
    '833d03f125d75a933164e69918fdc075080ea453a11091a132f58f3d68f7def8',
  'targets/armslegs/l-lowerleg-muscle-incr.target':
    '5c4323925e92e0875d4a3ce5e72db3ee0394dc865183349ac12ac8051dc1bd53',
  'targets/armslegs/r-lowerleg-muscle-incr.target':
    'e2d438a2ef32948d77316343f7882cfabe5cfe447b8b96bc31131c6812f10792',
};

/** A downloaded file does not match its pinned hash. */
export class AssetHashMismatchError extends Error {
  override name = 'AssetHashMismatchError';
}

/** A download failed. */
export class AssetDownloadError extends Error {
  override name = 'AssetDownloadError';
}

/** A MakeHuman file is not shaped the way the generator expects. */
export class MakeHumanFormatError extends Error {
  override name = 'MakeHumanFormatError';
}

function formatError(message: string): MakeHumanFormatError {
  console.error(message);
  return new MakeHumanFormatError(message);
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Returns the contents of a pinned MakeHuman file, downloading it into
 * `cacheDir` first when it is missing or the cached copy does not match its
 * pinned hash. Only a download that matches the hash is cached.
 *
 * @throws {AssetDownloadError} when the download fails.
 * @throws {AssetHashMismatchError} when the downloaded file does not match its pinned hash.
 */
export async function readMakeHumanFile(cacheDir: string, file: string): Promise<string> {
  const expected = MAKEHUMAN_FILES[file];
  if (!expected) {
    const message = `${file} is not a pinned MakeHuman file`;
    console.error(message);
    throw new AssetDownloadError(message);
  }
  const local = path.join(cacheDir, MAKEHUMAN_COMMIT, file);
  const cached = await readFile(local).catch(() => null);
  if (cached && sha256(cached) === expected) return cached.toString('utf8');

  const url = RAW_BASE + file;
  const response = await fetch(url);
  if (!response.ok) {
    const message = `Download of ${url} failed: HTTP ${response.status}`;
    console.error(message);
    throw new AssetDownloadError(message);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const actual = sha256(data);
  if (actual !== expected) {
    const message = `${url}: SHA-256 ${actual} does not match the pinned ${expected}`;
    console.error(message);
    throw new AssetHashMismatchError(message);
  }
  await mkdir(path.dirname(local), { recursive: true });
  await writeFile(local, data);
  return data.toString('utf8');
}

// ── Formats ──────────────────────────────────────────────────────────────────

export interface BaseMesh {
  /** Every vertex of the base mesh (body and helpers), in decimetres. */
  positions: Float64Array;
  /** Quads of the "body" group (4 vertex indices each). */
  bodyQuads: Uint32Array;
}

/**
 * Reads `base.obj`: all vertices and the quads of the body group.
 *
 * @throws {MakeHumanFormatError} when the body group has a face that is not a quad.
 */
export function parseBaseMesh(text: string): BaseMesh {
  const positions: number[] = [];
  const quads: number[] = [];
  let group = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x = '0', y = '0', z = '0'] = line.trim().split(/\s+/);
      positions.push(Number(x), Number(y), Number(z));
    } else if (line.startsWith('g ')) {
      group = line.slice(2).trim();
    } else if (line.startsWith('f ') && group === 'body') {
      const face = line
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((token) => Number(token.split('/')[0]) - 1);
      if (face.length !== 4) throw formatError(`The body group has a ${face.length}-sided face`);
      quads.push(...face);
    }
  }
  return { positions: Float64Array.from(positions), bodyQuads: Uint32Array.from(quads) };
}

/** Adds `weight` × a target (`index dx dy dz` lines) to `positions`. */
export function applyTarget(positions: Float64Array, text: string, weight: number): void {
  if (weight === 0) return;
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const [index = 0, dx = 0, dy = 0, dz = 0] = line.trim().split(/\s+/).map(Number);
    positions[index * 3] = (positions[index * 3] ?? 0) + weight * dx;
    positions[index * 3 + 1] = (positions[index * 3 + 1] ?? 0) + weight * dy;
    positions[index * 3 + 2] = (positions[index * 3 + 2] ?? 0) + weight * dz;
  }
}

export interface MakeHumanBone {
  name: string;
  parent: string | null;
  /** Joint names whose vertex sets locate the bone's head and tail. */
  head: string;
  tail: string;
}

export interface MakeHumanSkeleton {
  bones: Map<string, MakeHumanBone>;
  /** Joint name → base-mesh vertices whose centroid is the joint. */
  joints: Map<string, number[]>;
}

export function parseSkeleton(text: string): MakeHumanSkeleton {
  const json = JSON.parse(text) as {
    bones: Record<string, { parent: string | null; head: string; tail: string }>;
    joints: Record<string, number[]>;
  };
  const bones = new Map<string, MakeHumanBone>();
  for (const [name, bone] of Object.entries(json.bones)) {
    bones.set(name, { name, parent: bone.parent, head: bone.head, tail: bone.tail });
  }
  return { bones, joints: new Map(Object.entries(json.joints)) };
}

/** Bone name → [vertex, weight] pairs. */
export type MakeHumanWeights = Map<string, [number, number][]>;

export function parseWeights(text: string): MakeHumanWeights {
  const json = JSON.parse(text) as { weights: Record<string, [number, number][]> };
  return new Map(Object.entries(json.weights));
}

/**
 * Centroid of a joint's vertices.
 *
 * @throws {MakeHumanFormatError} when the skeleton has no such joint.
 */
export function jointPosition(
  skeleton: MakeHumanSkeleton,
  positions: Float64Array,
  joint: string,
): [number, number, number] {
  const vertices = skeleton.joints.get(joint);
  if (!vertices || vertices.length === 0) throw formatError(`Unknown MakeHuman joint ${joint}`);
  const out: [number, number, number] = [0, 0, 0];
  for (const v of vertices) {
    out[0] += (positions[v * 3] ?? 0) / vertices.length;
    out[1] += (positions[v * 3 + 1] ?? 0) / vertices.length;
    out[2] += (positions[v * 3 + 2] ?? 0) / vertices.length;
  }
  return out;
}
