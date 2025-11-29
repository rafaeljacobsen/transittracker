#!/usr/bin/env python3
"""
Download CTrail Shore Line East GTFS Data
Downloads the latest Shore Line East GTFS feed and extracts it to the shore_line_east_gtfs/ directory
"""

import requests
import zipfile
from io import BytesIO
from pathlib import Path
import shutil
from datetime import datetime

# CTrail Shore Line East GTFS Feed URL (provided by Amtrak)
SHORE_LINE_EAST_GTFS_URL = "https://content.amtrak.com/content/gtfs/GTFS.zip"

def download_shore_line_east_gtfs():
    """Download and extract Shore Line East GTFS data"""
    print("=" * 60)
    print("CTRAIL SHORE LINE EAST GTFS DOWNLOADER")
    print("=" * 60)
    print(f"Downloading from: {SHORE_LINE_EAST_GTFS_URL}")
    print()
    
    try:
        # Download the GTFS zip file
        print("📥 Downloading Shore Line East GTFS data...")
        response = requests.get(SHORE_LINE_EAST_GTFS_URL, timeout=120)
        response.raise_for_status()
        
        file_size_mb = len(response.content) / 1024 / 1024
        print(f"✅ Downloaded {file_size_mb:.2f} MB")
        
        # Create backup of existing data if it exists
        gtfs_dir = Path("shore_line_east_gtfs")
        if gtfs_dir.exists():
            backup_dir = Path(f"shore_line_east_gtfs_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            print(f"📦 Backing up existing data to {backup_dir}")
            shutil.copytree(gtfs_dir, backup_dir)
            shutil.rmtree(gtfs_dir)
        
        # Create directory
        gtfs_dir.mkdir(exist_ok=True)
        
        # Extract the zip file
        print("📂 Extracting GTFS files...")
        with zipfile.ZipFile(BytesIO(response.content)) as zip_file:
            zip_file.extractall(gtfs_dir)
            file_list = zip_file.namelist()
        
        print(f"✅ Extracted {len(file_list)} files to {gtfs_dir}/")
        
        # Save a copy of the zip file for reference
        zip_path = Path("shore_line_east_gtfs.zip")
        with open(zip_path, 'wb') as f:
            f.write(response.content)
        print(f"💾 Saved zip archive to {zip_path}")
        
        # Display extracted files
        print("\n📄 Extracted files:")
        for file_name in sorted(file_list):
            file_path = gtfs_dir / file_name
            if file_path.exists():
                size_kb = file_path.stat().st_size / 1024
                print(f"   - {file_name:<30} ({size_kb:>8.1f} KB)")
        
        # Show key statistics
        print("\n" + "=" * 60)
        print("DOWNLOAD COMPLETE")
        print("=" * 60)
        print(f"📁 GTFS Directory: {gtfs_dir.absolute()}")
        print(f"💾 Zip Archive: {zip_path.absolute()}")
        print(f"📊 Total Files: {len(file_list)}")
        print(f"📏 Total Size: {file_size_mb:.2f} MB")
        print()
        print("✨ Ready to parse! Run scripts/parse-ctrail-shore-line-east-data.py to generate data.")
        
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
    """Main function"""
    success = download_shore_line_east_gtfs()
    
    if success:
        print("\n🎉 Success! You can now run:")
        print("   - python scripts/parse-ctrail-shore-line-east-data.py")
        print()
        print("💡 Note: Shore Line East data is ready for your transit tracker!")
    else:
        print("\n⚠️  Download failed. Please check your internet connection and try again.")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())

