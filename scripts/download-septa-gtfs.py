#!/usr/bin/env python3
"""
Download SEPTA GTFS Data
Downloads the latest SEPTA GTFS feed (Regional Rail, bus, subway, trolley) and extracts to septa_gtfs/

SEPTA developer: https://www3.septa.org/developer/
"""

import requests
import zipfile
from io import BytesIO
from pathlib import Path
import shutil
from datetime import datetime

# SEPTA GTFS public feed (may require accepting license on developer page)
SEPTA_GTFS_URL = "https://www3.septa.org/developer/gtfs_public.zip"


def download_septa_gtfs():
    """Download and extract SEPTA GTFS data"""
    print("=" * 60)
    print("SEPTA GTFS DOWNLOADER")
    print("=" * 60)
    print(f"Downloading from: {SEPTA_GTFS_URL}")
    print()

    try:
        print("📥 Downloading SEPTA GTFS data...")
        headers = {"User-Agent": "TransitTracker/1.0 (GTFS download)"}
        response = requests.get(SEPTA_GTFS_URL, timeout=120, headers=headers)
        response.raise_for_status()

        file_size_mb = len(response.content) / 1024 / 1024
        print(f"✅ Downloaded {file_size_mb:.2f} MB")

        gtfs_dir = Path("septa_gtfs")
        if gtfs_dir.exists():
            backup_dir = Path(f"septa_gtfs_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            print(f"📦 Backing up existing data to {backup_dir}")
            shutil.copytree(gtfs_dir, backup_dir)
            shutil.rmtree(gtfs_dir)

        gtfs_dir.mkdir(exist_ok=True)

        print("📂 Extracting GTFS files...")
        with zipfile.ZipFile(BytesIO(response.content)) as zip_file:
            zip_file.extractall(gtfs_dir)
            file_list = zip_file.namelist()

        print(f"✅ Extracted {len(file_list)} files to {gtfs_dir}/")

        # SEPTA zip contains nested zips (google_rail.zip, google_bus.zip); extract them
        for nested_zip in gtfs_dir.glob("*.zip"):
            subdir = gtfs_dir / nested_zip.stem
            subdir.mkdir(exist_ok=True)
            print(f"📂 Extracting {nested_zip.name} to {subdir}/")
            with zipfile.ZipFile(nested_zip, "r") as zf:
                zf.extractall(subdir)
            nested_zip.unlink()
            print(f"   ✅ {nested_zip.name} -> {subdir}/")

        zip_path = Path("septa_gtfs.zip")
        with open(zip_path, "wb") as f:
            f.write(response.content)
        print(f"💾 Saved zip archive to {zip_path}")

        print("\n📄 Extracted files:")
        for file_name in sorted(file_list)[:40]:
            file_path = gtfs_dir / file_name
            if file_path.exists():
                size_kb = file_path.stat().st_size / 1024
                print(f"   - {file_name:<45} ({size_kb:>8.1f} KB)")
        if len(file_list) > 40:
            print(f"   ... and {len(file_list) - 40} more")

        print("\n" + "=" * 60)
        print("DOWNLOAD COMPLETE")
        print("=" * 60)
        print(f"📁 GTFS Directory: {gtfs_dir.absolute()}")
        print(f"💾 Zip Archive: {zip_path.absolute()}")
        print(f"📊 Total Files: {len(file_list)}")
        print(f"📏 Total Size: {file_size_mb:.2f} MB")
        print()
        print("✨ Ready to parse! Run scripts/parse-septa-rail-data.py to generate data.")

        return True

    except requests.exceptions.RequestException as e:
        print(f"❌ Error downloading GTFS data: {e}")
        return False
    except zipfile.BadZipFile as e:
        print(f"❌ Error extracting zip file: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False


def main():
    success = download_septa_gtfs()
    if success:
        print("\n🎉 Success! You can now run:")
        print("   python scripts/parse-septa-rail-data.py")
        return 0
    print("\n⚠️  Download failed. Check your connection or try again later.")
    return 1


if __name__ == "__main__":
    exit(main())
