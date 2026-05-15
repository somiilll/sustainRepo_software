"""
Script to update allowed_units and default_unit for 'Purchased Goods and Services' category
in the Scope 3 EF table.

Sets:
- allowed_units: ["t", "kg", "g"]
- default_unit: "t"
"""
import asyncio
import os
import sys
sys.path.insert(0, '/app/backend')

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def update_purchased_goods_units():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    if mongo_url.startswith('mongodb+srv://'):
        import certifi
        client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
    else:
        client = AsyncIOMotorClient(mongo_url)
    
    db = client[db_name]
    
    # Define the update values
    allowed_units = ["t", "kg", "g"]
    default_unit = "t"
    
    # First, let's see what we have - check for exact match
    exact_count = await db.scope3_ef.count_documents({"category": "Purchased Goods and Services"})
    print(f"Found {exact_count} entries with category 'Purchased Goods and Services'")
    
    # Get sample of current entries to show before state
    sample = await db.scope3_ef.find(
        {"category": "Purchased Goods and Services"},
        {"_id": 0, "activity": 1, "allowed_units": 1, "default_unit": 1}
    ).limit(5).to_list(5)
    
    print("\nSample entries BEFORE update:")
    for entry in sample:
        print(f"  - {entry.get('activity')}: allowed_units={entry.get('allowed_units')}, default_unit={entry.get('default_unit')}")
    
    # Update all entries
    result = await db.scope3_ef.update_many(
        {"category": "Purchased Goods and Services"},
        {
            "$set": {
                "allowed_units": allowed_units,
                "default_unit": default_unit
            }
        }
    )
    
    print(f"\n✅ Updated {result.modified_count} entries")
    print(f"   Matched: {result.matched_count}")
    
    # Verify the update
    sample_after = await db.scope3_ef.find(
        {"category": "Purchased Goods and Services"},
        {"_id": 0, "activity": 1, "allowed_units": 1, "default_unit": 1}
    ).limit(5).to_list(5)
    
    print("\nSample entries AFTER update:")
    for entry in sample_after:
        print(f"  - {entry.get('activity')}: allowed_units={entry.get('allowed_units')}, default_unit={entry.get('default_unit')}")
    
    # Final count verification
    final_with_default = await db.scope3_ef.count_documents({
        "category": "Purchased Goods and Services",
        "default_unit": "t",
        "allowed_units": ["t", "kg", "g"]
    })
    print(f"\n📊 Verification: {final_with_default} entries now have default_unit='t' and allowed_units=['t', 'kg', 'g']")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(update_purchased_goods_units())
