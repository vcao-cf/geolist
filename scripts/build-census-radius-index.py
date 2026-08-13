import argparse, csv, io, json, re, zipfile
from pathlib import Path

def rows_from_zip(path: Path):
    with zipfile.ZipFile(path) as archive:
        name=archive.namelist()[0]
        with archive.open(name) as raw:
            yield from csv.DictReader(io.TextIOWrapper(raw,encoding="utf-8-sig"),delimiter="|")

def clean_place(name: str) -> str:
    # Three independent passes, each of which fires at most once. A single
    # combined/looping regex is unsafe here: "city"/"town" etc. can be part of
    # a real place name (e.g. "Alexander City city" -> strip once -> the
    # correct "Alexander City" - looping would strip "City" again too).
    n = re.sub(r"\s*\(balance\)$", "", name, flags=re.I)
    n = re.sub(r"\s+(?:consolidated|unified|metropolitan|metro)\s+government$", "", n, flags=re.I)
    n = re.sub(r"\s+(?:city|town|village|borough|municipality|CDP)$", "", n, flags=re.I)
    return n.strip()

# Most consolidated city-county governments have NO separate row for the
# underlying city in the Gazetteer - the standalone city was legally
# eliminated when it merged into the county government, sometimes decades ago
# (Nashville-Davidson, 1963). For those, clean_place() giving a plain name
# like "Nashville-Davidson" or "Indianapolis" is the best available and they
# stay in the list - dropping them would make major cities unsearchable here
# with no substitute.
#
# This is a hand-verified allowlist, not a pattern match, specifically because
# a regex can't tell "this consolidated-government row is redundant" from
# "this is the only row for this place" - confirmed against the 2025
# Gazetteer that only these three have a real standalone alternate already
# in the places file for the same state. Re-verify before adding to this list
# if the Gazetteer is ever regenerated from a newer Census release.
REDUNDANT_CONSOLIDATED_GOVERNMENT_NAMES = {
    "Louisville/Jefferson County metro government (balance)",  # "Louisville city" + "West Louisville CDP" exist
    "Greeley County unified government (balance)",  # "Greeley city" exists
    "Georgetown-Quitman County unified government",  # "Georgetown CDP" exists
}

parser=argparse.ArgumentParser(description="Build an offline Census place/ZCTA radius index.")
parser.add_argument("--places",required=True,type=Path)
parser.add_argument("--zctas",required=True,type=Path)
parser.add_argument("--output",required=True,type=Path)
args=parser.parse_args()
places=[{"city":clean_place(r["NAME"]),"label":r["NAME"],"state":r["USPS"],"lat":round(float(r["INTPTLAT"]),6),"lng":round(float(r["INTPTLONG"]),6)} for r in rows_from_zip(args.places) if r["NAME"] not in REDUNDANT_CONSOLIDATED_GOVERNMENT_NAMES]
zctas=[{"zip":r["GEOID"].zfill(5),"lat":round(float(r["INTPTLAT"]),6),"lng":round(float(r["INTPTLONG"]),6)} for r in rows_from_zip(args.zctas)]
payload={"meta":{"source":"U.S. Census Bureau 2025 Gazetteer Files","method":"ZCTA representative point distance from Census place representative point","placeCount":len(places),"zctaCount":len(zctas)},"places":sorted(places,key=lambda x:(x["state"],x["city"],x["label"])),"zctas":sorted(zctas,key=lambda x:x["zip"])}
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
print(json.dumps(payload["meta"],indent=2))
