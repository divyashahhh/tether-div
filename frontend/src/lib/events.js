export const REACTIONS = [
  { id: "seen", emoji: "👀", label: "Seen" },
  { id: "smiled", emoji: "😊", label: "Smiled" },
  { id: "heart_spark", emoji: "💞", label: "Heart Spark" }
];

export const MOODS = ["😊", "🥰", "😴", "😌", "🥲", "😤", "🤒", "🎉", "☕️", "📚"];

export function reactionMeta(id) {
  return REACTIONS.find((r) => r.id === id) || { emoji: "✨", label: id };
}

/** Human sentence for an activity-feed event, e.g. "sent you a note". */
export function describeEvent(event) {
  const p = event.payload || {};
  switch (event.event_type) {
    case "nudge":
      return { icon: "❤️", text: "is thinking of you" };
    case "note":
      return { icon: "✉️", text: `“${p.message}”` };
    case "mood_update":
      return { icon: p.emoji || "💭", text: p.note ? `feels ${p.note}` : "updated their mood" };
    case "moment_window_started":
      return { icon: "⏱", text: "opened a 5-minute Moment window" };
    case "moment_created":
      return { icon: "📸", text: p.on_time ? "shared a Moment, right on time" : "shared today's Moment" };
    case "reaction_added":
      return { icon: reactionMeta(p.reaction).emoji, text: `reacted ${reactionMeta(p.reaction).label}` };
    case "plan_created":
      return { icon: "🗓", text: `planned “${p.title}”` };
    case "plan_updated":
      return { icon: p.done ? "✅" : "🗓", text: p.done ? `ticked off “${p.title}”` : `updated “${p.title}”` };
    case "plan_deleted":
      return { icon: "🗑", text: `removed “${p.title}”` };
    case "availability_updated":
      return { icon: "🌙", text: "updated their availability" };
    case "profile_updated":
      return { icon: "👤", text: "updated their profile" };
    case "pair_connected":
      return { icon: "🔗", text: "tethered with you" };
    default:
      return { icon: "•", text: event.event_type.replace(/_/g, " ") };
  }
}

/** Which event types should make each screen refetch its data. */
export const REFRESH_ON = {
  status: ["mood_update", "profile_updated"],
  moments: ["moment_created", "moment_window_started", "reaction_added", "profile_updated"],
  plans: ["plan_created", "plan_updated", "plan_deleted"],
  availability: ["availability_updated", "profile_updated"]
};

export function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}
