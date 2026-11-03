import { redirect } from "next/navigation";

// book.lightly.io has nothing but the booking flow.
export default function Home() {
  redirect("/book");
}
