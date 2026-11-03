import { Suspense } from "react";
import type { Metadata } from "next";
import { booking } from "@/lib/config.ts";
import BookingFlow from "./BookingFlow.tsx";

export const metadata: Metadata = { title: `Book: ${booking.session.name}` };

export default function BookPage() {
  return (
    <main>
      <h1>Book a conversation</h1>
      <p className="lede">{booking.session.description}</p>
      <Suspense>
        <BookingFlow />
      </Suspense>
    </main>
  );
}
