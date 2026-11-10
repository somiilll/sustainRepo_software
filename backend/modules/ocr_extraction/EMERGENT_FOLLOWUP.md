# Prompt to paste into Emergent

Copy everything below the line into Emergent. It asks for the last pieces needed to connect the new extractor to
the live app. Send back Emergent's answer and any files it produces. Part 1 should be a JSON file.

---

Thanks for the formula report. We are replacing the OCR Extraction backend with a new extractor that also fills the
formula fields Save-all needs. To connect it, please send the following. Read only from the codebase and the
database; do not change anything yet.

## Part 1 - JSON export (one file, please)

Export the GHG reference data as JSON with this shape. Include every record, not a sample.

```json
{
  "exported_at": "...",
  "database": "the database name / environment you read from",
  "scopes": [
    {"id": "...", "key": "scope_1", "name": "Scope 1",
     "categories": [
       {"id": "...", "name": "Stationary Combustion",
        "subcategories": [
          {"id": "...", "name": "Gas/Diesel Oil",
           "emission_factors": [
             {"id": "...", "source": "IPCC 2006 / DEFRA 2025 / ...", "region": "India / Global", "year": 2025,
              "formula_id": "...", "formula_name": "Heat basis (NCV)", "basis": "activity | spend | supplier",
              "unit": "kg CO2e per L", "is_default": true}
           ]}
        ]}
     ]}
  ],
  "formulas": [
    {"id": "...", "name": "...", "fields": [
      {"key": "qty", "label": "Quantity Used", "required": true, "allowed_units": ["L", "kL", "kg", "..."], "default": null}
    ]}
  ],
  "units": [{"id": "...", "name": "L", "dimension": "volume", "to_base_factor": 1}]
}
```

## Part 2 - questions your formula report did not cover

1. **Current OCR endpoints.** Give the path, method, request and response for upload, job status, list rows, update a
   row, delete, history, and Save-all. Include the stored shape of an extracted row as it is today.
2. **How an emission record is stored.** Show the header fields, the per-period values (monthly?), where `<key>_unit` is
   stored, how evidence or attachments are linked, and how a record says which emission factor it used. Paste one real
   record as JSON, with ids masked if needed.
3. **Save-all.** Which endpoint and function? Does it calculate on save or later? What happens if a required field is
   missing? Does it accept a reporting period split across two months?
4. **Facilities.** Give the schema: name, address, and any consumer/meter number, GSTIN or utility-account fields. Are
   facilities per organisation?
5. **Units.** Is there a units table, or a fixed list per formula? How are kL, MT, MWh and SCM handled?
6. **Energy, Water and Waste modules.** Are their records derived from GHG records (for example Scope 2 electricity ->
   Energy), or entered separately? If separately, give each one's record schema and save endpoint.
7. **Review status.** Which statuses does an extracted row have today ("Needs review" etc.), and what decides them?
8. **Auth and org scoping.** How does an endpoint know the organisation and user? Is there a per-org settings store
   we can use for extractor settings (thresholds, waste-transport rule)?
9. **Background jobs.** Is there a job queue or worker, or do uploads run inside the request? What is the request timeout?
10. **Storage.** Where are uploaded files kept (S3 / GridFS / disk), and can the review page show page images?

## Part 3 - confirm

- The formula report and this export were read from the **live** database, not a preview or seed copy. If they
  differ, which one should we use?
- Category 4 vs 9: Category 4 is transport we pay for, including outbound; Category 9 is only transport the customer
  pays for. Does any Emergent logic assume otherwise?
- Scope 1 and Scope 2 have no spend formula. Rows without a physical quantity will be blocked from Save-all. Is that right?
