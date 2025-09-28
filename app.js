(function () {
  // ---- helpers ----
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // ---- elements ----
  const els = {
    startCam: $("startCam"),
    stopCam: $("stopCam"),
    snapBtn: $("snapBtn"),
    upcInput: $("upcInput"),
    addManual: $("addManual"),
    live: $("live"),
    snapCanvas: $("snapCanvas"),
    palletCost: $("palletCost"),
    targetItems: $("targetItems"),
    saveSession: $("saveSession"),
    palletId: $("palletId"),
    count: $("count"),
    cpi: $("cpi"),
    retailLast: $("retailLast"),
    binLast: $("binLast"),
    tbody: $("tbody"),
    lastItem: $("lastItem"),
    exportCsv: $("exportCsv"),
    clearPallet: $("clearPallet"),
  };

  // ---- status banner to surface errors ----
  let statusBar = document.getElementById("statusBar");
  if (!statusBar) {
    statusBar = document.createElement("div");
    statusBar.id = "statusBar";
    statusBar.style.cssText =
      "position:sticky;top:0;z-index:9999;background:#2b3442;color:#fff;padding:6px 10px;font-size:12px;display:none;";
    document.body.prepend(statusBar);
  }
  const showStatus = (msg) => { statusBar.textContent = msg; statusBar.style.display = "block"; };
  const hideStatus = () => { statusBar.style.display = "none"; };

  // ---- persistent state ----
  const SKEY = "bb_pallet_v1";
  const state = { truckCost: 0, palletCost: 0, palletLabel: "", targetItems: 0, items: [] };

  const money = (n) => (Number(n) || 0).toFixed(2);
  const costPerItem = () => {
    const n = state.items.length || state.targetItems || 1;
    return state.palletCost ? state.palletCost / n : 0;
  };

  function load() {
    try { Object.assign(state, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch {}
  }
  function save() { localStorage.setItem(SKEY, JSON.stringify(state)); }

  function repaint() {
    if (els.palletId) els.palletId.textContent = state.palletLabel || "—";
    if (els.count) els.count.textContent = state.items.length;
    if (els.cpi) els.cpi.textContent = money(costPerItem());
    if (els.retailLast) els.retailLast.textContent = state.items[0] ? money(state.items[0].retail || 0) : "0.00";
    if (els.binLast) els.binLast.textContent = state.items[0] ? money(state.items[0].binPrice || 0) : "0.00";
    if (els.tbody) {
      els.tbody.innerHTML = "";
      state.items.forEach((it, i) => {
        const tr = document.createElement("tr");
        const img = it.stockImg || it.userImg || "";
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${it.upc || ""}</td>
          <td>${it.title || ""}</td>
          <td>${it.brand || ""}</td>
          <td>$${money(it.retail || 0)}</td>
          <td>$${money(it.startPrice || 0)}</td>
          <td>$${money(it.binPrice || 0)}</td>
          <td>${img ? `<img class="thumb" src="${img}">` : ""}</td>
        `;
        els.tbody.appendChild(tr);
      });
    }
  }
  function setLast(it) {
    if (!els.lastItem) return;
    els.lastItem.innerHTML =
      `<strong>${it.title || "Item"}</strong> ` +
      `<span style="color:#9aa4b2">UPC: ${it.upc || ""} • Brand: ${it.brand || ""}</span> ` +
      `<div style="color:#9aa4b2;font-size:12px">Retail $${money(it.retail || 0)} • ` +
      `Start (CPI) $${money(it.startPrice || 0)} • BIN $${money(it.binPrice || 0)}</div>`;
  }

  async function addUPC(upc) {
    upc = String(upc || "").replace(/\D/g, "");
    if (!upc) return;

    // compute CPI now (private)
    const cpi = costPerItem();

    // optional lookup
    let title = "", brand = "", retail = 0, stockImg = "";
    try {
      const r = await fetch(`/api/lookup?upc=${encodeURIComponent(upc)}`);
      const j = await r.json();
      if (j.ok) {
        title = j.title || "";
        brand = j.brand || "";
        stockImg = j.image || "";
        retail = Number(j.retail || 0);
      }
    } catch (e) {
      console.warn("lookup failed", e);
    }

    if (!title) title = prompt("Name/Title:", "") || "";
    if (!brand) brand = prompt("Brand (optional):", "") || "";
    if (!retail) retail = Number(prompt("Retail Price ($):", "") || 0);

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

    // fun cheer sound (if file present)
    try { new Audio("./cheer.mp3").play().catch(()=>{}); } catch {}
  }

  // ---- camera (Quagga) ----
  let running = false;
  function startCamera() {
    if (running) return;
    if (!window.Quagga) {
      showStatus("Scanner library failed to load. Check internet or CDN.");
      return;
    }
    hideStatus();
    const cfg = {
      inputStream: { type: "LiveStream", target: els.live, constraints: { facingMode: "environment" } },
      decoder: { readers: ["ean_reader","upc_reader","upc_e_reader","code_128_reader","ean_8_reader"] },
      locate: true,
      numOfWorkers: navigator.hardwareConcurrency || 2
    };
    window.Quagga.init(cfg, (err) => {
      if (err) { console.error(err); showStatus("Camera init failed. Allow camera & use HTTPS."); return; }
      window.Quagga.start(); running = true;
    });
    let last = "";
    window.Quagga.onDetected((res) => {
      const code = res?.codeResult?.code || "";
      if (!code || code === last) return;
      last = code;
      addUPC(code);
      setTimeout(() => { last = ""; }, 700);
    });
  }
  function stopCamera() {
    if (!running || !window.Quagga) return;
    window.Quagga.stop(); running = false;
  }
  function snapPhoto() {
    const video = els.live && els.live.querySelector("video");
    if (!video) { showStatus("Start camera first, then snap."); return; }
    const cv = els.snapCanvas; if (!cv) return;
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"); ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = cv.toDataURL("image/jpeg", 0.85);
    if (state.items[0]) { state.items[0].userImg = dataUrl; save(); repaint(); }
  }

  // ---- events ----
  function bindEvents() {
    on(els.saveSession, "click", () => {
      state.palletCost = Number(els.palletCost?.value || 0);
      state.targetItems = Number(els.targetItems?.value || 0);
      save(); repaint();
    });
    on(els.startCam, "click", startCamera);
    on(els.stopCam, "click", stopCamera);
    on(els.snapBtn, "click", snapPhoto);
    on(els.addManual, "click", () => {
      const v = els.upcInput && els.upcInput.value;
      addUPC(v);
      if (els.upcInput) { els.upcInput.value = ""; els.upcInput.focus(); }
    });
    // Enter to add UPC
    on(els.upcInput, "keydown", (e) => {
      if (e.key === "Enter") { addUPC(els.upcInput.value); els.upcInput.value = ""; }
    });
    // Export CSV (Woo)
    on(els.exportCsv, "click", () => {
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
          (it.binPrice ? it.binPrice.toFixed(2) : ""),
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
    });
    // Clear pallet
    on(els.clearPallet, "click", () => {
      if (confirm("Clear all items for this pallet?")) { state.items = []; save(); repaint(); }
    });
  }

  // ---- boot after DOM ready ----
  document.addEventListener("DOMContentLoaded", () => {
    load();
    // if you show inputs for pallet cost/target, prefill:
    if (els.palletCost) els.palletCost.value = state.palletCost || "";
    if (els.targetItems) els.targetItems.value = state.targetItems || "";
    repaint();
    bindEvents();

    // Detect missing Quagga library
    if (typeof window.Quagga === "undefined") {
      showStatus("Scanner library not loaded (network/CDN). Manual entry still works.");
    }
  });
})();