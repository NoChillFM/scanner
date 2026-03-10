# Inventory Scanner Tool

A lightweight browser-based inventory scanning app for CSV-driven device lookup and progress tracking.

## Overview

This app lets you upload an inventory CSV, scan device identifiers (inventory ID or serial), and instantly see whether each device is found. It tracks scan progress, organization-level completion, and restores session data from browser storage.

## Current Project Structure

- `index.html` — Single-page UI (layout + styles)
- `app.js` — Core application logic (state, parsing, scanning, rendering, persistence)
- `example.csv` — Sample inventory export format

---

## Features

### 1. CSV Upload and Parsing
- Uploads `.csv` via a custom styled file button
- Parses CSV safely with quoted value support
- Uses header-based row mapping
- Indexes rows by:
  - `inventory_id`
  - `serial_number`

### 2. Instant Scanner Input Handling
- Hidden input field optimized for scanner workflows
- Enter-triggered scan processing
- Supports burst token parsing from one input (space/comma/semicolon/newline separated)
- Immediate status feedback:
  - **Found** (green)
  - **Not found** (red)

### 3. Scan Metrics
- **Scans** = unique scan inputs
- **Found** = unique matched inventory IDs
- **Missing** = total indexed inventory IDs minus found IDs

### 4. Organization Progress Pills
- Compact per-organization pills
- Shows `found/total` per organization
- State styling:
  - idle
  - partial
  - complete

### 5. Device List + Filters
- Device list renderer exists in code
- Filter controls exist for:
  - text search
  - status
  - organization
  - category
- By default, list is hidden (`DEVICE_LIST_DEFAULT_VISIBLE = false`) for performance

### 6. Persistent Session (Browser Cache)
- Uses `localStorage`
- Restores previous session automatically:
  - CSV rows
  - scanned inputs
  - found IDs
- Persists theme preference (light/dark)
- Debounced save mechanism to reduce scan latency

### 7. New CSV Replacement Confirmation
- If a session is already active, uploading a new CSV prompts confirmation
- Confirming replacement clears prior session state and loads new data

### 8. Mobile-Friendly UI
- Compact card layout
- Responsive text and spacing
- Hidden scanner input with visible scanner activity indicator
- Touch-friendly controls

---

## Functional Breakdown (`app.js`)

## State and Constants
- `THEME_KEY`, `SESSION_KEY`
- `knownByInventoryId: Map`
- `knownBySerial: Map`
- `orgStats: Map`
- `allRows: Array`
- `uniqueScannedInputs: Set`
- `uniqueFoundIds: Set`
- `DEVICE_LIST_DEFAULT_VISIBLE` (currently `false`)

## Theme
- `setTheme(theme)`
- `initTheme()`

## CSV Parsing
- `parseCsvLine(line)`
- `parseCsv(text)`

## Persistence
- `saveSession()`
- `saveSessionDeferred()`
- `loadSession()`
- `clearSession()`

## Indexing and Data Loading
- `getOrgName(row)`
- `getCategory(row)`
- `buildIndexes(rows)`
- `loadNewCsv(text)`

## Metrics and Rendering
- `getMissingCount()`
- `updateStatsUI()`
- `renderOrgGrid()`
- `markFoundInOrg(row)`
- `populateFilterDropdowns()`
- `getFilteredRows()`
- `renderDeviceList()`
- `refreshAllUI()`

## Scan Pipeline
- `findMatch(raw)`
- `processScan(inputValue)`
- `parseScanBuffer(value)`

## UX Helpers
- `vibrate(pattern)`
- `setStatus(msg, type)`
- `focusScannerInput()`
- `blurScannerIndicator()`
- `showConfirm()`
- `hideConfirm()`

## Event Wiring
- Theme toggle click
- File button and CSV file change
- Confirm modal cancel/replace
- Scanner Enter key handling
- Focus/blur scanner indicator behavior
- Global click-to-refocus scanner
- Filter input/change listeners

---

## CSV Column Expectations

The app is most useful when CSV includes at least:
- `inventory_id`
- `serial_number`
- `organization_name`
- `category`
- `product_title`

Additional columns are preserved in row objects but not all are rendered.

---

## Performance Notes

Recent optimizations reduce scan latency by:
- Processing scan tokens in-memory first
- Applying immediate UI feedback first (`setStatus`, metrics, vibration)
- Deferring heavier operations (`renderOrgGrid`, persistence) via async scheduling
- Debouncing `localStorage` writes (`saveSessionDeferred`)
- Keeping device list hidden by default

---

## Running the App

1. Open `index.html` in a browser
2. Click **Choose File** and upload a CSV
3. Scan into the hidden scanner input workflow (scanner should send Enter)
4. View live status + metrics + organization progress

---

## Potential Next Improvements

- Add explicit **Show/Hide Device List** toggle
- Virtualize large device lists for ultra-large CSVs
- Add export of found/missing subsets
- Add keyboard shortcuts for quick filter reset
- Add diagnostics panel for scan throughput timing
