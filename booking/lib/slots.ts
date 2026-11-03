import { DateTime } from "luxon";
import type { Weekday } from "./config.ts";

export type Interval = { start: Date; end: Date };

type SlotRules = {
  timezone: string;
  weekly: Record<Weekday, string[]>;
  durationMinutes: number;
  minNoticeHours: number;
  bookingWindowDays: number;
};

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Every slot the weekly schedule offers between now + notice and the end of the booking window. */
export function candidateSlots(now: Date, rules: SlotRules): Interval[] {
  const earliest = DateTime.fromJSDate(now).plus({ hours: rules.minNoticeHours });
  const firstDay = DateTime.fromJSDate(now, { zone: rules.timezone }).startOf("day");
  const slots: Interval[] = [];

  for (let d = 0; d <= rules.bookingWindowDays; d++) {
    const day = firstDay.plus({ days: d });
    for (const time of rules.weekly[WEEKDAYS[day.weekday - 1]]) {
      const [hour, minute] = time.split(":").map(Number);
      const start = day.set({ hour, minute });
      // Skip times that don't exist on DST-change days (luxon shifts them forward).
      if (start.hour !== hour || start.minute !== minute) continue;
      if (start < earliest) continue;
      slots.push({
        start: start.toJSDate(),
        end: start.plus({ minutes: rules.durationMinutes }).toJSDate(),
      });
    }
  }
  return slots;
}

/** Drop slots that overlap (or come within `bufferMinutes` of) any busy interval. */
export function freeSlots(slots: Interval[], busy: Interval[], bufferMinutes = 0): Interval[] {
  const pad = bufferMinutes * 60_000;
  return slots.filter(
    (slot) =>
      !busy.some(
        (b) => slot.start.getTime() - pad < b.end.getTime() && slot.end.getTime() + pad > b.start.getTime(),
      ),
  );
}
