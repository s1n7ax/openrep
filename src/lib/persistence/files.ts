/**
 * Text files in the app's private data directory, and a crash-safe way to
 * replace one.
 */

/**
 * The file operations persistence needs. Paths are relative to the app's
 * private data directory and use "/" separators. Implemented with
 * `@capacitor/filesystem` in the app (`capacitorFiles.ts`) and in memory in tests.
 */
export interface TextFiles {
  /**
   * Names of the files in `dir`; empty when the directory does not exist.
   * Rejects when it exists but cannot be listed.
   */
  list(dir: string): Promise<string[]>;
  /** The UTF-8 content of a file. Rejects when it cannot be read. */
  read(path: string): Promise<string>;
  /** Creates or replaces a file as UTF-8, creating missing parent directories. */
  write(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Renames a file; the target must not exist. */
  rename(from: string, to: string): Promise<void>;
}

/** Name of the temporary file a crash-safe write goes through. */
export function tmpName(name: string): string {
  return `${name}.tmp`;
}

/**
 * Replaces `dir/name` with `text` so that a crash at any point leaves either
 * the old or the new content readable: write `name.tmp`, delete `name`,
 * rename `name.tmp` to `name`. Readers prefer `name` and fall back to
 * `name.tmp` (see `readWithFallback`).
 *
 * Rejects with the file system's error when a step fails.
 */
export async function writeFileAtomically(
  files: TextFiles,
  dir: string,
  name: string,
  text: string,
): Promise<void> {
  const tmp = `${dir}/${tmpName(name)}`;
  await files.write(tmp, text);
  if ((await files.list(dir)).includes(name)) await files.remove(`${dir}/${name}`);
  await files.rename(tmp, `${dir}/${name}`);
}

/** Outcome of reading a file written by `writeFileAtomically`. */
export type FallbackRead<T> = {
  /** The parsed content, or null when no valid copy was found. */
  value: T | null;
  /** Which copy the value came from. */
  source: 'main' | 'tmp' | null;
  /** Copies that existed but could not be read or parsed, with the reason. */
  invalid: { name: string; error: unknown }[];
};

/**
 * Reads `dir/name`, falling back to `dir/name.tmp` when the main file is
 * missing or invalid. `parse` turns the text into a value and throws when
 * the content is not valid. Rejects with the file system's error when `dir`
 * cannot be listed.
 */
export async function readWithFallback<T>(
  files: TextFiles,
  dir: string,
  name: string,
  parse: (text: string) => T,
): Promise<FallbackRead<T>> {
  const present = new Set(await files.list(dir));
  const invalid: FallbackRead<T>['invalid'] = [];
  const candidates = [
    { name, source: 'main' as const },
    { name: tmpName(name), source: 'tmp' as const },
  ];
  for (const candidate of candidates) {
    if (!present.has(candidate.name)) continue;
    try {
      const value = parse(await files.read(`${dir}/${candidate.name}`));
      return { value, source: candidate.source, invalid };
    } catch (error) {
      invalid.push({ name: candidate.name, error });
    }
  }
  return { value: null, source: null, invalid };
}
