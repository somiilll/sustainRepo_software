"""Export KPI/BRSR/GRI catalog to backend/data/catalog_bundle/bundle.json.gz.

Usage: python -m scripts.export_catalog_bundle <version>   (a new version makes every environment re-apply it once)
"""
import asyncio
import sys

from modules.catalog_sync.service import export_bundle


async def main(version: str) -> None:
    counts = await export_bundle(version)
    print("exported", version, counts)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
