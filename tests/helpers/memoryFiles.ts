import type { TextFiles } from '../../src/lib/persistence/files.ts';

/** File system error raised by the in-memory `TextFiles`. */
export class MemoryFilesError extends Error {
  override name = 'MemoryFilesError';
}

/** Which operations of `MemoryFiles` should fail, for failure-path tests. */
export interface MemoryFilesFailures {
  list?: (dir: string) => boolean;
  read?: (path: string) => boolean;
  write?: (path: string) => boolean;
  remove?: (path: string) => boolean;
  rename?: (from: string, to: string) => boolean;
}

/** An in-memory `TextFiles`, standing in for `@capacitor/filesystem` in tests. */
export class MemoryFiles implements TextFiles {
  readonly files = new Map<string, string>();
  readonly log: string[] = [];
  fail: MemoryFilesFailures = {};

  constructor(initial: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(initial)) this.files.set(path, text);
  }

  async list(dir: string): Promise<string[]> {
    if (this.fail.list?.(dir)) throw new MemoryFilesError(`cannot list ${dir}`);
    const prefix = `${dir}/`;
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map((path) => path.slice(prefix.length));
  }

  async read(path: string): Promise<string> {
    this.log.push(`read ${path}`);
    const text = this.files.get(path);
    if (text === undefined || this.fail.read?.(path)) {
      throw new MemoryFilesError(`cannot read ${path}`);
    }
    return text;
  }

  async write(path: string, text: string): Promise<void> {
    this.log.push(`write ${path}`);
    if (this.fail.write?.(path)) throw new MemoryFilesError(`cannot write ${path}`);
    this.files.set(path, text);
  }

  async remove(path: string): Promise<void> {
    this.log.push(`remove ${path}`);
    if (!this.files.has(path) || this.fail.remove?.(path)) {
      throw new MemoryFilesError(`cannot remove ${path}`);
    }
    this.files.delete(path);
  }

  async rename(from: string, to: string): Promise<void> {
    this.log.push(`rename ${from} ${to}`);
    const text = this.files.get(from);
    if (text === undefined || this.files.has(to) || this.fail.rename?.(from, to)) {
      throw new MemoryFilesError(`cannot rename ${from} to ${to}`);
    }
    this.files.delete(from);
    this.files.set(to, text);
  }
}
