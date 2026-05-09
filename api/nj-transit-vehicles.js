/**
 * Vercel serverless function: NJ Transit Rail API proxy.
 * GET /api/nj-transit-vehicles returns live train positions.
 * Set NJTRANSIT_USERNAME and NJTRANSIT_PASSWORD in Vercel Environment Variables.
 */

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

const USE_TEST = process.env.NJTRANSIT_USE_TEST === 'true';
const BASE = USE_TEST
  ? 'https://testraildata.njtransit.com'
  : 'https://raildata.njtransit.com';
const TOKEN_PATH = `${BASE}/api/TrainData/getToken`;
const VEHICLES_PATH = `${BASE}/api/TrainData/getVehicleData`;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
// Vehicle data cache: NJ Transit positions update every ~30s upstream, but the client polls every 5s.
// Caching for 4s collapses concurrent client polls into a single upstream hit and absorbs bursts
// across users hitting the same Vercel instance.
const VEHICLE_CACHE_TTL_MS = 4000;

let cachedToken = null;
let tokenExpiry = 0;
let cachedVehicles = null;
let cachedVehiclesExpiry = 0;
let inFlightVehiclesPromise = null;

function hasCredentials() {
  const u = process.env.NJTRANSIT_USERNAME || '';
  const p = process.env.NJTRANSIT_PASSWORD || '';
  return Boolean(u && p);
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (!hasCredentials()) throw new Error('NJ Transit credentials not configured');

  const { body, headers } = buildMultipartBody({
    username: process.env.NJTRANSIT_USERNAME,
    password: process.env.NJTRANSIT_PASSWORD,
  });
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

async function fetchVehicleDataUpstream() {
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

async function getVehicleData() {
  const now = Date.now();
  if (cachedVehicles && now < cachedVehiclesExpiry) return cachedVehicles;
  // Coalesce concurrent requests into a single upstream call.
  if (inFlightVehiclesPromise) return inFlightVehiclesPromise;
  inFlightVehiclesPromise = fetchVehicleDataUpstream()
    .then(data => {
      cachedVehicles = data;
      cachedVehiclesExpiry = Date.now() + VEHICLE_CACHE_TTL_MS;
      return data;
    })
    .finally(() => { inFlightVehiclesPromise = null; });
  return inFlightVehiclesPromise;
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
    // Allow Vercel's edge / CDN to serve a fresh copy for 4s and a stale copy for up to 30s while
    // revalidating in the background. Matches the in-memory cache TTL above.
    res.setHeader('Cache-Control', 's-maxage=4, stale-while-revalidate=30');
    res.json(vehicles);
  } catch (err) {
    console.error('NJ Transit getVehicleData:', err.message);
    res.status(502).json({ error: err.message || 'Failed to fetch vehicle data' });
  }
};
