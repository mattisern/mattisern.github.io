# lightly.io

The static pages in this folder are lightly.io, published by GitHub Pages from `master`.
`booking/` is the paid booking app at book.lightly.io, deployed by Netlify. See `booking/SETUP.md`.

## Try changes locally before pushing

```bash
npm run dev
```

- Site: <http://localhost:4000>
- Booking: <http://localhost:3000/book>

Locally, "Book a conversation" goes to the local booking app, which uses Stripe test mode. Test card: `4242 4242 4242 4242`.
For bookings to confirm locally, also run the `stripe listen` command from `booking/SETUP.md` in a second terminal.

Nothing goes live until you push `master`.
