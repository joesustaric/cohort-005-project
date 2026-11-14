import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { markdown } from "~/lib/text";

let db: TestDb;

vi.mock("~/db", () => ({
  get db() {
    return db;
  },
}));

const { action } = await import("./courses.$slug.lessons.$lessonId");

let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
});

async function postAs(
  userId: number,
  fields: Record<string, string>,
  params: { slug: string; lessonId: string } = {
    slug: base.course.slug,
    lessonId: String(lessonId),
  }
) {
  const setCookie = await setCurrentUserId(
    new Request("http://localhost"),
    userId
  );
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { Cookie: setCookie.split(";")[0] },
    body: new URLSearchParams(fields),
  });
  return action({ request, params, context: {} } as never);
}

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    return (error as { init?: { status?: number } }).init?.status;
  }
}

function enrol(userId: number, courseId = base.course.id) {
  db.insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt: new Date().toISOString() })
    .run();
}

function progressFor(userId: number) {
  return db
    .select()
    .from(schema.lessonProgress)
    .all()
    .filter((row) => row.userId === userId);
}

describe("marking a Lesson complete", () => {
  it("is refused for a Student without an Enrollment", async () => {
    const status = await statusOf(
      postAs(base.user.id, { intent: "mark-complete" })
    );

    expect(status).toBe(403);
    expect(progressFor(base.user.id)).toEqual([]);
  });

  it("is allowed for an enrolled Student", async () => {
    enrol(base.user.id);

    expect(
      await statusOf(postAs(base.user.id, { intent: "mark-complete" }))
    ).toBe(200);
    expect(progressFor(base.user.id)).toHaveLength(1);
  });

  it("is refused for a Lesson in another course, posted through an enrolled course", async () => {
    enrol(base.user.id);
    const otherLessonId = lessonInAnotherCourse();

    const status = await statusOf(
      postAs(
        base.user.id,
        { intent: "mark-complete" },
        { slug: base.course.slug, lessonId: String(otherLessonId) }
      )
    );

    expect(status).toBe(404);
    expect(progressFor(base.user.id)).toEqual([]);
  });
});

function lessonInAnotherCourse() {
  const other = db
    .insert(schema.courses)
    .values({
      title: "Other",
      slug: "other",
      description: "Other",
      salesCopy: markdown("Other"),
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
  const module = db
    .insert(schema.modules)
    .values({ courseId: other.id, title: "M", position: 1 })
    .returning()
    .get();
  return db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Other lesson", position: 1 })
    .returning()
    .get().id;
}

function quizOn(forLessonId: number) {
  return db
    .insert(schema.quizzes)
    .values({ lessonId: forLessonId, title: "Quiz", passingScore: 0.7 })
    .returning()
    .get().id;
}

function attemptsBy(userId: number) {
  return db
    .select()
    .from(schema.quizAttempts)
    .all()
    .filter((row) => row.userId === userId);
}

describe("submitting a Quiz", () => {
  it("is refused for a Student without an Enrollment", async () => {
    const quizId = quizOn(lessonId);

    const status = await statusOf(
      postAs(base.user.id, { intent: "submit-quiz", quizId: String(quizId) })
    );

    expect(status).toBe(403);
    expect(attemptsBy(base.user.id)).toEqual([]);
  });

  it("is refused for a Quiz on a Lesson in another course", async () => {
    enrol(base.user.id);
    const quizId = quizOn(lessonInAnotherCourse());

    const status = await statusOf(
      postAs(base.user.id, { intent: "submit-quiz", quizId: String(quizId) })
    );

    expect(status).toBe(404);
    expect(attemptsBy(base.user.id)).toEqual([]);
  });

  it("records an attempt for an enrolled Student", async () => {
    enrol(base.user.id);
    const quizId = quizOn(lessonId);

    await postAs(base.user.id, {
      intent: "submit-quiz",
      quizId: String(quizId),
    });

    expect(attemptsBy(base.user.id)).toHaveLength(1);
  });
});

describe("posting a Comment", () => {
  it("is refused for a Lesson in another course, posted through an enrolled course", async () => {
    enrol(base.user.id);
    const otherLessonId = lessonInAnotherCourse();

    const status = await statusOf(
      postAs(
        base.user.id,
        { intent: "create-comment", body: "Hello from the wrong course" },
        { slug: base.course.slug, lessonId: String(otherLessonId) }
      )
    );

    expect(status).toBe(404);
    expect(db.select().from(schema.comments).all()).toEqual([]);
  });
});
