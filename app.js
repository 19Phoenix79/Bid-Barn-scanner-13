// ===== Sir Scansalot — Scanner + Manifest import with CPI fallback for start price =====
(() => {
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const money = (n) => (Number(n) || 0).toFixed(2);
  const toFloat = (v) => { try { return parseFloat(String(v ?? "").replace(/[$,]/g, "")) || 0; } catch { return 0; } };

  const el = {
    truckCost: $("truckCost"),
    palletCost: $("palletCost"),
    palletLabel: $("palletLabel"),
    targetItems: $("targetItems"),
    startPct: $("startPct"),
    startMode: $("startMode"),
    startPctView: $("startPctView"),
    palletId: $("palletId"),
    count: $("count"),
    cpi: $("cpi"),
    retailLast: $("retailLast"),
    binLast: $("binLast"),

    live: $("live"),
    snapCanvas: $("snapCanvas"),
    upcInput: $("upcInput"),
    lastItem: $("lastItem"),
    tbody: $("tbody"),

    startCam: $("startCam"),
    stopCam: $("stopCam"),
    snapBtn: $("snapBtn"),
    addManual: $("addManual"),
    saveSession: $("saveSession"),
    newPallet: $("newPallet"),
    exportCsv: $("exportCsv"),
    clearPallet: $("clearPallet"),

    toastHost: $("toast"),
    manifestBtn: $("manifestBtn"),
    manifestFile: $("manifestFile"),
  };

  // --- Toast ---
  function toast(msg) {
    const host = el.toastHost || document.body;
    const div = document.createElement("div");
    div.className = "toast-bubble";
    div.textContent = msg;
    host.appendChild(div);
    setTimeout(() => div.remove(), 1600);
    try { navigator.vibrate && navigator.vibrate(40); } catch {}
  }

  // --- Recent de-dupe ---
  const recently = new Map(); const DEDUPE_MS = 3000;
  function isRecentlyScanned(upc){ const now=Date.now(); for(const[k,t]of recently) if(t<=now) recently.delete(k); const t=recently.get(upc); return t && t>now; }
  function markScanned(upc){ recently.set(upc, Date.now()+DEDUPE_MS); }

  // --- Detect pack quantity in title ---
  function detectPackQty(title=""){
    const pats=[/pack of\s*(\d+)/i,/(\d+)\s*pack\b/i,/(\d+)\s*pk\b/i,/(\d+)\s*ct\b/i,/(\d+)\s*count\b/i,/x\s*(\d+)\b/i];
    for(const re of pats){ const m=String(title).match(re); if(m && m[1]){ const n=+m[1]; if(Number.isFinite(n)&&n>1) return n; } }
    return 1;
  }

  // --- Retail cache ---
  const retailCacheKey="bb_retail_cache_v1";
  let retailCache={}; try{ retailCache=JSON.parse(localStorage.getItem(retailCacheKey)||"{}"); }catch{}
  function saveRetailCache(){ localStorage.setItem(retailCacheKey, JSON.stringify(retailCache)); }

  // --- State ---
  const SKEY="bb_pallet_v10";
  const state={ truckCost:0, palletCost:0, palletLabel:"", targetItems:0, startPct:0, startMode:"pct", items:[] };
  function load(){ try{ Object.assign(state, JSON.parse(localStorage.getItem(SKEY)||"{}")); }catch{} }
  function save(){ localStorage.setItem(SKEY, JSON.stringify(state)); }
  const totalUnits = () => state.items.reduce((s,it)=> s + (Number(it.qty)||0), 0);

  // ---- Cost helpers ----
  function totalCost(){ return state.palletCost>0 ? state.palletCost : (state.truckCost||0); }

  // CPI for “live” adds (scan/manual): use Target Items if provided, else current items + 1
  function cpiForLiveAdd(){
    const cost = totalCost();
    const denom = (state.targetItems && state.targetItems>0) ? state.targetItems : Math.max(1, totalUnits()+1);
    return cost>0 ? (cost/denom) : 0;
  }

  // CPI for a manifest batch: use Target Items if set, else sum of CSV quantities
  function cpiForBatch(batchQtyTotal){
    const cost = totalCost();
    const denom = (state.targetItems && state.targetItems>0) ? state.targetItems : Math.max(1, batchQtyTotal||0);
    return cost>0 ? (cost/denom) : 0;
  }

  // Compute all prices for a new item, with guaranteed CPI fallback if retail is missing
  function computePrices(retailPerUnit, cpiBaseline){
    const retail = Number(retailPerUnit||0);
    const mode   = state.startMode || "pct";
    let startPrice=0, startPctComputed=0;

    if (mode === "dollar"){
      startPrice = 1;
      startPctComputed = retail>0 ? (1/retail) : 0;
    } else {
      // pct mode: use % of retail WHEN retail>0; otherwise fall back to CPI
      if ((state.startPct||0) > 0 && retail>0){
        startPctComputed = state.startPct;
        startPrice = retail * state.startPct;
      } else {
        startPrice = cpiBaseline || 0;
        startPctComputed = retail>0 ? (startPrice/retail) : 0;
      }
    }

    const binPrice = retail ? retail*0.80 : 0;
    const goalSale = retail ? retail*0.38 : 0;
    const buyerFee = goalSale * 0.12;
    const profit   = (goalSale + buyerFee) - startPrice;

    return { startPrice, startPctComputed, binPrice, goalSale, buyerFee, profit };
  }

  // ---- UI paint ----
  function repaint(){
    if (el.palletId) el.palletId.textContent = state.palletLabel || "—";
    if (el.count) el.count.textContent = totalUnits();
    const liveCpi = cpiForLiveAdd();
    if (el.cpi) el.cpi.textContent = money(liveCpi);

    let pctHeader = state.startPct>0 ? state.startPct*100 : 0;
    if (!(pctHeader>0) && state.items[0] && state.items[0].startPctComputed>0) pctHeader = state.items[0].startPctComputed*100;
    if (el.startPctView) el.startPctView.textContent = `${Math.round(pctHeader)}%`;

    if (el.retailLast) el.retailLast.textContent = state.items[0]? money(state.items[0].retail||0) : "0.00";
    if (el.binLast)    el.binLast.textContent    = state.items[0]? money(state.items[0].binPrice||0) : "0.00";

    if (!el.tbody) return;
    el.tbody.innerHTML="";
    state.items.forEach((it,i)=>{
      const tr=document.createElement("tr");
      if ((it.profit||0)>0) tr.classList.add("profit-positive");
      if ((it.profit||0)<0) tr.classList.add("profit-negative");
      const retailHtml = (it.retail>0)
        ? `$${money(it.retail)}${(it.packQty>1?` <span class="small" style="color:#9aa4b2;">(per unit, pack ${it.packQty})</span>`:"")}`
        : `$0.00 <button class="qbtn" data-i="${i}" data-act="set-retail">Set</button>`;
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${it.upc||""}</td>
        <td>${it.title||""}</td>
        <td>${it.brand||""}</td>
        <td>${retailHtml}</td>
        <td>$${money(it.startPrice||0)}${(it.startPctComputed>0?` <span class="small" style="color:#9aa4b2;">(${Math.round(it.startPctComputed*100)}%)</span>`:"")}</td>
        <td>$${money(it.binPrice||0)}</td>
        <td>$${money(it.goalSale||0)}</td>
        <td>$${money(it.buyerFee||0)}</td>
        <td>$${money(it.profit||0)}</td>
        <td>
          <div class="qtywrap">
            <button class="qbtn" data-i="${i}" data-delta="-1">−</button>
            <input class="qtyinp" data-i="${i}" type="number" min="1" value="${it.qty||1}">
            <button class="qbtn" data-i="${i}" data-delta="1">+</button>
          </div>
        </td>
        <td>${it.userImg?`<img class="thumb" src="${it.userImg}" />`:""}</td>
      `;
      el.tbody.appendChild(tr);
    });
  }

  function setLast(it){
    if (!el.lastItem) return;
    const shortDesc = (it.desc||"").slice(0,180);
    el.lastItem.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        ${it.userImg?`<img class="thumb" src="${it.userImg}" />`:""}
        <div>
          <strong>${it.title || "Item"}</strong>
          <div class="small">UPC: ${it.upc||""} • Brand: ${it.brand||""} • Qty: ${it.qty||1}</div>
          <div class="small">
            Retail $${money(it.retail||0)} ${(it.packQty>1)?`(per unit, pack ${it.packQty})`:""} •
            Start $${money(it.startPrice||0)} ${(it.startPctComputed>0)?`(${Math.round(it.startPctComputed*100)}%)`:""} •
            BIN 80% $${money(it.binPrice||0)}
          </div>
          <div class="small">
            Goal (38%) $${money(it.goalSale||0)} • Buyer Fee (12%) $${money(it.buyerFee||0)} •
            <b>Profit</b> $${money(it.profit||0)}
          </div>
          ${shortDesc?`<div class="small" style="margin-top:6px;max-width:600px;">Desc: ${shortDesc}${(it.desc||"").length>180?'…':''}</div>`:""}
        </div>
      </div>
    `;
  }

  function genDesc(it){
    const parts=[];
    if (it.brand) parts.push(it.brand);
    if (it.title && it.title.toLowerCase()!==(it.brand||"").toLowerCase()) parts.push(it.title);
    if (it.retail) parts.push(`Approx. retail: $${money(it.retail)}.`);
    parts.push("Condition not verified. See photos for details.");
    return parts.join(" ");
  }

  // ------- Scanner / manual add -------
  let scanBusy=false;
  async function addUPC(upc){
    upc = String(upc||"").replace(/\D/g,"");
    if (upc.length===13 && upc.startsWith("0")) upc = upc.slice(1);
    if (!(upc.length===12 || upc.length===13)){ toast("Code too short — rescan"); return; }
    if (scanBusy) return;
    if (isRecentlyScanned(upc)){ toast("Already captured"); return; }
    scanBusy=true;

    let asin="", title="", brand="", retail=0, amazonUrl="", desc="", packQty=1;

    if (retailCache[upc]>0){
      retail = Number(retailCache[upc]);
    } else {
      try{
        const r = await fetch(`/api/lookup?upc=${encodeURIComponent(upc)}`);
        const j = await r.json();
        if (j.ok){
          asin = j.asin||""; title=j.title||""; brand=j.brand||"";
          retail = Number(j.retail||0); amazonUrl=j.amazon_url||""; desc=j.description||"";
          packQty = detectPackQty(title);
          if (packQty>1 && retail>0) retail = retail/packQty;
          if (retail>0){ retailCache[upc]=retail; saveRetailCache(); }
        }
      }catch{}
    }
    if (!desc) desc = genDesc({brand,title,retail});

    const calc = computePrices(retail, cpiForLiveAdd());

    const item = {
      upc, asin, title, brand,
      retail, packQty: packQty||1,
      desc,
      startPrice: calc.startPrice,
      startPctComputed: calc.startPctComputed,
      binPrice: calc.binPrice,
      goalSale: calc.goalSale,
      buyerFee: calc.buyerFee,
      profit: calc.profit,
      qty:1, userImg:"", amazonUrl
    };

    state.items.unshift(item);
    save(); setLast(item); repaint();
    toast("✅ Item captured!"); markScanned(upc);
    setTimeout(()=>{ scanBusy=false; }, 900);
  }

  // Quagga camera (unchanged except close-focus hints)
  let running=false, handlerRef=null;
  function attachHandler(){
    if (!window.Quagga) return;
    if (handlerRef){ try{ window.Quagga.offDetected(handlerRef); }catch{} handlerRef=null; }
    handlerRef=(res)=>{
      const raw = res?.codeResult?.code || "";
      if (!raw) return;
      const code = raw.replace(/\D/g,"");
      if (!(code.length===12 || code.length===13)) return;
      if (isRecentlyScanned(code)) return;
      addUPC(code);
    };
    window.Quagga.onDetected(handlerRef);
  }
  function startCamera(){
    if (location.protocol!=='https:' && location.hostname!=='localhost'){
      alert("Camera requires HTTPS."); return;
    }
    if (running) return;
    if (!window.Quagga){ alert("Scanner library not loaded."); return; }

    const constraints={
      facingMode:{ ideal:"environment" }, width:{ ideal:1280 }, height:{ ideal:720 },
      advanced:[ {focusMode:"continuous"}, {focusMode:"near"}, {focusDistance:0}, {zoom:2} ]
    };
    const cfg={
      inputStream:{ type:"LiveStream", target:el.live, constraints },
      decoder:{ readers:["ean_reader","upc_reader","upc_e_reader","code_128_reader","ean_8_reader"] },
      locate:true, numOfWorkers: navigator.hardwareConcurrency||2, locator:{ halfSample:false, patchSize:"medium" }
    };
    window.Quagga.init(cfg, async (err)=>{
      if (err){ console.error(err); alert("Camera init failed."); return; }
      attachHandler(); window.Quagga.start(); running=true;
      const v = el.live.querySelector("video");
      if (v){ v.setAttribute("playsinline","true"); v.style.width="100%"; }
      try{
        const track=v?.srcObject?.getVideoTracks?.()[0]; const caps=track?.getCapabilities?.();
        const apply=async(o)=>{ try{ await track.applyConstraints(o); }catch{} };
        if (track && caps){
          if (caps.focusMode?.includes("continuous")) await apply({advanced:[{focusMode:"continuous"}]});
          else if (caps.focusMode?.includes("near")) await apply({advanced:[{focusMode:"near"}]});
          if (typeof caps.focusDistance==="object") await apply({advanced:[{focusDistance:caps.focusDistance.min}]});
          if (typeof caps.zoom==="object") await apply({advanced:[{zoom: Math.min(2, caps.zoom.max||2)}]});
        }
      }catch{}
    });
  }
  function stopCamera(){ if(!running||!window.Quagga) return; try{ handlerRef&&window.Quagga.offDetected(handlerRef);}catch{} window.Quagga.stop(); running=false; handlerRef=null; }
  function snapPhoto(){
    const video = el.live?.querySelector("video"); if(!video){ alert("Start camera first."); return; }
    const cv = el.snapCanvas; if (!cv) return;
    const w=video.videoWidth||640, h=video.videoHeight||480;
    cv.width=w; cv.height=h; const ctx=cv.getContext("2d"); ctx.drawImage(video,0,0,w,h);
    const dataUrl=cv.toDataURL("image/jpeg",0.85);
    if (state.items[0]){ state.items[0].userImg=dataUrl; save(); repaint(); }
    else alert("Scan an item first, then snap.");
  }

  // ------- Manifest import -------
  const H = {
    upc: ["upc","upc code","upc_code","upc/ean","barcode","ean","gtin","scan lp #","sb #"],
    title: ["product title","item title","title","item name","name","item description","product description","description"],
    brand: ["brand","brand name","manufacturer","mfr","vendor"],
    qty: ["qty","quantity","units","unit qty","unit quantity","count"],
    retail: ["unit retail","unit msrp","msrp","retail","retail price","suggested retail","list price","ext. retail"],
    sku: ["sku","item number","model #","model","mpn"]
  };
  const norm = (s) => String(s||"").trim().toLowerCase().replace(/\uFEFF/g,"").replace(/[^a-z0-9]+/g," ");
  function findHeader(map, headerRow){
    const idx={}; const lower=headerRow.map(h=>norm(h));
    for(const key in map){ for(const cand of map[key]){ const j=lower.indexOf(norm(cand)); if(j!==-1){ idx[key]=j; break; } } }
    return idx;
  }
  function parseCSV(text){
    text=String(text||"");
    const first = text.split(/\r?\n/)[0]||"";
    const delim = ((first.match(/;/g)||[]).length > (first.match(/,/g)||[]).length) ? ";" : ",";
    const rows=[]; let i=0, field="", row=[], inQ=false;
    while(i<text.length){
      const c=text[i];
      if(inQ){
        if(c===`"`){ if(text[i+1]==='"'){ field+='"'; i+=2; continue; } inQ=false; i++; continue; }
        field+=c; i++; continue;
      } else {
        if(c===`"`){ inQ=true; i++; continue; }
        if(c===delim){ row.push(field); field=""; i++; continue; }
        if(c===`\r`){ i++; continue; }
        if(c===`\n`){ row.push(field); rows.push(row); row=[]; field=""; i++; continue; }
        field+=c; i++; continue;
      }
    }
    row.push(field); rows.push(row);
    while(rows.length && rows[rows.length-1].every(x=>x==="")) rows.pop();
    return rows;
  }

  function buildItemFromRow(row, idx){
    const get=(k)=> (idx[k]!==undefined ? row[idx[k]] : "");
    // UPC or numeric SKU fallback
    let upc = String(get("upc")||"").replace(/\D/g,"");
    if(!upc){
      const skuRaw = String(get("sku")||"");
      const digits = skuRaw.replace(/\D/g,"");
      if(digits.length>=8 && digits.length<=14) upc = digits;
    }
    if(upc.length===13 && upc.startsWith("0")) upc = upc.slice(1);

    const title = String(get("title")||"").trim();
    const brand = String(get("brand")||"").trim();
    const qty   = Math.max(1, parseInt(get("qty")||"1",10)||1);

    let retail = toFloat(get("retail"));
    const packQty = detectPackQty(title);
    if (packQty>1 && retail>0) retail = retail/packQty;

    return { upc, title, brand, qty, retail, packQty: Math.max(1, packQty) };
  }

  async function importManifestFile(file){
    if(!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if(!rows.length){ alert("CSV is empty"); return; }

    const header = rows[0];
    const idx = findHeader(H, header);
    const hasTitle = idx.title !== undefined;
    const hasUPC   = idx.upc   !== undefined;
    const hasSKU   = idx.sku   !== undefined;
    if(!hasTitle || (!hasUPC && !hasSKU)){
      alert("Missing required columns (need at least Title, and UPC or numeric SKU).\n\nHeaders I see:\n• " + header.map(h=>`"${h}"`).join("\n• "));
      return;
    }

    // First pass: parse rows -> plain items (no pricing), total quantity
    const parsed=[];
    let batchQtyTotal=0;
    for(let r=1;r<rows.length;r++){
      const row=rows[r];
      if(!row || row.every(x=>String(x??"")==="")) continue;
      const base = buildItemFromRow(row, idx);
      if (!base.title && !base.upc) continue;
      parsed.push(base);
      batchQtyTotal += base.qty||1;
    }
    if(!parsed.length){ toast("No valid rows found."); return; }

    // Compute one CPI for the whole batch and apply to every row
    const batchCPI = cpiForBatch(batchQtyTotal);

    for(const base of parsed){
      const calc = computePrices(base.retail, batchCPI);
      const desc = genDesc({brand:base.brand, title:base.title, retail:base.retail});
      const item = {
        upc: base.upc, asin:"", title: base.title, brand: base.brand,
        retail: base.retail, packQty: base.packQty,
        desc,
        startPrice: calc.startPrice,
        startPctComputed: calc.startPctComputed,
        binPrice: calc.binPrice,
        goalSale: calc.goalSale,
        buyerFee: calc.buyerFee,
        profit: calc.profit,
        qty: base.qty, userImg:"", amazonUrl:""
      };
      if (item.upc && item.retail>0){ retailCache[item.upc]=item.retail; }
      state.items.unshift(item);
    }
    saveRetailCache(); save(); repaint();
    toast(`📥 Imported ${batchQtyTotal} unit(s) from ${parsed.length} row(s)`);
  }

  // ------- Qty & Retail controls -------
  on(document, "click", (e)=>{
    const btn = e.target.closest(".qbtn"); if(!btn) return;
    const idx = Number(btn.dataset.i); const it = state.items[idx]; if(!it) return;

    if (btn.dataset.act==="set-retail"){
      const val = prompt("Enter retail price (per unit) for this item:", it.retail||"");
      const r = Number(val);
      if (isFinite(r) && r>=0){
        it.retail = r;
        if (it.upc){ retailCache[it.upc]=r; saveRetailCache(); }
        const calc = computePrices(it.retail, cpiForLiveAdd());
        Object.assign(it, {
          startPrice: calc.startPrice,
          startPctComputed: calc.startPctComputed,
          binPrice: calc.binPrice,
          goalSale: calc.goalSale,
          buyerFee: calc.buyerFee,
          profit: calc.profit
        });
        save(); repaint(); toast("Retail updated");
      }
      return;
    }

    const delta = Number(btn.dataset.delta||0);
    if (delta){
      it.qty = Math.max(1, (Number(it.qty)||1)+delta);
      save(); repaint();
    }
  });

  on(document, "change", (e)=>{
    const inp = e.target.closest(".qtyinp"); if(!inp) return;
    const idx = Number(inp.dataset.i); const it=state.items[idx]; if(!it) return;
    it.qty = Math.max(1, Math.floor(Number(inp.value)||1));
    save(); repaint();
  });

  // ------- Export Woo CSV -------
  function exportWooCsv(){
    const headers = [
      "Name","SKU","Regular price","Sale price","Categories","Brands","Tags",
      "Short description","Description","Images","Stock","In stock?","Catalog visibility","Status"
    ];
    const rows=[headers];
    state.items.forEach((it,i)=>{
      rows.push([
        it.title || `Item ${i+1}`,
        it.upc || "",
        it.binPrice ? it.binPrice.toFixed(2) : "",
        "",
        "",
        it.brand || "",
        "",
        "",
        it.desc || "",
        "",
        String(Math.max(1, Number(it.qty)||1)),
        "1","visible","publish"
      ]);
    });
    const csv = rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`sirscansalot_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ------- Session + buttons -------
  function bind(){
    on(el.saveSession,"click",()=>{
      state.truckCost  = Number(el.truckCost?.value || 0);
      state.palletCost = Number(el.palletCost?.value || 0);
      state.palletLabel= String(el.palletLabel?.value || "");
      state.targetItems= Number(el.targetItems?.value || 0);

      let pct = Number(el.startPct?.value || 0);
      if (pct>1) pct=pct/100;
      state.startPct = isFinite(pct)? Math.max(0,pct) : 0;

      state.startMode = el.startMode ? (el.startMode.value||"pct") : "pct";
      save(); repaint();
    });

    on(el.newPallet,"click",()=>{
      if(!confirm("Start a NEW pallet? This clears current pallet items.")) return;
      state.palletLabel = prompt("Pallet ID/Label:", "") || "";
      state.palletCost  = Number(prompt("Pallet Cost ($):", "") || 0);
      state.targetItems = Number(prompt("Target items on pallet (optional):", "") || 0);
      const p = prompt("Start % of Retail (leave blank/0 for AUTO CPI):", "");
      if (p!==null && p!==""){ let x=Number(p); if(x>1) x=x/100; state.startPct=isFinite(x)?Math.max(0,x):0; } else state.startPct=0;
      state.items=[]; save(); repaint();
      if (el.startPct)  el.startPct.value  = state.startPct ? Math.round(state.startPct*100) : "";
      if (el.startMode) el.startMode.value = state.startMode || "pct";
    });

    on(el.startCam,"click",startCamera);
    on(el.stopCam,"click",stopCamera);
    on(el.snapBtn,"click",snapPhoto);

    on(el.addManual,"click",()=>{ addUPC(el.upcInput?.value); if (el.upcInput){ el.upcInput.value=""; el.upcInput.focus(); } });
    on(el.upcInput,"keydown",(e)=>{ if(e.key==="Enter"){ addUPC(el.upcInput.value); el.upcInput.value=""; } });

    on(el.exportCsv,"click",exportWooCsv);
    on(el.clearPallet,"click",()=>{ if(confirm("Clear all items for this pallet?")){ state.items=[]; save(); repaint(); } });

    on(el.manifestBtn,"click",()=> el.manifestFile && el.manifestFile.click());
    on(el.manifestFile,"change",(e)=>{ const f=e.target.files?.[0]; if(!f) return; importManifestFile(f); e.target.value=""; });
  }

  document.addEventListener("DOMContentLoaded",()=>{
    load();
    if (el.truckCost)   el.truckCost.value   = state.truckCost || "";
    if (el.palletCost)  el.palletCost.value  = state.palletCost || "";
    if (el.palletLabel) el.palletLabel.value = state.palletLabel || "";
    if (el.targetItems) el.targetItems.value = state.targetItems || "";
    if (el.startPct)    el.startPct.value    = state.startPct ? Math.round(state.startPct*100) : "";
    if (el.startMode)   el.startMode.value   = state.startMode || "pct";
    repaint(); bind();

    if (typeof window.Quagga === "undefined"){
      console.warn("Quagga not loaded; scanner disabled. Manual entry still works.");
    }
  });
})();