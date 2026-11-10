# Notification vendors vs. an in-house SQLite feed

Research for [#7](https://github.com/joesustaric/cohort-005-project/issues/7) (child of map [#3](https://github.com/joesustaric/cohort-005-project/issues/3), "Wayfinder: In-app Notifications").

**Question.** For Cadence (React Router 8.3 + React 19.2, one SQLite file through Drizzle/`better-sqlite3`, transactional email already sent through Postmark in `app/lib/mailer.server.ts`, `sonner` for toasts), how do Knock, Novu (cloud and self-hosted), MagicBell, and an in-house `notifications` table compare for a v1 **in-app notification feed**: a bell, an unread count, and a list? Polling, or refreshing on the next page load, is fine for v1. Real time would be nice to have.

All sources were accessed on **2026-11-10**. Vendor pricing and plan limits change often, so check them again before deciding. This file compares the options only. The build-or-buy decision belongs to ticket #8.

---

## At a glance

| | **Knock** | **Novu Cloud** | **Novu self-hosted (Community)** | **MagicBell** | **In-house SQLite table** |
|---|---|---|---|---|---|
| Free tier | 10,000 messages/mo, unlimited profiles, workflows and channels [K1] | 10,000 workflow runs/mo, 20 workflows, 3 team members [N1] | Free (MIT core) but you run the infrastructure [N3][N6] | 1,000 deliveries/mo, 1 project [M1] | $0. Uses the existing `data.db` [A1] |
| First paid tier | Starter $250/mo (50k messages, then $0.005 each) [K1] | Pro from $30/mo (30k runs, then $1.20 per 1k) [N1] | Enterprise self-hosted: contact sales [N1] | Startup $249/mo (50k deliveries, then $0.0025 each) [M1] | n/a |
| How usage is counted | 1 message = 1 user × 1 channel. Bounced or failed messages are not counted [K1] | Workflow runs (one run can fan out to several channels) [N1] | n/a | Each channel a user receives on is one delivery (in-app + email = 2) [M1] | n/a |
| Prebuilt React bell, feed and unread count | Yes: `NotificationIconButton`, `NotificationFeedPopover`, `NotificationFeed` [K2] | Yes: `<Inbox />` with Bell, Notifications and Preferences sub-components [N2] | Yes, the same Inbox components [N3] | Yes: `FloatingInbox`, `Inbox` [M2] | You build it (about 3 small components) |
| Headless option | React hooks [K2] | `@novu/react` hooks / `@novu/js` [N2] | Same [N3] | `ContextProvider` plus a JS client (`magicbell-js`) [M2][K7] | Native (loaders + Drizzle) |
| React 19 peer support | `react ^17‖^18‖^19`. `next` and `@tanstack/react-router` are optional peers [K7] | `react ^18‖^19` [K7] | Same | No React peer declared. Bundles its own UI stack [K7] | n/a |
| Real time | WebSocket `new-message` events carrying badge counts [K3] | WebSocket (`wss://ws.novu.co`, EU `wss://eu.socket.novu.co`) [N4] | WS service is part of the deployment [N5] | Persistent connection, "appears instantly" [M3] | None by default. Polling with `useRevalidator`, or add SSE yourself [A2] |
| Postmark email | Native Postmark channel with delivery webhooks [K4] | Native Postmark provider [N7] | Postmark provider available. Delivery/engagement tracking is **cloud-only** [N3] | **No Postmark provider listed.** Only SMTP, Mailgun, SES, SendGrid, Ping Email [M4]. Postmark would go through the SMTP provider [M5] | Keep calling the existing `mailer.server.ts` [A1] |
| User preferences | `PreferenceSet` by channel, category or workflow, plus a React preference center [K5][K2] | `<Preferences />` component [N2] | Yes [N3] | Per-channel and per-category preferences UI [M3] | You build it (a table + a settings form) |
| Data residency | Docs list one base URL, `https://api.knock.app/v1`. No region choice found in the docs [K6] | US (Virginia) or EU (Frankfurt) on every plan. Other regions are Enterprise only [N4] | Wherever you host it [N4] | No region or residency options found in the public docs reviewed | Stays in `data.db` |
| Retention | In-app feed items are kept **indefinitely**. Message logs are kept 30 days (90 on Enterprise) [K8] | **Inbox messages: 30 days on Free**, 90 on Pro/Team [N4] | Depends on your infrastructure [N3] | Not stated on the pricing page [M1] | You decide |
| Branding | Knock branding stays on Free (removed on Starter) [K1] | Novu branding stays on Free (removed on Pro) [N1] | **Cannot be removed** [N3] | Not stated [M1] | None |
| Self-hosting | No | Enterprise only [N1] | Yes. Recommended single VM: 4 vCPU/8 GB + MongoDB + Redis (AOF) + S3 [N5] | No self-hosting found in the docs | n/a (already self-hosted) |
| Client auth | Public key plus a signed user token in "enhanced security mode". Without it, the feed is readable by anyone who has the feed ID [K9][K10] | HMAC `subscriberHash` per subscriber [N8] | Same | HS256 User JWT signed on the server [M6] | The existing session cookie |

---

## Knock

- **Pricing.** Free costs $0/mo and includes 10,000 messages a month, unlimited stored profiles, workflows, delivery channels and team members, and unlimited in-app feeds. Starter costs $250/mo for 50,000 messages, then $0.005 each. On Free, Knock branding cannot be removed. Preferences, batching/digests and the Feed API are on every plan. Translations (i18n) are Enterprise only. [K1]
- **In-app feed.** `@knocklabs/react` ships `NotificationIconButton` (a bell with the unread or unseen count), `NotificationFeedPopover` and `NotificationFeed`, plus React hooks for headless UI. It also ships a preference-center component and headless preference hooks. [K2] The feed API returns `unread_count`, `unseen_count` and `total_count` metadata. It supports seen/read/archived statuses and filtering by tenant or by data payload. [K3]
- **Real time.** A WebSocket emits `new-message` events with badge-count metadata. These events "might be throttled". [K3]
- **Security.** A public API key is used client-side. Production should turn on "enhanced security mode", which needs a user token signed on the server. Until then, feeds can be read by anyone who has the feed ID. [K9][K10]
- **Postmark.** There is a native channel (API key, from-address, sandbox mode, delivery-status webhooks, open and link tracking). Knock adds `Metadata.knock_message_id` and a `Tag` set to the workflow key. [K4] Adopting this means Knock sends the email instead of `mailer.server.ts`, or the app keeps two email paths.
- **Preferences.** A per-user `PreferenceSet` keyed by `categories`, `channels`, `channel_types` and `workflows`. Knock checks it before every send. [K5]
- **Residency and lock-in.** The API docs give one base URL (`api.knock.app`). The docs index has no region-selection page. [K6] Feed items stay readable without limit, but message logs are kept only 30 days (90 on Enterprise). [K8] Workflows, templates and preferences live in Knock. Knock can be managed through an API and a CLI. [K1]
- **Integration effort for Cadence.** Install `@knocklabs/react` and its CSS. Wrap the layout in `KnockProvider`/`KnockFeedProvider`. Add a server route that signs user tokens. Set up a feed channel and a workflow in the dashboard. Trigger workflows from server actions. Keep Knock users in sync with Cadence users. [K2][K9][K10]

## Novu (Cloud)

- **Pricing.** Free costs $0/mo and includes 10,000 workflow runs a month, every channel (email, in-app, SMS, chat, push), US or EU residency, up to 20 workflows, 2 environments, 24-hour activity-feed retention and up to 3 team members. Pro starts at $30/mo with 30k runs, then $1.20 per 1k, and removes Novu branding. Team starts at $250/mo. [N1]
- **Retention catch.** On Free, Inbox messages are kept for **30 days** (90 on Pro/Team). [N4]
- **In-app feed.** The `<Inbox />` component from `@novu/react` is built from `Bell`, `Notifications`, `InboxContent` and `Preferences` sub-components. Novu "handles delivery, unread counts, and preferences". You can also build your own UI with `@novu/react` hooks or framework-agnostic `@novu/js`. [N2]
- **Real time.** Each region has its own WebSocket endpoint (`wss://ws.novu.co`, `wss://eu.socket.novu.co`). [N4]
- **Security.** Production should turn on HMAC, which means passing a `subscriberHash` computed on the server for each `subscriberId`. [N8]
- **Postmark.** There is a native Postmark email provider (server API token + verified sender signature). [N7]
- **Residency.** Choose US (Virginia) or EU (Frankfurt) at signup. API keys are bound to that region, and data cannot be moved between regions by yourself. UK, Singapore, Australia, Japan and Korea are Enterprise only. [N4] Novu Cloud holds SOC 2 Type II and ISO 27001, and offers a DPA. [N4]
- **Integration effort.** About the same as Knock: an SDK, an HMAC signing route, workflows set up in the dashboard or in code, a trigger call from the server, and keeping subscribers in sync. [N2][N8]

## Novu (self-hosted Community edition)

- **License.** Open core. Everything outside `enterprise/packages` is MIT. The enterprise folders use a proprietary license that requires approval from Novu. [N6]
- **Infrastructure.** Recommended single-VM footprint: **4 vCPU / 8 GB** for the API, Worker, WS and Dashboard services, plus **MongoDB** (2 GB RAM, 20 GB disk), **Redis** with AOF (2 GB), and **S3-compatible storage** (10 GB minimum). The multi-VM recommendation runs 3 VMs per service. [N5]
- **Feature gaps vs. Cloud.** Bell, Inbox and Preferences components are included. Snooze is not. Novu branding **cannot be removed**. Email activity tracking (delivery and engagement events) is unavailable. The team is capped at **1 member**. There are no custom environments or environment variables, no translations, no MFA, SSO or RBAC, and no SOC 2. Novu describes Community as the way to "test and experiment". [N3]
- **Fit with Cadence.** ADR 0006 chose SQLite specifically to avoid running "a second service". [A1] Self-hosted Novu would add MongoDB, Redis, object storage and four Node services.

## MagicBell

- **Pricing.** Builder costs $0/mo for **1,000 deliveries/mo**, 1 project, unlimited team members and users. Startup costs $249/mo for 50,000 deliveries, then $0.0025 each, and 5 projects. Every channel a user is notified on counts as a delivery: sending a notification to 100 users in-app plus 50 of them by email is 150 deliveries. [M1]
- **In-app feed.** `@magicbell/react` provides `ContextProvider` (takes a User JWT and turns toasts on by default), `FloatingInbox` (a bell-triggered panel) and `Inbox`. [M2] The inbox supports read/unread, infinite-scroll pagination, archive and delete. [M3]
- **Real time.** "MagicBell maintains a persistent connection to deliver notifications in real-time." [M3] The package depends on `reconnecting-websocket`. [K7]
- **Toasts.** The provider turns its own toasts on by default (`toasts: true`). [M2] Cadence already uses `sonner`, so this would need to be switched off.
- **Postmark.** The email channel docs list **Ping Email, SMTP, Mailgun, Amazon SES and SendGrid only**. [M4] Postmark would have to go through the generic SMTP provider (host, port, username, password). [M5] The Postmark-specific features that Knock's native channel exposes (delivery webhooks, metadata, sandbox) would be unavailable.
- **Preferences.** Per-channel and per-category preferences UI. [M3]
- **Auth.** An HS256 User JWT signed on the server with the project secret. [M6]
- **Residency and self-hosting.** The public docs pages reviewed mention no region selection and no self-hosting.

## In-house SQLite `notifications` table

- **Cost and infrastructure.** Nothing new. Data stays in the single `data.db` through Drizzle, which matches ADR 0006 ("no database server to run, back up or pay for"). [A1]
- **Minimal shape (illustrative, not a decision).** One `notifications` table: `id`, `userId` → `users`, `type`, `title`/`body` or a JSON `data` field, `url`, `createdAt`, `readAt` (null means unread), with an index on `(userId, readAt, createdAt)`. The unread count is `count(*) where userId = ? and readAt is null`. Because `better-sqlite3` is synchronous, the root loader can read it cheaply. [A1]
- **Polling and refresh.** React Router revalidates loader data automatically after actions. `useRevalidator` can revalidate "for reasons outside of normal data mutations", for example on an interval or on window focus. [A2] Cadence gets next-page-load freshness for free. Polling is a few lines of code.
- **Real time (optional, later).** Not built in. You would add SSE or WebSockets yourself. The single-process deployment in ADR 0006 keeps an in-memory pub/sub simple. [A1]
- **Email.** Keep `mailer.server.ts` as it is. The app decides at each call site whether to also email.
- **Preferences.** Not included. If needed, add a table (`userId`, `type`, `channel`, `enabled`) and a settings form.
- **What you take on.** The bell, list and mark-as-read UI; pagination; preferences (if wanted); digests and batching (if wanted); retention and cleanup; and every future channel (push, Slack). The vendors provide each of these.
- **Lock-in.** None. The schema and data are yours.

---

## Neutral trade-off summary

- **Cost at Cadence's scale.** All four options start at $0. MagicBell's free tier is the smallest (1k deliveries, and in-app + email counts twice). Knock and Novu each allow about 10k a month. The next paid step is steep for Knock ($250) and MagicBell ($249). Novu Pro starts at $30. The in-house table has no usage cost.
- **Time to a working bell, list and unread count.** The vendors offer drop-in React components. That saves UI work, but adds a provider, a signing route for client auth, dashboard-configured workflows, and user/subscriber syncing. The in-house option needs a table, a migration, a loader, and three small components, and fits the existing loader/action/revalidation model.
- **Real time.** Built into all three vendors (WebSockets). The in-house option starts with polling or next-load refresh and needs custom SSE/WS work for real time.
- **Email via Postmark.** Knock and Novu Cloud both have native Postmark channels. To use them, email for those notifications would move from `mailer.server.ts` into the vendor, or the app would keep two paths. MagicBell supports Postmark only through generic SMTP. The in-house option keeps the existing mailer.
- **Preferences and orchestration (digests, batching, cross-channel routing).** These are the main thing the vendors offer on top of a feed. In-house, each one is extra work if it is ever needed.
- **Operational footprint.** Cloud vendors add a third-party dependency and a network call. Self-hosted Novu adds MongoDB, Redis, S3 and four services, which conflicts with ADR 0006's single-file stance, and has visible limits (a 1-member team, branding that cannot be removed, no email tracking). The in-house option adds nothing.
- **Data and lock-in.** Novu offers EU residency on Free. Knock and MagicBell docs show no region choice. Retention varies: Knock keeps feed items indefinitely, while Novu Free keeps Inbox messages 30 days. Vendor workflows, templates and preferences live in the vendor's system. In-house data stays in `data.db`.

---

## Sources (accessed 2026-11-10)

**Knock**
- [K1] Knock pricing: https://knock.app/pricing
- [K2] Building in-app UI in React: https://docs.knock.app/in-app-ui/react/overview
- [K3] In-app APIs and real-time service: https://docs.knock.app/in-app-ui/api-overview
- [K4] Postmark integration: https://docs.knock.app/integrations/email/postmark
- [K5] Preferences overview: https://docs.knock.app/preferences/overview
- [K6] API reference overview (base URL): https://docs.knock.app/api-reference/overview ; docs index: https://docs.knock.app/llms.txt
- [K7] npm registry metadata (`npm view <pkg> peerDependencies / dependencies`) for `@knocklabs/react@0.15.1`, `@novu/react@3.19.2`, `@magicbell/react@1.14.0`
- [K8] Data retention: https://docs.knock.app/manage-your-account/data-retention
- [K9] Security and authentication: https://docs.knock.app/in-app-ui/security-and-authentication
- [K10] Feed component for React: https://docs.knock.app/in-app-ui/react/feed

**Novu**
- [N1] Novu pricing: https://novu.co/pricing
- [N2] Inbox overview: https://docs.novu.co/platform/inbox/overview
- [N3] Self-Hosted and Novu Cloud: https://docs.novu.co/community/self-hosted-and-novu-cloud
- [N4] Security and Compliance (data residency, retention): https://docs.novu.co/platform/additional-resources/security
- [N5] Self-hosting overview (system requirements): https://docs.novu.co/community/self-hosting-novu/overview
- [N6] Novu repository license: https://github.com/novuhq/novu/blob/next/LICENSE-ENTERPRISE and README "License" section: https://github.com/novuhq/novu
- [N7] Postmark integration: https://docs.novu.co/platform/integrations/email/postmark
- [N8] Prepare Inbox for production (HMAC): https://docs.novu.co/platform/inbox/prepare-for-production

**MagicBell**
- [M1] MagicBell pricing: https://www.magicbell.com/pricing
- [M2] React components: https://www.magicbell.com/docs/libraries/magicbell-react
- [M3] In-app channel: https://www.magicbell.com/docs/channels/in_app
- [M4] Email channel providers: https://www.magicbell.com/docs/channels/email
- [M5] SMTP provider: https://www.magicbell.com/docs/channels/email/smtp
- [M6] User JWT authentication: https://www.magicbell.com/docs/api/authentication/user

**Cadence / in-house**
- [A1] ADR 0006, "Keep all data in one SQLite file, reached through Drizzle": `docs/adr/0006-one-sqlite-file-through-drizzle.md`; `app/lib/mailer.server.ts`; `package.json` (react-router 8.3.0, react ^19.2.7, drizzle-orm ^0.45.2, better-sqlite3 ^12.8.0, sonner ^2.0.3)
- [A2] React Router `useRevalidator`: https://reactrouter.com/api/hooks/useRevalidator
