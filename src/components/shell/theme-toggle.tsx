"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/primitives";

type Theme = "light" | "dark";

/**
 * The theme lives in localStorage and on the root element, not in React state —
 * an inline script in the document head applies it before first paint. Reading
 * it through useSyncExternalStore keeps the button label in step without an
 * effect that would fire a second render on every mount.
 */
const themeStore = {
  subscribe(onChange: () => void) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("storage", onChange);
    media.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      media.removeEventListener("change", onChange);
    };
  },
  getSnapshot(): Theme {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  },
  // The server can't know the viewer's theme; render the light icon and let the
  // client swap it on hydration.
  getServerSnapshot(): Theme {
    return "light";
  },
};

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    // `storage` doesn't fire in the tab that wrote it, so nudge the store.
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" }));
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.75} />
      )}
    </Button>
  );
}
