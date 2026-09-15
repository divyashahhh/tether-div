const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true
};

const icon = (paths) =>
  function Icon({ size, className = "", ...rest }) {
    return (
      <svg {...base} width={size || base.width} height={size || base.height} className={className} {...rest}>
        {paths}
      </svg>
    );
  };

export const IconNow = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>
);
export const IconMoments = icon(
  <>
    <rect x="3.5" y="6" width="17" height="13.5" rx="3.5" />
    <circle cx="12" cy="12.75" r="3.25" />
    <path d="M8.5 6l1.2-2h4.6l1.2 2" />
  </>
);
export const IconPlans = icon(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </>
);
export const IconMail = icon(
  <>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </>
);
export const IconLock = icon(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </>
);
export const IconUser = icon(
  <>
    <circle cx="12" cy="8.5" r="3.75" />
    <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
  </>
);
export const IconGlobe = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" />
  </>
);
export const IconCamera = icon(
  <>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </>
);
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);
export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </>
);
export const IconTrash = icon(<path d="M5 7h14M10 7V5h4v2M7 7l.8 12.5h8.4L17 7" />);
export const IconSend = icon(<path d="M20.5 3.5 3.5 10.5l7 3 3 7z M10.5 13.5l4-4" />);
export const IconMoon = icon(<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />);
export const IconSun = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </>
);
export const IconBriefcase = icon(
  <>
    <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
    <path d="M9 7.5V5.5h6v2M3.5 12.5h17" />
  </>
);
export const IconSparkle = icon(<path d="M12 3.5 13.8 10 20.5 12l-6.7 2-1.8 6.5-1.8-6.5L3.5 12l6.7-2z" />);
export const IconLogout = icon(<path d="M14 4.5h3.5A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5H14M10 16.5 5.5 12 10 7.5M5.5 12H15" />);
export const IconUnlink = icon(<path d="M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l2.5-2.5M14.5 9.5 17 7a3.5 3.5 0 0 1 5 5l-2.5 2.5M4 4l16 16" />);
export const IconClock = IconNow;
export const IconChevron = icon(<path d="m9 6 6 6-6 6" />);

export function IconHeart({ size = 26, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 21s-7.2-4.5-9.4-8.6C.9 9.2 3 5 7 5c2.1 0 3.4 1.1 5 3.1C13.6 6.1 14.9 5 17 5c4 0 6.1 4.2 4.4 7.4C19.2 16.5 12 21 12 21z" />
    </svg>
  );
}
