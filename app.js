// ======= Sir Scansalot — stable scanner with prompt lock & single handler =======
(() => {
  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const money = (n) => (Number(n) || 0).toFixed(2);

  // ---------- elements ----------
  const el = {
    truckCost: $("truckCost"),
    palletCost: $("palletCost"),
    palletLabel: $("palletLabel"),
    targetItems: $("targetItems"),
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
  };

  // ---------- state ----------
  const SKEY = "bb_pallet_v1";
  const state = {
    truckCost: 0,
    palletCost: 0,
    palletLabel: "",
    targetItems: 0,
    items: [] // { upc, title, brand, retail, startPrice, binPrice, stockImg, userImg }
  };

  function load() { try { Object.assign(state, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch {} }
  function save() { localStorage.setItem(SKEY, JSON.stringify(state)); }

  function costPerItem() {
    const n = state.items.length || state.targetItems || 1;
    return state.palletCost ? state.palletCost / n : 0;
  }

  function repaint() {
    if (el.palletId) el.palletId.textContent = state.palletLabel || "—";
    if (el.count) el.count.textContent = state.items.length;
    if (el.cpi) el.cpi.textContent = money(costPerItem());
    if (el.retailLast) el.retailLast.textContent = state.items[0] ? money(state.items[0].retail || 0) : "0.00";
    if (el.binLast) el.binLast.textContent = state.items[0] ? money(state.items[0].binPrice || 0) : "0.00";

    if (el.tbody) {
      el.tbody.innerHTML = "";
      state.items.forEach((it, i) => {
        const img = it.stockImg || it.userImg || "";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${it.upc || ""}</td>
          <td>${it.title || ""}</td>
          <td>${it.brand || ""}</td>
          <td>$${money(it.retail || 0)}</td>
          <td>$${money(it.startPrice || 0)}</td>
          <td>$${money(it.binPrice || 0)}</td>
          <td>${img ? `<img class="thumb" src="${img}" />` : ""}</td>
        `;
        el.tbody.appendChild(tr);
      });
    }
  }

  function setLast(it) {
    if (!el.lastItem) return;
    el.lastItem.innerHTML = `
      <strong>${it.title || "Item"}</strong>
      <div class="small">UPC: ${it.upc || ""} • Brand: ${it.brand || ""}</div>
      <div class="small">Retail $${money(it.retail || 0)} • Start (CPI) $${money(it.startPrice || 0)} • BIN $${money(it.binPrice || 0)}</div>
    `;
  }

  // ---------- add item (with lock so prompts don't loop) ----------
  let scanBusy = false;     // guards against re-entry while prompts open / processing
  async function addUPC(upc) {
    upc = String(upc || "").replace(/\D/g, "");
    if (!upc || scanBusy) return;
    scanBusy = true;

    const cpi = costPerItem();
    let title = "", brand = "", retail = 0, stockImg = "";

    // Try API lookup first (optional)
    try {
      const r = await fetch(`/api/lookup?upc=${encodeURIComponent(upc)}`);
      const j = await r.json();
      if (j.ok) {
        title = j.title || "";
        brand = j.brand || "";
        stockImg = j.image || "";
        retail = Number(j.retail || 0);
      }
    } catch {}

    // Only prompt for missing bits — in a stable order
    if (!title) {
      const t = prompt("Name/Title:", "");
      if (t === null) { scanBusy = false; return; }
      title = t.trim();
    }
    if (!brand) {
      const b = prompt("Brand (optional):", "");
      if (b === null) { scanBusy = false; return; }
      brand = b.trim();
    }
    if (!retail) {
      const r = prompt("Retail Price ($):", "");
      if (r === null) { scanBusy = false; return; }
      retail = Number(r || 0);
    }

    const item = {
      upc, title, brand, retail,
      startPrice: cpi,
      binPrice: Math.max(0, retail * 0.8),
      stockImg, userImg: ""
    };
    state.items.unshift(item);
    save();
    setLast(item);
    repaint();

    // fun cheer if present
    try { new Audio("./cheer.mp3").play().catch(()=>{}); } catch {}

    // cool-down so Quagga burst frames don't re-trigger
    setTimeout(() => { scanBusy = false; }, 900);
  }

  // ---------- camera (single handler, debounced) ----------
  let running = false;
  let handlerRef = null;

  function attachHandler() {
    if (!window.Quagga) return;
    // Remove old handler if exists
    if (handlerRef) {
      try { window.Quagga.offDetected(handlerRef); } catch {}
      handlerRef = null;
    }
    let lastCode = "";
    handlerRef = (res) => {
      const code = res?.codeResult?.code || "";
      if (!code) return;
      if (code === lastCode) return;   // debounce duplicate frames
      lastCode = code;
      addUPC(code);
      // allow a new code after short pause
      setTimeout(() => { lastCode = ""; }, 800);
    };
    window.Quagga.onDetected(handlerRef);
  }

  function startCamera() {
    if (running) return;
    if (!window.Quagga) { alert("Scanner library not loaded. Check internet."); return; }
    const cfg = {
      inputStream: { type: "LiveStream", target: el.live, constraints: { facingMode: "environment" } },
      decoder: { readers: ["ean_reader","upc_reader","upc_e_reader","code_128_reader","ean_8_reader"] },
      locate: true,
      numOfWorkers: navigator.hardwareConcurrency || 2
    };
    window.Quagga.init(cfg, (err) => {
      if (err) { console.error(err); alert("Camera init failed. Allow camera permission & HTTPS."); return; }
      attachHandler();
      window.Quagga.start();
      running = true;
    });
  }

  function stopCamera() {
    if (!running || !window.Quagga) return;
    try {
      if (handlerRef) { window.Quagga.offDetected(handlerRef); handlerRef = null; }
      window.Quagga.stop();
    } catch {}
    running = false;
  }

  // Snapshot to attach to latest item
  function snapPhoto() {
    const video = el.live && el.live.querySelector("video");
    if (!video) { alert("Start camera first."); return; }
    const cv = el.snapCanvas; if (!cv) return;
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = cv.toDataURL("image/jpeg", 0.85);
    if (state.items[0]) { state.items[0].userImg = dataUrl; save(); repaint(); }
    else { alert("Scan an item first, then snap."); }
  }

  // ---------- exports ----------
  function exportWooCsv() {
    const headers = [
      "Name","SKU","Regular price","Sale price","Categories","Brands","Tags",
      "Short description","Description","Images","Stock","In stock?","Catalog visibility","Status"
    ];
    const rows = [headers];
    state.items.forEach((it, i) => {
      const imgs = [it.stockImg, it.userImg].filter(Boolean).join("|");
      rows.push([
        it.title || `Item ${i+1}`,
        it.upc || "",
        it.binPrice ? it.binPrice.toFixed(2) : "",
        "",
        "",
        it.brand || "",
        "",
        "",
        "",
        imgs,
        "1",
        "1",
        "visible",
        "publish"
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `bidbarn_woo_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ---------- events ----------
  function bind() {
    on(el.saveSession, "click", () => {
      state.truckCost = Number(el.truckCost?.value || 0);
      state.palletCost = Number(el.palletCost?.value || 0);
      state.palletLabel = String(el.palletLabel?.value || "");
      state.targetItems = Number(el.targetItems?.value || 0);
      save(); repaint();
    });

    on(el.newPallet, "click", () => {
      if (!confirm("Start a NEW pallet? This clears current pallet items.")) return;
      state.palletLabel = prompt("Pallet ID/Label:", "") || "";
      state.palletCost = Number(prompt("Pallet Cost ($):", "") || 0);
      state.targetItems = Number(prompt("Target items on pallet (optional):", "") || 0);
      state.items = [];
      save(); repaint();
    });

    on(el.startCam, "click", startCamera);
    on(el.stopCam, "click", stopCamera);
    on(el.snapBtn, "click", snapPhoto);

    on(el.addManual, "click", () => {
      addUPC(el.upcInput && el.upcInput.value);
      if (el.upcInput) { el.upcInput.value = ""; el.upcInput.focus(); }
    });
    on(el.upcInput, "keydown", (e) => {
      if (e.key === "Enter") {
        addUPC(el.upcInput.value);
        el.upcInput.value = "";
      }
    });

    on(el.exportCsv, "click", exportWooCsv);
    on(el.clearPallet, "click", () => {
      if (confirm("Clear all items for this pallet?")) { state.items = []; save(); repaint(); }
    });
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    load();
    if (el.truckCost) el.truckCost.value = state.truckCost || "";
    if (el.palletCost) el.palletCost.value = state.palletCost || "";
    if (el.palletLabel) el.palletLabel.value = state.palletLabel || "";
    if (el.targetItems) el.targetItems.value = state.targetItems || "";
    repaint();
    bind();

    // If Quagga failed to load (CDN down), manual entry still works.
    if (typeof window.Quagga === "undefined") {
      console.warn("Quagga not loaded; scanner disabled. Check network/CDN.");
    }
  });
})();