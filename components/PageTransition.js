"use client";
import { usePathname } from "next/navigation";

// Next's App Router keeps the layout mounted across client-side navigations,
// so the one-shot `#app{animation:pageIn}` in globals.css only ever plays on
// first load. Keying a wrapper on the pathname forces React to remount it on
// every route change, which restarts the CSS animation — a lightweight page
// transition with no extra JS animation library.
export default function PageTransition({ children }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
