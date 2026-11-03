import { NextResponse } from "next/server";
import { booking, getOffering } from "@/lib/config.ts";
import { availableSlots } from "@/lib/booking.ts";

export const dynamic = "force-dynamic";

// Every offering shares the same schedule and calendar, so there's one list of free slots.
// ?offering=<id> also returns that offering's details, for the widget on lightly.io.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("offering");
  const offering = id ? getOffering(id) : undefined;
  if (id && !offering) return NextResponse.json({ error: "Unknown booking type." }, { status: 404 });

  try {
    const slots = await availableSlots();
    return NextResponse.json({
      durationMinutes: booking.durationMinutes,
      offering: offering && {
        id: offering.id,
        name: offering.name,
        prices: offering.prices,
        label: offering.label,
        kind: offering.kind,
        notePrompt: offering.notePrompt,
      },
      slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    });
  } catch (e) {
    console.error("[availability]", e);
    return NextResponse.json({ error: "Couldn't load available times. Please try again shortly." }, { status: 500 });
  }
}
