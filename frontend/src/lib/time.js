const FALLBACK_TIMEZONES = [
  "Pacific/Honolulu",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC"
];

export function allTimezones() {
  try {
    const zones = Intl.supportedValuesOf("timeZone");
    return zones.includes("UTC") ? zones : [...zones, "UTC"];
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function cityOf(timezone) {
  if (!timezone) return "";
  return timezone.split("/").pop().replace(/_/g, " ");
}

export function formatTime(value, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(new Date(value));
}

export function formatDayTime(value, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(new Date(value));
}

export function formatWeekdayTime(value, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(new Date(value));
}

export function relativeTime(value) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Hour difference between two zones right now, e.g. +15 or -8. */
export function hourOffset(fromTz, toTz) {
  const now = new Date();
  const offset = (tz) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric"
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    return (asUtc - now.getTime()) / 3600000;
  };
  return Math.round((offset(toTz) - offset(fromTz)) * 2) / 2;
}

/** Interpret a <input type="datetime-local"> value as wall-clock time in `timezone`. */
export function localInputToIso(value, timezone) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wallAsUtc;
  for (let i = 0; i < 2; i += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric"
      })
        .formatToParts(new Date(guess))
        .map((p) => [p.type, p.value])
    );
    const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    guess += wallAsUtc - shown;
  }
  return new Date(guess).toISOString();
}

/** ISO instant -> value for <input type="datetime-local"> in `timezone`. */
export function isoToLocalInput(value, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function countdown(msLeft) {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
