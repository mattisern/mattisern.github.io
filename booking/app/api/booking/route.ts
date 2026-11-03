import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe.ts";

export const dynamic = "force-dynamic";

// What the widget shows when a client comes back from Stripe: ?session_id=cs_...
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!id.startsWith("cs_")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await stripe().checkout.sessions.retrieve(id).catch(() => null);
  const m = session?.metadata;
  if (!session || !m?.start) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    start: m.start,
    email: m.email,
    name: m.name,
    paid: session.payment_status !== "unpaid",
  });
}
