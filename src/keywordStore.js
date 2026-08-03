const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'keywords.json');

const DEFAULT_CONFIG = {
  keywords: [],
  checkinMessage: "Thanks for checking in!"
};

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
}

function getConfig() {
  ensureDataFile();
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(data);
}

function saveConfig(config) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(config, null, 2));
  return config;
}

function addKeyword(keyword) {
  const config = getConfig();
  const normalizedKeyword = keyword.trim().toLowerCase();

  // Dedupe case-insensitively
  const exists = config.keywords.some(
    kw => kw.toLowerCase() === normalizedKeyword
  );

  if (!exists && normalizedKeyword) {
    config.keywords.push(keyword.trim());
    saveConfig(config);
  }

  return config;
}

function removeKeyword(keyword) {
  const config = getConfig();
  const normalizedKeyword = keyword.trim().toLowerCase();

  config.keywords = config.keywords.filter(
    kw => kw.toLowerCase() !== normalizedKeyword
  );

  saveConfig(config);
  return config;
}

function setCheckinMessage(message) {
  const config = getConfig();
  config.checkinMessage = message;
  saveConfig(config);
  return config;
}

module.exports = {
  getConfig,
  addKeyword,
  removeKeyword,
  setCheckinMessage
};
