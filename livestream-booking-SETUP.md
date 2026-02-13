# StreamMatch - Google Sheets Backend Setup

## Overview
This sets up a Google Sheets backend for the StreamMatch livestream booking app.

---

## Step 1: Create Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it "StreamMatch Database" (or any name you prefer)

---

## Step 2: Set Up the Apps Script

1. In your Google Sheet, go to **Extensions > Apps Script**
2. Delete any existing code in the editor
3. Copy the entire contents of `livestream-booking-backend.gs` and paste it
4. Click **Save** (Ctrl+S or Cmd+S)
5. Name the project "StreamMatch Backend"

---

## Step 3: Initialize the Sheets

1. In the Apps Script editor, find the function dropdown at the top (says "Select function")
2. Select **`initializeSheets`**
3. Click **Run**
4. Grant permissions when prompted:
   - Click "Review Permissions"
   - Choose your Google account
   - Click "Advanced" > "Go to StreamMatch Backend (unsafe)"
   - Click "Allow"
5. Go back to your Google Sheet - you should now see 4 tabs:
   - Sellers
   - Affiliates
   - Slots
   - Bookings

---

## Step 4: Deploy as Web App

1. In Apps Script, click **Deploy > New deployment**
2. Click the gear icon next to "Select type" and choose **Web app**
3. Configure:
   - **Description**: "StreamMatch API v1"
   - **Execute as**: Me
   - **Who has access**: Anyone
4. Click **Deploy**
5. **Copy the Web app URL** - it looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## Step 5: Update the HTML File

1. Open `livestream-booking.html`
2. Find line ~727 with `const API_URL = '...'`
3. Replace the URL with your new deployment URL:
   ```javascript
   const API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
   ```
4. Save the file

---

## Step 6: Test

1. Open `livestream-booking.html` in a browser
2. Try logging in as a Seller
3. Toggle some slots
4. Check your Google Sheet - data should appear in the Slots tab

---

## Sheet Structure

### Sellers
| id | name | createdAt |
|----|------|-----------|
| abc123 | Shop A | 2026-01-29T10:00:00Z |

### Affiliates
| id | name | createdAt |
|----|------|-----------|
| xyz789 | Streamer B | 2026-01-29T10:30:00Z |

### Slots
| id | sellerId | sellerName | date | startTime | endTime | description | createdAt |
|----|----------|------------|------|-----------|---------|-------------|-----------|
| slot001 | abc123 | Shop A | 2026-02-15 | 20:00 | 21:00 | | 2026-01-29T11:00:00Z |

### Bookings
| id | slotId | sellerId | sellerName | affiliateId | affiliateName | date | startTime | endTime | bookedAt |
|----|--------|----------|------------|-------------|---------------|------|-----------|---------|----------|
| book001 | slot001 | abc123 | Shop A | xyz789 | Streamer B | 2026-02-15 | 20:00 | 21:00 | 2026-01-29T12:00:00Z |

---

## Troubleshooting

### "Script function not found"
- Make sure you saved the Apps Script code
- Re-deploy after making changes

### CORS errors
- The script is set up to handle CORS via GET requests
- Make sure "Who has access" is set to "Anyone"

### Data not saving
- Check the Apps Script execution logs: View > Executions
- Verify sheet names match exactly: Sellers, Affiliates, Slots, Bookings

### Need to update the code?
- After editing the Apps Script, you must create a **new deployment**
- Or use "Manage deployments" > Edit > Version: New version > Deploy

---

## API Endpoints

All endpoints use GET with query parameters:

| Action | Parameters | Description |
|--------|------------|-------------|
| `getAllData` | none | Returns all sellers, affiliates, slots, bookings |
| `addSeller` | `data={JSON}` | Add a new seller |
| `addAffiliate` | `data={JSON}` | Add a new affiliate |
| `addSlot` | `data={JSON}` | Add a new slot |
| `addBooking` | `data={JSON}` | Add a new booking |
| `deleteSlot` | `id=xxx` | Delete a slot |
| `deleteBooking` | `id=xxx` | Delete a booking |

Example:
```
https://script.google.com/.../exec?action=getAllData
```
