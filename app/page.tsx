"use client";
/* eslint-disable jsx-a11y/label-has-associated-control */
import { memo, useCallback, useEffect, useMemo, useState } from "react";

type Place={state:string;stateName:string;county:string;city:string;zips:string[];aliases?:string[]};
type RadiusPlace={city:string;label:string;state:string;lat:number;lng:number};
type Zcta={zip:string;lat:number;lng:number};
type RadiusData={meta:{source:string;method:string;placeCount:number;zctaCount:number};places:RadiusPlace[];zctas:Zcta[]};
type GeoRow=[zip:string,state:string,stateName:string,county:string,city:string];
type GeoData={meta?:{source?:string;release?:string;uniqueZipCount?:number;multiCountyZipCount?:number;coverage?:string;attributionUrl?:string};rows?:GeoRow[]};
const PLACES:Place[]=[
{state:"NJ",stateName:"New Jersey",county:"Bergen",city:"Hackensack",zips:["07601","07602","07603"]},{state:"NJ",stateName:"New Jersey",county:"Bergen",city:"Fort Lee",zips:["07024"]},{state:"NJ",stateName:"New Jersey",county:"Essex",city:"Newark",zips:["07101","07102","07103","07104"]},{state:"NJ",stateName:"New Jersey",county:"Hudson",city:"Jersey City",zips:["07097","07302","07304","07305"]},{state:"NJ",stateName:"New Jersey",county:"Middlesex",city:"New Brunswick",zips:["08901","08902","08903"]},{state:"NY",stateName:"New York",county:"Kings",city:"Brooklyn",zips:["11201","11203","11205","11211"]},{state:"NY",stateName:"New York",county:"Queens",city:"Queens",zips:["11101","11354","11368","11432"]},{state:"NY",stateName:"New York",county:"Nassau",city:"Hempstead",zips:["11549","11550","11551"]},{state:"CA",stateName:"California",county:"Los Angeles",city:"Los Angeles",zips:["90001","90002","90003","90004","90005"]},{state:"CA",stateName:"California",county:"Orange",city:"Anaheim",zips:["92801","92802","92803","92804"]},{state:"CA",stateName:"California",county:"San Francisco",city:"San Francisco",zips:["94102","94103","94104","94105"]},{state:"TN",stateName:"Tennessee",county:"Shelby",city:"Memphis",zips:["38103","38104","38110","38111","38112"]},{state:"FL",stateName:"Florida",county:"Orange",city:"Orlando",zips:["32801","32803","32804","32805"]}];
const STATES=[["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["DC","District of Columbia"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],["PR","Puerto Rico"],["AS","American Samoa"],["GU","Guam"],["MP","Northern Mariana Islands"],["VI","U.S. Virgin Islands"]] as const;
const unique=(a:string[])=>Array.from(new Set(a)).sort();
// Hidden from the Build-tab browse grid only - typing "Puerto Rico" in Fast
// Path and the Radius-tab state dropdown are untouched.
const BROWSE_HIDDEN_STATES=new Set(["PR","AS","MP","VI"]);
const csvField=(s:string)=>/[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
// Resolved against the document base so the app works both at the site root and
// under a GitHub Pages sub-path such as /geolist/. Called only inside effects,
// so it stays server-render safe.
const dataUrl=(file:string)=>new URL("data/"+file,document.baseURI).toString();
const norm=(s:string)=>s.toLowerCase().replace(/\bst[.]?\b/g,"saint").replace(/\bcounty\b/g,"").replace(/[^a-z0-9]+/g," ").trim();
type NameIndex={byState:Map<string,Place[]>;byCity:Map<string,Set<Place>>;byCounty:Map<string,Set<Place>>};
// Name lookups are indexed once per dataset. Scanning `places` per token made a
// pasted list of N entries cost N x 47k comparisons and locked up the tab.
function resolve(raw:string,idx:NameIndex){
 const t=norm(raw),st=STATES.find(([a,n])=>t===a.toLowerCase()||t===norm(n));
 if(st){const p=idx.byState.get(st[0])??[];return{kind:p.length?"ok":"unsupported",raw,places:p};}
 const cityHit=idx.byCity.get(t),countyHit=idx.byCounty.get(t),p:Place[]=[],regions=new Set<string>();
 if(cityHit)for(const x of cityHit){p.push(x);regions.add(x.state+"|"+x.city);}
 if(countyHit)for(const x of countyHit)if(!cityHit?.has(x)){p.push(x);regions.add(x.state+"|"+x.county);}
 return{kind:!p.length?"unknown":regions.size>1?"ambiguous":"ok",raw,places:p};
}
// Memoized so unchecking one county re-renders that row instead of all 257.
const CountyRow=memo(function CountyRow({rowKey,county,state,count,checked,onToggle}:{rowKey:string;county:string;state:string;count:number;checked:boolean;onToggle:(key:string)=>void}){
 return <label><input type="checkbox" checked={checked} onChange={()=>onToggle(rowKey)}/><span><b>{county} County</b><small>{state} - {count} ZIPs</small></span></label>;
});
function miles(a:{lat:number;lng:number},b:{lat:number;lng:number}){const rad=(n:number)=>n*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),v=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 3958.8*2*Math.asin(Math.sqrt(v));}
export default function Home(){
 const[mode,setMode]=useState<"build"|"radius"|"inspect">("build"),[buildInput,setBuildInput]=useState(""),[inspectInput,setInspectInput]=useState(""),[places,setPlaces]=useState<Place[]>(PLACES),[dataSource,setDataSource]=useState("Loading SimpleMaps ZIP data");
 const[radiusData,setRadiusData]=useState<RadiusData|null>(null),[radiusCity,setRadiusCity]=useState(""),[radiusState,setRadiusState]=useState("TN"),[radiusMiles,setRadiusMiles]=useState(25),[pickedCenter,setPickedCenter]=useState<RadiusPlace|null>(null);
 const[selectedStates,setSelectedStates]=useState<string[]>([]),[selectedCounties,setSelectedCounties]=useState<string[]>([]),[browseState,setBrowseState]=useState(""),[format,setFormat]=useState<"comma"|"line">("comma"),[copied,setCopied]=useState(false),[query,setQuery]=useState(""),[inspectQuery,setInspectQuery]=useState(""),[inspectCopied,setInspectCopied]=useState(false);
 useEffect(()=>{fetch(dataUrl("geo-index.json")).then(r=>{if(!r.ok)throw Error();return r.json()}).then((data:GeoData)=>{if(Array.isArray(data.rows)&&data.rows.length){setPlaces(data.rows.map(([zip,state,stateName,county,city])=>({state,stateName,county,city,zips:[zip],aliases:[city]})));setDataSource(`${data.meta?.source??"SimpleMaps"} - ${data.meta?.release??"Basic"}`)}}).catch(()=>{});fetch(dataUrl("radius-index.json")).then(r=>r.json()).then((d:RadiusData)=>setRadiusData(d)).catch(()=>{});},[]);
 // One O(places) pass builds every lookup the render needs. Previously the
 // county list recomputed its per-county ZIP counts by re-filtering all 47k
 // places on every render - ~300ms for a state like TX, on every keystroke.
 const geo=useMemo(()=>{
  const byState=new Map<string,Place[]>(),byCity=new Map<string,Set<Place>>(),byCounty=new Map<string,Set<Place>>();
  const countiesByState=new Map<string,string[]>(),zipsByCounty=new Map<string,Set<string>>(),zipsByState=new Map<string,Set<string>>(),zipLookup=new Map<string,Place[]>();
  const push=(m:Map<string,Set<Place>>,k:string,p:Place)=>{let s=m.get(k);if(!s){s=new Set();m.set(k,s);}s.add(p);};
  for(const p of places){
   let list=byState.get(p.state);if(!list){list=[];byState.set(p.state,list);}list.push(p);
   for(const v of [p.city,...(p.aliases??[])])for(const q of [v,v+" "+p.state,v+" "+p.stateName])push(byCity,norm(q),p);
   for(const q of [p.county,p.county+" "+p.state,p.county+" "+p.stateName])push(byCounty,norm(q),p);
   const key=p.state+"|"+p.county;
   let cz=zipsByCounty.get(key);
   if(!cz){cz=new Set();zipsByCounty.set(key,cz);let ks=countiesByState.get(p.state);if(!ks){ks=[];countiesByState.set(p.state,ks);}ks.push(key);}
   let sz=zipsByState.get(p.state);if(!sz){sz=new Set();zipsByState.set(p.state,sz);}
   for(const zip of p.zips){cz.add(zip);sz.add(zip);const cur=zipLookup.get(zip);if(cur)cur.push(p);else zipLookup.set(zip,[p]);}
  }
  for(const ks of countiesByState.values())ks.sort();
  return{byState,byCity,byCounty,countiesByState,zipsByCounty,zipsByState,zipLookup};
 },[places]);
 const supported=useMemo(()=>new Set(places.map(p=>p.state)),[places]);
 const selectedStateSet=useMemo(()=>new Set(selectedStates),[selectedStates]),selectedCountySet=useMemo(()=>new Set(selectedCounties),[selectedCounties]);
 const partialStates=useMemo(()=>new Set(selectedCounties.map(k=>k.slice(0,k.indexOf("|")))),[selectedCounties]);
 const tokens=useMemo(()=>buildInput.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean),[buildInput]);
 const matches=useMemo(()=>tokens.map(raw=>resolve(raw,geo)),[tokens,geo]);
 const reverse=useMemo(()=>unique(inspectInput.split(/[\s,;]+/).filter(Boolean)).map(zip=>({zip,places:geo.zipLookup.get(zip)??[]})),[inspectInput,geo]);
 // Filters the full reverse-lookup list, not just the displayed slice below -
 // so filtering a paste larger than inspectLimit can surface matches the cap
 // would otherwise have hidden.
 const inspectFiltered=useMemo(()=>{
  const q=inspectQuery.trim();
  if(!q)return reverse;
  const nq=norm(q);
  return reverse.filter(({zip,places})=>zip.includes(q)||places.some(p=>norm(p.city).includes(nq)||norm(p.county).includes(nq)||norm(p.state).includes(nq)||norm(p.stateName).includes(nq)));
 },[reverse,inspectQuery]);
 const inspectHasFilter=inspectQuery.trim().length>0;
 // Exports inspectFiltered (the full matching set), not displayedReverse -
 // Copy/Download aren't limited by the 2,000-row display cap either.
 const inspectCsv=useMemo(()=>{
  const rows=inspectFiltered.map(({zip,places})=>{
   const found=places.length>0;
   return[zip,found?unique(places.map(p=>p.city)).join(", "):"",found?unique(places.map(p=>p.county)).join(", "):"",found?unique(places.map(p=>p.state)).join(", "):"",found?"":/^\d{5}$/.test(zip)?"Not found in loaded ZIP data":"Use a 5-digit ZIP"];
  });
  return["ZIP,City,County,State,Status",...rows.map(r=>r.map(csvField).join(","))].join("\n");
 },[inspectFiltered]);
 const copyInspect=async()=>{await navigator.clipboard.writeText(inspectCsv);setInspectCopied(true);setTimeout(()=>setInspectCopied(false),1500);};
 const downloadInspect=()=>{
  const blob=new Blob([inspectCsv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="zip-inspection.csv";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
 };
 const inspectLimit=2000,displayedReverse=useMemo(()=>inspectFiltered.slice(0,inspectLimit),[inspectFiltered]);
 const buildZips=useMemo(()=>{
  const out=new Set<string>();
  for(const m of matches)if(m.kind==="ok")for(const p of m.places)for(const zip of p.zips)out.add(zip);
  for(const s of selectedStates){const set=geo.zipsByState.get(s);if(set)for(const zip of set)out.add(zip);}
  for(const k of selectedCounties){const set=geo.zipsByCounty.get(k);if(set)for(const zip of set)out.add(zip);}
  return Array.from(out).sort();
 },[matches,selectedStates,selectedCounties,geo]);
 const suggestions=useMemo(()=>!radiusData||radiusCity.trim().length<2?[]:radiusData.places.filter(p=>p.state===radiusState&&norm(p.city).includes(norm(radiusCity))).slice(0,8),[radiusData,radiusCity,radiusState]);
 const center=pickedCenter&&pickedCenter.state===radiusState&&norm(pickedCenter.city)===norm(radiusCity)?pickedCenter:null;
 const radiusResults=useMemo(()=>!center||!radiusData?[]:radiusData.zctas.map(z=>({zip:z.zip,distance:miles(center,z)})).filter(z=>z.distance<=radiusMiles).sort((a,b)=>a.distance-b.distance),[center,radiusData,radiusMiles]);
 const zips=useMemo(()=>mode==="radius"?radiusResults.map(r=>r.zip):buildZips,[mode,radiusResults,buildZips]);
 const output=useMemo(()=>zips.join(format==="comma"?", ":"\n"),[zips,format]);
 const warnings=useMemo(()=>matches.filter(x=>x.kind!=="ok"),[matches]);
 const counties=useMemo(()=>geo.countiesByState.get(browseState)??[],[geo,browseState]);
 const visible=useMemo(()=>STATES.filter(([a,n])=>!BROWSE_HIDDEN_STATES.has(a)&&(a+" "+n).toLowerCase().includes(query.toLowerCase())),[query]);
 const selectedInBrowse=useMemo(()=>counties.reduce((n,k)=>n+(selectedCountySet.has(k)?1:0),0),[counties,selectedCountySet]);
 const allCountiesOn=counties.length>0&&selectedInBrowse===counties.length;
 const onFastInput=(value:string)=>{setBuildInput(value);if(value.trim()){setSelectedStates([]);setSelectedCounties([]);setBrowseState("");}};
 // Unchecking a fully-selected state leaves it with zero selection (checking a
 // county always clears the state's full-selection and vice versa, so a
 // checked state never has counties to preserve) - close its drill-down
 // instead of leaving an orphaned "0 of N selected" panel open.
 const toggleState=(s:string)=>{if(!supported.has(s))return;const wasSelected=selectedStates.includes(s);setBuildInput("");setBrowseState(wasSelected?"":s);setSelectedStates(v=>wasSelected?v.filter(x=>x!==s):[...v,s]);setSelectedCounties(v=>v.filter(x=>!x.startsWith(s+"|")));};
 // Stable identity keeps CountyRow's memo effective across renders.
 const toggleCounty=useCallback((key:string)=>{const state=key.split("|")[0];setBuildInput("");setBrowseState(state);setSelectedStates(v=>v.filter(x=>x!==state));setSelectedCounties(v=>v.includes(key)?v.filter(x=>x!==key):[...v,key]);},[]);
 // Check all selects every county in the browsed state so the user can then
 // uncheck the handful they don't want, rather than ticking dozens by hand.
 const setAllCounties=(on:boolean)=>{if(!browseState)return;setBuildInput("");setSelectedStates(v=>v.filter(x=>x!==browseState));setSelectedCounties(v=>{const others=v.filter(k=>!k.startsWith(browseState+"|"));return on?[...others,...counties]:others;});};
 const clearBrowse=()=>{setSelectedStates([]);setSelectedCounties([]);};
 const clearStateCounties=(state:string)=>setSelectedCounties(v=>v.filter(k=>!k.startsWith(state+"|")));
 // Counties collapse to one chip per state. Listing them individually meant
 // "Check all" on Texas rendered 257 chips (~1.5k DOM nodes) in the summary.
 const countyGroups=useMemo(()=>{
  const m=new Map<string,string[]>();
  for(const k of selectedCounties){const i=k.indexOf("|"),s=k.slice(0,i);let l=m.get(s);if(!l){l=[];m.set(s,l);}l.push(k.slice(i+1));}
  return Array.from(m,([state,list])=>({state,list:list.sort(),total:geo.countiesByState.get(state)?.length??0}));
 },[selectedCounties,geo]);
 const copy=async()=>{await navigator.clipboard.writeText(output);setCopied(true);setTimeout(()=>setCopied(false),1500);};
 const outputPanel=<aside className="output"><div className="outtitle"><span><label>Output</label><h2>Resolved ZIP list</h2></span><b>{zips.length}</b></div><div className="toggle"><button className={format==="comma"?"active":""} onClick={()=>setFormat("comma")}>Comma delimited</button><button className={format==="line"?"active":""} onClick={()=>setFormat("line")}>Line delimited</button></div><textarea readOnly value={output} placeholder="Your ZIPs will appear here"/><div className="zero"><b>0</b><span><strong>Leading zeroes preserved</strong><small>ZIPs are handled as text, never numbers.</small></span></div><button className="copy" disabled={!output} onClick={copy}>{copied?"\u2713 Copied to clipboard":"Copy ZIP list"}</button><p>Plain ZIPs only - you decide what to include or exclude.</p></aside>;
 return <main><header><div className="brand"><b><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></b><span><strong>SimpleZips</strong><small>ZIP targeting workspace</small></span></div><div className="badge"><i/>{mode==="radius"?"Census 2025 - offline radius":dataSource}</div></header>
 <section className="hero"><div><label>Campaign setup, simplified</label><h1>Turn a geo ask into a clean ZIP list.</h1><p>Build from states and counties, or find ZIPs within a radius of a city.</p></div><aside className="quick-guide"><small>Quick guide</small><ol><li><b>Choose</b><span>Select states, counties, or a city radius.</span></li><li><b>Paste</b><span>Copy the ZIP list wherever you need it.</span></li></ol></aside></section>
 <nav><button className={mode==="build"?"active":""} onClick={()=>setMode("build")}><em>01</em>Build a ZIP list</button><button className={mode==="radius"?"active":""} onClick={()=>setMode("radius")}><em>02</em>Search by radius</button><button className={mode==="inspect"?"active":""} onClick={()=>setMode("inspect")}><em>03</em>Inspect ZIPs</button></nav>
 {mode==="build"?<><section className="paste card"><div className="title"><span><label>Fast path</label><h2>Enter the target geography</h2></span><button onClick={()=>{setBuildInput("");setSelectedStates([]);setSelectedCounties([]);setBrowseState("")}}>Clear all</button></div><div className="inputbox"><textarea value={buildInput} onChange={e=>onFastInput(e.target.value)} placeholder={"Try: CA, NY, Bergen County\nOr: Memphis TN; Los Angeles County"}/><small>Separate places with commas, semicolons, or new lines</small></div><div className="chips">{matches.map((m,i)=><span key={i} className={m.kind}>{m.kind==="ok"?"\u2713":m.kind==="ambiguous"?"Review":"!"} {m.raw}</span>)}</div>{!!warnings.length&&<div className="warning"><b>!</b><span><strong>{warnings.length} item{warnings.length>1?"s need":" needs"} attention</strong>{warnings.map((m,i)=><p key={i}><b>{m.raw}</b> {m.kind==="ambiguous"?"matches multiple states. Add the state.":m.kind==="unsupported"?"is outside the currently loaded county dataset.":"couldn't be matched. Check spelling or add a state."}</p>)}</span></div>}</section><div className="or"><span>or browse manually</span></div><section className="workspace"><div className="browser card"><div className="title"><span><label>Browse</label><h2>Select states or counties</h2></span><mark>{selectedStates.length+selectedCounties.length} selected</mark></div><div className="search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a state"/></div><div className="states">{visible.map(([a,n])=>{const full=selectedStateSet.has(a),partial=partialStates.has(a);return<button key={a} title={!supported.has(a)?n+" is not in the loaded county file":n} className={(full?"selected ":partial?"partial ":"")+(!supported.has(a)?"disabled":"")} onClick={()=>toggleState(a)}><i>{full||partial?"\u2713":""}</i><span><b>{a}</b><small>{partial&&!full?"County selected":n}</small></span></button>})}</div>{!!(selectedStates.length+selectedCounties.length)&&<div className="selection-summary"><div><span><b>Current selections</b><small>{selectedStates.length+selectedCounties.length} active</small></span><button onClick={clearBrowse}>Clear selections</button></div><section>{selectedStates.map(state=>{const name=STATES.find(([a])=>a===state)?.[1]??state;return <button key={state} onClick={()=>toggleState(state)} title={`Remove ${name}`}><b>{"\u2713"}</b><span><strong>{name}</strong><small>Entire state</small></span><i>{"\u00d7"}</i></button>})}{countyGroups.map(({state,list,total})=>{const name=STATES.find(([a])=>a===state)?.[1]??state,label=list.length===total?`All ${total} counties`:list.length<=3?list.map(c=>c+" County").join(", "):`${list.length} of ${total} counties`;return <button key={state} onClick={()=>clearStateCounties(state)} title={`Remove county selections in ${name}`}><b>{"\u2713"}</b><span><strong>{name}</strong><small>{label}</small></span><i>{"\u00d7"}</i></button>})}</section></div>}<p className="coverage-note">Basic coverage excludes unique-company, military, and PO-box-only ZIPs.</p><p className="coverage-note">County names follow ZIP-code boundaries, not legal lines. Border ZIPs can appear under a neighboring county, and same-named cities/counties (e.g. St. Louis city and county) may be combined.</p>{!!counties.length&&<div className="counties"><span><h3>Drill into counties</h3><p>Check all, then uncheck the counties you don&apos;t want. Selecting counties replaces the full-state selection.</p></span><div className="county-actions"><button type="button" onClick={()=>setAllCounties(true)} disabled={allCountiesOn}>Check all</button><button type="button" onClick={()=>setAllCounties(false)} disabled={!selectedInBrowse}>Uncheck all</button><mark>{selectedInBrowse} of {counties.length} selected</mark></div><div>{counties.map(key=>{const i=key.indexOf("|");return<CountyRow key={key} rowKey={key} state={key.slice(0,i)} county={key.slice(i+1)} count={geo.zipsByCounty.get(key)?.size??0} checked={selectedCountySet.has(key)} onToggle={toggleCounty}/>})}</div></div>}</div>{outputPanel}</section></>:
 mode==="radius"?<section className="workspace radius-workspace"><div className="radius-card card"><div className="title"><span><label>Nationwide radius</label><h2>Find ZIPs around a city</h2></span><mark>{radiusData?"2025 data loaded":"Loading data..."}</mark></div><p className="radius-intro">Choose a Census place and distance. Results include ZCTAs whose representative center point falls inside the radius.</p><div className="radius-form"><label><span>City</span><input value={radiusCity} onChange={e=>{setRadiusCity(e.target.value);setPickedCenter(null)}} placeholder="Enter a city"/></label><label><span>State</span><select value={radiusState} onChange={e=>{setRadiusState(e.target.value);setPickedCenter(null)}}>{STATES.map(([a,n])=><option key={a} value={a}>{a} - {n}</option>)}</select></label><label><span>Radius</span><select value={radiusMiles} onChange={e=>setRadiusMiles(Number(e.target.value))}>{[5,10,15,25,50,75,100].map(n=><option key={n} value={n}>{n} miles</option>)}</select></label></div>{!center&&radiusCity.length>=2&&<div className="suggestions">{suggestions.length?suggestions.map((p,i)=><button key={p.state+p.label+i} onClick={()=>{setRadiusCity(p.city);setPickedCenter(p)}}><b>{p.city}, {p.state}</b><small>{p.label}</small></button>):<p>No matching Census place in {radiusState}. Check the spelling or state.</p>}</div>}{center&&<><div className="radius-status"><b>{"\u2713"}</b><span><strong>{center.city}, {center.state}</strong><small>{radiusResults.length} ZCTAs have a center point within {radiusMiles} miles</small></span></div><div className="nearby"><span>Nearest results</span>{radiusResults.slice(0,8).map(r=><b key={r.zip}>{r.zip}<small>{r.distance.toFixed(1)} mi</small></b>)}</div></>}<div className="method-note"><b>How radius works</b><p>This is a center-point test using official Census Gazetteer coordinates - not a drive-time area or exact ZIP-boundary intersection. ZCTAs approximate USPS delivery ZIPs, so review edge cases for high-value campaigns.</p></div></div>{outputPanel}</section>:
 <section className="inspect card"><div><label>Reverse lookup</label><h2>See what&apos;s inside a ZIP list.</h2><p>Paste ZIPs to identify their state, county, and city. Unknown and malformed entries are flagged instead of dropped.</p><textarea value={inspectInput} onChange={e=>setInspectInput(e.target.value)} placeholder="07601, 38110, 90001"/></div><div className="results">{!!reverse.length&&<div className="search"><input value={inspectQuery} onChange={e=>setInspectQuery(e.target.value)} placeholder="Filter by ZIP, city, county, or state"/></div>}{!!reverse.length&&<div className="inspect-meta"><span className="inspect-meta-text"><b>{inspectHasFilter?`${inspectFiltered.length.toLocaleString()} of ${reverse.length.toLocaleString()} match`:`${reverse.length.toLocaleString()} unique entries`}</b><span>{inspectFiltered.length>inspectLimit?`Showing the first ${inspectLimit.toLocaleString()} of ${inspectFiltered.length.toLocaleString()}${inspectHasFilter?" matches":""}. Download the full CSV to see the rest, or narrow your filter.`:inspectHasFilter&&!inspectFiltered.length?"No matches for this filter.":"All entries shown"}</span></span><span className="inspect-actions"><button type="button" onClick={copyInspect} disabled={!inspectFiltered.length}>{inspectCopied?"✓ Copied":"Copy"}</button><button type="button" onClick={downloadInspect} disabled={!inspectFiltered.length}>Download CSV</button></span></div>}<div className="thead"><b>ZIP</b><b>City</b><b>County</b><b>State</b></div>{displayedReverse.length?displayedReverse.map(({zip,places})=>{const found=places.length>0;return <div className={"row "+(!found?"unknown":"")} key={zip}><b>{zip}</b>{found?<><span>{unique(places.map(p=>p.city)).join(", ")}</span><span>{unique(places.map(p=>p.county)).join(", ")}</span><span>{unique(places.map(p=>p.state)).join(", ")}</span></>:<span className="notfound">{/^\d{5}$/.test(zip)?"Not found in loaded ZIP data":"Use a 5-digit ZIP"}</span>}</div>}):<div className="empty">{reverse.length?"No entries match this filter.":"Paste a ZIP list to inspect it."}</div>}</div></section>}
 <footer><span>ZIP/county data: <a href="https://simplemaps.com/data/us-zips" target="_blank" rel="noreferrer">SimpleMaps US ZIP Codes Basic</a> - Radius centers: Census 2025 Gazetteer</span><span>CC BY 4.0 attribution - No runtime API calls</span></footer></main>;
}
