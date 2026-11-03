import BookingPage, { bookingMetadata } from "../BookingPage.tsx";

export const metadata = bookingMetadata("exploration");

export default function Page() {
  return <BookingPage id="exploration" />;
}
