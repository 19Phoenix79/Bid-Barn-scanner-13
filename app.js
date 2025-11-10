// -----------------------------
// WooCommerce CSV Exporter + Uploader
// -----------------------------

// === Selectors ===
const importBtn = document.getElementById("importBtn");
const exportBtn = document.getElementById("exportBtn");
const uploadBtn = document.getElementById("uploadBtn");
const toast = document.getElementById("toast");

// === Toast notifications ===
function showToast(message) {
  if (!toast) {
    console.log("Toast:", message);
    return;
  }
  toast.innerText = message;
  toast.style.opacity = 1;
  setTimeout(() => (toast.style.opacity = 0), 4000);
}

// === Globals ===
let allItems = [];
const UNSPLASH_ACCESS_KEY = "D5LVeLM5MZKOJNhrIkjJE72QA20KOhpCk71l1R99Guw";

// 🛒 WooCommerce API setup
const WOO_API_URL = "https://bidbarn.bid";
const WOO_API_KEY = "ck_d55a9ed6d41a3d9a81ca11c768784466e295d2ff";
const WOO_API_SECRET = "cs_e758596896402d908099ff144cb09bd158ca4d21";

// -----------------------------
// CSV Import
// -----------------------------
importBtn.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return showToast("No file selected");

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split("\n").filter(Boolean);
    const headers = lines[0].split(",").map((h) => h.trim());
    allItems = lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.replace(/(^"|"$)/g, ""));
      return headers.reduce((obj, key, i) => {
        obj[key] = values[i] || "";
        return obj;
      }, {});
    });

    showToast(`Imported ${allItems.length} items`);
    console.log("Imported items:", allItems.length, allItems);
  };
  reader.readAsText(file);
});

// -----------------------------
// Fetch stock photo (Unsplash API)
// -----------------------------
async function fetchStockPhoto(sku, desc, brand) {
  try {
    const query = encodeURIComponent(desc || brand || sku);
    const url = `https://api.unsplash.com/search/photos?query=${query}&per_page=1&client_id=${UNSPLASH_ACCESS_KEY}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.results?.length > 0) {
      return data.results[0].urls.small;
    } else {
      return `https://via.placeholder.com/600x600.png?text=${query}`;
    }
  } catch (err) {
    console.warn(`Image fetch failed for ${sku}:`, err);
    return `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(sku)}`;
  }
}

// -----------------------------
// Delay helper (polite rate limiting)
// -----------------------------
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------
// Export CSV (for local backup)
// -----------------------------
function exportToCSV(items) {
  if (!items.length) {
    showToast("No items to export!");
    return;
  }

  const headers = Object.keys(items[0]);
  const csvRows = [headers.join(",")];

  for (const item of items) {
    const values = headers.map((h) => `"${(item[h] ?? "").toString().replace(/"/g, '""')}"`);
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

// -----------------------------
// Upload to WooCommerce
// -----------------------------
async function uploadToWooCommerce(item) {
  const url = `${WOO_API_URL}/products`;
  const auth = btoa(`${WOO_API_KEY}:${WOO_API_SECRET}`);

  const productData = {
    name: item.name,
    sku: item.sku,
    regular_price: item.binPrice.toString(),
    description: item.description || item.brand || "",
    images: [{ src: item.imageUrl }],
    categories: [{ name: "Worldly Treasures" }],
    meta_data: [
      { key: "auction_start_price", value: item.auctionPrice.toString() },
      { key: "source", value: "Sir Scansalot" },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
    },
    body: JSON.stringify(productData),
  });

  if (!response.ok) {
    console.error(`❌ WooCommerce upload failed for ${item.sku}:`, await response.text());
  } else {
    console.log(`✅ Uploaded to WooCommerce: ${item.name}`);
  }
}

// -----------------------------
// Export & Upload Workflow
// -----------------------------
exportBtn.addEventListener("click", async () => {
  if (!allItems.length) {
    showToast("No items to export");
    return;
  }

  showToast("Starting image lookup (this may take a moment)...");
  console.log("Export: fetching images for", allItems.length, "items...");

  const enrichedItems = [];

  for (const item of allItems) {
    const imageUrl = await fetchStockPhoto(item.sku, item.name, item.brand);
    const binPrice = (item.price * 1.8).toFixed(2); // 80% BIN
    const auctionPrice = item.price.toFixed(2); // cost = auction start
    enrichedItems.push({ ...item, imageUrl, binPrice, auctionPrice });
    await delay(300);
  }

  showToast("Image lookup complete. Generating CSV...");
  exportToCSV(enrichedItems);
  showToast("WooCommerce CSV exported successfully!");
});

// -----------------------------
// Upload to WooCommerce (Manual Button)
// -----------------------------
uploadBtn.addEventListener("click", async () => {
  if (!allItems.length) return showToast("No items loaded!");

  showToast("Uploading to WooCommerce...");
  for (const item of allItems) {
    await uploadToWooCommerce(item);
    await delay(500);
  }

  showToast("✅ Upload complete!");
});
