// Booking widget for lightly.io. Drop this on a page:
//
//   <div id="book" data-lightly-booking="conversation">…fallback link…</div>
//   <script src="https://book.lightly.io/embed.js" defer></script>
//
// List several offerings ("exploration conversation") to get a switch between them;
// the first is selected to begin with.
//
// It replaces the element's contents with the booking flow (days → times → details),
// talking to the booking API on the origin this script was loaded from. Paid bookings go
// to Stripe and come back to the same page with ?lb_session=… (or ?lb_release=… if the
// client backed out). Styling comes from the host page: see the .lb-* rules in style.css.

(() => {
  const BASE = new URL(document.currentScript.src).origin;
  const LOCALE = "en-GB";

  const params = new URLSearchParams(location.search);
  const returnedSession = params.get("lb_session");
  const releaseHold = params.get("lb_release");
  const returnedOffering = params.get("lb_offering");
  if (returnedSession || releaseHold || returnedOffering) {
    params.delete("lb_session");
    params.delete("lb_release");
    params.delete("lb_offering");
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? `?${query}` : "") + location.hash);
  }
  // Back from Stripe without paying: free the held slot before showing times again.
  const released = releaseHold
    ? api("/api/release", { holdId: releaseHold }).catch(() => {})
    : Promise.resolve();

  // Clients coming back from Stripe land on #book, so that widget shows the result.
  const mounts = [...document.querySelectorAll("[data-lightly-booking]")];
  const returnTarget = mounts.find((el) => el.id === "book") || mounts[0];
  mounts.forEach((el) => {
    const ids = el.dataset.lightlyBooking.split(/\s+/).filter(Boolean);
    mount(el, ids, el === returnTarget ? returnedSession : null);
  });

  function mount(root, offeringIds, sessionId) {
    const state = {
      offeringId: offeringIds.includes(returnedOffering) ? returnedOffering : offeringIds[0],
      offerings: {},
      data: null,
      loadError: null,
      day: null,
      slot: null,
      currency: null,
      form: { name: "", email: "", note: "" },
      submitting: false,
      formError: null,
      confirmed: null,
    };
    const set = (patch) => {
      Object.assign(state, patch);
      render();
    };

    async function load() {
      set({ loadError: null });
      try {
        // Every offering shares the same free times; each response also carries its details.
        const responses = await Promise.all(
          offeringIds.map((id) => api(`/api/availability?offering=${encodeURIComponent(id)}`)),
        );
        const offerings = Object.fromEntries(responses.map((r) => [r.offering.id, r.offering]));
        const data = responses[0];
        const days = groupByDay(data.slots);
        const day = days.some(([key]) => key === state.day) ? state.day : days[0]?.[0] ?? null;
        const prices = Object.values(offerings).flatMap((o) => o.prices);
        set({ data, offerings, day, currency: state.currency ?? defaultCurrency(prices) });
      } catch (e) {
        set({ loadError: e.message || "Couldn't load available times." });
      }
    }

    async function submit(e) {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      set({ submitting: true, formError: null });
      try {
        const res = await api("/api/checkout", {
          offering: state.offeringId,
          start: state.slot.start,
          currency: state.currency,
          ...state.form,
          website: form.get("website"),
          returnUrl: location.href,
        });
        if (res.confirmed) {
          set({ confirmed: { ...res.confirmed, paid: true }, submitting: false });
          root.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          location.href = res.url;
        }
      } catch (err) {
        set({ submitting: false, formError: err.message || "Something went wrong. Please try again." });
        if (err.status === 409) {
          set({ slot: null });
          load();
        }
      }
    }

    function render() {
      root.classList.add("lb");
      root.replaceChildren(view());
    }

    function view() {
      const { data, loadError, confirmed } = state;

      if (confirmed) {
        return h(
          "div",
          { class: "lb-card" },
          h("p", { class: "lb-label" }, confirmed.paid ? "You're booked" : "Payment processing"),
          h("p", { class: "lb-when" }, longDate(confirmed.start)),
          h(
            "p",
            { class: "lb-text" },
            confirmed.paid
              ? "A calendar invite with the Google Meet link is on its way to "
              : "Your time is held while the payment completes. Then a calendar invite with the Google Meet link goes to ",
            h("strong", {}, confirmed.email),
            confirmed.paid ? ". If it hasn't arrived in a few minutes, check your spam folder." : ".",
          ),
        );
      }

      if (loadError) {
        return h(
          "div",
          { class: "lb-card" },
          h("p", { class: "lb-error" }, loadError),
          h("button", { type: "button", class: "lb-submit", onclick: load }, "Try again"),
        );
      }

      if (!data) return h("div", { class: "lb-card" }, h("p", { class: "lb-hint" }, "Loading available times…"));

      const { durationMinutes } = data;
      const offering = state.offerings[state.offeringId];
      const free = offering.prices.length === 0;
      const selected = offering.prices.find((p) => p.currency === state.currency) || offering.prices[0];
      const price = free ? "Free" : selected ? formatPrice(selected) : "";
      const days = groupByDay(data.slots);
      const daySlots = days.find(([key]) => key === state.day)?.[1] ?? [];

      return h(
        "div",
        { class: "lb-card" },
        offeringIds.length > 1 &&
          h(
            "div",
            { class: "lb-switch", role: "radiogroup", "aria-label": "What to book" },
            offeringIds.map((id) =>
              h(
                "button",
                {
                  type: "button",
                  role: "radio",
                  class: "lb-tab",
                  "aria-checked": String(id === state.offeringId),
                  "aria-pressed": String(id === state.offeringId),
                  onclick: () => set({ offeringId: id, formError: null }),
                },
                state.offerings[id].label,
              ),
            ),
          ),
        h(
          "p",
          { class: "lb-meta" },
          `${durationMinutes} minutes · Google Meet · ${free ? "Free" : offering.prices.map(formatPrice).join(" / ")}`,
        ),

        days.length === 0
          ? h("p", { class: "lb-hint" }, "No times are available right now. Please check back soon.")
          : [
              h("p", { class: "lb-label" }, "Pick a day"),
              h(
                "div",
                { class: "lb-days" },
                days.map(([key, slots]) => {
                  const d = new Date(slots[0].start);
                  return h(
                    "button",
                    {
                      type: "button",
                      class: "lb-chip",
                      "aria-pressed": String(key === state.day),
                      onclick: () => set({ day: key, slot: null, formError: null }),
                    },
                    h("span", { class: "lb-dow" }, d.toLocaleDateString(LOCALE, { weekday: "short" })),
                    h("span", { class: "lb-date" }, d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" })),
                  );
                }),
              ),

              h("p", { class: "lb-label" }, "Pick a time"),
              h(
                "div",
                { class: "lb-times" },
                daySlots.map((s) =>
                  h(
                    "button",
                    {
                      type: "button",
                      class: "lb-chip",
                      "aria-pressed": String(s.start === state.slot?.start),
                      onclick: () => set({ slot: s, formError: null }),
                    },
                    new Date(s.start).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }),
                  ),
                ),
              ),
              h("p", { class: "lb-hint" }, `Times are in your timezone (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`),
            ],

        state.slot && detailsForm({ offering, free, price, durationMinutes }),
      );
    }

    function detailsForm({ offering, free, price, durationMinutes }) {
      const field = (name, label, attrs) =>
        h(
          "label",
          { class: "lb-field" },
          h("span", {}, label),
          h(attrs.multiline ? "textarea" : "input", {
            name,
            ...attrs,
            multiline: null,
            value: attrs.multiline ? null : state.form[name],
            oninput: (e) => (state.form[name] = e.target.value),
          }),
        );

      const note = field("note", "", { multiline: true, maxlength: 1000 });
      note.querySelector("textarea").value = state.form.note;
      note.firstChild.append(offering.notePrompt, " ", h("span", { class: "lb-optional" }, "(optional)"));

      return h(
        "form",
        { class: "lb-form", onsubmit: submit },
        h("p", { class: "lb-label" }, "Your details"),
        h("p", { class: "lb-summary" }, `${longDate(state.slot.start)} · ${durationMinutes} min · ${price}`),
        field("name", "Name", { required: true, maxlength: 100, autocomplete: "name" }),
        field("email", "Email", { type: "email", required: true, maxlength: 200, autocomplete: "email" }),
        note,
        // Spam trap: hidden from people, but bots fill it in.
        h("input", { name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true", class: "lb-trap" }),
        offering.prices.length > 1 &&
          h(
            "div",
            { class: "lb-currency", role: "radiogroup", "aria-label": "Currency" },
            h("span", {}, "Pay in"),
            offering.prices.map((p) =>
              h(
                "button",
                {
                  type: "button",
                  role: "radio",
                  class: "lb-chip",
                  "aria-checked": String(p.currency === state.currency),
                  "aria-pressed": String(p.currency === state.currency),
                  onclick: () => set({ currency: p.currency }),
                },
                formatPrice(p),
              ),
            ),
          ),
        state.formError && h("p", { class: "lb-error" }, state.formError),
        h(
          "button",
          { type: "submit", class: "lb-submit", disabled: state.submitting },
          free
            ? state.submitting
              ? "Booking…"
              : "Book this time"
            : state.submitting
              ? "Opening payment…"
              : `Continue to payment · ${price}`,
        ),
        h(
          "p",
          { class: "lb-hint" },
          free
            ? "You'll get a calendar invite with a Google Meet link by email straight away."
            : "The time is held for you for 30 minutes while you pay. Your calendar invite with a Google Meet link arrives by email as soon as payment goes through.",
        ),
      );
    }

    render();
    released.then(async () => {
      if (sessionId) {
        try {
          const b = await api(`/api/booking?session_id=${encodeURIComponent(sessionId)}`);
          set({ confirmed: { start: b.start, email: b.email, paid: b.paid } });
          root.scrollIntoView({ block: "start" });
          return;
        } catch {}
      }
      await load();
      if (location.hash === `#${root.id}`) root.scrollIntoView({ block: "start" });
    });
  }

  async function api(path, body) {
    const res = await fetch(BASE + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error || ""), { status: res.status });
    return json;
  }

  // Small DOM builder; text is always added as text, never as HTML.
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else if (key === "value") el.value = value;
      else el.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat(Infinity)) {
      if (child != null && child !== false) el.append(child);
    }
    return el;
  }

  function groupByDay(slots) {
    const map = new Map();
    for (const s of slots) {
      // en-CA formats as YYYY-MM-DD, a handy key for the visitor's local date.
      const key = new Date(s.start).toLocaleDateString("en-CA");
      map.set(key, [...(map.get(key) || []), s]);
    }
    return [...map.entries()];
  }

  function formatPrice({ amount, currency }) {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100);
  }

  // Swedish time → SEK, American time → USD, otherwise the first price.
  function defaultCurrency(prices) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const guess = tz === "Europe/Stockholm" ? "sek" : tz.startsWith("America/") ? "usd" : null;
    return (prices.find((p) => p.currency === guess) || prices[0] || {}).currency || null;
  }

  function longDate(iso) {
    return new Date(iso).toLocaleString(LOCALE, {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
})();
