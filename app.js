let items = [];
let currentImage = null;
let stream = null;

// CSV Import
document.getElementById('csvFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    (!file) return;

    const text = await file.text();
    const rows = parseCSV(text);
    
    items = rows.slice(1).map(row => ({
        id: row[0],
        name: row[1],
        description: row[2],
        imageUrl: row[3] || '',
        sku: row[] || row[0],
        startingBid: parseFloat(row[5]) || 0
    }));
    
    document.getElementById('importStatus').textContent = `Imported ${items.length} items`;
    renderItems();
});

// Parse CSV
function parseCSV(text) {
    return text.split('\n').map(row => 
 row.split(',').map(cell => cell.replace(/"/g, '').trim())
    ).filter(row => row.length > 1 && row[0]);
}

// Camera Functions
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia 
            video: { facingMode: 'environment' } 
        });
        const video = document.getElementById('cameraFeed');
        video.srcObject = stream;
        video.style.display = 'block';
        document.getElementById('captureBtn').style.display = 'inline-block';
        document.getElementById('startCamera').style.display = 'none';
    } catch (err) {
        alert('Camera error: ' + err.message);
    }
}

function captureImage() {
    const video = document.getElementById('cameraFeed');
    const canvas = document.getElementById('snapshotCanvas');
    const img = document.getElementById('previewImage');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    currentImage = canvas.toDataURL('image/jpeg');
    img.src = currentImage;
    img.style.display = 'block';
    
    // Stop camera
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.style.display = 'none';
        document.getElementById('captureBtn').style.display = 'none';
        document.getElementById('uploadImage').style.display = 'inline-block';
    }
}

// Upload to WordPress
async function uploadImage() {
    ifcurrentImage) return;
    
    const status = document.getElementById('importStatus');
    status.text = 'Uploading...';
    
    try {
        // Remove data:image/jpeg;base64, prefix
        const base64Image = currentImage.split(',')[1];
        const blob = await fetch(currentImage).then(r => r.blob());
        
        const formData = new FormData();
        formData.append('file', blob, 'item_' + Date.now() + '.jpg');
        
        const response = await fetch('https://bidbarn.bid/wp-json/wp/v2/media', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa('YOUR_WP_USERNAME:YOUR_APP_PASSWORD')
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            currentImage = data.source_url;
            status.textContent = '✅ Image uploaded!';
            document.getElementById('uploadImage').style.display = 'none';
        } else {
            throw new Error('Upload failed: ' + response.status);
        }
    } catch (err) {
        status.textContent = '❌ Upload failed: ' + err.message;
    }
}

// Add Item
function addItem() {
    const item = {
        id: document.getElementById('itemId').value,
        name: document.getElementById('itemName').value,
        description: document.getElementById('itemDesc').value,
        sku: document.getElementById('itemSkuvalue,
        startingBid: document.getElementById('startingBid').value,
        imageUrl: currentImage || ''
    };
    
    if (!item.id || !item.name) {
        alert('ID and Name are required!');
        return;
    }
    
    items.push(item);
    renderItems();
    clearForm();
}

// Render Items
function renderItems() {
    const list = document.getElementById('itemsList');
    list.innerHTML = items.map((item, index) => `
        <div class="item-card">
            <img src="${item.imageUrl}" class="item-image">
            <div class="item-info">
                <h3>${item.name}</h3>
                <p>ID: ${item.id} | SKU: ${item.sku}</p>
                <p>Starting: $${item.startingBid}</p>
            </div>
            <button onclick="removeItem(${index})">🗑️</button>
        </div>
    `).join('');
    
    document.getElementById('itemCount').textContent = items.length;
}

function removeItem(index) {
    items.splice(index, 1);
    renderItems();
}

function clearForm {
    document.getElementById('itemId').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemDesc').value = '';
    document.getElementById('itemSku').value = '';
    document.getElementById('startingBid').value = '';
    currentImage = null;
    document.getElementById('previewImage').style.display = 'none';
}

// Export WooCommerce CSV
function exportToWooCommerce() {
    if (items.length === 0) {
        alert('No items to export!');
        return;
    }
    
    const header = ['ID', 'Type', 'SKU', 'Name', 'Description', 'Categories', 'Images', 'Auction', 'Starting bid'];
    const rows = items.map(item => [
        '', 'auction', item.sku, item.name, item.description, 
        'Auctions', item.imageUrl, 'yes', item.startingBid
    ]);
    
    const csv = [header, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bidbarn_auctions_${Date.now()}.csv`;
    a.click();
    
    document.getElementById('importStatus').textContent = '✅ CSV downloaded!';
}
3. main.py - Python backend (Flask/FastAPI)
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses FileResponse, HTMLResponse
import os
import json
import csv
 pathlib import Path
from typing import List, Dict
import aiofiles

app = FastAPI()
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Serve static files
app.mount("/static", StaticFiles(directory="."), name="static")

@app.get("/", response_class=HTMLResponse)
async def get_index():
    return open("index.html").read()

@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Handle image uploads from the app"""
    try:
        file_path = UPLOAD_DIR / file.filename
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
        
        # Return WordPress-compatible URL
        return {
            "success": True,
            "image_url": f"https://bidbarn.bid/uploads/{file.filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/batch-upload")
async def batch_upload(items: List[Dict]):
    """Process batch item upload to WooCommerce"""
    # Import WooCommerce API
    from woocommerce import API
    
    wcapi = API(
        url="https://bidbarn.bid",
        consumer_key="YOUR_WC_CONSUMER_KEY",
        consumer_secret="YOUR_WC_CONSUMER_SECRET",
        version="wc/v3"
    )
    
    results = []
    for item in items:
        # Upload image to WordPress first
        image_id = None
        if item.get('image_url'):
            # Create product with image
            data = {
                "name": item['name'],
                "sku": item['sku'],
                "description": item['description'],
                "regular_price": str(item['starting_bid']),
                "images": [{"src": item['image_url']}],
                "meta_data": [{"key": "_auction", "value": "yes"}]
            }
        else:
            data = {
                "name": item['name'],
                "sku": item['sku'],
                "description": item['description'],
                "regular_price": str(item['starting_bid']),
                "meta_data": [{"key": "_auction", "value": "yes"}]
            }
        
        response = wcapi.post("products", data)
        results.append(response.json())
    
    return {"success": True, "results": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
