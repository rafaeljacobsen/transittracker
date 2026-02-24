# Deploying to Vercel (with NJ Transit live)

One deploy serves the map and the NJ Transit API. No separate server.

## 1. Install Vercel CLI (optional, for local dev)

```bash
npm i -g vercel
```

## 2. Environment variables

**On Vercel (production):** In your project on [vercel.com](https://vercel.com) go to **Settings → Environment Variables** and add:

- `NJTRANSIT_USERNAME` = your NJ Transit API username  
- `NJTRANSIT_PASSWORD` = your NJ Transit API password  

**Local (`vercel dev`):** Create a `.env` file in the **project root** (same folder as this file) with:

```
NJTRANSIT_USERNAME=your_username
NJTRANSIT_PASSWORD=your_password
```

Do not commit `.env`. It is in `.gitignore`.

## 3. Deploy

- **From Git:** Connect the repo to Vercel; Vercel will build and deploy. Add the env vars in the dashboard.
- **From CLI:** Run `vercel` in the project root, then set the env vars in the Vercel dashboard for the linked project.

## 4. Local dev with API

Run the app and API together so the relative URL `/api/nj-transit-vehicles` works:

```bash
npm install
vercel dev
```

Open the URL shown (e.g. http://localhost:3000). The map and NJ Transit live will use the same origin.

If you prefer the old setup (static app on port 8000 + Node server on 3000), change `NJ_TRANSIT_VEHICLES_URL` in `app.js` back to `'http://localhost:3000/api/nj-transit-vehicles'` and run `npm start` in the `server/` folder.
