# External services and production environment

Pricing checked on 15 September 2026. Vendor prices can change and taxes, exchange rates, extra bandwidth, backups, and overages can add to the totals.

## Recommended launch stack

| Need | Recommended launch choice | Expected charge | Why |
| --- | --- | ---: | --- |
| Application hosting | Railway Pro | $20 minimum usage/month | Runs the persistent Next.js service and scheduled jobs in one project with managed deployments. |
| Database | MongoDB Atlas M10 Dedicated | From $56.94/month | Production tier with the complete Atlas feature set. Use Flex ($8–$30/month) only for a controlled pilot. |
| Product and delivery images | Cloudinary Free | $0 until usage exceeds 25 monthly credits | Enough for an initial stationery catalog if images are optimized. Plus is $99/month monthly or $89/month billed annually. |
| Online payments | Razorpay standard | 2% + GST per successful transaction | No setup or annual maintenance fee; COD has no gateway fee. |
| Customer OTP | MSG91 WhatsApp Titan (earlier plan; MiniMoth is in use, see Customer OTP below) | ₹500/month per number after the first two discounted months, plus message charges | Low fixed price, developer API, Indian support, and a registered WhatsApp sender. Current India authentication rate is $0.00142 per delivered template message. |
| Domain and DNS | A registrar plus Cloudflare DNS | Domain renewal varies; DNS/TLS can be $0 | Buy one `.in` or `.com` domain and point it to the app. |
| Better Auth | Existing open-source package | $0 license subscription | It runs inside our own service; there is no separate hosted account to buy. |

The recommended fixed infrastructure starts at about **$77/month + ₹500/month**, before GST, domain renewal, WhatsApp messages, Razorpay transaction fees, and optional Cloudinary upgrades. A pilot can use Railway Hobby and Atlas Flex for roughly **$13–$35/month + OTP costs**, but should be upgraded before meaningful production traffic.

## Plan choices

### Hosting

- **Railway Free:** 30-day $5 trial, then $1/month; 0.5 GB RAM. Suitable only for previews.
- **Railway Hobby:** $5 minimum monthly usage, including $5 usage credit. Useful for staging or a low-volume pilot.
- **Railway Pro:** $20 minimum monthly usage, including usage credit. Recommended for production because this project needs a persistent web service and cron jobs.
- **DigitalOcean alternative:** $12/month provides 1 vCPU and 2 GB RAM; $18/month provides 2 vCPU and 2 GB RAM. It is cheaper but requires us to manage Linux patches, process supervision, reverse proxying, TLS, backups, and deployment ourselves.
- **Render alternative:** Hobby workspace is $0 plus compute, while a 512 MB paid service is $0.05/hour. Two continuously running services can cost more than the entry Railway setup.

Sources: [Railway pricing](https://railway.com/pricing), [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets), [Render pricing](https://render.com/pricing).

### MongoDB Atlas

- **Free M0:** $0, 512 MB storage, shared CPU/RAM, no backups. Development only.
- **Flex:** $8–$30/month, 5 GB storage, backup support, up to 100 operations/second in the base allowance, and access to Atlas Search. Good for staging and a carefully monitored pilot.
- **Dedicated:** starts at $56.94/month with 10 GB storage. M10/M20 suit low-traffic production; scale when metrics justify it.

Sources: [MongoDB Atlas pricing](https://www.mongodb.com/pricing), [Atlas Flex cost details](https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/), [cluster comparison](https://www.mongodb.com/docs/atlas/manage-clusters/).

### Cloudinary

- **Free:** 3 users, 1 account, 25 monthly credits; no expiry. One credit can cover 1 GB storage, 1 GB image bandwidth, or 1,000 transformations.
- **Plus:** $99/month, or $89/month billed annually, with 225 monthly credits and higher upload limits.
- **Advanced:** $249/month, or $224/month billed annually, with 600 monthly credits and custom-domain support.

Start on Free and set usage alerts. Upgrade only when the catalog, evidence photos, or image bandwidth consistently approach the credit limit.

Source: [Cloudinary pricing](https://cloudinary.com/pricing).

### Razorpay

- Standard domestic payment gateway pricing is **2% + GST per successful transaction**.
- Setup, annual maintenance, standard refunds, and standard settlement have no separate fee.
- Custom pricing is available when monthly processed volume exceeds roughly ₹5 lakh.
- A temporary 90-day promotion may offer reduced platform fees, but the business plan should use the normal 2% + GST rate.

Source: [Razorpay pricing](https://razorpay.com/pricing/).

### WhatsApp OTP

A personal WhatsApp or normal WhatsApp Business app should not be automated for login codes. Production OTP uses the WhatsApp Business Platform, a registered business sender, an approved **Authentication** template, customer consent, and delivery/status webhooks.

The store can use its own number if it can receive an onboarding SMS or voice call. With providers that do not support app coexistence, migrating the number means it can no longer remain logged into the ordinary WhatsApp mobile app. A new dedicated store number avoids operational disruption.

Options:

- **Direct Meta Cloud API:** no BSP dashboard subscription, with Meta template-message charges. Cheapest at scale, but we manage Meta Business verification, templates, tokens, webhooks, retries, monitoring, and billing ourselves.
- **MSG91 Titan:** ₹500/month per number after the first two discounted months, plus the current India Authentication rate of $0.00142 per delivered template. This is the practical low-cost recommendation for the website.
- **AiSensy:** Free Forever is useful for setup/testing, but Project APIs are listed from Pro; Basic is ₹1,500/month, Pro ₹3,200/month, Premium ₹9,100/month. India Authentication messages are ₹0.145 each and the automation balance minimum is ₹10.
- **Interakt:** Growth is ₹2,799/month and includes developer template APIs/webhooks; Advanced is ₹3,799/month. Authentication messages are about ₹0.128 on Growth.
- **Twilio Programmable WhatsApp:** $0.005 Twilio fee per message plus Meta's fee; Twilio Verify adds $0.05 per successful verification, so it is usually expensive for a local Indian store.

At 10,000 OTPs/month, the raw Indian authentication-template charge is only around ₹1,280–₹1,450 depending on provider markup. The provider subscription, taxes, fallbacks, and repeated delivery attempts are additional.

Sources: [WhatsApp Business messaging policy](https://business.whatsapp.com/policy/preview), [MSG91 WhatsApp pricing](https://msg91.com/global/pricing/whatsapp), [MSG91 subscription details](https://msg91.com/help/whatsapp/whatsapp-subscription), [AiSensy pricing](https://aisensy.com/pricing), [Interakt pricing](https://www.interakt.shop/resource-center/whatsapp-business-api-pricing-structure/), [Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing), [number migration requirements](https://www.twilio.com/docs/whatsapp/migrate-numbers-and-senders).

## Production environment variables

### Required core configuration

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
APP_ORIGIN=https://shop.example.com
BETTER_AUTH_SECRET=<at-least-32-random-characters>
AUTH_SECRET=<separate-at-least-32-random-characters>
```

`APP_ORIGIN` must exactly match the public HTTPS origin. Keep secrets in the hosting provider's secret manager, never in Git.

### Payment

```env
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

Create separate Razorpay test and live credentials. The webhook URL will be the site's Razorpay webhook route.

### Customer OTP

Login and delivery codes go through MiniMoth (minimoth.dev), chosen 2026-10-10. The app makes and verifies every code; MiniMoth only delivers it, WhatsApp first and then a text from MiniMoth's own TRAI DLT-registered sender, never a call. The store registers nothing on DLT; the trade-off is MiniMoth's name on the message. About ₹0.35 per code, ₹20 free credit to start.

```env
MOCK_OTP=false
MINIMOTH_HOOK_URL=...   # Live Hook URL from the project's "Auth0 Hook" card
MINIMOTH_HOOK_TOKEN=... # its Live Token
```

The "Auth0 Hook" is MiniMoth's own delivery hook (a POST of `{phone, code}` with the token), meant for auth systems that make their own codes, which is what better-auth and the delivery check do. MiniMoth allows 3 codes per number per 10 minutes.

2Factor was tried first and dropped the same day: without the store's own DLT registration it read the codes out in phone calls, and the store wants messages only.

### Media uploads

```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
EVIDENCE_RETENTION_DAYS=90
AUDIT_RETENTION_DAYS=730
```

### Search and launch controls

```env
ATLAS_SEARCH_ENABLED=true
SEED_DEMO=false
```

Do not set `MOCK_OTP_CODE` in production. Demo seeds and mock OTP are development-only.

## Google Search Console and Google Maps

The site already gives search engines what they need: `/sitemap.xml` (every aisle and product, rebuilt per request), `/robots.txt`, one canonical address per page, product and breadcrumb data on product pages and the shop's details on the home page (`src/lib/seo.ts`). What's left happens outside the code.

**Before submitting**, so Google doesn't index demo data:

1. Replace the demo catalog with the real products. No product description may still say "Fictional demonstration product".
2. Delete the footer line "Development storefront · Fictional products and prices" (`src/components/site-footer.tsx`).
3. Save the real shop name, address and phone in Store settings → "Business and tax details". The home page's structured data and the contact page read them from there.

**Search Console** (search.google.com/search-console):

1. Add a **Domain** property for `agarwalonline.in`. It covers `www` and every subdomain.
2. Google shows a `google-site-verification=…` value. In Hostinger hPanel → Domains → DNS / Nameservers, add a **TXT** record with name `@` and that value. Leave the A, CNAME, MX, SPF, DKIM and DMARC records as they are. Click Verify; DNS can take up to an hour.
3. Sitemaps → submit `https://agarwalonline.in/sitemap.xml`.
4. URL Inspection → Request indexing for the home page and one product page.
5. Check one product in the Rich Results Test (search.google.com/test/rich-results). It should find Product and Breadcrumb data.

**Google Business Profile** (business.google.com). This is what shows the shop in Maps and in "stationery shop near me" searches:

1. Create the profile with the category **Stationery store**, as a business with a storefront that also delivers. List the delivery areas as service areas.
2. Use exactly the name, address and phone saved in the store details. Google compares them with the site.
3. Add the website `https://agarwalonline.in`, opening hours and photos of the shop front and shelves.
4. Google verifies by postcard, phone or video. After verification, ask the first customers to leave reviews there. The site never shows invented ratings.
5. Once the listing is live, add its Maps link to `storeJsonLd` in `src/lib/seo.ts` as `sameAs: ["https://maps.google.com/?cid=…"]`.

## Accounts and business documents needed

1. Domain registrar account and DNS access.
2. Railway (or selected host) account and billing method.
3. MongoDB Atlas organization/project, database user, IP/network rules, and billing method.
4. Razorpay merchant account with PAN, business proof, bank account, website policies, and settlement details.
5. Meta Business Portfolio, WhatsApp Business Account, business verification documents, phone-number ownership, payment method, approved authentication template, and recorded user opt-in.
6. Cloudinary account with upload credentials and usage alerts.
7. A dedicated operational email address such as `support@yourdomain.in` for provider notices and customer support.

## Buying order

1. Buy the domain and create the operational email.
2. Open Atlas and Railway; deploy staging with test credentials.
3. Complete Razorpay KYC and keep test mode active until checkout acceptance passes.
4. Choose the WhatsApp provider and dedicated number; approve the Authentication template.
5. Open Cloudinary Free and upload the final product catalog.
6. Move Atlas to M10 and Razorpay to live only for production launch.
