import { chromium } from 'playwright';
import type { Page, Locator } from 'playwright';

const URL = 'https://www.scaler.com/academy/ta-dashboard/teaching_assistant_help_requests/';

// Helper to click with retries
async function clickWithRetry(page: Page, locator: Locator, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.click();
      return;
    } catch (e) {
      if (i === attempts) throw e;
      await new Promise(r => setTimeout(r, 500 * i));
    }
  }
}

(async () => {
  console.log('Connecting to existing Chrome instance via CDP...');
  
  // Connect to Chrome running with remote debugging on port 9222
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  
  // Get the default context (your existing browser session)
  const defaultContext = browser.contexts()[0];
  
  // Reuse existing tab or create new one
  const pages = defaultContext.pages();
  const page = pages.length ? pages[0] : await defaultContext.newPage();
  
  console.log('Navigating to dashboard...');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  console.log('\n📋 If login is required, please complete it manually in the browser.');
  console.log('The script will automatically continue once you are logged in.\n');

  // Wait for user to be logged in - check for dashboard elements
  const openPoolTab = page.locator('li[data-ga-label="open_pool_hr"]');
  try {
    await openPoolTab.waitFor({ state: 'visible', timeout: 300_000 }); // 5 minute timeout
    console.log('[auth] ✅ Login detected, continuing...');
  } catch (e) {
    console.log('[auth] ❌ Login timeout. Please ensure you are logged in and try again.');
    await browser.close();
    return;
  }

  // 1) Click "Open Pool" tab if present
  if (await openPoolTab.isVisible().catch(() => false)) {
    await clickWithRetry(page, openPoolTab);
    console.log('[auth] Clicked Open Pool tab');
  }

  // 2) Continuously check for "View & Accept Request" button
  console.log('[auth] Checking for "View & Accept Request" button...');
  let acceptBtn: Locator | undefined;
  let buttonFound = false;
  const maxAttempts = 600000; // Check for up to 60 attempts
  const waitBetweenAttempts = 60000; // 50 seconds between checks
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[auth] Attempt ${attempt}/${maxAttempts}: Checking for accept button...`);
    
    // Reload the page to get fresh data
    try {
    await page.keyboard.down('Shift');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.keyboard.up('Shift');
    } catch (e) {
    console.log('[auth] ⚠️  Page reload failed (server may be down), retrying...');
    await page.waitForTimeout(waitBetweenAttempts);
    continue;
    }
    
    // Click Open Pool tab again after reload
    if (await openPoolTab.isVisible().catch(() => false)) {
      await openPoolTab.click();
      await page.waitForTimeout(2000); // Wait for tab content to load
    }
    
    // Check for the button
    acceptBtn = page.locator('button[data-ga-label="accept-request-open-pool"]');
    const buttonCount = await acceptBtn.count();
    
    if (buttonCount > 0) {
      console.log('[auth] ✅ "View & Accept Request" button found!');
      buttonFound = true;
      break;
    }
    
    console.log(`[auth] Button not found. Waiting ${waitBetweenAttempts/1000}s before next check...`);
    await page.waitForTimeout(waitBetweenAttempts);
  }
  
  if (!buttonFound) {
    console.log('[auth] ❌ "View & Accept Request" button not found after all attempts. Exiting.');
    await browser.close();
    return;
  }
  
  // Click the button
  if (acceptBtn) {
    await clickWithRetry(page, acceptBtn.first());
    console.log('[auth] Clicked View & Accept Request');
  }

  // 3) In modal, select first radio slot
  let slotRadio = page.locator('input[ng-model="chrAcceptOpenPoolModal.selectedSlot"]');
  if (await slotRadio.count() === 0) {
    // Fallback: any visible radio inside a dialog/modal
    const dialog = page.locator('[role="dialog"], .modal, .md-dialog');
    if (await dialog.count()) {
      slotRadio = dialog.locator('input[type="radio"]');
    }
  }
  if (await slotRadio.count() > 0) {
    await slotRadio.first().waitFor({ state: 'visible' });
    await slotRadio.first().check();
    console.log('[auth] Selected first available slot');
  } else {
    console.log('[auth] No slot radio button found. Exiting.');
    await browser.close();
    return;
  }

  // 4) Click submit/accept/confirm button in modal
  let confirmBtn = page.locator('div.chr-open-request-accept-modal__book-slot-btn[ng-click="submitChrAcceptOpenPoolModal()"]');
  if (await confirmBtn.count() === 0) {
    // Fallback to generic selector
    confirmBtn = page.getByRole('button', { name: /accept|submit|confirm/i });
  }
  if (await confirmBtn.count() > 0) {
    await confirmBtn.first().click();
    console.log('[auth] Clicked final Accept/Submit/Confirm');
  } else {
    console.log('[auth] No explicit final Accept/Submit/Confirm button found (skipped)');
  }

  // Disconnect without closing Chrome
  await browser.close();
  console.log('✅ Flow completed. Chrome remains open.');
})();