import { Suspense } from "react";
import type { Metadata } from "next";
import { offerings, type Offering, type OfferingId } from "@/lib/config.ts";
import BookingFlow from "./book/BookingFlow.tsx";

export function bookingMetadata(id: OfferingId): Metadata {
  return { title: `Book: ${offerings[id].name}`, description: offerings[id].description };
}

export default function BookingPage({ id }: { id: OfferingId }) {
  const { heading, description, path, prices, notePrompt, priceLabel }: Offering = offerings[id];
  return (
    <main>
      <h1>{heading}</h1>
      <p className="lede">{description}</p>
      <Suspense>
        <BookingFlow offering={{ id, path, prices, notePrompt, priceLabel }} />
      </Suspense>
    </main>
  );
}
