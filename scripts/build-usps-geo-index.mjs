import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => {
  if (!value.startsWith("--")) return [];
  const key = value.slice(2);
  const next = all[index + 1];
  return [key, next && !next.startsWith("--") ? next : true];
}).filter((entry) => entry.length));

if (!args.input || !args.output) {
  console.error("Usage: npm run data:build -- --input CITYSTATE.TXT --output public/data/geo-index.json [--allow-sample]");
  process.exit(2);
}

const STATE_NAMES = new Map([
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],["DC","District of Columbia"]
]);

const clean = (value) => value.trim().replace(/\s+/g, " ");
const groups = new Map();
const lines = readFileSync(resolve(String(args.input)), "latin1").split(/\r?\n/);

for (const line of lines) {
  if (!line.startsWith("D") || line.length < 104) continue;
  const zip = line.slice(1, 6);
  const zipClass = clean(line.slice(12, 13)) || "standard";
  const city = clean(line.slice(13, 41));
  const preferredCity = clean(line.slice(62, 90)) || city;
  const state = clean(line.slice(99, 101));
  const countyCode = clean(line.slice(101, 104));
  const county = clean(line.slice(104));
  if (!/^\d{5}$/.test(zip) || !state || !county || !city) continue;

  const key = [zip, state, countyCode].join("|");
  const current = groups.get(key) ?? {
    zip,
    state,
    stateName: STATE_NAMES.get(state) ?? state,
    county,
    countyCode,
    primaryCity: preferredCity,
    zipClass,
    cities: new Set()
  };
  current.cities.add(city);
  current.cities.add(preferredCity);
  if (preferredCity) current.primaryCity = preferredCity;
  groups.set(key, current);
}

const records = [...groups.values()]
  .map((record) => ({ ...record, cities: [...record.cities].sort() }))
  .sort((a, b) => a.zip.localeCompare(b.zip) || a.county.localeCompare(b.county));

const zipSet = new Set(records.map((record) => record.zip));
const stateSet = new Set(records.map((record) => record.state));
const errors = [];
if (!args["allow-sample"] && records.length < 30000) errors.push("Expected at least 30,000 ZIP/county records.");
if (!args["allow-sample"] && stateSet.size < 50) errors.push("Expected coverage for at least 50 states/districts.");
if (!args["allow-sample"] && !zipSet.has("38110")) errors.push("Required regression ZIP 38110 is missing.");
if (!args["allow-sample"] && !records.some((record) => record.zip.startsWith("0"))) errors.push("No leading-zero ZIP was found.");
if (records.some((record) => !/^\d{5}$/.test(record.zip))) errors.push("A malformed ZIP was produced.");
if (errors.length) {
  console.error("USPS dataset validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}

const output = {
  meta: {
    source: "USPS City State Product",
    generatedAt: new Date().toISOString(),
    recordCount: records.length,
    uniqueZipCount: zipSet.size,
    stateCount: stateSet.size,
    validation: {
      requiredZip38110: zipSet.has("38110"),
      leadingZeroPreserved: records.some((record) => record.zip.startsWith("0"))
    }
  },
  records
};

const outputPath = resolve(String(args.output));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(output));
console.log(JSON.stringify(output.meta, null, 2));
