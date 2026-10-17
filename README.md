# QMarketplace

QMarketplace is a study-material marketplace built with static HTML/CSS/JavaScript, an Express API, Prisma, and PostgreSQL. The same Express app can run locally or be exposed as a Vercel function.

## Local development

Requirements: Node.js 20 or newer and npm.

1. Install the workspace dependencies from the repository root:

   ```sh
   npm install
   ```

2. Copy `backend/.env.example` to `backend/.env` and set a long, private `JWT_SECRET`. The backend loads this file relative to its own source directory, regardless of the directory used to start Node. Database, PayPal, and R2 variables are optional for local browsing; checkout and private downloads report unavailable until their provider credentials are configured. Restart the backend after changing environment variables.

3. Start the app:

   ```sh
   npm run dev
   ```

4. Open [http://localhost:4000](http://localhost:4000). Do not open the HTML files directly with a `file://` URL; the pages use same-origin API requests.

Without `DATABASE_URL`, the catalog uses in-memory sample data. Registered accounts and orders in this mode are temporary and reset when the server restarts. The sample catalog does not include a downloadable private file or a pre-completed purchase.

## PostgreSQL / Prisma

Set `DATABASE_URL` in `backend/.env`, then run these from the repository root:

```sh
npm run prisma:generate
npm --workspace backend exec prisma migrate dev -- --name init
npm run seed
```

The seed is repeatable and does not delete existing records. It creates the development account `ava@student.com`; its password is the value of `SEED_DEMO_PASSWORD` (default `DemoPassword123!`). Change that value before seeding any shared database and do not use the sample account in production.

For a deployed database with committed migrations, use `npm run prisma:deploy`. Apply the schema changes before deploying code that reads the new `Material.academicYear`, `Material.fileFormat`, or pending-order default.

## Payments and private downloads

- PayPal credentials belong only in server environment variables: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_BASE_URL`. Use `https://api-m.sandbox.paypal.com` for sandbox and `https://api-m.paypal.com` for live payments.
- The backend creates PayPal orders and marks an order paid only after server-side capture confirmation and amount/currency validation. Reaching the return page alone does not complete an order.
- Configure `FRONTEND_URL` to the public site origin so PayPal returns to the correct deployment. On Vercel, the app uses Vercel's production URL when `FRONTEND_URL` is unset or still points to localhost; set `FRONTEND_URL` explicitly when using a custom domain.
- The site uses its public origin for `robots.txt`, the generated `sitemap.xml`, API CORS, and payment return URLs.
- Private files use Cloudflare R2. Configure `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. Configure bucket CORS to allow browser `PUT` requests from the admin site origin with the `Content-Type` header. The app issues short-lived upload and download URLs; paid files are not exposed from public catalog responses.
- New PDFs are processed on the server before they are published: the private original is retained separately, a configurable diagonal `QMarketplace` watermark is applied to every page, and a three-page watermarked preview is generated. Set `PDF_WATERMARK_TEXT=StudyVault` in the backend environment to use that brand instead; processing is limited to 20 MB and 1,000 pages per upload. The preview endpoint serves only the processed preview, while the full watermarked file is available only after purchase.
- Existing files uploaded before watermark processing was added must be reprocessed from **Admin → Materials → Process PDF** before new previews or purchases are enabled. Failed processing leaves the listing unpublished.
- Admin endpoints require an authenticated account whose server-issued role is `admin`. Promote an administrator through a trusted database operation; the app has no public role-upgrade endpoint.

## Vercel

The root `package.json` workspace installs the backend dependencies needed by `api/index.js`. Configure the environment variables above in the Vercel project, set the project root to this repository, and deploy. `vercel.json` routes `/api/*` to the Express function and serves the existing files from `frontend/`.

## Search visibility

- `https://your-domain/robots.txt` advertises the sitemap and keeps admin/API paths out of crawls. `https://your-domain/sitemap.xml` includes public catalog pages and active materials that have a processed preview.
- Public material, course, and university pages receive page-specific canonical URLs, descriptions, social-sharing metadata, and structured data after their catalog data loads. Keep public titles, descriptions, course/university associations, and material previews accurate and original.
- After deploying to the real domain, verify ownership in Google Search Console and Bing Webmaster Tools, then submit the sitemap URL. Crawling and ranking are controlled by the search engines; sitemap submission and structured data do not guarantee indexing or rich-result placement.
- Keep paid originals private. Search should land customers on a public material detail page with a watermarked preview, not an unauthorized document download.

## Main routes

- `GET /api/health`
- `GET /api/materials`, `GET /api/materials/:id`, `GET /api/search?q=...`
- `GET /api/universities`, `GET /api/courses`
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/users/profile`, `GET /api/users/orders`
- `POST /api/checkout/create-order`, `POST /api/checkout/verify`
- `GET /api/users/materials/:materialId/download`
- Admin: `GET /api/admin/overview`, `/api/admin/materials`, `/api/admin/orders`, `/api/admin/users`; upload/create/edit/deactivate routes are under `/api/admin/materials`.

## Known configuration boundaries

The app does not provide payment or storage credentials, a production database, a custom email/support provider, or content moderation. Checkout, private downloads, uploads, and database persistence must be configured and smoke-tested against the provider sandbox before enabling them for customers.

Run the focused PDF processing tests with `npm run test --workspace backend`.
