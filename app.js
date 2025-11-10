// ======================================================
// Sir Scansalot - WooCommerce CSV Export with Unsplash
// ======================================================

// === Config ===
const UNSPLASH_ACCESS_KEY = "D5LVeLM5MZKOJNhrIkjJE72QA20KOhpCk71l1R99Guw";

// === Selectors ===
const worldlyFile = document.getElementById("worldlyFile");
const manifestFile = document.getElementById("manifestFile");
const exportBtn = document.getElementById("exportCsv");
const toast = document.getElementById("toast");

// === Toast Notification ===
function showToast(message) {
  if (!toast) {
    console.log("Toast:", message);
    return;
  }
  toast.textContent = message;
  toast.style.opacity = 1;
  setTimeout(() => (toast.style.opacity = 0), 4000);
}

// === App State ===
let allItems = [];

// ======================================================
// CSV Parser (simple split-based, works for WT + B-Stock)
// ======================================================
function parseCSV(text) {
  const rows = text.split(/\r?\n/).filter((r) => r.trim() !== "");
  const headers = rows[0].split(",").map((h) => h.trim());
  const items = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim());
    const obj = {};
    headers.forEach((h, j) => (obj[h] = cols[j]));
    items.push(obj);
  }
  return items;
}

// ======================================================
// File Readers
// ======================================================
worldlyFile?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showToast(`Importing ${file.name}...`);

  const text = await file.text();
  const parsed = parseCSV(text);

  // Normalize Worldly Treasures format
  allItems = parsed.map((r) => ({
    sku: r["SKU"]?.trim() || "",
    name: r["Item Description"]?.trim() || "",
    brand: r["Brand"]?.trim() || "Unknown",
    retail: parseFloat((r["Retail"] || r["WT Retail"] || "0").replace(/[^0-9.]/g, "")) || 0,
    cost: parseFloat((r["Wholesale"] || "0").replace(/[^0-9.]/g, "")) || 0,
    qty: parseInt(r["Qty"] || r["WT QTY"] || 1),
  }));

  showToast(`Worldly Treasures items loaded: ${allItems.length}`);
  console.log("Worldly Treasures items:", allItems);
});

manifestFile?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showToast(`Importing ${file.name}...`);

  const text = await file.text();
  const parsed = parseCSV(text);

  // Normalize B-Stock format
  allItems = parsed.map((r) => ({
    sku: r["Item ID"]?.trim() || r["Product ID"]?.trim() || "",
    name: r["Title"]?.trim() || r["Item Description"]?.trim() || "",
    brand: r["Brand"]?.trim() || "Unknown",
    retail: parseFloat((r["Retail Price"] || "0").replace(/[^0-9.]/g, "")) || 0,
    cost: parseFloat((r["Your Cost"] || "0").replace(/[^0-9.]/g, "")) || 0,
    qty: parseInt(r["Quantity"] || 1),
  }));

  showToast(`B-Stock items loaded: ${allItems.length}`);
  console.log("B-Stock items:", allItems);
});

// ======================================================
// Unsplash Image Search
// ======================================================
async function fetchStockPhoto(sku, desc, brand) {
  const query = encodeURIComponent(`${brand || ""} ${desc || sku}`.trim());
  const url = `https://api.unsplash.com/search/photos?query=${query}&per_page=1&client_id=${UNSPLASH_ACCESS_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.results?.length) {
      return data.results[0].urls.small;
    } else {
      console.warn("No Unsplash image found for", query);
      return `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(sku)}`;
    }
  } catch (err) {
    console.error("Unsplash fetch failed:", err);
    return `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(sku)}`;
  }
}

// ======================================================
// Delay helper
// ======================================================
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ======================================================
// CSV Export
// ======================================================
function exportToCSV(items) {
  if (!items.length) {
    showToast("No items to export!");
    return;
  }

  const headers = Object.keys(items[0]);
  const csvRows = [headers.join(",")];

  for (const item of items) {
    const values = headers.map((h) =>
      `"${(item[h] ?? "").toString().replace(/"/g, '""')}"`
    );
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `WooCommerce_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ======================================================
// Export Button Logic
// ======================================================
if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    if (!allItems.length) {
      showToast("No items to export");
      return;
    }

    showToast("Fetching Unsplash images...");
    const enrichedItems = [];

    for (const item of allItems) {
      const binPrice = item.retail * 0.8;
      const startPrice = item.cost;

      const imageUrl = await fetchStockPhoto(item.sku, item.name, item.brand);

      enrichedItems.push({
        SKU: item.sku,
        Name: item.name,
        Brand: item.brand,
        Retail: item.retail.toFixed(2),
        Cost: item.cost.toFixed(2),
        "BIN 80%": binPrice.toFixed(2),
        "Auction Start": startPrice.toFixed(2),
        Qty: item.qty,
        Image: imageUrl,
      });

      await delay(300); // avoid Unsplash rate limit
    }

    showToast("Building WooCommerce CSV...");
    exportToCSV(enrichedItems);
    showToast("WooCommerce CSV exported successfully!");
  });
}
