import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLanding } from "../index.server";

let db: TestDb;
let instructor: typeof schema.users.$inferSelect;
let baseCourse: typeof schema.courses.$inferSelect;
let categoryId: number;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  instructor = base.instructor;
  baseCourse = base.course;
  categoryId = base.category.id;
});

// ─── Fixtures ───
// Nothing writes courses, modules or lessons through a module yet, so rows go
// in directly. Kept in one place so a schema change touches only this block.

let slugCounter = 0;

function addInstructor(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      role: UserRole.Instructor,
    })
    .returning()
    .get();
}

function addCourse(
  title: string,
  options: {
    instructorId?: number;
    categoryId?: number;
    status?: CourseStatus;
    createdAt?: string;
  } = {}
) {
  slugCounter += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${slugCounter}`,
      description: `${title} description`,
      salesCopy: markdown(title),
      instructorId: options.instructorId ?? instructor.id,
      categoryId: options.categoryId ?? categoryId,
      status: options.status ?? CourseStatus.Published,
      createdAt: options.createdAt,
    })
    .returning()
    .get();
}

function addLessons(courseId: number, perModule: number[]) {
  perModule.forEach((lessonCount, index) => {
    const mod = db
      .insert(schema.modules)
      .values({ courseId, title: `Module ${index + 1}`, position: index })
      .returning()
      .get();
    for (let position = 0; position < lessonCount; position++) {
      db.insert(schema.lessons)
        .values({ moduleId: mod.id, title: `Lesson ${position}`, position })
        .run();
    }
  });
}

function addCategory(name: string) {
  return db
    .insert(schema.categories)
    .values({ name, slug: name.toLowerCase() })
    .returning()
    .get();
}

function get() {
  return createLanding(db).get();
}

describe("featured courses", () => {
  it("shows the three newest published courses, newest first", () => {
    addCourse("Oldest", { createdAt: "2031-01-01T00:00:00.000Z" });
    addCourse("Middle", { createdAt: "2031-02-01T00:00:00.000Z" });
    addCourse("Newest", { createdAt: "2031-03-01T00:00:00.000Z" });
    addCourse("Newer", { createdAt: "2031-02-15T00:00:00.000Z" });

    expect(get().featuredCourses.map((c) => c.title)).toEqual([
      "Newest",
      "Newer",
      "Middle",
    ]);
  });

  it("leaves out courses that are not published", () => {
    addCourse("Draft", {
      status: CourseStatus.Draft,
      createdAt: "2030-01-01T00:00:00.000Z",
    });
    addCourse("Archived", {
      status: CourseStatus.Archived,
      createdAt: "2030-01-01T00:00:00.000Z",
    });

    expect(get().featuredCourses.map((c) => c.title)).toEqual([
      baseCourse.title,
    ]);
  });

  it("counts each course's lessons across all of its modules", () => {
    addLessons(baseCourse.id, [2, 3]);
    const empty = addCourse("Empty", {
      createdAt: "2030-01-01T00:00:00.000Z",
    });

    const featured = get().featuredCourses;

    expect(featured.find((c) => c.id === baseCourse.id)?.lessonCount).toBe(5);
    expect(featured.find((c) => c.id === empty.id)?.lessonCount).toBe(0);
  });

  it("names the course's instructor", () => {
    const olive = addInstructor("Olive Other");
    addCourse("Olive's", {
      instructorId: olive.id,
      createdAt: "2030-01-01T00:00:00.000Z",
    });

    expect(get().featuredCourses[0]).toMatchObject({
      title: "Olive's",
      instructorName: "Olive Other",
    });
  });

  it("is empty when nothing is published", () => {
    db.update(schema.courses).set({ status: CourseStatus.Draft }).run();

    expect(get().featuredCourses).toEqual([]);
  });
});

describe("stats", () => {
  it("counts only published courses, their lessons and their instructors", () => {
    const olive = addInstructor("Olive Other");
    const draftOnly = addInstructor("Dee Draft");
    const second = addCourse("Second", { instructorId: olive.id });
    const sameInstructor = addCourse("Third", { instructorId: olive.id });
    const draft = addCourse("Draft", {
      instructorId: draftOnly.id,
      status: CourseStatus.Draft,
    });
    addLessons(baseCourse.id, [2]);
    addLessons(second.id, [1, 1]);
    addLessons(sameInstructor.id, [3]);
    addLessons(draft.id, [10]);

    expect(get().stats).toMatchObject({
      courses: 3,
      lessons: 7,
      instructors: 2,
    });
  });

  it("counts only categories that have a published course", () => {
    const design = addCategory("Design");
    addCategory("Data");
    addCourse("Draft design", {
      categoryId: design.id,
      status: CourseStatus.Draft,
    });
    addCourse("Published design", { categoryId: design.id });

    expect(get().stats.categories).toBe(2);
  });

  it("counts every published course, not only the featured ones", () => {
    for (let i = 0; i < 60; i++) addCourse(`Course ${i}`);

    expect(get().stats.courses).toBe(61);
  });

  it("is all zeros for an empty catalogue", () => {
    const empty = createLanding(createTestDb()).get();

    expect(empty).toEqual({
      featuredCourses: [],
      stats: { courses: 0, categories: 0, lessons: 0, instructors: 0 },
    });
  });
});
