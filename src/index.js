require('dotenv').config();

const { SocketModeClient } = require('@slack/socket-mode');
const { WebClient } = require('@slack/web-api');
const express = require('express');
const path = require('path');
const store = require('./keywordStore');

// User client for sending messages as your own account
const userClient = new WebClient(process.env.SLACK_USER_TOKEN);

// Socket Mode client for receiving events
const socketClient = new SocketModeClient({ appToken: process.env.SLACK_APP_TOKEN });

// Store your user ID to skip your own messages
let selfUserId;

// Keyword matching utilities
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAnyKeyword(text, keywords) {
  return keywords.some((kw) => {
    const pattern = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
    return pattern.test(text);
  });
}

// Send check-in message
async function sendCheckin(channel, text) {
  await userClient.chat.postMessage({ channel, text });
}

// Listen for ALL events to debug
socketClient.on('slack_event', async ({ event, body, ack }) => {
  if (ack) await ack();

  console.log('Received event type:', body?.event?.type || 'unknown');
  console.log('Event payload:', JSON.stringify(body?.event, null, 2));
});

// Message event listener
socketClient.on('message', async ({ event, ack }) => {
  // Acknowledge the event so Slack doesn't redeliver
  if (ack) await ack();

  const message = event;
  console.log('--- Message received ---');
  console.log('Text:', message?.text);
  console.log('User:', message?.user);
  console.log('Channel:', message?.channel);
  console.log('Subtype:', message?.subtype);

  // Skip non-standard messages (edits, deletes, joins, etc.)
  if (message.subtype || !message.text) {
    console.log('Skipped: has subtype or no text');
    return;
  }

  // Skip YOUR own messages - only reply to others
  if (message.user === selfUserId) {
    console.log('Skipped: this is your own message');
    return;
  }

  const { keywords, checkinMessage } = store.getConfig();
  console.log('Keywords:', keywords);
  console.log('Checking for match...');

  if (keywords.length && matchesAnyKeyword(message.text, keywords)) {
    console.log('MATCH FOUND! Sending reply...');
    await sendCheckin(message.channel, checkinMessage);
    console.log('Reply sent!');
  } else {
    console.log('No keyword match');
  }
});

// Express dashboard server
const dashboard = express();
const PORT = process.env.PORT || 3000;

dashboard.use(express.json());
dashboard.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
dashboard.get('/api/config', (req, res) => {
  res.json(store.getConfig());
});

dashboard.post('/api/keywords', (req, res) => {
  const { keyword } = req.body;
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ error: 'Keyword is required' });
  }
  res.json(store.addKeyword(keyword));
});

dashboard.delete('/api/keywords/:keyword', (req, res) => {
  const keyword = decodeURIComponent(req.params.keyword);
  res.json(store.removeKeyword(keyword));
});

dashboard.post('/api/checkin-message', (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  res.json(store.setCheckinMessage(message));
});

// Start both servers
(async () => {
  // Get your user ID to skip your own messages
  const identity = await userClient.auth.test();
  selfUserId = identity.user_id;
  console.log(`Running as: ${identity.user} (${selfUserId})`);

  // Start Socket Mode connection
  await socketClient.start();
  console.log('Socket Mode connected - listening for messages');

  // Start dashboard server
  dashboard.listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
  });
})();
