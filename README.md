# FORGE — sports nutrition ecommerce

React 19 + Vite storefront, Express 5 / Node 24 API, Prisma 6 with SQLite, Stripe Checkout, optional OpenAI query interpretation.

## Run the full app

Use Node.js 22.12+ (24 recommended).

```bash
npm ci
cp .env.example .env
# Set ADMIN_EMAIL and a unique ADMIN_PASSWORD (12+ characters) in .env.
# Leave Stripe/OpenAI blank to explore without external services.
npx prisma generate
# Create the SQLite file first if Prisma reports a schema engine error:
touch prisma/dev.db
npm run db:push
npm run db:seed
npm run dev:full
```

Open http://localhost:3000. `APP_URL` must exactly match the origin used in the browser, including the port, for CSRF protection. To reset an admin password use a deliberate database administration procedure; the seed script does not overwrite existing accounts.

- `npm run dev`: standalone frontend demo at the Vite URL; accounts and payments are disabled. Admin edits last for the current page session; cart stays in localStorage.
- `npm run dev:full`: React frontend plus actual Node API and database.
- `npm run build`: production frontend assets.
- `NODE_ENV=production npm start`: Node serves the built frontend, API, SEO metadata and sitemap.
- `npm test`: catalog search and API integration tests. Initialize and seed the local database first. API tests require Stripe keys unset and use a temporary test customer which is removed afterward.

## Included

Responsive homepage, `/shop`, `/category/protein`, `/category/creatine`, `/category/pre-workout`, `/category/essentials`, product pages, browser-local cart, customer registration/login/logout, persisted order history, shipping form and Stripe checkout handoff. Admin `/admin` has product creation/editing, publish/hide controls, stock management and order fulfillment status updates. Admin authorization is enforced by the API.

The sample catalog has eight illustrative products. Admin prices are entered in dollars and stored as integer cents. Dietary/ingredient values are catalog attributes, not inferred nutrition facts. Product packaging is drawn in CSS so sample labels can change with catalog edits. Replace it with verified product photography before selling.

## Payment setup

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Start with test mode. Forward these Stripe webhook events to `/api/webhooks/stripe`:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Example with the official Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the CLI webhook signing secret into `.env` and restart. Use Stripe test cards in test mode only. The webhook, not the redirect URL, marks an order paid. It verifies signatures, deduplicates event IDs and restores inventory on expiration/failure. Orders reserve inventory atomically before Checkout creation. Price and stock are always read on the server; client price fields are ignored. Shipping is US-only, $5.90 or free at $75. This starter treats prices as tax-inclusive and does not calculate location-specific taxes.

**Operational limitation:** an ambiguous Stripe network failure or a crash between reservation and session linking can leave a pending reservation. Reconcile pending orders with Stripe before releasing inventory. The provided `npm run orders:reconcile` checks Stripe sessions by order metadata, links orphan sessions, processes paid/expired sessions and releases reservations with no session after 24 hours. Run it periodically in your Node host’s scheduler. It requires the Stripe key. Never manually mark unpaid orders paid. There is no automatic refund workflow; perform refunds in Stripe and reconcile inventory deliberately.

## AI search

With `OPENAI_API_KEY`, the API sends only the search query (max 500 characters) to OpenAI to extract a constrained category, budget in cents and supported dietary attributes. No account or shipping details are sent. The extracted intent is validated and applied to actual Prisma catalog records. The model never writes product names, prices, availability or search result descriptions.

Without credentials, or on timeout/API error, deterministic catalog search supports natural budget phrases, dietary constraints, synonyms (`plant-based`, `stim-free`) and common misspellings (`protien`, `creatin`). The UI identifies the actual search mode. AI bills are controlled through your provider account; add stronger per-user quotas for a public launch. Catalog search runs in memory for this small starter catalog; for a large store use indexed PostgreSQL full-text/trigram search or a search engine, keeping catalog constraints in the database.

## Security and deployment

Sessions are random, database-backed and stored in HttpOnly, SameSite cookies; HTTPS enables Secure. Passwords use bcrypt. APIs include request validation, origin checks, rate limits, and role checks. Deploy Node behind HTTPS with a persistent disk for SQLite. Do not put this SQLite database on ephemeral/serverless filesystems. For multi-instance production use PostgreSQL, change the Prisma provider and DATABASE_URL, and create migrations for that database. Rate limiting is process-local; use a shared store and appropriate trusted-proxy configuration behind a production reverse proxy.

Keep `.env`, database files and secrets out of Git. There are no seeded default credentials. Password reset, email verification, a persistent server-side cart, email receipts, promotion codes, address validation, automatic refunds and shipment-provider integration are not included. Finalize policies, tax treatment, merchant country, support contact, product labels and allergen claims before commercial launch.

## SEO

The Node production server supplies unique product/category titles, descriptions, canonical URLs, Open Graph title/description and Product JSON-LD with current price and availability. It exposes `/sitemap.xml` and `/robots.txt`, and noindexes admin/account/checkout pages. The React app also updates page titles and product schema during navigation. The hosted static demo has generic HTML metadata; full per-route server SEO requires the Node app. Full server rendering and share-card images are future enhancements.

## Hosting preview vs full app

The supplied private Sites deployment is a static React demonstration. It does not run Express, Prisma, external AI requests or live payments. Download and run this source to use the actual backend. No customer accounts or card details are collected by the demo.

## Asset

Gym photograph: Unsplash image `photo-1534438327276-14e5300c3a48`, downloaded for the sample design. Google Fonts: Barlow Condensed and DM Sans, with system font fallbacks. Review asset licensing and host fonts locally for your production requirements.
