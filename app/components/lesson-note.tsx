import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import {
  describeNoteDraft,
  type NoteDraft,
  type NoteDraftStatus,
} from "~/modules/lesson-notes";

export type LessonNoteData = { body: string; updatedAt: string } | null;

/** The Student's private Note on a Lesson, styled to match the discussion card. */
export function LessonNote({ note }: { note: LessonNoteData }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const draft = describeNoteDraft({
    draft: body,
    savedBody: note?.body ?? null,
  });

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <NoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson..."
            aria-label="Your notes"
            className="resize-y"
          />

          <NoteFooter
            isSaving={isSaving}
            draft={draft}
            updatedAt={note?.updatedAt}
          />
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteFooter({
  isSaving,
  draft,
  updatedAt,
}: {
  isSaving: boolean;
  draft: NoteDraft;
  updatedAt: string | undefined;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={isSaving || !draft.canSave}>
        {isSaving ? "Saving..." : "Save note"}
      </Button>
      <NoteStatus
        status={isSaving ? "saving" : draft.status}
        updatedAt={updatedAt}
      />
      <span
        className={cn(
          "ml-auto text-xs",
          draft.status === "too-long"
            ? "text-destructive"
            : "text-muted-foreground"
        )}
      >
        {draft.length} / {draft.maxLength}
      </span>
    </div>
  );
}

function NoteHeader() {
  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Your notes</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <Lock className="size-3" />
          Private
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Only you can read these. Find every note again on your{" "}
        <Link to="/saved" className="underline underline-offset-2">
          Saved
        </Link>{" "}
        page.
      </p>
    </>
  );
}

function NoteStatus({
  status,
  updatedAt,
}: {
  status: NoteDraftStatus | "saving";
  updatedAt: string | undefined;
}) {
  if (status === "unsaved") {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (status === "too-long") {
    return (
      <span className="text-xs text-destructive">
        Too long to save — trim it down first
      </span>
    );
  }
  if (status === "saved" && updatedAt) {
    return (
      <span suppressHydrationWarning className="text-xs text-muted-foreground">
        Saved · edited {formatRelativeTime(updatedAt)}
      </span>
    );
  }
  return null;
}
