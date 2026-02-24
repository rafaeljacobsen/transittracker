# NJ Transit live vehicles proxy

This server calls the NJ Transit Rail Data API (getToken + getVehicleData) so the map can show live train positions without exposing your username/password in the browser.

## Setup

1. Install dependencies:
   ```bash
   cd server && npm install
   ```

2. Copy `.env.example` to `.env` and set your NJ Transit API credentials (from [developer.njtransit.com](https://developer.njtransit.com/registration)):
   ```
   NJTRANSIT_USERNAME=your_username
   NJTRANSIT_PASSWORD=your_password
   ```

3. Start the server:
   ```bash
   npm start
   ```
   It listens on http://localhost:3000 and serves the app from the parent directory.

## Endpoints

- **GET /api/nj-transit-vehicles** — Returns JSON array of active trains (ID, TRAIN_LINE, LATITUDE, LONGITUDE, NEXT_STOP, SEC_LATE, etc.). Used by the map when “NJ Transit” → “Show live” is enabled.

If credentials are missing, the endpoint returns 503.
