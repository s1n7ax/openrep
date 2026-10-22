/**
 * Reads `THIRD_PARTY_NOTICES.md` (the single source of the notices) into the
 * list Settings shows: the summary table and each work's licence text.
 */

export interface Notice {
  name: string;
  url: string | null;
  usedFor: string;
  licence: string;
  /** Notes and the licence text from the work's `## <name>` section. */
  text: string;
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** `[three.js](https://…)` → name and URL; plain text → name only. */
function parseLink(cell: string): { name: string; url: string | null } {
  const match = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(cell);
  return match ? { name: match[1] ?? cell, url: match[2] ?? null } : { name: cell, url: null };
}

/** Markdown inline code marks removed: "in `data/`" → "in data/". */
function stripCode(text: string): string {
  return text.replace(/`([^`]+)`/g, '$1');
}

/**
 * Section text: prose paragraphs unwrapped onto one line each, code blocks
 * (the licence texts) kept line by line, fences and inline code marks removed.
 */
function plainText(lines: readonly string[]): string {
  const out: string[] = [];
  let inCode = false;
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length > 0) out.push(paragraph.join(' '), '');
    paragraph = [];
  };
  for (const line of lines) {
    if (line.startsWith('```')) {
      endParagraph();
      inCode = !inCode;
    } else if (inCode) {
      out.push(line);
    } else if (line.trim() === '') {
      endParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  endParagraph();
  return stripCode(out.join('\n')).trim();
}

/** The notices in table order, each with the text of its section (empty when it has none). */
export function parseNotices(markdown: string): Notice[] {
  const lines = markdown.split(/\r?\n/);
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of lines) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = [];
      sections.set((heading[1] ?? '').trim(), current);
    } else {
      current?.push(line);
    }
  }

  const rows = lines.filter((line) => line.trim().startsWith('|')).map(cells);
  // Skip the header row and the |---| separator.
  return rows
    .slice(2)
    .filter((row) => row.length >= 3)
    .map(([work = '', usedFor = '', licence = '']) => {
      const { name, url } = parseLink(work);
      return {
        name,
        url,
        usedFor: stripCode(usedFor),
        licence,
        text: plainText(sections.get(name) ?? []),
      };
    });
}
