# Slack Keyword Check-in Bot

A lightweight bot that watches Slack channels and automatically replies with a check-in message when specific keywords are detected. Runs locally with no public URL required.

## Features

- **Socket Mode** - No ngrok, no public URL, no reverse proxy needed
- **Invisible automation** - Messages appear as if you typed them (no "APP" tag)
- **No bot to invite** - Listens to channels you're already in
- **Web dashboard** - Manage keywords and reply message without restarting
- **Real-time updates** - Keyword changes apply immediately

## How It Works

1. The bot connects to Slack via Socket Mode using your user token
2. It monitors all channels you're a member of
3. When someone else posts a message containing a keyword, it auto-replies
4. The reply appears under your name/avatar — completely invisible automation

## Prerequisites

- Node.js 18+
- A Slack workspace where you can create apps

## Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app ("From scratch")

2. **Enable Socket Mode:**
   - Settings → Socket Mode → Toggle ON
   - Create an App-Level Token with `connections:write` scope
   - Save it as `SLACK_APP_TOKEN` (starts with `xapp-`)

3. **Add User Token Scopes** (OAuth & Permissions → User Token Scopes):
   - `chat:write` — send messages as your account
   - `channels:history` — read public channel messages
   - `groups:history` — read private channel messages (optional)

4. **Subscribe to Events** (Event Subscriptions → Toggle ON):
   - Scroll to **"Subscribe to events on behalf of users"** (NOT bot events)
   - Add `message.channels` (and `message.groups` for private channels)

5. **Install the App:**
   - OAuth & Permissions → Install to Workspace
   - Copy the **User OAuth Token** (`xoxp-...`) as `SLACK_USER_TOKEN`

## Installation

```bash
git clone https://github.com/yourusername/slack-checkin-bot.git
cd slack-checkin-bot
npm install
```

## Configuration

Create a `.env` file:

```env
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_USER_TOKEN=xoxp-your-user-token
PORT=3000
```

## Usage

```bash
npm start
```

Open the dashboard at `http://localhost:3000` to:
- Add/remove trigger keywords
- Set the check-in reply message

## Example

**Dashboard config:**
- Keywords: `standup`, `check-in`, `status`
- Reply message: `Here! Working on the API integration.`

**In Slack:**
- Coworker posts: "Hey team, time for standup!"
- Bot auto-replies (as you): "Here! Working on the API integration."

## Project Structure

```
slack-checkin-bot/
├── src/
│   ├── index.js          # Main app (Socket Mode + Express)
│   └── keywordStore.js   # Config read/write
├── data/
│   └── keywords.json     # Persisted keywords & message
├── public/
│   └── index.html        # Dashboard UI
├── .env                  # Your tokens (gitignored)
└── package.json
```

## Running in Background

To keep the bot running after closing terminal:

```bash
# Using pm2
npm install -g pm2
pm2 start src/index.js --name slack-bot
pm2 save

# Or using nohup
nohup npm start > bot.log 2>&1 &
```

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/config` | Get current config |
| POST | `/api/keywords` | Add a keyword |
| DELETE | `/api/keywords/:keyword` | Remove a keyword |
| POST | `/api/checkin-message` | Update reply message |

## Important Notes

- The bot only responds to **other people's messages**, not yours
- You must be a member of the channel for the bot to see messages
- Messages are sent as your account — no indication it's automated
- Keep the process running for the bot to work

## License

MIT
