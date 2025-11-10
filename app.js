// ======================================================
// Sir Scansalot - WooCommerce CSV Export with Unsplash
// ======================================================

// === Config ===
const UNSPLASH_ACCESS_KEY = "D5LVeLM5MZKOJNhrIkjJE72QA20KOhpCk71l1R99Guw";

// === Elements ===
const exportBtn = document.getElementById("exportCsv");
const toast = document.getElementById("toast");

// === Toast Notifications ===
function showToast(message) {
  if (!toast) {
    console.log("Toast:", message);
    return;
  }
  toast.textContent = message;
  toast.style.opacity = 1;
  setTimeout(() => (toast.style.opacity = 0), 4000);
}

// ======================================================
// Example item array (replace this with imported data)
// ======================================================
let allItems = [
  {
    sku: "1010438319",
    name: "S7A WASHLET ELONGATED ELECTRIC HEATE",
    brand: "TOTO",
    retail: 1209.0,
    cost: 1314.0,
    qty: 1
  },
  {
    sku: "1005437420",
    name: "Merryfield 49 in. Sink Vanity",
    brand: "Home Decorators",
    retail: 1105.0,
    cost: 52.0,
    qty: 1
  },
  {
    sku: "1005581779",
    name: "Brightling 67 in. Freestanding Bathtub",
    brand: "Glacier Bay",
    retail: 972.79,
    cost: 432.0,
    qty: 1
  }
];

// ======================================================
// Unsplash image search helper
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
// Delay helper (rate-limit friendly)
// ======================================================
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ======================================================
// CSV Export Function
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
  link.download = `WooCommerce_Export_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ======================================================
// Export button logic
// ======================================================
if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    if (!allItems.length) {
      showToast("No items to export");
      return;
    }

    showToast("Fetching images from Unsplash...");
    const enrichedItems = [];

    for (const item of allItems) {
      // Compute BIN price (80% retail)
      const binPrice = item.retail * 0.8;

      // Auction starting price = cost
      const startPrice = item.cost;

      const imageUrl = await fetchStockPhoto(item.sku, item.name, item.brand);
      enrichedItems.push({
        SKU: item.sku,
        Name: item.name,
        Brand: item.brand,
        Retail: item.retail.toFixed(2),
        Cost: item.cost.toFixed(2),
        "BIN 80%": binPrice.toFixed(2),
        "Auction Start ($)": startPrice.toFixed(2),
        Qty: item.qty,
        Image: imageUrl
      });

      await delay(300); // polite rate limit
    }

    showToast("Building CSV file...");
    exportToCSV(enrichedItems);
    showToast("WooCommerce CSV exported successfully!");
  });
}
