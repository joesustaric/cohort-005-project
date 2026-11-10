// PROTOTYPE: "How should the Notification feed look and behave?" (wayfinder ticket #6)
// Four variants of the in-app Notification feed, switched via ?variant=A|B|C|D on every
// app-layout route. Throwaway: lives only on the prototype/notification-feed branch.
//
// ASSUMPTION: we have no Knock keys yet, so the bell and popover below are hand-made
// look-alikes of Knock's prebuilt <NotificationIconButton> + <NotificationFeedPopover>
// (and <NotificationFeed> for the drawer). Same anatomy: header with All/Unread/Read
// filter + "Mark all as read", cells with avatar / markdown body / relative time / unread
// dot, empty state, "Powered by Knock" footer. Variants only change what Knock lets us
// change: placement, theming (CSS variables), badge count type, and container.
// Placeholder data only; no persistence. "+ new" on the switcher simulates a real-time push.
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Popover } from "radix-ui";
import { Bell, X, Settings2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";

// ─── Mock feed ──────────────────────────────────────────────────────────────

type Item = {
  id: number;
  actor: string;
  body: string;
  href: string;
  ago: string;
  seen: boolean;
  read: boolean;
};

type Seed = Omit<Item, "id" | "seen" | "read"> & { seen?: boolean; read?: boolean };

const seeds: Record<string, Seed[]> = {
  [UserRole.Student]: [
    { actor: "Sarah Chen", body: "**Sarah Chen** answered your question in **React Hooks Deep Dive › useEffect pitfalls**", href: "/courses", ago: "4 min ago" },
    { actor: "Cadence", body: "New lesson published in **TypeScript Fundamentals**: *Generics in practice*", href: "/courses", ago: "2 hours ago" },
    { actor: "Cadence", body: "Your refund request for **Intro to SQL** was **approved**. $49.00 is on its way.", href: "/dashboard", ago: "yesterday", seen: true },
    { actor: "Alex Rivera", body: "**Alex Rivera** replied to your comment on **Lesson 3: Closures**", href: "/courses", ago: "3 days ago", seen: true, read: true },
  ],
  [UserRole.Instructor]: [
    { actor: "Jamie Park", body: "**Jamie Park** asked a question in **React Hooks Deep Dive › Custom hooks**", href: "/instructor/questions", ago: "just now" },
    { actor: "Cadence", body: "**3 new students** enrolled in **TypeScript Fundamentals**", href: "/instructor", ago: "1 hour ago" },
    { actor: "Morgan Lee", body: "**Morgan Lee** left a ★★★★★ review on **React Hooks Deep Dive**", href: "/instructor", ago: "yesterday", seen: true },
    { actor: "Cadence", body: "A student requested a refund for **TypeScript Fundamentals**", href: "/instructor", ago: "2 days ago", seen: true, read: true },
  ],
  [UserRole.Admin]: [
    { actor: "Taylor Kim", body: "**Taylor Kim** submitted a refund request for **Intro to SQL** ($49.00)", href: "/admin/refunds", ago: "12 min ago" },
    { actor: "Sarah Chen", body: "**Sarah Chen** published a new course: **Advanced Node Streams**", href: "/admin/courses", ago: "3 hours ago" },
    { actor: "Cadence", body: "**2 refund requests** are waiting more than 48 hours", href: "/admin/refunds", ago: "yesterday", seen: true },
  ],
  teamAdmin: [
    { actor: "Riley Jones", body: "**Riley Jones** redeemed a seat on your team licence (7 of 10 used)", href: "/team", ago: "30 min ago" },
  ],
};

const liveSamples: Seed[] = [
  { actor: "Sam Patel", body: "**Sam Patel** asked a question in **Lesson 5: Reducers**", href: "/instructor/questions", ago: "just now" },
  { actor: "Cadence", body: "New lesson published in **React Hooks Deep Dive**", href: "/courses", ago: "just now" },
  { actor: "Dana Wu", body: "**Dana Wu** replied to your question", href: "/courses", ago: "just now" },
];

function seed(role: string | null, isTeamAdmin: boolean): Item[] {
  return [...(isTeamAdmin ? seeds.teamAdmin : []), ...(seeds[role ?? ""] ?? [])].map(
    (s, i) => ({ seen: false, read: false, ...s, id: i + 1 })
  );
}

function useMockFeed(role: string | null, isTeamAdmin: boolean) {
  const who = `${role}:${isTeamAdmin}`;
  const [owner, setOwner] = useState(who);
  const [items, setItems] = useState<Item[]>(() => seed(role, isTeamAdmin));
  if (owner !== who) {
    setOwner(who);
    setItems(seed(role, isTeamAdmin));
  }
  const [n, setN] = useState(0);
  return {
    items,
    unseen: items.filter((i) => !i.seen).length,
    unread: items.filter((i) => !i.read).length,
    markAllSeen: () => setItems((xs) => xs.map((x) => ({ ...x, seen: true }))),
    markAllRead: () =>
      setItems((xs) => xs.map((x) => ({ ...x, seen: true, read: true }))),
    markRead: (id: number) =>
      setItems((xs) =>
        xs.map((x) => (x.id === id ? { ...x, seen: true, read: true } : x))
      ),
    push: () => {
      setItems((xs) => [
        { ...liveSamples[n % liveSamples.length], id: Date.now(), seen: false, read: false },
        ...xs,
      ]);
      setN(n + 1);
    },
  };
}
type Feed = ReturnType<typeof useMockFeed>;

// ─── Knock look-alike feed (the "prebuilt" bit) ──────────────────────────────

type Theme = "knock" | "cadence";

function md(s: string) {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, i) =>
    part.startsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part.startsWith("*") ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      part
    )
  );
}

function useVariantHref() {
  const v = new URLSearchParams(useLocation().search).get("variant");
  return (href: string) => (v ? `${href}?variant=${v}` : href);
}

function KnockFeed({
  feed,
  theme,
  onItemClick,
  className,
  headerExtra,
}: {
  feed: Feed;
  theme: Theme;
  onItemClick?: () => void;
  className?: string;
  headerExtra?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const withVariant = useVariantHref();
  const k = theme === "knock";
  const shown = feed.items.filter((i) =>
    filter === "all" ? true : filter === "unread" ? !i.read : i.read
  );

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        k
          ? "bg-white font-[system-ui] text-[#1a1f36]"
          : "bg-popover text-popover-foreground",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          k ? "border-b border-[#e4e8ee]" : "border-b border-border"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">Notifications</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className={cn(
              "rounded px-1 text-xs",
              k ? "bg-[#f4f6f9] text-[#697386]" : "bg-muted text-muted-foreground"
            )}
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={feed.markAllRead}
            disabled={feed.unread === 0}
            className={cn(
              "text-xs disabled:opacity-40",
              k ? "text-[#697386] hover:text-[#1a1f36]" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Mark all as read
          </button>
          {headerExtra}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <div className={cn("px-4 py-12 text-center text-sm", k ? "text-[#a5acb8]" : "text-muted-foreground")}>
            No notifications yet
            <div className="mt-1 text-xs">We'll let you know when we've got something new for you.</div>
          </div>
        ) : (
          shown.map((item) => (
            <Link
              key={item.id}
              to={withVariant(item.href)}
              onClick={() => {
                feed.markRead(item.id);
                onItemClick?.();
              }}
              className={cn(
                "relative flex gap-3 px-4 py-3 text-sm transition-colors",
                k
                  ? "border-b border-[#f0f2f5] hover:bg-[#f9fafb]"
                  : "border-b border-border/60 hover:bg-accent",
                !item.read && !k && "bg-primary/5"
              )}
            >
              {!item.read && (
                <span
                  className={cn(
                    "absolute left-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full",
                    k ? "bg-[#5469d4]" : "bg-primary"
                  )}
                />
              )}
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  k ? "bg-[#e3e8ee] text-[#3c4257]" : "bg-muted text-muted-foreground"
                )}
              >
                {item.actor === "Cadence" ? "C" : item.actor.split(" ").map((w) => w[0]).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="leading-snug">{md(item.body)}</div>
                <div className={cn("mt-1 text-xs", k ? "text-[#a5acb8]" : "text-muted-foreground")}>
                  {item.ago}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      <div className={cn("py-2 text-center text-[10px]", k ? "bg-[#f9fafb] text-[#a5acb8]" : "bg-muted/40 text-muted-foreground")}>
        Powered by Knock
      </div>
    </div>
  );
}

function Badge({ count, theme, dot }: { count: number; theme: Theme; dot?: boolean }) {
  if (count === 0) return null;
  const color = theme === "knock" ? "bg-[#e95744] text-white" : "bg-primary text-primary-foreground";
  if (dot) return <span className={cn("absolute right-1 top-1 size-2 rounded-full", color)} />;
  return (
    <span className={cn("absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold", color)}>
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ─── Variants ───────────────────────────────────────────────────────────────

export const notificationVariants = [
  { key: "A", name: "Stock Knock · logo bell · unseen" },
  { key: "B", name: "Themed · nav row · unread" },
  { key: "C", name: "Top bar · dropdown · dot" },
  { key: "D", name: "Footer bell · side drawer" },
];

export type NotificationSlots = {
  sidebarHeader?: React.ReactNode;
  sidebarNav?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  topBar?: React.ReactNode;
  overlay?: React.ReactNode;
};

/** A: Knock defaults, untouched. Bell next to the Cadence logo; badge counts UNSEEN and clears when opened. */
function useVariantA(feed: Feed): NotificationSlots {
  const [open, setOpen] = useState(false);
  return {
    sidebarHeader: (
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) feed.markAllSeen();
        }}
      >
        <Popover.Trigger asChild>
          <button className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent" title="Notifications">
            <Bell className="size-4" />
            <Badge count={feed.unseen} theme="knock" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="right" align="start" sideOffset={12} className="z-50">
            <KnockFeed feed={feed} theme="knock" onItemClick={() => setOpen(false)} className="h-[420px] w-[360px] rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.18)]" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    ),
  };
}

/** B: Themed with Cadence CSS vars. A "Notifications" row in the nav; pill counts UNREAD and only drops as items are clicked or marked read. */
function useVariantB(feed: Feed): NotificationSlots {
  const [open, setOpen] = useState(false);
  return {
    sidebarNav: (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              open
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Bell className="size-4" />
            Notifications
            {feed.unread > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
                {feed.unread}
              </span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="right" align="start" sideOffset={14} className="z-50">
            <KnockFeed feed={feed} theme="cadence" onItemClick={() => setOpen(false)} className="h-[460px] w-[380px] rounded-xl border border-border shadow-xl" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    ),
  };
}

/** C: New thin app bar above every page. Bell top-right with a plain DOT (no number) for unseen; dropdown below; themed. */
function useVariantC(feed: Feed): NotificationSlots {
  const [open, setOpen] = useState(false);
  return {
    topBar: (
      <div className="sticky top-0 z-40 flex h-14 items-center justify-end gap-2 border-b border-border bg-background/80 px-6 backdrop-blur">
        <Popover.Root
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) feed.markAllSeen();
          }}
        >
          <Popover.Trigger asChild>
            <button className="relative rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground" title="Notifications">
              <Bell className="size-5" />
              <Badge count={feed.unseen} theme="cadence" dot />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="bottom" align="end" sideOffset={8} className="z-50">
              <KnockFeed feed={feed} theme="cadence" onItemClick={() => setOpen(false)} className="h-[480px] w-[400px] rounded-xl border border-border shadow-xl" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    ),
  };
}

/** D: Bell beside the settings cog in the sidebar footer; opens Knock's full <NotificationFeed> in a right-hand drawer. Badge counts UNREAD. */
function useVariantD(feed: Feed): NotificationSlots {
  const [open, setOpen] = useState(false);
  return {
    sidebarFooter: (
      <button
        onClick={() => setOpen(true)}
        title="Notifications"
        className="relative rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        <Badge count={feed.unread} theme="cadence" />
      </button>
    ),
    overlay: open ? (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)}>
        <div onClick={(e) => e.stopPropagation()} className="h-full w-[440px] border-l border-border shadow-2xl">
          <KnockFeed
            feed={feed}
            theme="cadence"
            onItemClick={() => setOpen(false)}
            className="h-full"
            headerExtra={
              <>
                <Link to="/settings" onClick={() => setOpen(false)} title="Notification settings" className="text-muted-foreground hover:text-foreground">
                  <Settings2 className="size-4" />
                </Link>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </>
            }
          />
        </div>
      </div>
    ) : null,
  };
}

export function useNotificationPrototype(
  variant: string,
  role: string | null,
  isTeamAdmin: boolean
) {
  const feed = useMockFeed(role, isTeamAdmin);
  const all = {
    A: useVariantA(feed),
    B: useVariantB(feed),
    C: useVariantC(feed),
    D: useVariantD(feed),
  } as Record<string, NotificationSlots>;
  return {
    slots: role ? all[variant] ?? all.A : {},
    simulate: (
      <button
        onClick={feed.push}
        className="ml-1 flex items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-0.5 text-xs hover:bg-fuchsia-500"
        title="Simulate a real-time Notification arriving"
      >
        + new
      </button>
    ),
  };
}
