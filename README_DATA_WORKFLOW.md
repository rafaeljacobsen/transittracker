# Transit Data Workflow

## 📋 Overview

This project uses a **two-step workflow** for transit data:
1. **Download** GTFS data (from the internet)
2. **Parse** GTFS data (generate JavaScript files)

---

## 🔄 Complete Workflow

### **Step 1: Download GTFS Data**

Run the download scripts to fetch the latest GTFS feeds:

```bash
# Download MBTA data (Boston)
python download-mbta-gtfs.py

# Download LIRR data (New York)
python download-lirr-gtfs.py
```

**What this does:**
- Downloads the latest GTFS zip file
- Extracts to `mbta_gtfs/` or `lirr_gtfs/` directory
- Creates backup of old data (if exists)
- Saves zip archive for reference

**Output directories:**
- `mbta_gtfs/` - MBTA transit data
- `lirr_gtfs/` - LIRR transit data

---

### **Step 2: Parse GTFS Data**

Run the parse scripts to generate JavaScript data files:

#### **MBTA (Boston) Parsers:**
```bash
python parse-mbta-stops.py      # Train & subway stops
python parse-bus-data.py         # Bus routes & shapes
python parse-ferry-routes.py     # Ferry routes
python parse-shuttle-data.py     # Shuttle routes
python parse-silver-line-data.py # Silver Line BRT
```

#### **MTA (New York) Parsers:**
```bash
python parse-lirr-data.py        # LIRR routes & stations
```

**What this does:**
- Reads GTFS text files (routes.txt, stops.txt, shapes.txt, etc.)
- Processes and combines data
- Generates JavaScript files for the web app
- Generates JSON files for reference

**Output files:**
- `mbta-*-data.js` - JavaScript format (used by website)
- `mbta-*-data.json` - JSON format (for reference)
- `lirr-*-data.js` - JavaScript format (used by website)
- `lirr-*-data.json` - JSON format (for reference)

---

## 📁 File Organization

```
project/
├── download-mbta-gtfs.py      # Downloads MBTA GTFS
├── download-lirr-gtfs.py      # Downloads LIRR GTFS
│
├── parse-mbta-stops.py         # Parses MBTA stops
├── parse-bus-data.py           # Parses MBTA bus routes
├── parse-ferry-routes.py       # Parses MBTA ferry routes
├── parse-shuttle-data.py       # Parses MBTA shuttles
├── parse-silver-line-data.py   # Parses MBTA Silver Line
├── parse-lirr-data.py          # Parses LIRR routes/stations
│
├── mbta_gtfs/                  # MBTA GTFS files (downloaded)
│   ├── routes.txt
│   ├── stops.txt
│   ├── shapes.txt
│   └── ...
│
├── lirr_gtfs/                  # LIRR GTFS files (downloaded)
│   ├── routes.txt
│   ├── stops.txt
│   ├── shapes.txt
│   └── ...
│
├── mbta-stops.js      # Generated data files
├── mbta-bus-data.js
├── mbta-ferry-data.js
├── lirr-routes-data.js
└── ...
```

---

## 🔧 Dependencies

Install Python dependencies:

```bash
pip install requests
```

Some parse scripts may also need:
```bash
pip install pandas tqdm
```

---

## ⏱️ Update Frequency

### **When to re-download:**

| Transit Agency | Update Frequency | When to Re-run |
|----------------|------------------|----------------|
| **MBTA** | Daily/Weekly | When routes/schedules change |
| **MTA LIRR** | Weekly/Monthly | When routes/schedules change |

**Tip:** Run download scripts periodically to keep data current!

---

## 🎯 Quick Start

**First time setup:**
```bash
# 1. Download all GTFS data
python download-mbta-gtfs.py
python download-lirr-gtfs.py

# 2. Parse MBTA data
python parse-mbta-stops.py
python parse-bus-data.py
python parse-ferry-routes.py
python parse-shuttle-data.py
python parse-silver-line-data.py

# 3. Parse LIRR data
python parse-lirr-data.py

# 4. Open index.html in a browser!
```

**To update data later:**
```bash
# Just re-run the download and parse scripts
python download-mbta-gtfs.py
python parse-mbta-stops.py
# ... etc
```

---

## ❓ Troubleshooting

### "GTFS directory not found"
**Solution:** Run the download script first
```bash
python download-mbta-gtfs.py  # or download-lirr-gtfs.py
```

### "Error downloading GTFS data"
**Causes:**
- No internet connection
- GTFS feed URL changed
- Server is down

**Solution:** Check internet connection and try again

### Parse script fails
**Causes:**
- GTFS directory is empty
- GTFS files are corrupted

**Solution:** Delete the `*_gtfs/` folder and re-download

---

## 📊 Data Sources

| Agency | GTFS Feed URL |
|--------|---------------|
| **MBTA** | https://cdn.mbta.com/MBTA_GTFS.zip |
| **MTA LIRR** | http://web.mta.info/developers/data/lirr/google_transit.zip |

---

## 🚂 Live Real-Time Train Tracking

The parse scripts generate **static** route/station data.

### LIRR Live Tracking ✅
**Already working!** LIRR live train tracking is fully implemented and requires no setup:
- **No API key needed** - MTA feeds are now free and open
- **Auto-updates every 5 seconds**
- Just check the "Live Trains" checkbox in the MTA tab!
- See `LIRR_LIVE_TRAINS.md` for details

### MBTA Live Tracking
For **MBTA live train positions**:
- MBTA V3 API: https://api-v3.mbta.com/
- Requires free API key from MBTA
- Already implemented in `app.js` - just add your API key!

---

**Last Updated:** November 2025


