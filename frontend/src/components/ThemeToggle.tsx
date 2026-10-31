"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const THEME_EVENT = "pilotmate-theme-change";

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("light");
}

function getServerSnapshot() {
  return false;
}

function setTheme(light: boolean) {
  document.documentElement.classList.toggle("light", light);
  try {
    localStorage.setItem("pilotmate_theme", light ? "light" : "dark");
  } catch {
    /* ignore unavailable storage */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export default function ThemeToggle() {
  const light = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const label = light ? "Light mode" : "Dark mode";

  return <Button variant="outline" size="sm" onClick={() => setTheme(!light)}>{label}</Button>;
}
