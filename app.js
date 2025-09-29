// ===== Sir Scansalot — Qty per item, Start Mode switch, Profit calc, Free-only lookup, Description to CSV =====
(() => {
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const money = (n) => (Number(n) || 0).toFixed(2);

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
  };

  // --- Toast helper ---
  function toast(msg) {
    const host = el.toastHost || document.body;
    const div = document.createElement("div");
    div.className = "toast-bubble";
    div.textContent = msg;
    host.appendChild(div);
    setTimeout(() => div.remove(), 1400);
    try { navigator.vibrate && navigator.vibrate(40); } catch {}
  }

  // --- Recent-scan de-dupe ---
  const recently = new Map(); // upc -> expiresAt
  const DEDUPE_MS = 3000;
  function isRecentlyScanned(upc) {
    const now = Date.now();
    for (const [k, t] of recently) if (t <= now) recently.delete(k);
    const t = recently.get(upc);
    return t && t > now;
  }
  function markScanned(upc) {
    recently.set(upc, Date.now() + DEDUPE_MS);
  }

  const SKEY = "bb_pallet_v6";
  const state = {
    truckCost: 0,
    palletCost: 0,
    palletLabel: "",
    targetItems: 0,
    startPct: 0,        // 0.23 => 23%
    startMode: "pct",   // 'pct' or 'dollar'
    items: []           // { upc, asin, title, brand, retail, desc, startPrice, binPrice, goalSale, buyerFee, profit, qty, userImg, amazonUrl }
  };

  function load(){ try{ Object.assign(state, JSON.parse(localStorage.getItem(SKEY) || "{}")); }catch{} }
  function save(){ localStorage.setItem(SKEY, JSON.stringify(state)); }

  const totalUnits = () => state.items.reduce((s, it) => s + (Number(it.qty)||0), 0);
  const cpi = () => (state.palletCost ? state.palletCost / (totalUnits() || state.targetItems || 1) : 0);

  function repaint(){
    if (el.palletId) el.palletId.textContent = state.palletLabel || "—";
    if (el.count) el.count.textContent = totalUnits();
    if (el.cpi) el.cpi.textContent = money(cpi());
    if (el.startPctView) el.startPctView.textContent = `${Math.round((state.startPct||0)*100)}%`;
    if (el.retailLast) el.retailLast.textContent = state.items[0] ? money(state.items[0].retail || 0) : "0.00";
    if (el.binLast) el.binLast.textContent = state.items[0] ? money(state.items[0].binPrice || 0) : "0.00";

    if (el.tbody){
      el.tbody.innerHTML = "";
      state.items.forEach((it,i)=>{
        const tr = document.createElement("tr");
        if ((it.profit||0) > 0) tr.classList.add("profit-positive");
        if ((it.profit||0) < 0) tr.classList.add("profit-negative");
        const img = it.userImg || "";
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${it.upc || ""}</td>
          <td>${it.title || ""}</td>
          <td>${it.brand || ""}</td>
          <td>$${money(it.retail || 0)}</td>
          <td>$${money(it.startPrice || 0)}</td>
          <td>$${money(it.binPrice || 0)}</td>
          <td>$${money(it.goalSale || 0)}</td>
          <td>$${money(it.buyerFee || 0)}</td>
          <td>$${money(it.profit || 0)}</td>
          <td>
            <div class="qtywrap">
              <button class="qbtn" data-i="${i}" data-delta="-1">−</button>
              <input class="qtyinp" data-i="${i}" type="number" min="1" value="${it.qty || 1}">
              <button class="qbtn" data-i="${i}" data-delta="1">+</button>
            </div>
          </td>
          <td>${img ? `<img class="thumb" src="${img}" />` : ""}</td>
        `;
        el.tbody.appendChild(tr);
      });
    }
  }

  function setLast(it){
    if (!el.lastItem) return;
    const asinLine = it.asin ? ` • ASIN: ${it.asin}` : "";
    const img = it.userImg || "";
    const shortDesc = (it.desc || "").slice(0, 180);
    el.lastItem.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        ${img ? `<img class="thumb" src="${img}" />` : ""}
        <div>
          <strong>${it.title || "Item"}</strong>
          <div class="small">UPC: ${it.upc || ""}${asinLine} • Brand: ${it.brand || ""} • Qty: ${it.qty || 1}</div>
          <div class="small">
            Retail $${money(it.retail||0)} • Start (${state.startMode === "dollar" ? "$1 flat" : (Math.round((state.startPct||0)*100)+'%')}) $${money(it.startPrice||0)}
            • BIN 80% $${money(it.binPrice||0)}
          </div>
          <div class="small">
            Goal Sale (38%) $${money(it.goalSale||0)} • Buyer Fee (12%) $${money(it.buyerFee||0)}
            • <b>Profit</b> $${money(it.profit||0)}
          </div>
          ${shortDesc ? `<div class="small" style="margin-top:6px;max-width:600px;">Desc: ${shortDesc}${it.desc.length>180?'…':''}</div>` : ""}
        </div>
      </div>
    `;
  }

  // Generate a friendly fallback description on the client if server had none
  function genDesc(it){
    const parts = [];
    if (it.brand) parts.push(it.brand);
    if (it.title && it.title.toLowerCase() !== (it.brand||"").toLowerCase()) parts.push(it.title);
    if (it.retail) parts.push(`Approx. retail: $${money(it.retail)}.`);
    parts.push("Condition not verified. See photos for details.");
    return parts.join(" ");
  }

  // Add item
  let scanBusy = false;

  async function addUPC(upc){
    upc = String(upc||"").replace(/\D/g,"");
    if (!upc || scanBusy) return;
    if (isRecentlyScanned(upc)) { toast("Already captured"); return; }
    scanBusy = true;

    let asin="", title="", brand="", retail=0, amazonUrl="", desc="";
    try{
      const r = await fetch(`/api/lookup?upc=${encodeURIComponent(upc)}`);
      const j = await r.json();
      if (j.ok){
        asin = j.asin || "";
        title = j.title || "";
        brand = j.brand || "";
        retail = Number(j.retail || 0);
        amazonUrl = j.amazon_url || "";
        desc = j.description || "";
      }
    }catch{}

    if (!desc) {
      // create a helpful fallback so CSV always has something
      desc = genDesc({ brand, title, retail });
    }

    // Start / BIN / Goal / Fee / Profit
    let startPrice = 0;
    if (state.startMode === "dollar") startPrice = 1;
    else startPrice = retail ? (retail * (state.startPct || 0)) : 0;

    const binPrice = retail ? (retail * 0.80) : 0;
    const goalSale = retail ? (retail * 0.38) : 0;
    const buyerFee = goalSale * 0.12;
    const profit   = (goalSale + buyerFee) - startPrice;

    const item = {
      upc, asin, title, brand, retail,
      desc,
      startPrice, binPrice, goalSale, buyerFee, profit,
      qty: 1, userImg: "", amazonUrl
    };
    state.items.unshift(item);
    save();
    setLast(item);
    repaint();

    toast("✅ Item captured!");
    markScanned(upc);
    setTimeout(()=>{ scanBusy = false; }, 900);
  }

  // Camera
  let running=false, handlerRef=null;
  function attachHandler(){
    if (!window.Quagga) return;
    if (handlerRef){ try{ window.Quagga.offDetected(handlerRef); }catch{} handlerRef=null; }
    let last="";
    handlerRef=(res)=>{
      const code = res?.codeResult?.code || "";
      if (!code || code === last) return;
      if (isRecentlyScanned(code)) return;
      last = code;
      addUPC(code);
      setTimeout(()=>{ last = ""; }, 800);
    };
    window.Quagga.onDetected(handlerRef);
  }
  function startCamera(){
    if (running) return;
    if (!window.Quagga){ alert("Scanner library not loaded. Check internet."); return; }
    const cfg = {
      inputStream:{ type:"LiveStream", target: el.live, constraints:{ facingMode:"environment" }},
      decoder:{ readers:["ean_reader","upc_reader","upc_e_reader","code_128_reader","ean_8_reader"] },
      locate:true, numOfWorkers: navigator.hardwareConcurrency || 2
    };
    window.Quagga.init(cfg,(err)=>{
      if (err){ console.error(err); alert("Camera init failed. Allow camera & HTTPS."); return; }
      attachHandler(); window.Quagga.start(); running=true;
    });
  }
  function stopCamera(){
    if (!running || !window.Quagga) return;
    try{ if (handlerRef) window.Quagga.offDetected(handlerRef); }catch{}
    window.Quagga.stop(); running=false; handlerRef=null;
  }

  // Snapshot attaches ONLY your photo to the latest item
  function snapPhoto(){
    const video = el.live && el.live.querySelector("video");
    if (!video){ alert("Start camera first."); return; }
    const cv = el.snapCanvas; if (!cv) return;
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = cv.toDataURL("image/jpeg", 0.85);
    if (state.items[0]){ state.items[0].userImg = dataUrl; save(); repaint(); }
    else { alert("Scan an item first, then snap."); }
  }

  // Qty handlers
  on(el.tbody, "click", (e) => {
    const btn = e.target.closest(".qbtn");
    if (!btn) return;
    const idx = Number(btn.dataset.i);
    const delta = Number(btn.dataset.delta || 0);
    const it = state.items[idx];
    if (!it) return;
    const next = Math.max(1, (Number(it.qty)||1) + delta);
    it.qty = next;
    save(); repaint();
  });

  on(el.tbody, "change", (e) => {
    const inp = e.target.closest(".qtyinp");
    if (!inp) return;
    const idx = Number(inp.dataset.i);
    const it = state.items[idx];
    if (!it) return;
    let v = Math.max(1, Math.floor(Number(inp.value)||1));
    it.qty = v;
    save(); repaint();
  });

  // Export: WooCommerce CSV — put description into the Description column
  function exportWooCsv(){
    const headers = [
      "Name","SKU","Regular price","Sale price","Categories","Brands","Tags",
      "Short description","Description","Images","Stock","In stock?","Catalog visibility","Status"
    ];
    const rows = [headers];

    state.items.forEach((it,i)=>{
      const images = ""; // leave blank for Woo CSV
      const description = it.desc || ""; // pulled or generated
      rows.push([
        it.title || `Item ${i+1}`,                // Name
        it.upc || "",                              // SKU
        it.binPrice ? it.binPrice.toFixed(2) : "", // Regular price = BIN (80% retail)
        "", "",                                    // Sale price, Categories
        it.brand || "",                            // Brands
        "", "",                                    // Tags, Short description
        description,                               // Description -> Woo long description
        images,                                    // Images
        String(Math.max(1, Number(it.qty)||1)),   // Stock = qty
        "1","visible","publish"
      ]);
    });

    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sirscansalot_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function bind(){
    on(el.saveSession,"click",()=>{
      state.truckCost = Number(el.truckCost?.value || 0);
      state.palletCost = Number(el.palletCost?.value || 0);
      state.palletLabel = String(el.palletLabel?.value || "");
      state.targetItems = Number(el.targetItems?.value || 0);

      let pct = Number(el.startPct?.value || 0);
      if (pct > 1) pct = pct / 100;
      state.startPct = isFinite(pct) ? Math.max(0, pct) : 0;

      state.startMode = el.startMode ? (el.startMode.value || "pct") : "pct";

      save(); repaint();
    });

    on(el.newPallet,"click",()=>{
      if (!confirm("Start a NEW pallet? This clears current pallet items.")) return;
      state.palletLabel = prompt("Pallet ID/Label:", "") || "";
      state.palletCost = Number(prompt("Pallet Cost ($):", "") || 0);
      state.targetItems = Number(prompt("Target items on pallet (optional):", "") || 0);
      const p = prompt("Start % of Retail (e.g., 23 for 23%):", "");
      if (p !== null){
        let x = Number(p); if (x > 1) x = x/100;
        state.startPct = isFinite(x) ? Math.max(0, x) : 0;
      }
      state.items = [];
      save(); repaint();

      if (el.startPct)  el.startPct.value  = state.startPct ? Math.round(state.startPct*100) : "";
      if (el.startMode) el.startMode.value = state.startMode || "pct";
    });

    on(el.startCam,"click",startCamera);
    on(el.stopCam,"click",stopCamera);
    on(el.snapBtn,"click",snapPhoto);

    on(el.addManual,"click",()=>{
      addUPC(el.upcInput && el.upcInput.value);
      if (el.upcInput){ el.upcInput.value=""; el.upcInput.focus(); }
    });
    on(el.upcInput,"keydown",(e)=>{
      if (e.key === "Enter"){ addUPC(el.upcInput.value); el.upcInput.value=""; }
    });

    on(el.exportCsv,"click",exportWooCsv);
    on(el.clearPallet,"click",()=>{
      if (confirm("Clear all items for this pallet?")){ state.items = []; save(); repaint(); }
    });
  }

  document.addEventListener("DOMContentLoaded",()=>{
    load();
    if (el.palletId) el.palletId.textContent = state.palletLabel || "—";
    if (el.truckCost)   el.truckCost.value   = state.truckCost || "";
    if (el.palletCost)  el.palletCost.value  = state.palletCost || "";
    if (el.palletLabel) el.palletLabel.value = state.palletLabel || "";
    if (el.targetItems) el.targetItems.value = state.targetItems || "";
    if (el.startPct)    el.startPct.value    = state.startPct ? Math.round(state.startPct*100) : "";
    if (el.startMode)   el.startMode.value   = state.startMode || "pct";
    repaint();
    bind();

    if (typeof window.Quagga === "undefined"){
      console.warn("Quagga not loaded; scanner disabled. Manual entry still works.");
    }
  });
})();