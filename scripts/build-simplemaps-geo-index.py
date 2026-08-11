import argparse, csv, json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

parser=argparse.ArgumentParser(description="Build GeoList from the SimpleMaps US ZIP Codes Basic CSV.")
parser.add_argument("--input",required=True,type=Path)
parser.add_argument("--output",required=True,type=Path)
parser.add_argument("--version",default="Basic")
args=parser.parse_args()
records=[]
with args.input.open("r",encoding="utf-8-sig",newline="") as handle:
    for row in csv.DictReader(handle):
        z=str(row.get("zip","")).zfill(5)
        state=row.get("state_id","").strip()
        state_name=row.get("state_name","").strip() or state
        city=row.get("city","").strip()
        fips=(row.get("county_fips_all") or row.get("county_fips") or "").split("|")
        names=(row.get("county_names_all") or row.get("county_name") or "").split("|")
        if len(names)!=len(fips):
            raise SystemExit(f"County name/FIPS mismatch for ZIP {z}")
        if not (len(z)==5 and z.isdigit() and state and city):
            continue
        for county_fips,county in zip(fips,names):
            records.append({"zip":z,"state":state,"stateName":state_name,"county":county.strip(),"countyCode":county_fips.strip().zfill(5),"primaryCity":city,"cities":[city],"zcta":row.get("zcta")=="TRUE","latitude":float(row["lat"]),"longitude":float(row["lng"])})
records.sort(key=lambda r:(r["zip"],r["countyCode"]))
zip_count=len({r["zip"] for r in records}); states=len({r["state"] for r in records})
if zip_count<33000: raise SystemExit(f"Validation failed: only {zip_count} unique ZIPs")
if states<50: raise SystemExit(f"Validation failed: only {states} states/territories")
if not any(r["zip"].startswith("0") for r in records): raise SystemExit("Validation failed: no leading-zero ZIP")
zip_counts=Counter(r["zip"] for r in records)
payload={"meta":{"source":"SimpleMaps US ZIP Codes Basic","release":args.version,"generatedAt":datetime.now(timezone.utc).isoformat(),"recordCount":len(records),"uniqueZipCount":zip_count,"stateCount":states,"multiCountyZipCount":sum(1 for count in zip_counts.values() if count>1),"coverage":"ZCTAs only; unique, military, and PO-box-only ZIPs are not included","attributionUrl":"https://simplemaps.com/data/us-zips","schema":"rows: zip,state,stateName,county,city"},"rows":[[r["zip"],r["state"],r["stateName"],r["county"],r["primaryCity"]] for r in records]}
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
print(json.dumps(payload["meta"],indent=2))
