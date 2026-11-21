import { describeDraft, type NoteDraft } from "./lib/draft";

export type { NoteDraft, NoteDraftStatus } from "./lib/draft";

/**
 * Where the Student's Note editor stands: whether the text in the box differs
 * from the saved Note, whether it may be saved, and how long it is.
 */
export function describeNoteDraft({
  draft,
  savedBody,
}: {
  draft: string;
  savedBody: string | null;
}): NoteDraft {
  return describeDraft(draft, savedBody);
}
