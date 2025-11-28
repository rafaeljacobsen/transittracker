# Instructions to Fix Large File Issue

The MTA subway data files are too large for GitHub. Follow these steps:

## Step 1: Remove old files from Git tracking
```bash
git rm --cached data/mta-subway-routes-data.js data/mta-subway-routes-data.json
```

## Step 2: Delete the old files locally
```bash
rm data/mta-subway-routes-data.js data/mta-subway-routes-data.json
```

## Step 3: Regenerate with optimized script
```bash
python scripts/parse-mta-subway-data.py
```

## Step 4: Check file sizes (should be much smaller now)
```bash
ls -lh data/mta-subway-routes-data.*
```

## Step 5: Add and commit the new smaller files
```bash
git add data/mta-subway-routes-data.js data/mta-subway-routes-data.json
git commit -m "Optimize MTA subway data files - reduce size by keeping only representative trips"
git push
```

If the files are still too large after regeneration, we may need to remove `trip_stop_times` entirely and rely only on `ordered_stops` and `avg_travel_times`.

