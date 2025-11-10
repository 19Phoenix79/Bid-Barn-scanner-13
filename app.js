// app.js — Full replacement: imports + DuckDuckGo image lookup + WooCommerce export
document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const worldlyBtn = $("worldlyBtn");
  const worldlyFile = $("worldlyFile");
  const manifestBtn = $("manifestBtn");
  const manifestFile = $("manifestFile");
  const exportBtn = $("exportCsv");
  const clearBtn = $("clearPallet");
  const tbody = $("tbody");
  const toastHost = $("toast");

  // Data store
  let allItems = []; // each item: { sku, upc, name, model, qty, wholesale, retail, brand, source, image }

  // Config
  const IMAGE_DELAY_MS = 450; // delay between DuckDuckGo requests
  const PLACEHOLDER_IMAGE = (txt = "No+Image") => `https://via.placeholder.com/600x600?text=${encodeURIComponent(txt)}`;

  // --- Helpers ---
  function $(id) { return document.getElementById(id); }

  function showToast(msg, ms = 1300) {
    const div = document.createElement("div");
    div.className = "toast-bubble";
    div.textContent = msg;
    (toastHost || document.body).appendChild(div);
    setTimeout(() => { div.remove(); }, ms);
  }

  function safeNum(v) { return (v === undefined || v === null || v === "") ? 0 : Number(String(v).replace(/[^0-9.\-]/g, "")) || 0; }

  function clearTable() {
    tbody.innerHTML = "";
  }

  function renderTable() {
    clearTable();
    allItems.forEach((it, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${it.upc || ""}</td>
        <td>${(it.name || "").slice(0,120)}</td>
        <td>${it.brand || ""}</td>
        <td>$${(safeNum(it.retail)).toFixed(2)}</td>
        <td>$${(safeNum(it.wholesale)).toFixed(2)}</td>
        <td>${it.qty || 1}</td>
        <td>${it.source || ""}</td>
        <td style="max-width:120px">${it.sku || ""}</td>
        <td>${it.model || ""}</td>
        <td>${it.image ? `<img class="thumb" src="${it.image}" />` : "—"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- CSV/TSV parsing utilities ---
  function splitSafe(line, delimiter = ",") {
    // simple split that handles quoted cells
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' ) { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { result.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    result.push(cur.trim());
    return result;
  }

  function parseRows(text, delimiterGuess = null) {
    // returns array of rows (array of columns)
    const rowsRaw = text.replace(/\r/g, "").split("\n").map(r => r.trim()).filter(r => r.length > 0);
    if (!rowsRaw.length) return [];
    let delimiter = delimiterGuess;
    if (!delimiter) {
      // auto-detect: prefer tab if present
      delimiter = rowsRaw.some(r => r.indexOf("\t") >= 0) ? "\t" : ",";
    }
    return rowsRaw.map(r => splitSafe(r, delimiter));
  }

  // --- Import handlers (file pickers fire these) ---
  worldlyBtn.addEventListener("click", () => worldlyFile.click());
  manifestBtn.addEventListener("click", () => manifestFile.click());

  worldlyFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast(`Loading ${file.name}...`);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const rows = parseRows(text); // will auto-detect tab vs comma
        if (!rows.length) { showToast("No rows found in file"); return; }
        const header = rows[0].map(h => h.toLowerCase());
        // Look for columns: SKU, Scan LP #, Item Description, Model #, Qty, Wholesale, Retail
        const idxSKU = header.findIndex(h => h.includes("sku"));
        const idxScan = header.findIndex(h => h.includes("scan"));
        const idxDesc = header.findIndex(h => h.includes("item description") || h.includes("description") || h.includes("item"));
        const idxModel = header.findIndex(h => h.includes("model"));
        const idxQty = header.findIndex(h => h === "qty" || h.includes("qty"));
        const idxWholesale = header.findIndex(h => h.includes("wholesale"));
        const idxRetail = header.findIndex(h => h.includes("retail"));
        let imported = 0;
        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i];
          if (!cols || cols.length < 2) continue;
          const item = {
            sku: (cols[idxSKU] || "").trim(),
            scan: (cols[idxScan] || "").trim(),
            name: (cols[idxDesc] || "").trim(),
            model: (cols[idxModel] || "").trim(),
            qty: parseInt(cols[idxQty] || "1") || 1,
            wholesale: safeNum(cols[idxWholesale] || ""),
            retail: safeNum(cols[idxRetail] || ""),
            brand: "", // not provided in WT; left blank
            upc: "",
            source: "Worldly Treasures",
            image: "" // to fill later
          };
          allItems.push(item);
          imported++;
        }
        renderTable();
        showToast(`Imported ${imported} Worldly Treasures items ✅`);
      } catch (err) {
        console.error(err);
        showToast("Error parsing file");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  });

  manifestFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast(`Loading ${file.name}...`);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const rows = parseRows(text, ",");
        if (!rows.length) { showToast("No rows found in file"); return; }
        const header = rows[0].map(h => h.toLowerCase());
        const idxUPC = header.findIndex(h => h.includes("upc") || h.includes("sku"));
        const idxName = header.findIndex(h => h.includes("name") || h.includes("title"));
        const idxBrand = header.findIndex(h => h.includes("brand"));
        const idxRetail = header.findIndex(h => h.includes("retail") || h.includes("price"));
        const idxQty = header.findIndex(h => h.includes("qty") || h.includes("quantity") || h.includes("stock"));
        let imported = 0;
        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i];
          if (!cols || cols.length < 2) continue;
          const item = {
            sku: (cols[idxUPC] || "").trim(),
            upc: (cols[idxUPC] || "").trim(),
            name: (cols[idxName] || "").trim(),
            model: "",
            qty: parseInt(cols[idxQty] || "1") || 1,
            wholesale: 0,
            retail: safeNum(cols[idxRetail] || ""),
            brand: (cols[idxBrand] || "").trim(),
            source: "B-Stock",
            image: ""
          };
          allItems.push(item);
          imported++;
        }
        renderTable();
        showToast(`Imported ${imported} B-Stock items ✅`);
      } catch (err) {
        console.error(err);
        showToast("Error parsing file");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  });

  // Clear pallet
  clearBtn.addEventListener("click", () => {
    if (!confirm("Clear all items?")) return;
    allItems = [];
    renderTable();
    showToast("Pallet cleared 🗑️");
  });

// ---- Fetch stock photo via DuckDuckGo Image Search (with placeholder fallback) ----
const fetchStockPhoto = async (sku, desc, brand) => {
  try {
    const query = encodeURIComponent(`${brand || ''} ${desc || ''} ${sku} product photo`);
    const response = await fetch(`https://duckduckgo.com/i.js?q=${query}&iax=images&ia=images`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn("DuckDuckGo fetch failed:", response.status);
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data && data.results && data.results.length > 0) {
      const firstImg = data.results[0].image;
      console.log(`✅ Found image for [${sku}]:`, firstImg);
      return firstImg;
    }

    // If no results, use placeholder
    console.warn(`⚠️ No DuckDuckGo results for ${sku}`);
    return `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(desc?.slice(0, 60) || sku)}`;

  } catch (err) {
    console.warn("DuckDuckGo image fetch failed for", sku, err);
    return `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(desc?.slice(0, 60) || sku)}`;
  }
};


  // Delay helper
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

 // --- Export to WooCommerce CSV (with images) ---
exportBtn.addEventListener("click", async () => {
  if (!allItems.length) {
    showToast("No items to export");
    return;
  }

  showToast("Starting image lookup (this may take a moment)...");
  console.log("Export: fetching images for", allItems.length, "items...");

  const enrichedItems = [];

  for (const item of allItems) {
    // Fetch image from DuckDuckGo or fallback placeholder
    const imageUrl = await fetchStockPhoto(item.sku, item.name, item.brand);
    enrichedItems.push({ ...item, imageUrl });
    await delay(300); // gentle delay between requests (prevents blocking)
  }

  // Now continue your CSV export logic
  console.log("Finished fetching images. Ready to export:", enrichedItems.length);
  showToast("Image lookup complete. Preparing CSV...");

  // build CSV from enrichedItems (replace allItems in your CSV generator)
  exportToCSV(enrichedItems);
});



    // For each item, try to fetch image (prefer SKU then name)
    for (let i = 0; i < allItems.length; i++) {
      const it = allItems[i];
      if (it.image) continue; // already set

      let found = null;
      // try SKU first
      if (it.sku) {
        found = await fetchDuckImage(it.sku + " product photo");
      }
      // then model
      if (!found && it.model) {
        found = await fetchDuckImage(it.model + " product photo");
      }
      // then name
      if (!found && it.name) {
        found = await fetchDuckImage(it.name + " product photo");
      }
      // fallback
      it.image = found || PLACEHOLDER_IMAGE(it.name || it.sku || "No+Image");

      console.log(`Image for [${it.sku||it.name}]:`, it.image);
      // be polite with DDG
      await delay(IMAGE_DELAY_MS);
    }

    showToast("Images fetched — generating WooCommerce CSV...");

    // Build WooCommerce CSV headers (expanded)
    const headers = [
      "ID","Type","SKU","Name","Published","Is featured?","Visibility in catalog",
      "Short description","Description","Regular price","In stock?","Stock","Categories","Tags",
      "Images","Brands"
    ];
    const rows = [headers.join(",")];

    // Create rows — ensure CSV safe quoting
    allItems.forEach((it, idx) => {
      const sku = it.sku || it.upc || "";
      const name = (it.name || "").replace(/"/g, '""');
      const shortDesc = (`Imported from ${it.source}`).replace(/"/g,'""');
      const description = (`Model: ${it.model || "N/A"} | Brand: ${it.brand || ""}`).replace(/"/g,'""');
      const price = (safeNum(it.retail)).toFixed(2);
      const stock = (it.qty || 1);
      const categories = it.source === "Worldly Treasures" ? "Home & Garden" : "B-Stock";
      const tags = (it.brand || "").split(/\s*,\s*/).filter(Boolean).join(",");
      const imageUrls = Array.isArray(it.image) ? it.image.join("|") : it.image; // Woo accepts pipe-separated images
      const brand = it.brand || "";

      const row = [
        "", // ID blank so WooCommerce creates/merges via SKU
        "simple",
        `"${sku}"`,
        `"${name}"`,
        "1", // published
        "0", // featured
        "visible",
        `"${shortDesc}"`,
        `"${description}"`,
        price,
        "1", // in stock
        stock,
        `"${categories}"`,
        `"${tags}"`,
        `"${imageUrls}"`,
        `"${brand}"`
      ];
      rows.push(row.join(","));
    });

    // Create and trigger download
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `woo_import_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast("WooCommerce CSV downloaded ✅");
  });

  // --- On load: optional restore or notices ---
  showToast("App ready");
  console.log("app.js loaded — ready for CSV imports and Woo export");

  // small helper to ensure element exists
  function $(id) { return document.getElementById(id); }
});
