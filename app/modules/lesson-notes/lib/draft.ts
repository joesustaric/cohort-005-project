import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftStatus = "empty" | "too-long" | "unsaved" | "saved";

export type NoteDraft = {
  status: NoteDraftStatus;
  length: number;
  maxLength: number;
  canSave: boolean;
};

// Measured on the trimmed text because that is what `saveNote` stores and
// checks against the limit.
export function describeDraft(
  draft: string,
  savedBody: string | null
): NoteDraft {
  const trimmed = draft.trim();
  const status = statusOf(trimmed, savedBody);
  return {
    status,
    length: trimmed.length,
    maxLength: MAX_NOTE_LENGTH,
    canSave: status === "unsaved",
  };
}

function statusOf(trimmed: string, savedBody: string | null): NoteDraftStatus {
  if (trimmed.length === 0) return "empty";
  if (trimmed.length > MAX_NOTE_LENGTH) return "too-long";
  if (trimmed === savedBody) return "saved";
  return "unsaved";
}
