
# Scaler Auto Accept (Playwright + TypeScript)

Automates the Scaler TA dashboard to:

1. Open the **Open Pool** tab
2. Click **View & Accept Request**
3. Select the first radio slot in the modal
4. Optionally click final **Accept** (if present)

Includes a scheduler to run **every 5 minutes**.

---

## Prerequisites

- Node.js 18+
- `npm`

## Install

```bash
npm install
npx playwright install
```

## One-time Authentication

Run once interactively to save your login session:

```bash
npm run auth
```

A browser will open. Log in to Scaler. Once the dashboard loads and the **Open Pool** tab appears, the script will save `storageState.json`.

## Run Continuously (Node-based cron)

```bash
npm run build
npm run start
```

By default runs headless every 5 minutes. To watch it run (headful):

**macOS/Linux:**
```bash
HEADFUL=1 npm run start
```

**Windows (PowerShell):**
```powershell
$env:HEADFUL="1"; npm run start
```

## OS Cron (optional)

After `npm run build`, add to your crontab:

```
*/5 * * * * /usr/bin/node /absolute/path/to/scaler-auto-accept/dist/index.js >> /absolute/path/to/scaler-auto-accept/cron.log 2>&1
```

## Files

- `src/auth.ts` – interactive login to create `storageState.json`
- `src/worker.ts` – core automation (clicks tab/button/radio, optional confirm)
- `src/index.ts` – scheduler every 5 minutes with overlap protection

## Notes

- Selectors used:
  - `li[data-ga-label="open_pool_hr"]`
  - `button[data-ga-label="accept-request-open-pool"]`
  - `input[ng-model="chrAcceptOpenPoolModal.selectedSlot"]`
- If UI changes, the script has text-based fallbacks as well. Adjust as needed.
- Error screenshots are saved as `error-<timestamp>.png` for debugging.

## Troubleshooting

- If the site resists headless automation, set `HEADFUL=1`.
- If session expires, rerun `npm run auth`.
- Increase timeouts by editing `context.setDefaultTimeout(30000)` in `src/worker.ts`.




pkill -9 "Google Chrome" && sleep 3 && /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile &


//////////////////
killall "Google Chrome" && sleep 2 && /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile &
