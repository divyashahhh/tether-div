import { useRef, useState } from "react";

/**
 * Adapted from 21st.dev prebuiltui "Glowing Border On Hover Card":
 * a blurred red orb follows the pointer (or finger) behind a 1px border.
 */
export function GlowCard({ children, className = "", innerClassName = "", glow = "from-brand via-brand-deep to-brand-blood", alwaysOn = false }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 160, y: 60 });

  const track = (e) => {
    const bounds = ref.current.getBoundingClientRect();
    setPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
  };

  return (
    <div
      ref={ref}
      onPointerMove={track}
      onPointerEnter={() => setVisible(true)}
      onPointerLeave={() => setVisible(false)}
      className={`relative overflow-hidden rounded-3xl bg-surface-3/70 p-px shadow-card ${className}`}
    >
      <div
        className={`pointer-events-none absolute z-0 size-60 rounded-full bg-gradient-to-r ${glow} blur-3xl transition-opacity duration-500 ${
          visible || alwaysOn ? "opacity-70" : "opacity-0"
        }`}
        style={{ top: position.y - 120, left: position.x - 120 }}
      />
      <div className={`relative z-10 h-full w-full rounded-[23px] bg-surface/90 ${innerClassName}`}>{children}</div>
    </div>
  );
}
