
import { chromium, BrowserContext, Page, Locator } from 'playwright';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const URL = 'https://www.scaler.com/academy/ta-dashboard/teaching_assistant_help_requests/';
const STORAGE = 'storageState.json';

async function ensureChromeWithDebugging(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:9222/json/version');
    if (response.ok) return true;
  } catch (e) {}
  
  // Chrome not running with debugging, try to start it
  console.log('[worker] Starting Chrome with remote debugging...');
  
  try {
    // Close existing Chrome
    await execAsync('osascript -e \'quit app "Google Chrome"\'').catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {}

  // Start Chrome with remote debugging
  try {
    execAsync('/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 > /dev/null 2>&1 &');
    
    // Wait for Chrome to be ready
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const response = await fetch('http://localhost:9222/json/version');
        if (response.ok) {
          console.log('[worker] Chrome started successfully');
          return true;
        }
      } catch (e) {}
    }
  } catch (e) {}
  
  return false;
}

async function createContext(): Promise<BrowserContext> {
  // Try to connect to existing Chrome with remote debugging
  const chromeRunning = await ensureChromeWithDebugging();
  
  if (chromeRunning) {
    console.log('[worker] Connecting to existing Chrome...');
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    return browser.contexts()[0];
  }
  
  // Fallback: launch new Chrome
  console.log('[worker] Launching new Chrome instance...');
  const headless = process.env.HEADFUL !== '1';
  const browser = await chromium.launch({
    headless,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // Use saved session if available
  const context = fs.existsSync(STORAGE)
    ? await browser.newContext({ storageState: STORAGE })
    : await browser.newContext();

  context.setDefaultTimeout(30_000);
  return context;
}

async function clickWithRetry(locator: Locator, attempts = 3): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await locator.waitFor({ state: 'visible' });
      await locator.click();
      return;
    } catch (e) {
      if (i === attempts) throw e;
      await new Promise(r => setTimeout(r, 100 * i));
    }
  }
}

export async function runOnce(): Promise<void> {
  const context = await createContext();
  
  // Try to find existing tab with the URL, or use the first page
  const pages = context.pages();
  let page: Page;
  
  if (pages.length > 0) {
    // Reuse existing tab
    page = pages[0];
    console.log('[run] Reusing existing Chrome tab');
  } else {
    // No pages available, create new one
    page = await context.newPage();
    console.log('[run] Created new tab');
  }

  try {
    console.log('[run] goto dashboard');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Check if we need to login first
    const googleLink = page.locator('a[href="/users/auth/google_oauth2/"]');
    const isLoginPage = await googleLink.isVisible().catch(() => false);
    
    if (isLoginPage) {
      console.log('[run] Not logged in, clicking Google login...');
      await googleLink.click();
      console.log('[run] Please complete Google authentication in the browser...');
      
      // Wait for redirect back to dashboard after login
      await page.waitForURL(URL, { timeout: 120_000 });
      await page.waitForLoadState('networkidle');
      console.log('[run] Login completed, continuing...');
    }

    // 1) Click "Open Pool" tab
    const openPoolTab = page.locator('li[data-ga-label="open_pool_hr"]');
    await clickWithRetry(openPoolTab);
    console.log('[run] clicked Open Pool tab');

    // 2) Click "View & Accept Request" (first one)
    let acceptBtn = page.locator('button[data-ga-label="accept-request-open-pool"]');
    if (await acceptBtn.count() === 0) {
      // Fallback by text
      acceptBtn = page.getByRole('button', { name: /view\s*&\s*accept\s*request/i });
    }
    await clickWithRetry(acceptBtn.first());
    console.log('[run] clicked View & Accept Request');

    // 3) In modal, select first radio slot
    let slotRadio = page.locator('input[ng-model="chrAcceptOpenPoolModal.selectedSlot"]');
    if (await slotRadio.count() === 0) {
      // Fallback: any visible radio inside a dialog/modal
      const dialog = page.locator('[role="dialog"], .modal, .md-dialog');
      if (await dialog.count()) {
        slotRadio = dialog.locator('input[type="radio"]');
      } else {
        slotRadio = page.locator('input[type="radio"]');
      }
    }
    await slotRadio.first().waitFor({ state: 'visible' });
    await slotRadio.first().check();
    console.log('[run] selected first available slot');

    // 4) Optional final accept / confirm button
    let confirmBtn = page.getByRole('button', { name: /accept/i });
    if (await confirmBtn.count()) {
      await confirmBtn.first().click();
      console.log('[run] clicked final Accept');
    } else {
      console.log('[run] no explicit final Accept button found (skipped)');
    }

    console.log('✅ Completed run successfully');
    
    // Don't save session when using CDP connection
    if (!await ensureChromeWithDebugging()) {
      await context.storageState({ path: STORAGE });
      console.log('[run] Session saved');
    }
  } catch (err) {
    console.error('❌ Run failed:', err);
    try {
      await page.screenshot({ path: `error-${Date.now()}.png`, fullPage: true });
      console.log('Saved error screenshot.');
    } catch {}
    throw err;
  } finally {
    // Don't close context when using CDP (it's the browser's context)
    const usingCDP = await ensureChromeWithDebugging();
    if (!usingCDP) {
      await context.close();
    }
  }
}
