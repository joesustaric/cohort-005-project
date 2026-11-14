import { data } from "react-router";
import { eq, and } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  UserRole,
  users,
  courses,
  enrollments,
  lessons,
  modules,
  purchases,
} from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { resolveCountry } from "~/lib/country.server";
import { checkPppAccess } from "~/lib/ppp";

export type Db = BetterSQLite3Database<typeof schema>;
type User = typeof users.$inferSelect;
type Course = typeof courses.$inferSelect;

function getUserById(db: Db, id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function getCourseById(db: Db, id: number) {
  return db.select().from(courses).where(eq(courses.id, id)).get();
}

function isUserEnrolled(db: Db, userId: number, courseId: number) {
  return !!db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

function findPurchase(db: Db, userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .get();
}

const SIGN_IN_FIRST = "Select a user from the DevUI panel.";

// getAccess never throws — the lesson page needs to render a paywall preview for
// signed-out and unenrolled visitors rather than erroring.

export type Access = {
  userId: number | null;
  user: User | undefined;
  isAdmin: boolean;
  /** The instructor who owns this specific course. */
  isOwningInstructor: boolean;
  /** Owning instructor or admin — the people who speak for the course. */
  isStaff: boolean;
  enrolled: boolean;
  pppBlocked: boolean;
  pppBlockedCountry: string | null;
  pppPurchaseCountry: string | null;
  /**
   * May they read the course's content (lesson bodies, comments)?
   * Staff always can. Students need an enrollment that isn't PPP-blocked.
   */
  canViewContent: boolean;
};

const SIGNED_OUT: Access = {
  userId: null,
  user: undefined,
  isAdmin: false,
  isOwningInstructor: false,
  isStaff: false,
  enrolled: false,
  pppBlocked: false,
  pppBlockedCountry: null,
  pppPurchaseCountry: null,
  canViewContent: false,
};

export async function getAccess(
  db: Db,
  request: Request,
  courseId: number
): Promise<Access> {
  const userId = await getCurrentUserId(request);
  if (!userId) return SIGNED_OUT;

  const user = getUserById(db, userId);
  if (!user) return SIGNED_OUT;

  const course = getCourseById(db, courseId);
  const isAdmin = user.role === UserRole.Admin;
  const isOwningInstructor = course?.instructorId === userId;
  const isStaff = isAdmin || isOwningInstructor;
  const enrolled = isUserEnrolled(db, userId, courseId);

  // PPP only restricts students who bought at a discount — staff are exempt.
  let ppp = {
    blocked: false,
    blockedCountry: null as string | null,
    purchaseCountry: null as string | null,
  };

  if (enrolled && !isStaff && course) {
    const purchase = findPurchase(db, userId, courseId);
    const currentCountry = await resolveCountry(request);
    ppp = checkPppAccess(
      course.price,
      course.pppEnabled,
      purchase?.country ?? null,
      currentCountry
    );
  }

  return {
    userId,
    user,
    isAdmin,
    isOwningInstructor,
    isStaff,
    enrolled,
    pppBlocked: ppp.blocked,
    pppBlockedCountry: ppp.blockedCountry,
    pppPurchaseCountry: ppp.purchaseCountry,
    canViewContent: isStaff || (enrolled && !ppp.blocked),
  };
}

// The require* guards below throw a 401/403/404 Response instead of returning.
// Use them in actions as well as loaders — loader guards don't protect actions.

export type SignedIn = { userId: number; user: User; isAdmin: boolean };

/**
 * Throws 401 unless someone is signed in. Returns their user id.
 */
export async function requireUserId(request: Request): Promise<number> {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data(SIGN_IN_FIRST, { status: 401 });
  }
  return userId;
}

/**
 * Throws 401 when signed out, 403 unless the user has one of `roles`. For pages
 * that aren't about one course — the admin pages, an instructor's course list.
 */
export async function requireRole(
  db: Db,
  request: Request,
  roles: readonly UserRole[]
): Promise<SignedIn> {
  const userId = await requireUserId(request);
  const user = getUserById(db, userId);
  if (!user) {
    throw data(SIGN_IN_FIRST, { status: 401 });
  }
  if (!roles.includes(user.role)) {
    throw data("You don't have permission to do that.", { status: 403 });
  }
  return { userId, user, isAdmin: user.role === UserRole.Admin };
}

/**
 * Throws 401 when signed out, 403 when the user can't see the course's content.
 */
export async function requireContentAccess(
  db: Db,
  request: Request,
  courseId: number
): Promise<Access & SignedIn> {
  const access = await getAccess(db, request, courseId);

  if (!access.userId || !access.user) {
    throw data(SIGN_IN_FIRST, { status: 401 });
  }

  if (!access.canViewContent) {
    throw data("You must be enrolled in this course.", { status: 403 });
  }

  return { ...access, userId: access.userId, user: access.user };
}

/**
 * Throws 401 when signed out, 404 when the course doesn't exist, 403 unless
 * the user is the course's own instructor or an admin.
 */
export async function requireStaff(
  db: Db,
  request: Request,
  courseId: number
): Promise<SignedIn & { course: Course }> {
  const userId = await requireUserId(request);
  const user = getUserById(db, userId);
  if (!user) {
    throw data(SIGN_IN_FIRST, { status: 401 });
  }

  const course = getCourseById(db, courseId);
  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  const isAdmin = user.role === UserRole.Admin;
  if (!isAdmin && course.instructorId !== userId) {
    throw data("Only this course's instructor can do that.", { status: 403 });
  }

  return { userId, user, isAdmin, course };
}

/**
 * Throws 404 unless the lesson is in the course, so access to one course can't
 * reach a lesson in another by posting its id. Check access to the course first.
 */
export function requireLessonInCourse(
  db: Db,
  lessonId: number,
  courseId: number
) {
  const lesson = db
    .select()
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .get();
  const module = lesson
    ? db.select().from(modules).where(eq(modules.id, lesson.moduleId)).get()
    : undefined;
  if (!lesson || !module || module.courseId !== courseId) {
    throw data("Lesson not found in this course.", { status: 404 });
  }
  return { lesson, module };
}
