/**
 * The Submit button: copies a contribution's file content to the clipboard
 * and opens GitHub's "new file" page for it in the browser.
 */
import { buildSubmitUrl, type Contribution } from './contribute.ts';
import { copyText, openExternal } from './external.ts';

export interface SubmitResult {
  /** Whether the GitHub URL carries the content (else the user pastes it). */
  includesContent: boolean;
  /** Whether the content is on the clipboard. */
  copied: boolean;
}

/** Copies the content, then opens GitHub. Rejects when the browser cannot be opened. */
export async function submitContribution(contribution: Contribution): Promise<SubmitResult> {
  const copied = await copyText(contribution.json);
  const { url, includesContent } = buildSubmitUrl(contribution);
  await openExternal(url);
  return { includesContent, copied };
}
