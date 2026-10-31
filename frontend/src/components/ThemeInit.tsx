"use client";

import { useLayoutEffect } from "react";

export default function ThemeInit() {
  useLayoutEffect(() => {
    const saved = localStorage.getItem("pilotmate_theme");
    document.documentElement.classList.toggle("light", saved === null || saved === "light");
  }, []);

  return null;
}
