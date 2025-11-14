// Sir Scansalot 2.0 – Manifest → CPI → Photos → Bid Barn CSV
(() => {
  const $ = (id) => document.getElementById(id);
  const money = (n) => (Number(n) || 0).toFixed(2);

  // Element map
  const el = {
    truckCost: $("truckCost"),
    shippingCost: $("shippingCost"),
    otherFees: $("otherFees"),
    truckLabel: $("truckLabel"),

    btnSaveSession: $("btnSaveSession"),
    btnNewSession: $("btnNewSession"),

    statTotalItems: $("statTotalItems"),
    statTotalCost: $("statTotalCost"),
    statCPI: $("statCPI"),

    btnManifest: $("btnManifest"),
    manifestFile: $("manifestFile"),
    btnClearItems: $("btnClearItems"),

    itemsBody: $("itemsBody"),

    btnExportCSV: $("btnExportCSV"),
    toastHost: $("toast"),
  };

  // Toast helper
  function toast(msg) {
    const host = el.toastHost || document.body;
    const div = document.createElement("div");
    div.className = "toast-bubble";
    div.textContent = msg;
    host.appendChild(div);
    setTimeout(() => div.remove(), 1600);
  }

  // Parse numeric: strips $ , commas, etc.
  function cleanNumber(val) {
    if (val == null) return 0;
    const s = String(val).replace(/[^0-9.\-]/g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  // App state
  const SKEY = "sirscansalot_v2";
  const state = {
    truckCost: 0,
    shippingCost: 0,
    otherFees: 0,
    truckLabel: "",
    items: [], // { sku, title, retail, qty, cpi, startPrice, imgData, imgName }
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SKEY) || "{}");
      Object.assign(state, saved);
    } catch {}
  }
  function save() {
    localStorage.setItem(SKEY, JSON.stringify(state));
  }

  function totalUnits() {
    return state.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  }

  function totalCost() {
    return (Number(state.truckCost) || 0) +
           (Number(state.shippingCost) || 0) +
           (Number(state.otherFees) || 0);
  }

  function currentCPI() {
    const units = totalUnits();
    if (!units) return 0;
    return totalCost() / units;
  }

  // Recalculate CPI & per-item startPrice
  function recalcPrices() {
    const cpi = currentCPI();
    state.items.forEach(it => {
      it.cpi = cpi;
      if (it.startPrice == null || it.startPrice === "" || it.startPrice === 0) {
        it.startPrice = cpi; // default auction start = CPI
      }
    });
  }

  // Render table + stats
  function render() {
    const units = totalUnits();
    const tCost = totalCost();
    const cpi = currentCPI();

    if (el.statTotalItems) el.statTotalItems.textContent = units;
    if (el.statTotalCost) el.statTotalCost.textContent = money(tCost);
    if (el.statCPI) el.statCPI.textContent = money(cpi);

    if (el.truckCost) el.truckCost.value = state.truckCost || "";
    if (el.shippingCost) el.shippingCost.value = state.shippingCost || "";
    if (el.otherFees) el.otherFees.value = state.otherFees || "";
    if (el.truckLabel) el.truckLabel.value = state.truckLabel || "";

    if (!el.itemsBody) return;
    el.itemsBody.innerHTML = "";

    state.items.forEach((it, idx) => {
      const tr = document.createElement("tr");
      const imgHtml = it.imgData
        ? `<img class="thumb" src="${it.imgData}" alt="photo" />`
        : `<button class="btn" data-act="photo" data-i="${idx}">Add Photo</button>`;

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${it.sku || ""}</td>
        <td>${it.title || ""}</td>
        <td>$${money(it.retail || 0)}</td>
        <td>
          <input type="number" min="1" step="1" class="qty-input" data-i="${idx}" value="${it.qty || 1}" style="width:70px" />
        </td>
        <td>$${money(it.cpi || 0)}</td>
        <td>
          <input type="number" step="0.01" class="start-input" data-i="${idx}" value="${it.startPrice != null ? it.startPrice : it.cpi}" style="width:90px" />
        </td>
        <td>${imgHtml}</td>
      `;
      el.itemsBody.appendChild(tr);
    });
  }

  // Handle photo capture / upload for one row
  function attachPhotoForIndex(idx) {
    const it = state.items[idx];
    if (!it) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment"; // mobile camera
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        it.imgData = reader.result;
        // Suggested filename for Woo import
        const base = it.sku || ("item-" + (idx + 1));
        it.imgName = `${base}.jpg`;
        save();
        render();
        toast(`Photo attached to SKU ${it.sku || base}`);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // Import manifest CSV
  function importManifest(file) {
    if (!window.Papa) {
      alert("CSV parser not loaded.");
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data || [];
        if (!rows.length) {
          alert("No rows in CSV.");
          return;
        }

        let added = 0;
        rows.forEach((row) => {
          const sku = String(row["SKU"] || "").trim();
          const title = String(row["Title"] || row["Item Description"] || "").trim();
          const retail = cleanNumber(row["Retail"]);
          const qty = cleanNumber(row["Qty"] || row["QTY"] || 1) || 1;

          if (!sku && !title) return; // need something
          if (!retail) {
            // Still allow import; just treat as 0 retail
          }

          state.items.push({
            sku,
            title: title || sku,
            retail,
            qty,
            cpi: 0,
            startPrice: null,
            imgData: "",
            imgName: ""
          });
          added++;
        });

        recalcPrices();
        save();
        render();
        toast(`Imported ${added} items from manifest`);
      }
    });
  }

  // Export Bid Barn CSV (for Woo / All Import)
  function exportBidBarnCSV() {
    if (!state.items.length) {
      alert("No items to export.");
      return;
    }

    const headers = [
      "Name",              // Woo Name
      "SKU",               // Woo SKU
      "Regular price",     // Retail
      "Auction Start",     // our field; map via All Import if needed
      "Stock",             // Qty
      "Images",            // suggested filename; upload separately
      "Description",       // includes CPI info
      "Truck Label"        // for reference
    ];

    const rows = [headers];

    state.items.forEach((it) => {
      const name = it.title || it.sku || "Item";
      const sku = it.sku || "";
      const retail = money(it.retail || 0);
      const start = money(it.startPrice != null ? it.startPrice : it.cpi || 0);
      const stock = String(Math.max(1, Number(it.qty) || 1));
      const imgName = it.imgName || (sku ? `${sku}.jpg` : "");
      const desc = `Retail $${retail}. CPI (truck cost per item) $${money(it.cpi || 0)}. Auction start $${start}.`;

      rows.push([
        name,
        sku,
        retail,
        start,
        stock,
        imgName,
        desc,
        state.truckLabel || ""
      ]);
    });

    const csv = rows
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
    a.download = `bidbarn_manifest_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast("Bid Barn CSV exported");
  }

  // Bind events
  function bind() {
    if (el.btnSaveSession) {
      el.btnSaveSession.addEventListener("click", () => {
        state.truckCost = cleanNumber(el.truckCost.value);
        state.shippingCost = cleanNumber(el.shippingCost.value);
        state.otherFees = cleanNumber(el.otherFees.value);
        state.truckLabel = String(el.truckLabel.value || "");
        recalcPrices();
        save();
        render();
        toast("Cost info saved");
      });
    }

    if (el.btnNewSession) {
      el.btnNewSession.addEventListener("click", () => {
        if (!confirm("Start a new session and clear all items?")) return;
        state.truckCost = 0;
        state.shippingCost = 0;
        state.otherFees = 0;
        state.truckLabel = "";
        state.items = [];
        save();
        render();
      });
    }

    if (el.btnManifest && el.manifestFile) {
      el.btnManifest.addEventListener("click", () => el.manifestFile.click());
      el.manifestFile.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) importManifest(file);
        e.target.value = "";
      });
    }

    if (el.btnClearItems) {
      el.btnClearItems.addEventListener("click", () => {
        if (!state.items.length) return;
        if (!confirm("Clear all imported items?")) return;
        state.items = [];
        save();
        render();
      });
    }

    if (el.itemsBody) {
      // Qty and Start price changes
      el.itemsBody.addEventListener("change", (e) => {
        const qtyInp = e.target.closest(".qty-input");
        const startInp = e.target.closest(".start-input");

        if (qtyInp) {
          const idx = Number(qtyInp.dataset.i);
          const it = state.items[idx];
          if (!it) return;
          let v = cleanNumber(qtyInp.value);
          if (!v || v < 1) v = 1;
          it.qty = v;
          recalcPrices();
          save();
          render();
          return;
        }
        if (startInp) {
          const idx = Number(startInp.dataset.i);
          const it = state.items[idx];
          if (!it) return;
          it.startPrice = cleanNumber(startInp.value);
          save();
          render();
          return;
        }
      });

      // Photo button
      el.itemsBody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act='photo']");
        if (!btn) return;
        const idx = Number(btn.dataset.i);
        attachPhotoForIndex(idx);
      });
    }

    if (el.btnExportCSV) {
      el.btnExportCSV.addEventListener("click", exportBidBarnCSV);
    }
  }

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    load();
    recalcPrices();
    render();
    bind();
  });
})();