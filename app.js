// Scanner + lookup + CSV export (WooCommerce-ready)

const codeReader = new ZXing.BrowserMultiFormatReader();
let currentStream = null;
const items = [];

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const cameraSelect = document.getElementById('cameraSelect');

const upcEl = document.getElementById('upc');
const validateBtn = document.getElementById('validateBtn');
const lookupBtn = document.getElementById('lookupBtn');
const validMsg = document.getElementById('validMsg');

const nameEl = document.getElementById('name');
const brandEl = document.getElementById('brand');
const amazonEl = document.getElementById('amazon_link');
const retailEl = document.getElementById('retail');
const buyNowEl = document.getElementById('buy_now');
const shortDescEl = document.getElementById('short_description');
const descEl = document.getElementById('description');
const imagesEl = document.getElementById('images');
const startPriceEl = document.getElementById('auction_start_price');
const incrementEl = document.getElementById('auction_bid_increment');
const endEl = document.getElementById('auction_end');

const addItemBtn = document.getElementById('addItem');
const clearFormBtn = document.getElementById('clearForm');
const exportBtn = document.getElementById('exportCsv');
const clearAllBtn = document.getElementById('clearAll');
const tableBody = document.querySelector('#itemsTable tbody');

// ----- Camera -----
async function listCameras() {
  const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
  cameraSelect.innerHTML = '';
  devices.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${i+1}`;
    cameraSelect.appendChild(opt);
  });
}
async function startCamera() {
  await listCameras();
  const deviceId = cameraSelect.value || undefined;
  stopCamera();
  try {
    const constraints = { video: { deviceId: deviceId ? { exact: deviceId } : undefined, facingMode: "environment" } };
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;
    await video.play();
    overlay.width = video.videoWidth; overlay.height = video.videoHeight;
    codeReader.decodeFromVideoDevice(deviceId || null, video, (result) => {
      ctx.clearRect(0,0,overlay.width,overlay.height);
      if (result) {
        upcEl.value = sanitize(result.getText());
        if (validateUPC()) doLookup();
      }
    });
    startBtn.disabled = true; stopBtn.disabled = false;
  } catch (e) { alert('Camera error: ' + e.message); }
}
function stopCamera() {
  codeReader.reset();
  if (currentStream) currentStream.getTracks().forEach(t => t.stop());
  startBtn.disabled = false; stopBtn.disabled = true;
}
startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);

// ----- Validation -----
function sanitize(s){ return (s||'').toString().trim().replace(/[^\d]/g,''); }
function isValidUPC_EAN(s){
  const d = sanitize(s); if (![12,13].includes(d.length)) return false; return checkDigitOK(d);
}
function checkDigitOK(d){
  const a = d.split('').map(n=>+n); const check = a.pop(); const len=a.length;
  let sum=0; for(let i=0;i<len;i++){ sum += (i % 2 === (len % 2 === 0 ? 1 : 0)) ? a[i]*3 : a[i]; }
  const calc=(10-(sum%10))%10; return calc===check;
}
function validateUPC(){
  if (isValidUPC_EAN(upcEl.value)){ validMsg.textContent='✓ Valid'; validMsg.className='ok'; return true; }
  validMsg.textContent='✗ Invalid code'; validMsg.className='err'; return false;
}
validateBtn.addEventListener('click', validateUPC);

// ----- Lookup -----
lookupBtn.addEventListener('click', ()=>{ if (validateUPC()) doLookup(); });
async function doLookup(){
  const upc = sanitize(upcEl.value);
  try{
    lookupBtn.disabled = true; lookupBtn.textContent = 'Looking…';
    const r = await fetch(`/lookup?upc=${encodeURIComponent(upc)}`);
    const j = await r.json();
    if (j.ok && j.data){
      const d=j.data;
      if (d.name) nameEl.value = d.name;
      if (d.brand) brandEl.value = d.brand;
      if (d.description) descEl.value = d.description;
      if (d.amazon_link) amazonEl.value = d.amazon_link;
      if (d.retail){ retailEl.value = fmt(d.retail); recalcBuyNow(); }
      if (d.image && !imagesEl.value) imagesEl.value = d.image;
      validMsg.textContent = `✓ Auto-filled (${d.source})`; validMsg.className='ok';
    } else { validMsg.textContent = 'Not found'; validMsg.className='err'; }
  } catch(e){ alert('Lookup error: '+e.message); }
  finally{ lookupBtn.disabled=false; lookupBtn.textContent='Lookup'; }
}

// ----- Pricing -----
function fmt(n){ return (Math.round(parseFloat(n||0)*100)/100).toFixed(2); }
function recalcBuyNow(){ const r=parseFloat(retailEl.value||0); if(!isNaN(r)) buyNowEl.value = fmt(r*0.80); }
retailEl.addEventListener('input', recalcBuyNow);

// ----- Pallet Calculator -----
const totalPaidEl = document.getElementById('totalPaid');
const totalMSRPEl = document.getElementById('totalMSRP');
const itemCountEl = document.getElementById('itemCount');
const costPerItemEl = document.getElementById('costPerItem');
const profitMarginEl = document.getElementById('profitMargin');
const calculateBtn = document.getElementById('calculateBtn');
const applyStartingBidBtn = document.getElementById('applyStartingBidBtn');
const clearPalletBtn = document.getElementById('clearPalletBtn');

let calculatedCostPerItem = 0;

function calculatePalletCosts(showAlert = false) {
  const totalPaid = parseFloat(totalPaidEl.value || 0);
  const totalMSRP = parseFloat(totalMSRPEl.value || 0);
  const itemCount = parseInt(itemCountEl.value || 0);
  
  if (totalPaid <= 0 || itemCount <= 0) {
    if (showAlert) {
      alert('Please enter valid amounts for total paid and item count.');
    }
    applyStartingBidBtn.disabled = true;
    return false;
  }
  
  calculatedCostPerItem = totalPaid / itemCount;
  costPerItemEl.textContent = fmt(calculatedCostPerItem);
  
  if (totalMSRP > 0) {
    const profitMargin = ((totalMSRP - totalPaid) / totalMSRP * 100);
    profitMarginEl.textContent = fmt(profitMargin) + '%';
  } else {
    profitMarginEl.textContent = 'N/A';
  }
  
  applyStartingBidBtn.disabled = false;
  return true;
}

function applyStartingBid() {
  if (calculatedCostPerItem > 0) {
    startPriceEl.value = fmt(calculatedCostPerItem);
    alert(`Starting bid set to $${fmt(calculatedCostPerItem)} (your cost per item)`);
  }
}

function clearPalletForm() {
  totalPaidEl.value = '';
  totalMSRPEl.value = '';
  itemCountEl.value = '';
  costPerItemEl.textContent = '0.00';
  profitMarginEl.textContent = 'N/A';
  calculatedCostPerItem = 0;
  applyStartingBidBtn.disabled = true;
}

calculateBtn.addEventListener('click', () => calculatePalletCosts(true));
applyStartingBidBtn.addEventListener('click', applyStartingBid);
clearPalletBtn.addEventListener('click', clearPalletForm);

// Auto-calculate when inputs change
[totalPaidEl, totalMSRPEl, itemCountEl].forEach(el => {
  el.addEventListener('input', () => {
    const totalPaid = parseFloat(totalPaidEl.value || 0);
    const itemCount = parseInt(itemCountEl.value || 0);
    if (totalPaid > 0 && itemCount > 0) {
      calculatePalletCosts(false);
    } else {
      // Clear stale values when inputs become invalid
      costPerItemEl.textContent = '0.00';
      profitMarginEl.textContent = 'N/A';
      calculatedCostPerItem = 0;
      applyStartingBidBtn.disabled = true;
    }
  });
});

// ----- Items / CSV -----
function clearForm(){
  nameEl.value=''; brandEl.value=''; amazonEl.value=''; retailEl.value='';
  buyNowEl.value=''; shortDescEl.value=''; descEl.value=''; imagesEl.value='';
  startPriceEl.value='1.00'; incrementEl.value='1.00'; endEl.value='';
}
document.getElementById('clearForm').addEventListener('click', clearForm);

document.getElementById('addItem').addEventListener('click', ()=>{
  if (!validateUPC()) { alert('Enter a valid UPC/EAN.'); return; }
  if (!nameEl.value.trim()) { alert('Enter a product name.'); return; }
  const row = {
    name: nameEl.value.trim(),
    sku: sanitize(upcEl.value),
    description: descEl.value.trim(),
    short_description: shortDescEl.value.trim(),
    images: imagesEl.value.trim(),
    tags: brandEl.value.trim(),
    regular_price: fmt(retailEl.value || 0),
    auction_start_price: fmt(startPriceEl.value || 1),
    auction_bid_increment: fmt(incrementEl.value || 1),
    auction_end_date: endEl.value ? endEl.value.replace('T',' ') + ':00' : '',
    'meta:amazon_link': amazonEl.value.trim(),
    'meta:retail_price_source': 'lookup',
    'meta:buy_now_80': fmt(buyNowEl.value || (parseFloat(retailEl.value||0)*0.8))
  };
  items.push(row); drawTable(); clearForm();
});

function drawTable(){
  tableBody.innerHTML='';
  items.forEach((it, i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${it.sku}</td>
      <td>${escapeHtml(it.name)}</td>
      <td>${escapeHtml(it.tags||'')}</td>
      <td>$${it.regular_price}</td>
      <td>$${it['meta:buy_now_80']}</td>
      <td>${escapeHtml(it.auction_end_date)}</td>
      <td>${it['meta:amazon_link']?`<a href="${it['meta:amazon_link']}" target="_blank">link</a>`:''}</td>
      <td><button data-i="${i}" class="del">Delete</button></td>`;
    tableBody.appendChild(tr);
  });
  tableBody.querySelectorAll('button.del').forEach(b=>b.addEventListener('click',e=>{
    items.splice(+e.target.dataset.i,1); drawTable();
  }));
}
function escapeHtml(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

document.getElementById('exportCsv').addEventListener('click', ()=>{
  if (!items.length){ alert('No items to export.'); return; }
  const headers = [
    'name','sku','description','short_description','images','tags',
    'regular_price','auction_start_price','auction_bid_increment','auction_end_date',
    'meta:amazon_link','meta:retail_price_source','meta:buy_now_80'
  ];
  const rows=[headers.join(',')];
  for (const it of items){
    const line=headers.map(h=>csvEscape(it[h]??'')).join(',');
    rows.push(line);
  }
  const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  const ts=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  a.href=url; a.download=`bidbarn_woocommerce_${ts}.csv`; document.body.appendChild(a);
  a.click(); URL.revokeObjectURL(url); a.remove();
});
function csvEscape(v){ const s=String(v); return (s.includes('"')||s.includes(',')||s.includes('\n'))?`"${s.replace(/"/g,'""')}"`:s; }

window.addEventListener('load', listCameras);