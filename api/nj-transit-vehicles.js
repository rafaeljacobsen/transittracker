/**
 * Vercel serverless function: NJ Transit Rail API proxy.
 * GET /api/nj-transit-vehicles returns live train positions.
 * Set NJTRANSIT_USERNAME and NJTRANSIT_PASSWORD in Vercel Environment Variables.
 */
const FormData = require('form-data');

const USE_TEST = process.env.NJTRANSIT_USE_TEST === 'true';
const BASE = USE_TEST
  ? 'https://testraildata.njtransit.com'
  : 'https://raildata.njtransit.com';
const TOKEN_PATH = `${BASE}/api/TrainData/getToken`;
const VEHICLES_PATH = `${BASE}/api/TrainData/getVehicleData`;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

let cachedToken = null;
let tokenExpiry = 0;

function hasCredentials() {
  const u = process.env.NJTRANSIT_USERNAME || '';
  const p = process.env.NJTRANSIT_PASSWORD || '';
  return Boolean(u && p);
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (!hasCredentials()) throw new Error('NJ Transit credentials not configured');

  const form = new FormData();
  form.append('username', process.env.NJTRANSIT_USERNAME);
  form.append('password', process.env.NJTRANSIT_PASSWORD);

  const res = await fetch(TOKEN_PATH, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });
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
  const form = new FormData();
  form.append('token', token);

  const res = await fetch(VEHICLES_PATH, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
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
};
