import BookingPage, { bookingMetadata } from "../BookingPage.tsx";

export const metadata = bookingMetadata("conversation");

export default function Page() {
  return <BookingPage id="conversation" />;
}
