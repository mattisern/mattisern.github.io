import Link from "next/link";
import type { Metadata } from "next";
import { stripe } from "@/lib/stripe.ts";
import LocalTime from "./LocalTime.tsx";

export const metadata: Metadata = { title: "You're booked" };
export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  const session = session_id ? await stripe().checkout.sessions.retrieve(session_id).catch(() => null) : null;

  if (!session || !session.metadata?.start) {
    return (
      <main>
        <h1>Booking not found</h1>
        <p className="lede">
          We couldn't find that booking. If you've paid, your invite will still arrive by email.
        </p>
        <p style={{ marginTop: 28 }}>
          <Link href="/book">Back to booking</Link>
        </p>
      </main>
    );
  }

  const paid = session.payment_status !== "unpaid";
  const { start, name, email } = session.metadata;

  return (
    <main>
      <h1>{paid ? `You're booked, ${name.split(" ")[0]}` : "Payment processing"}</h1>
      <div className="card">
        <p className="step-label">When</p>
        <p style={{ margin: 0, fontSize: "1.1rem" }}>
          <LocalTime iso={start} />
        </p>
        <hr className="divider" />
        <p style={{ margin: 0 }}>
          {paid ? (
            <>
              A calendar invite with the Google Meet link is on its way to <strong>{email}</strong>. If it hasn't
              arrived in a few minutes, check your spam folder.
            </>
          ) : (
            <>
              Your time is held while your payment completes. As soon as it does, a calendar invite with the Google
              Meet link will be sent to <strong>{email}</strong>.
            </>
          )}
        </p>
      </div>
    </main>
  );
}
