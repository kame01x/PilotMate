"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  LayoutDashboard,
  LogOut,
  Moon,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sun,
} from "lucide-react";
import { API_URL, apiFetch, getRole, getToken } from "@/lib/api";
import { useMusic } from "@/lib/music/MusicContext";
import { trackById, TRACKS } from "@/lib/music/tracks";

export type SidebarItem = {
  id: string;
  label: string;
  iconPaths: string[];
  href?: string;
};

export const STUDENT_ITEMS: SidebarItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    iconPaths: ["M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  },
  {
    id: "preflight",
    label: "Pre-flight",
    iconPaths: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
  },
  {
    id: "technical",
    label: "Technical",
    iconPaths: ["M3 9l9-5 9 5-9 5z", "M7 11.5V16c2.5 2 7.5 2 10 0v-4.5"],
  },
  {
    id: "debrief",
    label: "Debriefing",
    iconPaths: [
      "M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z",
      "M9 4h6v3H9z",
      "M8 12h8",
      "M8 16h5",
    ],
  },
  {
    id: "billing",
    label: "Billing",
    iconPaths: ["M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M3 10h18"],
  },
];

export const INSTRUCTOR_ITEMS: SidebarItem[] = [
  {
    id: "my-students",
    label: "My Students",
    iconPaths: [
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
      "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
      "M22 21v-2a4 4 0 0 0-3-3.87",
      "M16 3.13a4 4 0 0 1 0 7.75",
    ],
  },
  {
    id: "messages",
    label: "Messages",
    iconPaths: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  },
  {
    id: "preflight",
    label: "Pre-flight Agent",
    iconPaths: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
  },
];

export const ADMIN_ITEMS: SidebarItem[] = [
  {
    id: "overview",
    label: "Overview",
    iconPaths: ["M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  },
  {
    id: "users",
    label: "Users",
    iconPaths: [
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
      "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
      "M22 21v-2a4 4 0 0 0-3-3.87",
      "M16 3.13a4 4 0 0 1 0 7.75",
    ],
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    iconPaths: ["M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M3 10h18"],
  },
  {
    id: "health",
    label: "System health",
    iconPaths: ["M3 12h4l3 9 4-18 3 9h4"],
  },
];

export function itemsForRole(role: string | null | undefined): SidebarItem[] {
  if (role === "instructor") return INSTRUCTOR_ITEMS;
  if (role === "admin") return ADMIN_ITEMS;
  return STUDENT_ITEMS;
}

export function itemsWithHrefs(role: string | null | undefined): SidebarItem[] {
  const items = itemsForRole(role);
  const base = role === "admin" ? "/admin" : role === "instructor" ? "/instructor" : "/student";
  const queryKey = role === "admin" ? "tab" : "view";
  return items.map((item) => ({
    ...item,
    href: `${base}?${queryKey}=${encodeURIComponent(item.id)}`,
  }));
}

type Identity = {
  role: "student" | "instructor" | "admin";
  name: string;
  identifier?: string;
  hasPhoto: boolean;
};

const ROLE_LABEL: Record<Identity["role"], string> = {
  student: "Student",
  instructor: "Instructor",
  admin: "Administrator",
};

const THEME_EVENT = "pilotmate-theme-change";

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getThemeSnapshot() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("light");
}

function setTheme(light: boolean) {
  document.documentElement.classList.toggle("light", light);
  document.documentElement.classList.toggle("dark", !light);
  try {
    localStorage.setItem("pilotmate_theme", light ? "light" : "dark");
  } catch {
    /* ignore unavailable storage */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

function initials(name: string | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PM";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "PM";
}

type ShellProfileValue = {
  identity: Identity | null;
  photoUrl: string | null;
  uploading: boolean;
  photoError: string | null;
  photoNotice: string | null;
  canEditPhoto: boolean;
  openPhotoPicker: () => void;
};

const ShellProfileContext = createContext<ShellProfileValue | null>(null);

export function useShellProfile() {
  return useContext(ShellProfileContext);
}

export function ProfileAvatar({
  size = "md",
  className = "",
}: {
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const profile = useShellProfile();
  const canEdit = profile?.canEditPhoto ?? false;
  const photoUrl = profile?.photoUrl ?? null;
  const uploading = profile?.uploading ?? false;
  const label = uploading ? "Saving..." : photoUrl ? "Change photo" : "Add photo";
  const dimension =
    size === "xl" ? "h-[72px] w-[72px] text-lg" : size === "lg" ? "h-11 w-11 text-sm" : "h-[38px] w-[38px] text-[13px]";

  return (
    <button
      type="button"
      onClick={() => canEdit && profile?.openPhotoPicker()}
      disabled={!canEdit || uploading}
      aria-label={canEdit ? `${label} profile photo` : `${profile?.identity?.name ?? "Account"} profile`}
      title={canEdit ? label : undefined}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#cfe0fb] font-bold text-[#0b2f78] ${dimension} ${
        canEdit ? "cursor-pointer" : "cursor-default"
      } ${className}`}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials(profile?.identity?.name)}</span>
      )}
      {canEdit && (
        <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full border border-[#0b2f78]/30 bg-[#0b2f78] text-white">
          <Camera className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

function SidebarMusic({ onReturn }: { onReturn: () => void }) {
  const { enabled, status, error, trackId, play, pause, setTrack } = useMusic();
  const current = trackById(trackId);
  const isPlaying = status === "playing";
  const isLoading = status === "loading" && enabled;
  const currentIndex = Math.max(0, TRACKS.findIndex((track) => track.id === trackId));

  const changeTrack = (offset: number) => {
    const next = (currentIndex + offset + TRACKS.length) % TRACKS.length;
    setTrack(TRACKS[next].id);
  };

  return (
    <div className="pt-6 sm:pt-10">
      <div className="hidden sm:block">
        <p className="mb-2 ml-1 text-xs text-[#aebfe3]">Music</p>
      <div className="flex items-center gap-2.5 rounded-[10px] border border-white/15 bg-white/10 px-2.5 py-2.5">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#dbe7fc]">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0b2f78" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{current.title}</p>
          <p className="truncate text-[11px] text-[#aebfe3]">
            {error ? "Unavailable" : isPlaying ? "Now playing" : enabled ? "Paused" : "Ready"}
          </p>
        </div>
        <span aria-hidden="true" className="text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l6 6-6 6M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>

      <div className="my-4 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => changeTrack(-1)}
          aria-label="Previous track"
          title="Previous track"
          className="flex p-1.5 text-white/90 transition hover:text-white"
        >
          <SkipBack className="h-[18px] w-[18px]" fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => (isPlaying || enabled ? pause() : play())}
          disabled={isLoading}
          aria-label={isPlaying ? "Pause background music" : "Play background music"}
          aria-pressed={isPlaying}
          title={isPlaying ? "Pause background music" : "Play background music"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f6bf5] text-white transition hover:bg-[#357bf7] disabled:opacity-60"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => changeTrack(1)}
          aria-label="Next track"
          title="Next track"
          className="flex p-1.5 text-white/90 transition hover:text-white"
        >
          <SkipForward className="h-[18px] w-[18px]" fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </button>
      </div>

      </div>

      <SidebarThemeToggle />

      <button
        type="button"
        onClick={onReturn}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-[9px] text-xs font-medium text-[#d3e0fb] transition hover:border-white/25 hover:bg-white/10 hover:text-white"
      >
        <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
        Return to Main Dashboard
      </button>

      {error && (
        <p role="status" className="mt-2 hidden rounded-md bg-[#7f1d1d]/40 px-2 py-1.5 text-[10px] leading-tight text-[#fecaca] sm:block">
          {error}
        </p>
      )}
    </div>
  );
}

function SidebarThemeToggle() {
  const light = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => false);

  return (
    <div className="flex items-center gap-2 rounded-full bg-white/10 p-1" aria-label="Theme">
      <button
        type="button"
        onClick={() => setTheme(true)}
        aria-pressed={light}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-[7px] text-xs transition ${
          light ? "bg-white/20 font-semibold text-white" : "font-medium text-[#d3e0fb] hover:text-white"
        }`}
      >
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
        Light
      </button>
      <button
        type="button"
        onClick={() => setTheme(false)}
        aria-pressed={!light}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-[7px] text-xs transition ${
          !light ? "bg-white/20 font-semibold text-white" : "font-medium text-[#d3e0fb] hover:text-white"
        }`}
      >
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
        Dark
      </button>
    </div>
  );
}

export default function Shell({
  items,
  active,
  onSelect,
  children,
  onLogout,
  contentClassName = "p-6 sm:p-8",
}: {
  items: SidebarItem[];
  active: string;
  onSelect?: (id: string) => void;
  children: React.ReactNode;
  onLogout: () => void;
  contentClassName?: string;
}) {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoRequestRef = useRef(0);

  useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem("pilotmate_theme");
      } catch {
        return null;
      }
    })();
    document.documentElement.classList.toggle("light", saved === null || saved === "light");
    document.documentElement.classList.toggle("dark", saved !== "light");
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  useEffect(() => {
    const role = getRole();
    const endpoint =
      role === "student" ? "/student/profile" : role === "instructor" ? "/instructor/me" : role === "admin" ? "/admin/me" : null;
    if (!endpoint) return;

    let cancelled = false;
    apiFetch(endpoint)
      .then((data) => {
        if (cancelled) return;
        if (role === "student") {
          setIdentity({
            role: "student",
            name: typeof data.name === "string" ? data.name : "Student",
            identifier: typeof data.student_id === "string" ? data.student_id : undefined,
            hasPhoto: Boolean(data.has_photo),
          });
        } else if (role === "instructor") {
          setIdentity({
            role: "instructor",
            name: typeof data.name === "string" ? data.name : "Instructor",
            hasPhoto: false,
          });
        } else {
          setIdentity({
            role: "admin",
            name: typeof data.name === "string" ? data.name : "Administrator",
            hasPhoto: false,
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIdentity({
          role: role === "instructor" ? "instructor" : role === "admin" ? "admin" : "student",
          name: role === "instructor" ? "Instructor" : role === "admin" ? "Administrator" : "Student",
          hasPhoto: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!identity?.hasPhoto) return;
    const token = getToken();
    if (!token) return;

    const requestId = ++photoRequestRef.current;
    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(`${API_URL}/student/profile/photo`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("No profile photo");
        const blob = await response.blob();
        if (cancelled || requestId !== photoRequestRef.current) return;
        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
      })
      .catch(() => {
        /* keep the initials fallback */
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [identity?.hasPhoto, identity?.role]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  async function uploadPhoto(file: File) {
    setPhotoError(null);
    setPhotoNotice(null);

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setPhotoError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Profile photos must be 2 MB or smaller.");
      return;
    }

    const token = getToken();
    if (!token) {
      setPhotoError("Your session has expired. Please log in again.");
      return;
    }

    setUploading(true);
    try {
      const response = await fetch(`${API_URL}/student/profile/photo`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the profile photo.");
      }

      photoRequestRef.current += 1;
      const nextUrl = URL.createObjectURL(file);
      setPhotoUrl(nextUrl);
      setIdentity((current) => (current ? { ...current, hasPhoto: true } : current));
      setPhotoNotice("Profile photo saved.");
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Could not save the profile photo.");
    } finally {
      setUploading(false);
    }
  }

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadPhoto(file);
  }

  function activate(item: SidebarItem) {
    if (item.href) {
      router.push(item.href);
      return;
    }
    onSelect?.(item.id);
  }

  const name = identity?.name ?? "Account";
  const roleLabel = identity ? ROLE_LABEL[identity.role] : "PilotMate";
  const canEditPhoto = identity?.role === "student";
  const photoLabel = uploading ? "Saving..." : photoUrl ? "Change photo" : "Add photo";
  const profileValue: ShellProfileValue = {
    identity,
    photoUrl,
    uploading,
    photoError,
    photoNotice,
    canEditPhoto,
    openPhotoPicker: () => fileInputRef.current?.click(),
  };

  return (
    <ShellProfileContext.Provider value={profileValue}>
    <div className="pilotmate-shell flex min-h-screen flex-col sm:h-screen sm:flex-row">
      <aside className="flex w-full shrink-0 flex-col overflow-y-auto bg-[linear-gradient(180deg,#0b2f78_0%,#071f55_55%,#051745_100%)] px-4 pb-5 pt-6 text-white sm:h-screen sm:w-[232px] sm:border-r sm:border-white/10">
        <div className="flex items-center gap-2.5 px-2 pb-5 sm:pb-7">
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#5aa2ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4z" />
          </svg>
          <span className="text-xl font-bold tracking-[.2px]">PilotMate</span>
        </div>

        <nav className="flex flex-row gap-1.5 overflow-x-auto pb-1 sm:flex-col sm:gap-1.5 sm:overflow-visible sm:pb-0" aria-label="Workspace">
          {items.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => activate(item)}
                aria-current={isActive ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-[11px] text-left text-sm transition-colors ${
                  isActive
                    ? "bg-[#1f6bf5] font-semibold text-white"
                    : "font-medium text-[#d3e0fb] hover:bg-white/10 hover:text-white"
                }`}
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {item.iconPaths.map((path) => (
                    <path key={path} d={path} />
                  ))}
                </svg>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-white/10 pt-4 sm:mt-auto sm:border-t-0 sm:pt-0">
          <SidebarMusic onReturn={() => router.push("/dashboard")} />
        </div>

        <div className="mt-5 flex items-center gap-2.5 px-1 sm:mt-11">
          <div className="relative">
            <ProfileAvatar />
            {canEditPhoto && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={chooseFile}
                className="sr-only"
                tabIndex={-1}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{name}</p>
            <p className="truncate text-[11px] text-[#aebfe3]">
              {roleLabel}
              {identity?.identifier ? ` \u00b7 ${identity.identifier}` : ""}
            </p>
            {canEditPhoto && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-0.5 block text-[10px] font-medium text-[#8db6ff] hover:text-white disabled:opacity-60"
              >
                {photoLabel}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#d3e0fb] transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {(photoError || photoNotice) && (
          <p
            role={photoError ? "alert" : "status"}
            className={`mt-2 px-1 text-[10px] leading-tight ${photoError ? "text-[#fecaca]" : "text-[#bbf7d0]"}`}
          >
            {photoError ?? photoNotice}
          </p>
        )}
      </aside>

      <main className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto ${contentClassName}`}>
        {children}
      </main>
    </div>
    </ShellProfileContext.Provider>
  );
}
