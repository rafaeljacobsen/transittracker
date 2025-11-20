# LIRR Live Train Tracking - Setup Guide

## 🎉 Great News!

**No API key required!** The MTA now provides LIRR live tracking data for free without requiring authentication.

## ✅ It Just Works!

LIRR live train tracking is **already enabled** in your application. No setup needed!

### How to Use:

1. **Open your browser**
   - Load `index.html`

2. **Go to the MTA tab**
   - Click the "MTA" button in the info panel

3. **Enable live tracking**
   - Check the "Live Trains" checkbox for LIRR
   - Live trains will appear within 30 seconds!

## 📊 Data Source

- **Feed URL**: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr
- **Format**: GTFS-Realtime (Protocol Buffers)
- **Update Frequency**: Every 30 seconds (as recommended by MTA)
- **Authentication**: None required! 🎉

## Troubleshooting

### No trains appearing?

1. **Check the browser console** (Press F12)
   - Look for any error messages
   
2. **Verify checkboxes are enabled**
   - "Show Paths" for LIRR (to see the tracks)
   - "Live Trains" for LIRR (to see the trains)

3. **Wait 30 seconds**
   - Live data updates every 30 seconds
   - Be patient on the first load!

4. **Check if trains are running**
   - LIRR operates on a schedule
   - You may not see trains late at night or during off-peak hours

### Error messages in console?

- **"HTTP error! status: 503"** = MTA server is temporarily unavailable (try again later)
- **"Failed to fetch"** = Network error or CORS issue (check your internet connection)
- **"Error fetching LIRR trains"** = General error (check console for details)

### CORS Issues?

If you're running the app locally (opening `index.html` directly), you may encounter CORS errors. Solutions:

1. **Use a local web server** (recommended):
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Then open: http://localhost:8000
   ```

2. **Use Live Server extension** (VS Code):
   - Install "Live Server" extension
   - Right-click `index.html` → "Open with Live Server"

## Features

✅ **Real-time train positions** - See where trains are right now  
✅ **Auto-updates** - Refreshes every 30 seconds  
✅ **Route information** - Shows which branch each train is on  
✅ **Train status** - Displays if train is stopped, in transit, or approaching  
✅ **Click-to-highlight** - Click any train to highlight its route  
✅ **No setup required** - Works out of the box!

## Rate Limits

- The MTA recommends updating no more frequently than every 30 seconds
- The app is configured to respect this limit automatically
- No authentication means no rate limit concerns! 🎊

## More Information

- **MTA Developer Portal**: https://new.mta.info/developers
- **GTFS-Realtime Spec**: https://developers.google.com/transit/gtfs-realtime
- **LIRR Feed URL**: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr

---

Enjoy tracking live LIRR trains with zero setup! 🚂✨

