"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Slot = { start: string; end: string };
type Price = { amount: number; currency: string };
type Availability = { durationMinutes: number; slots: Slot[] };
type Offering = { id: string; path: string; prices: Price[]; notePrompt: string };

// en-CA formats dates as YYYY-MM-DD, which makes a handy grouping key in the visitor's timezone.
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

const formatPrice = ({ amount, currency }: Price) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);

/**
 * Guess the visitor's currency from their timezone (more reliable than browser language,
 * which is often English anywhere). Falls back to the first configured currency.
 */
function defaultCurrency(prices: Price[]) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const guess = tz === "Europe/Stockholm" ? "sek" : tz.startsWith("America/") ? "usd" : undefined;
  return prices.find((p) => p.currency === guess)?.currency ?? prices[0]?.currency;
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });

export default function BookingFlow({ offering }: { offering: Offering }) {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Availability>();
  const [loadError, setLoadError] = useState<string>();
  const [day, setDay] = useState<string>();
  const [slot, setSlot] = useState<Slot>();
  const [currency, setCurrency] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [confirmed, setConfirmed] = useState<{ start: string; email: string }>();
  const free = offering.prices.length === 0;

  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const res = await fetch("/api/availability", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
      // Guessed here, in the browser: the server doesn't know the visitor's timezone.
      setCurrency((c) => c ?? defaultCurrency(offering.prices));
    } catch (e) {
      setLoadError(e instanceof Error && e.message ? e.message : "Couldn't load available times.");
    }
  }, []);

  useEffect(() => {
    // Back from Stripe without paying: free the held slot first so it shows as available again.
    const release = params.get("release");
    (async () => {
      if (release) {
        await fetch("/api/release", { method: "POST", body: JSON.stringify({ holdId: release }) }).catch(() => {});
        router.replace(offering.path);
      }
      await load();
    })();
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of data?.slots ?? []) {
      const key = dayKey(s.start);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [data]);

  const daySlots = days.find(([key]) => key === day)?.[1] ?? [];

  const selectedPrice = offering.prices.find((p) => p.currency === currency);
  const price = free ? "Free" : selectedPrice ? formatPrice(selectedPrice) : "";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot) return;
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setFormError(undefined);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offering: offering.id,
          start: slot.start,
          currency,
          name: form.get("name"),
          email: form.get("email"),
          note: form.get("note"),
          website: form.get("website"),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error);
        if (res.status === 409) {
          setSlot(undefined);
          await load();
        }
        setSubmitting(false);
        return;
      }
      if (json.confirmed) {
        setConfirmed(json.confirmed);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      window.location.href = json.url;
    } catch {
      setFormError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="card">
        <p className="error">{loadError}</p>
        <p style={{ marginTop: 16 }}>
          <button className="button" onClick={load}>Try again</button>
        </p>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="card">
        <p className="step-label">You're booked</p>
        <p style={{ margin: 0, fontSize: "1.1rem" }}>{longDate(confirmed.start)}</p>
        <hr className="divider" />
        <p style={{ margin: 0 }}>
          A calendar invite with the Google Meet link is on its way to <strong>{confirmed.email}</strong>. If it
          hasn't arrived in a few minutes, check your spam folder.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <p className="empty">Loading available times…</p>
      </div>
    );
  }

  return (
    <>
      <div className="meta">
        <span>{data.durationMinutes} minutes</span>
        <span>Google Meet</span>
        <span>{free ? "Free" : offering.prices.map(formatPrice).join(" / ")}</span>
      </div>

      <div className="card">
        <p className="step-label">1. Pick a day</p>
        {days.length === 0 ? (
          <p className="empty">No times are available right now. Please check back soon.</p>
        ) : (
          <div className="days">
            {days.map(([key, slots]) => {
              const d = new Date(slots[0].start);
              return (
                <button
                  key={key}
                  type="button"
                  className="chip"
                  aria-pressed={key === day}
                  onClick={() => {
                    setDay(key);
                    setSlot(undefined);
                  }}
                >
                  <span className="dow">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <span className="date">{d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                </button>
              );
            })}
          </div>
        )}

        {day && (
          <>
            <hr className="divider" />
            <p className="step-label">2. Pick a time</p>
            <div className="times">
              {daySlots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  className="chip"
                  aria-pressed={s.start === slot?.start}
                  onClick={() => setSlot(s)}
                >
                  {new Date(s.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 12 }}>Times are in your timezone ({timeZone}).</p>
          </>
        )}

        {slot && (
          <>
            <hr className="divider" />
            <p className="step-label">3. Your details</p>
            <form onSubmit={submit}>
              <div className="summary">
                {longDate(slot.start)} · {data.durationMinutes} min · {price}
              </div>
              <label>
                Name
                <input name="name" required maxLength={100} autoComplete="name" />
              </label>
              <label>
                Email
                <input name="email" type="email" required maxLength={200} autoComplete="email" />
              </label>
              <label>
                <span>
                  {offering.notePrompt} <span className="optional">(optional)</span>
                </span>
                <textarea name="note" maxLength={1000} />
              </label>
              {/* Spam trap: hidden from people, but bots fill it in. */}
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="trap" />
              {offering.prices.length > 1 && (
                <div role="radiogroup" aria-label="Currency" className="currency">
                  <span>Pay in</span>
                  {offering.prices.map((p) => (
                    <button
                      key={p.currency}
                      type="button"
                      role="radio"
                      className="chip"
                      aria-checked={p.currency === currency}
                      aria-pressed={p.currency === currency}
                      onClick={() => setCurrency(p.currency)}
                    >
                      {formatPrice(p)}
                    </button>
                  ))}
                </div>
              )}
              {formError && <p className="error">{formError}</p>}
              <button className="button" disabled={submitting}>
                {free
                  ? submitting
                    ? "Booking…"
                    : "Book this time"
                  : submitting
                    ? "Opening payment…"
                    : `Continue to payment · ${price}`}
              </button>
              <p className="hint">
                {free
                  ? "You'll get a calendar invite with a Google Meet link by email straight away."
                  : "The time is held for you for 30 minutes while you pay. Your calendar invite with a Google Meet link arrives by email as soon as payment goes through."}
              </p>
            </form>
          </>
        )}
      </div>
    </>
  );
}
