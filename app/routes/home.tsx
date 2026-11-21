import { Link } from "react-router";
import { useState, useEffect } from "react";
import type { Route } from "./+types/home";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "~/components/ui/card";
import {
  BookOpen,
  GraduationCap,
  Users,
  ArrowRight,
  User,
  Moon,
  Sun,
  Layers,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { CourseImage } from "~/components/course-image";
import { DevUI } from "~/components/dev-ui";
import { getCurrentUserId, getDevCountry } from "~/lib/session";
import { getCountryTierInfo, COUNTRIES } from "~/lib/ppp";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { users } from "~/db/schema";
import { landing } from "~/modules/landing/index.server";

function getAllUsers() {
  return db.select().from(users).all();
}

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function meta() {
  return [
    { title: "Cadence — Learn at your own pace" },
    {
      name: "description",
      content:
        "A modern course platform for developers. Browse courses, track your progress, and learn at your own pace.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { featuredCourses, stats } = landing.get();
  const users = getAllUsers();
  const currentUserId = await getCurrentUserId(request);
  const currentUser = currentUserId ? getUserById(currentUserId) : null;
  const devCountry = await getDevCountry(request);
  const countryTierInfo = getCountryTierInfo(devCountry);

  return {
    featuredCourses,
    stats,
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    currentUser: currentUser
      ? { id: currentUser.id, name: currentUser.name, role: currentUser.role }
      : null,
    devCountry,
    countryTierInfo,
    countries: COUNTRIES,
  };
}

const HIGHLIGHTS = [
  "Bite-sized lessons",
  "Quizzes to check your work",
  "Progress tracking",
];

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 p-6">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-5 text-primary" />
      </div>
      <p className="mt-4 text-3xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const {
    featuredCourses,
    stats,
    users,
    currentUser,
    devCountry,
    countryTierInfo,
    countries,
  } = loaderData;
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDarkMode() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cadence-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="text-xl font-bold tracking-tight">
            Cadence
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              to="/courses"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Courses
            </Link>
            <button
              onClick={toggleDarkMode}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
            {currentUser ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Log In
                </Link>
                <Button asChild size="sm">
                  <Link to="/signup">Sign Up</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-[3fr_2fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              {stats.courses} courses across {stats.categories} categories
            </p>
            <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Learn to code,
              <br />
              <span className="text-muted-foreground">at your own pace</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Structured courses built by experienced instructors. Track your
              progress, take quizzes, and build real-world skills.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link to="/courses">
                  Browse Courses
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              {currentUser ? (
                <Button asChild size="lg" variant="outline">
                  <Link to="/dashboard">Go to your dashboard</Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant="outline">
                  <Link to="/signup">Create a free account</Link>
                </Button>
              )}
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
              {HIGHLIGHTS.map((highlight) => (
                <li
                  key={highlight}
                  className="flex items-center gap-2 whitespace-nowrap"
                >
                  <CheckCircle2 className="size-4 text-primary" />
                  {highlight}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard icon={BookOpen} value={stats.courses} label="Courses" />
            <StatCard icon={Layers} value={stats.lessons} label="Lessons" />
            <StatCard
              icon={Users}
              value={stats.instructors}
              label="Instructors"
            />
            <StatCard
              icon={GraduationCap}
              value={stats.categories}
              label="Categories"
            />
          </div>
        </div>
      </section>

      {featuredCourses.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                Featured Courses
              </h2>
              <p className="mt-2 text-muted-foreground">
                Start learning with our most popular courses
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/courses">
                View all
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCourses.map((course) => (
              <Link
                key={course.id}
                to={`/courses/${course.slug}`}
                className="group"
              >
                <Card className="h-full overflow-hidden pt-0 transition-shadow group-hover:shadow-md">
                  <CourseImage
                    src={course.coverImageUrl}
                    alt={course.title}
                    className="aspect-video w-full object-cover"
                  />
                  <CardHeader>
                    <h3 className="font-semibold leading-snug group-hover:text-primary">
                      {course.title}
                    </h3>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {course.description}
                    </p>
                  </CardContent>
                  <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="size-3" />
                      {course.instructorName ?? "Instructor"}
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="size-3" />
                      {course.lessonCount} lessons
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold tracking-tight">Cadence</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Learn to code, at your own pace.
            </p>
          </div>
          <nav className="flex gap-6 text-sm text-muted-foreground">
            <Link to="/courses" className="hover:text-foreground">
              Courses
            </Link>
            {currentUser ? (
              <Link to="/dashboard" className="hover:text-foreground">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="hover:text-foreground">
                  Log In
                </Link>
                <Link to="/signup" className="hover:text-foreground">
                  Sign Up
                </Link>
              </>
            )}
          </nav>
        </div>
      </footer>

      <DevUI
        users={users}
        currentUser={currentUser}
        devCountry={devCountry}
        countryTierInfo={countryTierInfo}
        countries={countries}
      />
    </div>
  );
}
