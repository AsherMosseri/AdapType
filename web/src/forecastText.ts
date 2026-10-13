import type { Forecast } from "../../engine/src";

type Unit = { name: string; days: number };
const DAY: Unit = { name: "day", days: 1 };
const WEEK: Unit = { name: "week", days: 7 };
const MONTH: Unit = { name: "month", days: 30 };

const unitFor = (days: number): Unit => (days < 10 ? DAY : days < 56 ? WEEK : MONTH);
const count = (days: number, unit: Unit) => Math.max(1, Math.round(days / unit.days));
const plural = (n: number, unit: Unit) => `${n} ${unit.name}${n === 1 ? "" : "s"}`;

/** "about a day", "about 4 days", "about 3 weeks", "about 5 months". */
export function aboutDays(days: number): string {
  if (days < 1.5) return "about a day";
  const unit = unitFor(days);
  return `about ${plural(count(days, unit), unit)}`;
}

/** "2 to 5 weeks", in the unit that suits the longer end; collapses to "about" when both ends match. */
export function rangeDays(low: number, high: number): string {
  const unit = unitFor(high);
  const a = count(low, unit);
  const b = count(high, unit);
  if (a >= b) return aboutDays(high);
  return `${a} to ${plural(b, unit)}`;
}

/** The forecast as a short phrase; for none, why there isn't one. */
export function forecastText(f: Forecast, subject: "goal" | "key" = "goal"): string {
  switch (f.kind) {
    case "reached":
      return subject === "goal" ? "You're there" : "Already at your goal";
    case "estimate":
      return aboutDays(f.days);
    case "range":
      return rangeDays(f.low, f.high);
    case "none":
      return {
        data: "Keep practicing to see a forecast",
        flat: subject === "goal" ? "Not trending up yet, so no forecast" : "Not getting faster yet, so no forecast",
        uncertain: "Too up and down to forecast yet",
        far: "More than a year away at this pace",
        accuracy: "Accuracy first: it needs fewer mistakes before speed counts",
      }[f.reason];
  }
}

/** Whether the forecast is a time (estimate or range) rather than a note. */
export function isTimed(f: Forecast): boolean {
  return f.kind === "estimate" || f.kind === "range";
}
