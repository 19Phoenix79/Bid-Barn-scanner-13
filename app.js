// ============================================================
// SIR SCANSALOT 2.0 — FULL APP.JS (COMPLETE REWRITE)
// Handles:
// - Truck cost / CPI
// - Manifest upload (auto-detect B-Stock, WTL, Amazon manifests)
// - Photo capture
// - Export for WooCommerce / Bid Barn CSV
// ============================================================

const state = {
  truckCost: 0,
  shippingCost: 0,
  otherFees: 0,
  items: []
};

function money(v) {
  return Number(v || 0).toFixed(2);
}

function cleanNumber(v) {
  if (!v) return 0;
  return Number(String(v).replace(/[^0-9.\-]/g, "")) || 0;
}

function totalUnits() {
  return state.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
}

function computeCPI() {
  const totalCost = Number(state.truckCost) + Number(state.shippingCost) + Number(state.otherFees);
  const units = totalUnits() || 1;
  return totalCost / units;
}

function recalcPrices() {
  const cpi = computeCPI();
  state.items.forEach(it => {
    it.cpi = cpi;
    it.startPrice = cpi; // Auction Start defaults to CPI
  });
}

function save() {
  localStorage.setItem("bb_scansalot2", JSON.stringify(state));
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem("bb_scansalot2"));
    if (data) Object.assign(state, data);
  } catch {}
}

function render() {
  const tbody = document.getElementById("itemsBody");
  const totalItemsEl = document.getElementById("statTotalItems");
  const totalCostEl = document.getElementById("statTotalCost");
  const cpiEl = document.getElementById("statCPI");

  tbody.innerHTML = "";
  const cpi = computeCPI();

  state.items.forEach((it, idx) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${it.sku}</td>
      <td>${it.title}</td>
      <td>$${money(it.retail)}</td>
      <td>${it.qty}</td>
      <td>$${money(it.cpi)}</td>
      <td>$${money(it.startPrice)}</td>
      <td>
        <button class="btn qbtn" data-photo="${idx}">Add Photo</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  totalItemsEl.textContent = totalUnits();
  totalCostEl.textContent = money(Number(state.truckCost) + Number(state.shippingCost) + Number(state.otherFees));
  cpiEl.textContent = money(cpi);

  save();
}

function toast(msg) {
  alert(msg); // simple temporary toast
}

// ============================================================
// UNIVERSAL MANIFEST IMPORTER (B-STOCK, WTL, AMAZON)
// ============================================================

function importManifest(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (result) => {
      const rows = result.data || [];
      if (!rows.length) {
        toast("No rows in CSV");
        return;
      }

      const getField = (row, names) => {
        const keys = Object.keys(row || {});
        for (const name of names) {
          const target = name.toLowerCase().trim();
          const match = keys.find(k => k.toLowerCase().trim() === target);
          if (match) return row[match];
        }
        return "";
      };

      let added = 0;

      rows.forEach(row => {
        const sku = String(getField(row, [
          "SKU", "ITEM #", "Item #", "ASIN", "UPC", "Scan LP #", "ITEM"
        ]) || "").trim();

        const title = String(getField(row, [
          "Title","Item Title","Description","Item Description","Item Name","Product Name"
        ]) || "").trim();

        const retail = cleanNumber(getField(row, [
          "Retail","Retail Value","RETAIL VALUE","MSRP",
          "List Price","Unit Price","Lot Item Price",
          "Ext. Retail Value","EXT. RETAIL VALUE","Extended Retail"
        ]));

        let qty = cleanNumber(getField(row, [
          "Qty","QTY","Quantity","Order Qty","QTY SHIPPED"
        ]));
        if (!qty || qty < 1) qty = 1;

        if (!sku && !title) return;

        state.items.push({
          sku,
          title: title || sku,
          retail,
          qty,
          cpi: 0,
          startPrice: 0,
          imgData: "",
          imgName: ""
        });

        added++;
      });

      recalcPrices();
      render();
      toast(`Imported ${added} items`);
    }
  });
}

// ============================================================
// EXPORT BID BARN CSV FOR WOOCOMMERCE
// ============================================================

function exportBidBarnCsv() {
  const rows = [];
  rows.push([
    "SKU","Name","Regular price","Stock","Images"
  ]);

  state.items.forEach(it => {
    rows.push([
      it.sku,
      it.title,
      money(it.startPrice),
      it.qty,
      it.imgName || ""
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "bidbarn_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// PHOTO UPLOAD
// ============================================================

function attachPhoto(idx) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      state.items[idx].imgData = reader.result;
      state.items[idx].imgName = `${state.items[idx].sku}.jpg`;
      render();
    };
    reader.readAsDataURL(file);
  };

  input.click();
}

// ============================================================
// BIND UI
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  load();
  render();

  document.getElementById("btnSaveSession").onclick = () => {
    state.truckCost = cleanNumber(document.getElementById("truckCost").value);
    state.shippingCost = cleanNumber(document.getElementById("shippingCost").value);
    state.otherFees = cleanNumber(document.getElementById("otherFees").value);
    recalcPrices();
    render();
  };

  document.getElementById("btnNewSession").onclick = () => {
    if (confirm("Start new session? This clears items.")) {
      state.items = [];
      recalcPrices();
      render();
    }
  };

  document.getElementById("btnManifest").onclick = () => {
    document.getElementById("manifestFile").click();
  };

  document.getElementById("manifestFile").onchange = (e) => {
    const file = e.target.files[0];
    if (file) importManifest(file);
  };

  document.getElementById("btnClearItems").onclick = () => {
    if (confirm("Clear all items?")) {
      state.items = [];
      render();
    }
  };

  document.getElementById("itemsBody").onclick = (e) => {
    const btn = e.target.closest("button[data-photo]");
    if (!btn) return;
    attachPhoto(btn.dataset.photo);
  };

  document.getElementById("btnExportCsv").onclick = exportBidBarnCsv;
});