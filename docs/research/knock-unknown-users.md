# Does Knock's feed load cleanly for a person it has never been told about?

Research for [#14](https://github.com/joesustaric/cohort-005-project/issues/14). Context: [ADR 0013](../adr/0013-notifications-are-delivered-through-knock.md) and the Build or buy decision (#8). `notify` identifies recipients inline at trigger time and there is no sync job. The root loader signs a Knock user token for enhanced security mode, the client renders Knock's prebuilt React feed, and preferences are read and written server-side through the seam.

Sources, gathered 2026-11-10:

- Knock docs at docs.knock.app, plus the public docs source repo [`knocklabs/docs`](https://github.com/knocklabs/docs) at commit `06a3ce7`, which includes the OpenAPI spec at `data/specs/api/openapi.yml`.
- The Knock JS/React SDK [`knocklabs/javascript`](https://github.com/knocklabs/javascript) at commit `7bc6b68`.

## TL;DR

- **The feed is fine.** Knock's API reference says that for a user who "has not yet been identified within Knock, an empty feed will be returned". That is a 200 response with no entries, not an error or a 404.
- **`KnockProvider` creates the user anyway.** By default it upserts the user (`PUT /v1/users/:id`) when it mounts. So the first page load creates the Knock user, as long as we pass `user={{ id }}` and do not set `identificationStrategy="skip"`.
- **Signing a token neither creates nor requires a user.** The JWT is signed offline with a `sub` claim. With a token, the public key may still call `PUT /v1/users/:id` unless we restrict grants.
- **Preferences are partly undocumented.** Docs say a user with no preferences of their own gets the environment default set. They do **not** say what a server-side read returns for a user who does not exist at all. Writes can safely go through the identify upsert, which accepts inline `preferences`.
- **Cheapest fix:** keep the default inline identify and make the seam's preference write an upsert. Identify calls cost no messages on any plan.

## 1. `KnockProvider`, `KnockFeedProvider` and the feed API for an unknown user id

**Feed API: empty feed, not an error.** The reference for `GET /v1/users/{user_id}/feeds/{id}` says:

> "Returns a paginated list of feed items for a user in reverse chronological order, including metadata about the feed. If the user has not yet been identified within Knock, an empty feed will be returned."

Source: [List feed items](https://docs.knock.app/api-reference/users/feeds/list_items). The same text is in `knocklabs/docs` `data/specs/api/openapi.yml` (line ~11782).

**`KnockProvider` identifies the user on mount, by default.**

- The docs say: "Client-side identification is handled automatically when you initialize the `KnockProvider` with user data provided. When mounted, the provider will identify the user in Knock by upserting the provided user information." ([Identifying recipients → Client-side inline identification](https://docs.knock.app/managing-recipients/identifying-recipients#inline-identification))
- In the SDK, `Knock.authenticate()` defaults `identificationStrategy` to `"inline"`. When it is given an object with an `id`, it calls `this.user.identify(properties)`, even if `properties` is empty. See `packages/client/src/knock.ts` lines ~116 and ~157–180.
- `UserClient.identify` sends `PUT /v1/users/${userId}`. See `packages/client/src/clients/users/index.ts` line ~41.
- `KnockProvider` passes `user` and `identificationStrategy` through to `authenticate` (`packages/react-core/src/modules/core/context/KnockProvider.tsx`, `.../hooks/useAuthenticatedKnockClient.ts`).
- Caveats:
  - The identify call is fire-and-forget. If it fails, the error is caught and only logged (`knock.ts` ~172–178).
  - It runs concurrently with the feed fetch and does not run before it. That does not matter, because the feed returns empty either way.
  - The deprecated `userId` prop (a string) does **not** trigger identify. Only an object `user` does.
  - `identificationStrategy="skip"` turns identify off.
  - `enabled={false}` keeps the client idle: no identify, no requests, no socket.

**`KnockFeedProvider` and the WebSocket.**

- `useNotifications` calls `feedClient.listenForUpdates()` (`packages/react-core/src/modules/feed/hooks/useNotifications.ts` ~20).
- `FeedSocketManager.join()` connects the socket if needed and joins the Phoenix channel `feeds:<channel_id>:<user_id>`. It does this without any client-side check that the user exists (`packages/client/src/clients/feed/socket-manager.ts` ~89–135, `feed.ts` ~653).
- **Unverified:** Knock's docs do not say whether the socket server refuses a channel join for an unidentified user. In practice the question does not come up, because the inline identify above creates the user on the same mount.
- If an HTTP fetch fails, the feed store sets `networkStatus = error` and does not throw (`feed.ts` ~590).

## 2. Does enhanced security mode or a signed token create the user, or need it to exist?

**Neither.** The token is a JWT signed with our private key, using RS256 and a required `sub` claim (`iat`/`exp` recommended). It is generated "out-of-band without an additional network request" ([Security and authentication → with enhanced security](https://docs.knock.app/in-app-ui/security-and-authentication#authentication-with-enhanced-security)). Since signing makes no network call, it cannot create a user, and Knock cannot check whether the user exists when the token is made.

Enhanced security mode only rejects public-key requests that lack a valid signed token. The list of endpoints a public key may call includes `PUT /v1/users/:id` ("Update a user by their ID") ([same page, Public API key endpoints](https://docs.knock.app/in-app-ui/security-and-authentication#public-api-key-endpoints)). So `KnockProvider`'s inline identify still works in enhanced security mode.

The one exception is a token signed with `explicit_grants: true` that leaves out `user/write`. Without `explicit_grants`, "the token will be granted access to all resources by default" ([Limiting access to specific resources](https://docs.knock.app/in-app-ui/security-and-authentication#limiting-access-to-specific-resources)).

## 3. Do preference reads and writes work for a user who doesn't exist yet?

**Documented:**

- Users who have not set preferences fall back to the environment default. "If the user hasn't set any preferences of their own, `getPreferences()` returns the environment default set … so you always have values to render." ([Custom preference center → Get user preferences](https://docs.knock.app/preferences/custom-preference-center))
- Also: "When Knock evaluates preferences for a recipient who has not set any preferences of their own, the environment default serves as the baseline." ([Preferences overview → Environment-level default preferences](https://docs.knock.app/preferences/overview#environment-level-default-preferences))
- Identify (`PUT /v1/users/{user_id}`, operationId `identifyUser`) "Create[s] or update[s] a user". Its request body (`IdentifyUserRequest`) takes an inline `preferences` map, which is deep-merged ([Preferences overview → Inline identifying preferences](https://docs.knock.app/preferences/overview); `openapi.yml` `identifyUser`, `IdentifyUserRequest.preferences`). This writes preferences and creates the user in one call.

**Not documented:**

- The [Get user preference set](https://docs.knock.app/api-reference/users/get_preferences) and [Update user preference set](https://docs.knock.app/api-reference/users/set_preferences) references list only a `200` response. Neither says what happens when the user record does not exist. The docs above speak only of a user who "hasn't set any preferences of their own", which implies the user exists.
- So "server-side read or write of preferences for a never-identified user returns defaults or 200" is **unverified**. It could be a 404.
- In Cadence this edge is narrow. The person must have reached `/settings` without `KnockProvider` (root layout) having identified them first, or the identify must have lost the race.

## 4. If anything breaks: cheapest fix and its cost

The feed and the token do not break. The only open risk is a server-side preference call for a user who has never been identified. The cheapest fixes, in order:

1. **Keep `KnockProvider`'s default inline identify.**
   - Pass `user={{ id: cadenceUserId }}` and do not set `identificationStrategy="skip"`.
   - Do not use `explicit_grants` without `user/write`.
   - This costs no new code. Every person who loads the app gets a Knock user record.
2. **Make the seam's preference write an upsert.** Implement "save preferences" as `PUT /v1/users/:id` with inline `preferences`, or call identify before `PUT /v1/users/:id/preferences/default`. This removes any write-path dependency on the user already existing.
3. **Make the seam's preference read tolerant.**
   - Either identify first (one extra call), or treat a not-found response as "no preferences yet" and render the environment default.
   - Smoke-test once against a real Knock environment to settle the undocumented read behaviour.

**Cost.**

- Knock meters plans on **messages**, not API calls: "A message is counted each time a notification is successfully delivered to a single user on a single channel" ([Knock plans and usage → Message counts](https://docs.knock.app/manage-your-account/knock-plans#message-counts)). Identify calls therefore cost **zero messages** against the 10,000/month free tier.
- Rate limits apply instead. `identifyUser` is tier 3 (60 req/s) and `getUser` is tier 4 (200 req/s) (`openapi.yml` `x-ratelimit-tier`; [Rate limits](https://docs.knock.app/api-reference/overview/rate-limits)).
- Requests made with a signed user token are rate-limited per environment **and** per user, so a client-side identify per page load is not a scaling concern at our size.

An identify on sign-up is unnecessary, and there is no sign-up flow to hook in dev anyway (the DevUI switches users).
