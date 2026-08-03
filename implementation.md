# Slack Keyword Check-in Bot — Implementation Spec

## Goal
A bot that runs on a local machine, watches a Slack channel, and automatically
replies with a check-in message whenever an incoming message contains one of
a set of user-defined keywords. Keywords (and the reply text) are managed
through a small local web dashboard — no redeploy needed to change them.

## Architecture
- **Slack connection: Socket Mode.** The app opens an outbound WebSocket to
  Slack, so it needs no public URL, no ngrok, no reverse proxy — ideal for a
  process running on a local device.
- **Listening AND sending both happen as your own account.** Slack supports
  subscribing to events "on behalf of a user" instead of a bot — meaning the
  app receives message events for channels *you* are a member of, with no
  bot user needing to join anything. Combined with sending via your **User
  OAuth Token** (`xoxp-...`), this means the app never has a visible
  presence in the channel at all — no bot to invite, no join message, no
  "APP" tag on replies.
- **No bot user needed.** Because of the above, this doesn't need Bolt's
  bot-centric `App` class or a bot token at all — just Slack's low-level
  `@slack/socket-mode` client (authenticated with the app-level token) for
  the event stream, and `@slack/web-api`'s `WebClient` (authenticated with
  your user token) for both reading identity and sending.
- **Dashboard:** a small local web server (Express for Node / FastAPI or
  Flask for Python) serving one page to add/remove keywords and edit the
  check-in reply text.
- **Storage:** a single local JSON file (or SQLite if preferred) holding
  `{ keywords: string[], checkinMessage: string }`. No external DB needed at
  this scale.
- Listener and dashboard server run in the **same process**, sharing the
  same storage module, so keyword edits apply on the next incoming message
  with no restart.

## Slack App Setup (do this first, in api.slack.com/apps)
1. Create a new app ("Blank app"), pick your workspace.
2. **Socket Mode:** Settings → Socket Mode → toggle on. This generates an
   **App-Level Token** — create it with the `connections:write` scope. Save
   it as `SLACK_APP_TOKEN` (starts with `xapp-`).
3. **User Token Scopes** (OAuth & Permissions → Scopes → **User Token
   Scopes**, not Bot Token Scopes) — add:
   - `chat:write` — send the check-in reply as your own account
   - `channels:history` — read messages in public channels you're in
   - `groups:history` — read messages in private channels you're in
     (optional, only if the target channel is private)
4. **Event Subscriptions:** toggle on. Scroll past "Subscribe to bot
   events" — leave that empty — and use the separate section
   **"Subscribe to events on behalf of users"** instead. Add there:
   - `message.channels` (public channels)
   - `message.groups` (private channels, optional)
   This is the key step: events subscribed here fire based on *your*
   channel membership, not a bot's, so nothing needs to be invited anywhere.
5. **Install App to Workspace** (OAuth & Permissions → Install, or reinstall
   if already installed — new scopes require reinstalling). This produces a
   **User OAuth Token** (`xoxp-...`) — save as `SLACK_USER_TOKEN`. That one
   token now covers both listening and sending.

No bot invite step, no bot token, no signing secret (only needed for
HTTP-based, non-Socket-Mode event delivery).

## Environment variables
```
SLACK_APP_TOKEN=xapp-...     # Socket Mode connection
SLACK_USER_TOKEN=xoxp-...    # listens AND sends, as your own account
PORT=3000                    # local dashboard port
```

## Suggested file structure
```
slack-checkin-bot/
├── package.json
├── .env                 # gitignored, holds the two tokens above
├── src/
│   ├── index.js          # opens Socket Mode connection + Express dashboard
│   │                      # deps: @slack/socket-mode, @slack/web-api, express, dotenv
│   └── keywordStore.js    # read/write keywords.json
├── data/
│   └── keywords.json      # { "keywords": [], "checkinMessage": "..." }
└── public/
    └── index.html          # dashboard UI (vanilla JS, fetch-based)
```

## Core logic

### Keyword matching
Case-insensitive, whole-word match, so "check" doesn't fire on "checking":
```js
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function matchesAnyKeyword(text, keywords) {
  return keywords.some((kw) => {
    const pattern = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
    return pattern.test(text);
  });
}
```

### One client, one identity: your own account listens and sends
Both the event stream and the outgoing reply run through your user token —
there's no separate bot identity anywhere in this flow:
```js
const { SocketModeClient } = require('@slack/socket-mode');
const { WebClient } = require('@slack/web-api');

const userClient = new WebClient(process.env.SLACK_USER_TOKEN);
const socketClient = new SocketModeClient({ appToken: process.env.SLACK_APP_TOKEN });
```
**Note for whoever implements this:** the exact event name/payload shape
`@slack/socket-mode` delivers for user-scoped `message.channels` events
should be verified against the current `@slack/socket-mode` docs/types when
building — it's a less common path than Bolt's bot-oriented `App`, so don't
assume the shape below is exact; treat it as the intended logic, confirm the
envelope structure while wiring it up.

### Message listener — filter by message, not by user
**Do not** filter out messages by comparing `message.user` to your own user
ID. Since the reply is sent from the same account being watched, that
blocks every message you send — including the trigger keyword itself,
which is why nothing appears to happen even though the listener is running
correctly. There is no sender-identity difference between "you typing the
keyword" and "the automated reply" — they're the same account.

Instead, track the specific timestamps of messages *this script* sent, and
only skip those:
```js
const sentTimestamps = new Set();

async function sendCheckin(channel, text) {
  const result = await userClient.chat.postMessage({ channel, text });
  if (result.ts) {
    sentTimestamps.add(result.ts);
    setTimeout(() => sentTimestamps.delete(result.ts), 60_000); // don't grow unbounded
  }
}

socketClient.on('message', async ({ event, ack }) => {
  if (ack) await ack(); // acknowledge so Slack doesn't redeliver

  const message = event;
  if (message.subtype || !message.text) return;
  if (sentTimestamps.has(message.ts)) return; // this IS our own auto-reply, skip it

  const { keywords, checkinMessage } = store.getConfig();
  if (keywords.length && matchesAnyKeyword(message.text, keywords)) {
    await sendCheckin(message.channel, checkinMessage);
  }
});

(async () => {
  await socketClient.start();
})();
```
This correctly processes messages you type yourself (including the trigger
keyword), while still preventing the automated reply from re-triggering
itself if it happens to contain a keyword.

### Dashboard API contract
| Method | Route                        | Body                | Returns             |
|--------|-------------------------------|----------------------|----------------------|
| GET    | `/api/config`                 | —                    | full config object   |
| POST   | `/api/keywords`                | `{ keyword }`         | updated config        |
| DELETE | `/api/keywords/:keyword`        | —                    | updated config        |
| POST   | `/api/checkin-message`           | `{ message }`          | updated config        |

Dashboard UI: an input + "Add" button, keywords rendered as removable chips,
a textarea for the check-in reply with a "Save" button. Load config on page
load via `GET /api/config`, re-render after every mutation.

## Edge cases to handle
- **Self-trigger loop:** filtering must be by message timestamp (tracking
  what the script itself sent), not by user ID — filtering by user ID
  blocks your own trigger messages too, since sender and replier are the
  same account. This was the actual cause of "runs fine, nothing happens."
- **No automation signal:** the reply is visually identical to something
  you typed yourself, and there's no bot to invite or join message either —
  nothing in the channel indicates this is automated.
- **Tied to your own session:** since everything runs on your user token,
  if you revoke it, sign out, or your Slack session changes, the listener
  stops working — there's no separate bot identity to fall back on.
- **Only sees channels you're already in.** No invite step is needed, but
  correspondingly there's no way to watch a channel you haven't joined.
- Empty keyword list → listens but never replies (avoid noisy false
  positives before any keywords are configured).
- Duplicate keyword adds → dedupe case-insensitively.
- If the target is a private channel, make sure `groups:history` and
  `message.groups` (on behalf of users) are both added — public-only scopes
  won't see private channel traffic.
- Long-running process: this needs to stay running on the local device for
  the listener to be active; consider `pm2` or a simple systemd/launchd
  service if it needs to survive reboots.

## Run
```
npm install
cp .env.example .env   # fill in tokens
npm start
```
Dashboard: `http://localhost:3000`