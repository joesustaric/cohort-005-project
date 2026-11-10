// PROTOTYPE: throwaway variant switcher. Never merge to main.
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  current,
  children,
}: {
  variants: { key: string; name: string }[];
  current: string;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );

  function go(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length];
    const params = new URLSearchParams(location.search);
    params.set("variant", next.key);
    try {
      sessionStorage.setItem("prototype-variant", next.key);
    } catch {}
    navigate(`${location.pathname}?${params}`, {
      replace: true,
      preventScrollReset: true,
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  const v = variants[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-dashed border-fuchsia-500 bg-black px-2 py-1.5 text-sm text-white shadow-2xl">
      <button
        onClick={() => go(-1)}
        className="rounded-full p-1 hover:bg-white/20"
        title="Previous variant (←)"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 text-center font-mono">
        {v.key} ({v.name})
      </span>
      <button
        onClick={() => go(1)}
        className="rounded-full p-1 hover:bg-white/20"
        title="Next variant (→)"
      >
        <ChevronRight className="size-4" />
      </button>
      {children}
    </div>
  );
}
