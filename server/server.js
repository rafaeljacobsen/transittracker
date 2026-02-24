/**
 * NJ Transit Rail API proxy.
 * Gets a token with username/password, caches it, and exposes GET /api/nj-transit-vehicles
 * so the frontend can show live train positions without exposing credentials.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

/** Build multipart/form-data body as buffer (avoids form-data stream issues). */
function buildMultipartBody(fields) {
  const boundary = '----NJT' + Math.random().toString(36).slice(2, 14);
  const CRLF = '\r\n';
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${String(value)}${CRLF}`);
  }
  parts.push(`--${boundary}--${CRLF}`);
  return {
    body: Buffer.from(parts.join(''), 'utf8'),
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  };
}

const app = express();
const PORT = process.env.PORT || 3000;
const USE_TEST = process.env.NJTRANSIT_USE_TEST === 'true';
const BASE = USE_TEST
  ? 'https://testraildata.njtransit.com'
  : 'https://raildata.njtransit.com';
const TOKEN_PATH = `${BASE}/api/TrainData/getToken`;
const VEHICLES_PATH = `${BASE}/api/TrainData/getVehicleData`;

const username = process.env.NJTRANSIT_USERNAME || '';
const password = process.env.NJTRANSIT_PASSWORD || '';

let cachedToken = null;
let tokenExpiry = 0;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // refresh before 24h

function hasCredentials() {
  return Boolean(username && password);
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (!hasCredentials()) throw new Error('NJ Transit credentials not configured');

  const { body, headers } = buildMultipartBody({ username, password });
  const res = await fetch(TOKEN_PATH, { method: 'POST', body, headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid getToken response');
  }
  if (data.errorMessage) throw new Error(data.errorMessage);
  if (data.Authenticated !== 'True' || !data.UserToken) throw new Error('Authentication failed');
  cachedToken = data.UserToken;
  tokenExpiry = Date.now() + TOKEN_TTL_MS;
  return cachedToken;
}

async function getVehicleData() {
  const token = await getToken();
  const { body, headers } = buildMultipartBody({ token });
  const res = await fetch(VEHICLES_PATH, { method: 'POST', body, headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid getVehicleData response');
  }
  if (data.errorMessage) throw new Error(data.errorMessage);
  if (!Array.isArray(data)) return [];
  return data;
}

app.use(cors());
app.use(express.json());

app.get('/api/nj-transit-vehicles', async (req, res) => {
  if (!hasCredentials()) {
    return res.status(503).json({ error: 'NJ Transit credentials not configured' });
  }
  try {
    const vehicles = await getVehicleData();
    res.json(vehicles);
  } catch (err) {
    console.error('NJ Transit getVehicleData:', err.message);
    res.status(502).json({ error: err.message || 'Failed to fetch vehicle data' });
  }
});

// Optional: serve the app from parent directory so one origin works
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!hasCredentials()) {
    console.warn('Set NJTRANSIT_USERNAME and NJTRANSIT_PASSWORD in .env to enable /api/nj-transit-vehicles');
  }
});
