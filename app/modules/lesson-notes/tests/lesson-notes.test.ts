import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("cannot save an empty box", () => {
    expect(describeNoteDraft({ draft: "", savedBody: null })).toEqual({
      status: "empty",
      length: 0,
      maxLength: MAX_NOTE_LENGTH,
      canSave: false,
    });
  });

  it("treats whitespace alone as empty, even over a saved Note", () => {
    const draft = describeNoteDraft({ draft: "  \n ", savedBody: "old" });
    expect(draft.status).toBe("empty");
    expect(draft.canSave).toBe(false);
  });

  it("can save new text that differs from the saved Note", () => {
    const draft = describeNoteDraft({ draft: "new", savedBody: "old" });
    expect(draft.status).toBe("unsaved");
    expect(draft.canSave).toBe(true);
  });

  it("can save the first Note on a Lesson", () => {
    const draft = describeNoteDraft({ draft: "first", savedBody: null });
    expect(draft.status).toBe("unsaved");
    expect(draft.canSave).toBe(true);
  });

  it("reports saved when the box matches the Note, ignoring surrounding whitespace", () => {
    const draft = describeNoteDraft({ draft: "  same\n", savedBody: "same" });
    expect(draft.status).toBe("saved");
    expect(draft.canSave).toBe(false);
  });

  it("counts the trimmed length, which is what the server checks", () => {
    expect(
      describeNoteDraft({ draft: "  abc  ", savedBody: null }).length
    ).toBe(3);
  });

  it("allows a Note of exactly the limit", () => {
    const draft = describeNoteDraft({
      draft: "a".repeat(MAX_NOTE_LENGTH),
      savedBody: null,
    });
    expect(draft.status).toBe("unsaved");
    expect(draft.canSave).toBe(true);
  });

  it("refuses a Note one character over the limit", () => {
    const draft = describeNoteDraft({
      draft: "a".repeat(MAX_NOTE_LENGTH + 1),
      savedBody: null,
    });
    expect(draft.status).toBe("too-long");
    expect(draft.length).toBe(MAX_NOTE_LENGTH + 1);
    expect(draft.canSave).toBe(false);
  });
});
