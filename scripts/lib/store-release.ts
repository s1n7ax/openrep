/**
 * The per-release files of the store listing: the "what's new" text (from
 * release-please's CHANGELOG.md) that Google Play and F-Droid show for a
 * versionCode, and the version fields of the F-Droid build recipe.
 */

/** Longest "what's new" text Google Play and F-Droid accept, in characters. */
export const RELEASE_NOTES_MAX_LENGTH = 500;

/** CHANGELOG.md has no section for the version. */
export class ChangelogSectionNotFoundError extends Error {
  override name = 'ChangelogSectionNotFoundError';
}

/** The F-Droid recipe does not have exactly one of a version field it must have. */
export class RecipeFormatError extends Error {
  override name = 'RecipeFormatError';
}

/** The version in a release-please section heading (`## 0.1.0 (…)`, `## [0.2.0](…) (…)`). */
const SECTION_HEADING = /^## \[?(\d+\.\d+\.\d+)\]?(?=[\s(]|$)/;

/**
 * The lines of `version`'s CHANGELOG.md section, without its `## ` heading.
 *
 * @throws {ChangelogSectionNotFoundError} when no section is headed with `version`.
 */
export function changelogSection(changelog: string, version: string): string[] {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => SECTION_HEADING.exec(line)?.[1] === version);
  if (start === -1) {
    throw new ChangelogSectionNotFoundError(`CHANGELOG.md has no section for ${version}`);
  }
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

/** A changelog line as plain text: no commit and issue links, emphasis or code marks. */
function plainText(markdown: string): string {
  return (
    markdown
      // The commit and pull request links release-please appends: ([#1](…)) ([319cc97](…))
      .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, '')
      // ", closes [#12](…)"
      .replace(/,?\s*closes\s+\[[^\]]*\]\([^)]*\)/gi, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|__|`/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Length in characters (code points), as the stores count it. */
function length(text: string): number {
  return [...text].length;
}

interface NotesGroup {
  heading: string;
  items: string[];
}

/** The `### ` groups of a section and their bullet points, as plain text. */
function groups(section: string[]): NotesGroup[] {
  const result: NotesGroup[] = [];
  for (const line of section) {
    const heading = /^###\s+(.*)$/.exec(line);
    const item = /^\s*[*-]\s+(.*)$/.exec(line);
    if (heading) {
      result.push({ heading: plainText(heading[1]!), items: [] });
    } else if (item) {
      if (result.length === 0) result.push({ heading: '', items: [] });
      result.at(-1)!.items.push(plainText(item[1]!));
    } else if (line.trim() && result.at(-1)?.items.length) {
      // A wrapped bullet point (release-please wraps breaking-change notes).
      const items = result.at(-1)!.items;
      items[items.length - 1] = `${items.at(-1)} ${plainText(line)}`;
    }
  }
  return result.filter((group) => group.items.length > 0);
}

function render(list: NotesGroup[]): string {
  return list
    .map(({ heading, items }) =>
      [...(heading ? [heading] : []), ...items.map((item) => `• ${item}`)].join('\n'),
    )
    .join('\n\n');
}

/**
 * The "what's new" text of `version` for Google Play and F-Droid: its
 * CHANGELOG.md section as plain text (a line per group heading, a bullet per
 * entry), at most {@link RELEASE_NOTES_MAX_LENGTH} characters. When it is
 * longer, the last entries are left out and a link to `releaseUrl` (the
 * GitHub release, which has all of them) ends the text.
 *
 * @throws {ChangelogSectionNotFoundError} when CHANGELOG.md has no section for `version`.
 */
export function releaseNotes(changelog: string, version: string, releaseUrl: string): string {
  const list = groups(changelogSection(changelog, version));
  const full = render(list);
  if (full === '') return `Version ${version}: ${releaseUrl}`;
  if (length(full) <= RELEASE_NOTES_MAX_LENGTH) return full;

  // Leave out entries from the end until the text and the link fit.
  const more = `\n\nAll changes: ${releaseUrl}`;
  const budget = RELEASE_NOTES_MAX_LENGTH - length(more);
  const entries = list.flatMap(({ heading, items }) => items.map((item) => ({ heading, item })));
  for (let count = entries.length - 1; count > 0; count--) {
    const text = render(regroup(entries.slice(0, count)));
    if (length(text) <= budget) return `${text}${more}`;
  }
  // Even the first entry is too long: shorten it.
  const [{ heading, item }] = entries as [{ heading: string; item: string }];
  const head = render([{ heading, items: [''] }]);
  return `${head}${[...item].slice(0, budget - length(head) - 1).join('')}…${more}`;
}

/** Entries back in groups, in order. */
function regroup(entries: { heading: string; item: string }[]): NotesGroup[] {
  const result: NotesGroup[] = [];
  for (const { heading, item } of entries) {
    if (result.at(-1)?.heading === heading) result.at(-1)!.items.push(item);
    else result.push({ heading, items: [item] });
  }
  return result;
}

/** The recipe fields that carry the version, with the value each gets. */
function versionFields(version: string, versionCode: number): [RegExp, string][] {
  return [
    [/^( {2}- versionName: ).*$/gm, version],
    [/^( {4}versionCode: ).*$/gm, String(versionCode)],
    [/^( {4}commit: ).*$/gm, `v${version}`],
    [/^(CurrentVersion: ).*$/gm, version],
    [/^(CurrentVersionCode: ).*$/gm, String(versionCode)],
  ];
}

/**
 * The F-Droid recipe `recipe` (fdroiddata's YAML format, one `Builds` entry)
 * with its build and CurrentVersion fields set to `version`, `versionCode`
 * and the tag `v<version>`.
 *
 * @throws {RecipeFormatError} when a field is missing or there is more than one `Builds` entry.
 */
export function stampFdroidRecipe(recipe: string, version: string, versionCode: number): string {
  let result = recipe;
  for (const [field, value] of versionFields(version, versionCode)) {
    const count = recipe.match(field)?.length ?? 0;
    if (count !== 1) {
      throw new RecipeFormatError(
        `the F-Droid recipe must have exactly one line matching ${field.source}, found ${count}`,
      );
    }
    result = result.replace(field, (_line, key: string) => `${key}${value}`);
  }
  return result;
}
