import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { markdown } from "~/lib/text";
import { eq } from "drizzle-orm";
import {
  requireContentAccess,
  requireLessonInCourse,
  requireRole,
  requireStaff,
} from "./access.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

async function requestAs(
  userId: number | null,
  headers: Record<string, string> = {}
) {
  if (userId === null) return new Request("http://localhost", { headers });
  const setCookie = await setCurrentUserId(
    new Request("http://localhost"),
    userId
  );
  return new Request("http://localhost", {
    headers: { ...headers, Cookie: setCookie.split(";")[0] },
  });
}

async function statusOf(promise: Promise<unknown> | (() => unknown)) {
  try {
    await (typeof promise === "function" ? promise() : promise);
    return 200;
  } catch (error) {
    return (error as { init?: { status?: number } }).init?.status;
  }
}

function addUser(role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name: role, email: `${role}-${Math.random()}@x.com`, role })
    .returning()
    .get();
}

function enrol(userId: number) {
  db.insert(schema.enrollments)
    .values({
      userId,
      courseId: base.course.id,
      enrolledAt: new Date().toISOString(),
    })
    .run();
}

describe("requireContentAccess", () => {
  it("refuses a signed-out visitor with 401", async () => {
    expect(
      await statusOf(
        requireContentAccess(db, await requestAs(null), base.course.id)
      )
    ).toBe(401);
  });

  it("refuses a Student without an Enrollment with 403", async () => {
    expect(
      await statusOf(
        requireContentAccess(db, await requestAs(base.user.id), base.course.id)
      )
    ).toBe(403);
  });

  it("lets an enrolled Student in", async () => {
    enrol(base.user.id);

    const access = await requireContentAccess(
      db,
      await requestAs(base.user.id),
      base.course.id
    );

    expect(access.user.id).toBe(base.user.id);
  });

  it("lets the owning Instructor and an Admin in without an Enrollment", async () => {
    const admin = addUser(UserRole.Admin);

    for (const userId of [base.instructor.id, admin.id]) {
      expect(
        await statusOf(
          requireContentAccess(db, await requestAs(userId), base.course.id)
        )
      ).toBe(200);
    }
  });

  it("refuses a Student who bought at a PPP discount and is now in another country", async () => {
    db.update(schema.courses)
      .set({ price: 10000, pppEnabled: true })
      .where(eq(schema.courses.id, base.course.id))
      .run();
    enrol(base.user.id);
    db.insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 3000,
        country: "IN",
      })
      .run();

    const fromIndia = await requestAs(base.user.id, { "CF-IPCountry": "IN" });
    const fromUS = await requestAs(base.user.id, { "CF-IPCountry": "US" });

    expect(
      await statusOf(requireContentAccess(db, fromIndia, base.course.id))
    ).toBe(200);
    expect(
      await statusOf(requireContentAccess(db, fromUS, base.course.id))
    ).toBe(403);
  });
});

describe("requireRole", () => {
  const ADMIN_ONLY = [UserRole.Admin];

  it("refuses a signed-out visitor with 401", async () => {
    expect(
      await statusOf(requireRole(db, await requestAs(null), ADMIN_ONLY))
    ).toBe(401);
  });

  it("refuses a session for a user who no longer exists with 401", async () => {
    expect(
      await statusOf(requireRole(db, await requestAs(9999), ADMIN_ONLY))
    ).toBe(401);
  });

  it("refuses a user without one of the roles with 403", async () => {
    expect(
      await statusOf(
        requireRole(db, await requestAs(base.instructor.id), ADMIN_ONLY)
      )
    ).toBe(403);
  });

  it("returns the user when they have one of the roles", async () => {
    const admin = addUser(UserRole.Admin);

    const signedIn = await requireRole(db, await requestAs(admin.id), [
      UserRole.Instructor,
      UserRole.Admin,
    ]);

    expect(signedIn).toMatchObject({ userId: admin.id, isAdmin: true });
  });
});

describe("requireStaff", () => {
  it("refuses a signed-out visitor with 401", async () => {
    expect(
      await statusOf(requireStaff(db, await requestAs(null), base.course.id))
    ).toBe(401);
  });

  it("refuses another Instructor with 403", async () => {
    const otherInstructor = addUser(UserRole.Instructor);

    expect(
      await statusOf(
        requireStaff(db, await requestAs(otherInstructor.id), base.course.id)
      )
    ).toBe(403);
  });

  it("refuses an enrolled Student with 403", async () => {
    enrol(base.user.id);

    expect(
      await statusOf(
        requireStaff(db, await requestAs(base.user.id), base.course.id)
      )
    ).toBe(403);
  });

  it("returns 404 for a course that doesn't exist", async () => {
    const admin = addUser(UserRole.Admin);

    expect(
      await statusOf(requireStaff(db, await requestAs(admin.id), 9999))
    ).toBe(404);
  });

  it("returns the course to its owning Instructor and to an Admin", async () => {
    const admin = addUser(UserRole.Admin);

    for (const userId of [base.instructor.id, admin.id]) {
      const staff = await requireStaff(
        db,
        await requestAs(userId),
        base.course.id
      );
      expect(staff.course.id).toBe(base.course.id);
    }
  });
});

describe("requireLessonInCourse", () => {
  function addLesson(courseId: number) {
    const module = db
      .insert(schema.modules)
      .values({ courseId, title: "M", position: 1 })
      .returning()
      .get();
    return db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "L", position: 1 })
      .returning()
      .get();
  }

  it("returns the lesson and its module when the lesson is in the course", () => {
    const lesson = addLesson(base.course.id);

    const found = requireLessonInCourse(db, lesson.id, base.course.id);

    expect(found.lesson.id).toBe(lesson.id);
    expect(found.module.courseId).toBe(base.course.id);
  });

  it("returns 404 for a lesson in another course", async () => {
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
    const lesson = addLesson(other.id);

    expect(
      await statusOf(() => requireLessonInCourse(db, lesson.id, base.course.id))
    ).toBe(404);
  });

  it("returns 404 for a lesson that doesn't exist", async () => {
    expect(
      await statusOf(() => requireLessonInCourse(db, 9999, base.course.id))
    ).toBe(404);
  });
});
