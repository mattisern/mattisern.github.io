"use client";

import { useEffect, useState } from "react";

/** Renders a timestamp in the visitor's own timezone (the server doesn't know it). */
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(
      new Date(iso).toLocaleString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    );
  }, [iso]);
  return <>{text || " "}</>;
}
