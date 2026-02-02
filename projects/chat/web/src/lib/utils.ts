import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseDate(date: Date | string): Date {
  if (date instanceof Date) return date;

  // Handle time-only strings like "11:14:35" from the database
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(date)) {
    const today = new Date();
    const [hours, minutes, seconds = '0'] = date.split(':');
    today.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds), 0);
    return today;
  }

  // Handle ISO strings or other formats
  const d = new Date(date);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function formatTime(date: Date | string): string {
  const d = parseDate(date);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDate(date: Date | string): string {
  const d = parseDate(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "Today";
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return d.toLocaleDateString([], { weekday: "long" });
  } else {
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
}

export function formatRelativeTime(date: Date | string): string {
  const d = parseDate(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return "just now";
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days === 1) {
    return "yesterday";
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  }
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}
