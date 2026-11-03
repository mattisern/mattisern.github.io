import { NextResponse } from "next/server";
import { booking } from "@/lib/config.ts";
import { availableSlots } from "@/lib/booking.ts";

export const dynamic = "force-dynamic";

// Every offering shares the same schedule and calendar, so there's one list of free slots.
export async function GET() {
  try {
    const slots = await availableSlots();
    return NextResponse.json({
      durationMinutes: booking.durationMinutes,
      slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    });
  } catch (e) {
    console.error("[availability]", e);
    return NextResponse.json({ error: "Couldn't load available times. Please try again shortly." }, { status: 500 });
  }
}
