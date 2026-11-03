// Mirrored review calendar resolver from metto-data; source metadata in isfahan-service-source.json.
/** Review-only Isfahan calendar: national holidays and Friday are independent. */
import data from "@/data/reference/isfahan-service.json";
const rawPolicy = data.calendar;

export type HolidayStatus = "ordinary" | "public_holiday" | "unknown";
export type DateOverride = {
  date: string;
  availability: "closed" | "modified";
  verification: "source_verified" | "unverified";
  hours?: { start: string; end: string };
  timetableRef?: string;
  evidence: { url: string; publishedOn: string; sha256: string; kind: "operator_notice" | "operator_quoted_report" | "user_report" };
};
export type CalendarPolicy = {
  cityId: string; timezone: string; reviewOnly: boolean; productionEtaApproved: boolean;
  regularPatternsNotBefore: string;
  weekdayRule: { serviceId: string; firstTerminalDeparture: string; lastTerminalDeparture: string; sourceReferenceId: string };
  fridayRule: { serviceId: string; firstTerminalDeparture: string; lastTerminalDeparture: string; sourceReferenceId: string };
  nonFridayHolidayRule: { availability: string; provisionalExpectation: string; confirmedBlanketClosure: boolean; departuresAllowed: boolean; sourceReferenceId: string };
  dateOverrides: DateOverride[];
};
export const isfahanCalendarPolicy = rawPolicy as CalendarPolicy;
function civilDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Expected an Asia/Tehran civil date, YYYY-MM-DD");
  const instant = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) throw Error("Invalid civil date");
  return instant.getUTCDay();
}
export function resolveIsfahanServiceDate(date: string, holidayStatus: HolidayStatus, policy: CalendarPolicy = isfahanCalendarPolicy) {
  const isFriday = civilDay(date) === 5;
  if (!["ordinary", "public_holiday", "unknown"].includes(holidayStatus)) throw Error("Invalid holiday classification");
  if (policy.cityId !== "isfahan" || policy.timezone !== "Asia/Tehran" || policy.reviewOnly !== true || policy.productionEtaApproved !== false) throw Error("Invalid review calendar boundary");
  const base = { date, timezone: "Asia/Tehran", isFriday, holidayStatus, reviewOnly: true as const, productionEtaApproved: false as const };
  const result = (category: string, availability: string, serviceId: string | null, hours: { start: string; end: string } | null,
    evidence: string[], reason: string, provisionalExpectation: string | null = null) =>
    ({ ...base, category, availability, serviceId, hours, evidence, reason, provisionalExpectation });
  civilDay(policy.regularPatternsNotBefore);
  for (const o of policy.dateOverrides) {
    civilDay(o.date);
    if (!["closed", "modified"].includes(o.availability) || !["source_verified", "unverified"].includes(o.verification)) throw Error("Invalid date override");
  }
  const overrides = policy.dateOverrides.filter(o => o.date === date);
  const verified = overrides.filter(o => o.verification === "source_verified" && o.evidence.kind !== "user_report" &&
    ["operator_notice", "operator_quoted_report"].includes(o.evidence.kind) &&
    /^https:\/\//.test(o.evidence.url) && /^\d{4}-\d{2}-\d{2}$/.test(o.evidence.publishedOn) && /^[a-f0-9]{64}$/.test(o.evidence.sha256));
  if (verified.length > 1) return result("date_override", "unconfirmed", null, null, verified.map(o => o.evidence.url), "Conflicting verified date overrides require reconciliation");
  if (verified.length === 1) {
    const o = verified[0];
    civilDay(o.evidence.publishedOn);
    if (o.availability === "closed") return result("date_override", "closed", null, null, [o.evidence.url], "Verified date-specific closure");
    if (!o.hours || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(o.hours.start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(o.hours.end) || o.hours.start >= o.hours.end) throw Error("Invalid modified-hours override");
    return result("date_override", o.timetableRef ? "published_pattern" : "hours_only", o.timetableRef ?? null, o.hours, [o.evidence.url], "Verified date-specific hours; station times require their own timetable");
  }
  if (overrides.length) return result("date_override", "unconfirmed", null, null, overrides.map(o => o.evidence.url), "Unverified date-specific report blocks a normal-service promise");
  if (date < policy.regularPatternsNotBefore) return result("unconfirmed", "unconfirmed", null, null, [], "Current poster cannot establish historical service before its publication");
  if (isFriday) {
    const r = policy.fridayRule;
    return result("friday", "published_pattern", r.serviceId, { start: r.firstTerminalDeparture, end: r.lastTerminalDeparture }, [r.sourceReferenceId], "Friday pattern; date-specific overrides take priority");
  }
  if (holidayStatus === "public_holiday") {
    const r = policy.nonFridayHolidayRule;
    if (r.confirmedBlanketClosure || !r.departuresAllowed || r.availability !== "assumed_pattern" || r.provisionalExpectation !== "friday_service") throw Error("Invalid provisional holiday rule");
    const friday = policy.fridayRule;
    return result("public_holiday", "assumed_pattern", friday.serviceId,
      { start: friday.firstTerminalDeparture, end: friday.lastTerminalDeparture },
      [r.sourceReferenceId, friday.sourceReferenceId], "Owner-authorized Friday fallback on public holidays; not operator verified", r.provisionalExpectation);
  }
  if (holidayStatus === "unknown") return result("unconfirmed", "unconfirmed", null, null, [], "Holiday classification is required before selecting a weekday pattern");
  const r = policy.weekdayRule;
  return result("weekday", "published_pattern", r.serviceId, { start: r.firstTerminalDeparture, end: r.lastTerminalDeparture }, [r.sourceReferenceId], "Ordinary Saturday–Thursday pattern");
}
