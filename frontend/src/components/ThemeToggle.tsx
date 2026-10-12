"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("pilotmate_theme") : null;
    const isLight = saved === "light";
    setLight(isLight);
    document.documentElement.classList.toggle("light", isLight);
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("pilotmate_theme", next ? "light" : "dark");
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle}>
      {light ? "Dark mode" : "Light mode"}
    </Button>
  );
}
