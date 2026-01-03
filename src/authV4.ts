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

async function acceptRequest(page: Page) {
  // Click the button
  const acceptBtn = page.locator('button[data-ga-label="accept-request-open-pool"]').first();
  await clickWithRetry(page, acceptBtn);
  console.log('[auth] Clicked View & Accept Request');

  // Check if "Join now & Resolve" button is present
  const joinResolveBtn = page.locator('a.chr-open-request-accept-modal__join-resolve-btn');
  const joinResolveBtnCount = await joinResolveBtn.count();

  if (joinResolveBtnCount > 0) {
    // If "Join now & Resolve" button is present, click it directly
    console.log('[auth] "Join now & Resolve" button found, clicking it...');
    try {
      await joinResolveBtn.first().waitFor({ state: 'visible', timeout: 5000 });
      await joinResolveBtn.first().click();
      console.log('[auth] Clicked "Join now & Resolve" button');
      return true;
    } catch (e) {
      console.log('[auth] Failed to click "Join now & Resolve" button:', e);
      return false;
    }
  }

  // If "Join now & Resolve" button not present, proceed with radio button selection
  console.log('[auth] "Join now & Resolve" button not found, proceeding with slot selection...');
  
  // In modal, select first radio slot
  let slotRadio = page.locator('input[ng-model="chrAcceptOpenPoolModal.selectedSlot"]');
  if (await slotRadio.count() === 0) {
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
    console.log('[auth] No slot radio button found.');
    return false;
  }

  // Click submit/accept/confirm button in modal
  let confirmBtn = page.locator('div.chr-open-request-accept-modal__book-slot-btn[ng-click="submitChrAcceptOpenPoolModal()"]');
  if (await confirmBtn.count() === 0) {
    confirmBtn = page.getByRole('button', { name: /accept|submit|confirm/i });
  }
  if (await confirmBtn.count() > 0) {
    await confirmBtn.first().click();
    console.log('[auth] Clicked final Accept/Submit/Confirm');
    return true;
  } else {
    console.log('[auth] No explicit final Accept/Submit/Confirm button found');
    return false;
  }
}

(async () => {
  console.log('Connecting to existing Chrome instance via CDP...');
  
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const defaultContext = browser.contexts()[0];
  const pages = defaultContext.pages();
  const page = pages.length ? pages[0] : await defaultContext.newPage();
  
  console.log('Navigating to dashboard...');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  console.log('\n📋 If login is required, please complete it manually in the browser.');
  console.log('The script will automatically continue once you are logged in.\n');

  const openPoolTab = page.locator('li[data-ga-label="open_pool_hr"]');
  try {
    await openPoolTab.waitFor({ state: 'visible', timeout: 300_000 });
    console.log('[auth] ✅ Login detected, continuing...');
  } catch (e) {
    console.log('[auth] ❌ Login timeout. Please ensure you are logged in and try again.');
    await browser.close();
    return;
  }

  if (await openPoolTab.isVisible().catch(() => false)) {
    await clickWithRetry(page, openPoolTab);
    console.log('[auth] Clicked Open Pool tab');
  }

  // Infinite loop - continuously check for requests
  let attempt = 1;
  const waitBetweenAttempts = 60000; // 60 seconds
  
  while (true) {
    // Check if page is still open
    if (page.isClosed()) {
      console.log('[auth] ❌ Page was closed. Exiting...');
      break;
    }

    console.log(`[auth] Attempt ${attempt}: Checking for accept button...`);
    attempt++;
    
    // Reload the page to get fresh data
    try {
      await page.keyboard.down('Shift');
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      await page.keyboard.up('Shift');
    } catch (e: any) {
      if (e.message?.includes('closed') || e.message?.includes('Target')) {
        console.log('[auth] ❌ Browser/page was closed. Exiting...');
        break;
      }
      console.log('[auth] ⚠️  Page reload failed (server may be down), retrying...');
      try {
        await page.waitForTimeout(waitBetweenAttempts);
      } catch {
        console.log('[auth] ❌ Cannot wait, page closed. Exiting...');
        break;
      }
      continue;
    }
    
    // Click Open Pool tab again after reload
    if (await openPoolTab.isVisible().catch(() => false)) {
      await openPoolTab.click();
      await page.waitForTimeout(2000);
    }
    
    // Check for the button
    const acceptBtn = page.locator('button[data-ga-label="accept-request-open-pool"]');
    const buttonCount = await acceptBtn.count();
    
    if (buttonCount > 0) {
      console.log('[auth] ✅ "View & Accept Request" button found!');
      const success = await acceptRequest(page);
      if (success) {
        console.log('✅ Request accepted successfully! Continuing to monitor...\n');
      }
      // Wait a bit before checking again
      await page.waitForTimeout(5000);
      continue;
    }
    
    console.log(`[auth] Button not found. Waiting ${waitBetweenAttempts/1000}s before next check...`);
    try {
      await page.waitForTimeout(waitBetweenAttempts);
    } catch {
      console.log('[auth] ❌ Cannot wait, page closed. Exiting...');
      break;
    }
  }
  
  await browser.close();
  console.log('Script ended.');
})();
