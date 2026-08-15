const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const email = process.env.UNITY_EMAIL;
  const password = process.env.UNITY_PASSWORD;
  const alfPath = process.env.ALF_PATH || './Unity_v2022.alf';

  if (!email || !password) {
    console.error('Missing UNITY_EMAIL or UNITY_PASSWORD');
    process.exit(1);
  }

  if (!fs.existsSync(alfPath)) {
    console.error(`ALF file not found: ${alfPath}`);
    process.exit(1);
  }

  console.log('[INFO] Starting Unity license activation...');
  console.log(`[INFO] ALF file: ${alfPath}`);
  console.log(`[INFO] Email: ${email}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    // Step 1: Navigate to manual activation page
    console.log('[INFO] Navigating to https://license.unity3d.com/manual');
    await page.goto('https://license.unity3d.com/manual', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: 'step1_landing.png' });
    console.log('[INFO] Page loaded, screenshot saved');

    // Step 2: Login - Unity uses a two-step login (email first, then password)
    console.log('[INFO] Starting login process...');

    // Wait for the email input field - Unity login page
    // The page might redirect to id.unity.com for login
    await page.waitForSelector('input[type="email"], input[name="email"], #conversations_create_session_form_email', { timeout: 30000 });
    
    // Type email
    const emailInput = await page.$('input[type="email"], input[name="email"], #conversations_create_session_form_email');
    if (emailInput) {
      await emailInput.type(email, { delay: 50 });
      console.log('[INFO] Email entered');
    }
    
    await page.screenshot({ path: 'step2_email.png' });

    // Click Continue/Next button
    const continueBtn = await page.$('button[type="submit"], input[type="submit"], button[data-testid="continue-button"], #continue-button');
    if (continueBtn) {
      await continueBtn.click();
      console.log('[INFO] Continue button clicked');
    } else {
      // Try pressing Enter
      await page.keyboard.press('Enter');
      console.log('[INFO] Enter key pressed');
    }

    // Wait for password field
    await page.waitForSelector('input[type="password"], #conversations_create_session_form_password', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    
    const passwordInput = await page.$('input[type="password"], #conversations_create_session_form_password');
    if (passwordInput) {
      await passwordInput.type(password, { delay: 50 });
      console.log('[INFO] Password entered');
    }

    await page.screenshot({ path: 'step3_password.png' });

    // Submit password
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log('[INFO] Submit button clicked');
    } else {
      await page.keyboard.press('Enter');
    }

    // Wait for navigation after login
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('[INFO] No navigation after login, checking current page...');
    });
    
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: 'step4_after_login.png' });
    console.log('[INFO] After login screenshot saved');
    console.log(`[INFO] Current URL: ${page.url()}`);

    // Step 3: Upload .alf file
    // Look for file input on the manual activation page
    console.log('[INFO] Looking for file upload...');
    
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(alfPath);
      console.log('[INFO] ALF file uploaded');
    } else {
      console.log('[INFO] No file input found, trying to navigate to manual page...');
      await page.goto('https://license.unity3d.com/manual', { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 2000));
      
      const fileInput2 = await page.$('input[type="file"]');
      if (fileInput2) {
        await fileInput2.uploadFile(alfPath);
        console.log('[INFO] ALF file uploaded (second attempt)');
      } else {
        await page.screenshot({ path: 'error_no_fileinput.png' });
        console.error('[ERROR] No file input found on page');
        throw new Error('No file input found');
      }
    }

    await page.screenshot({ path: 'step5_file_uploaded.png' });

    // Click Next/Continue after upload
    const nextBtn = await page.$('button[type="submit"], input[type="submit"], button[type="button"]');
    if (nextBtn) {
      await nextBtn.click();
      console.log('[INFO] Next button clicked after file upload');
    }
    
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: 'step6_after_upload.png' });
    console.log(`[INFO] Current URL: ${page.url()}`);

    // Step 4: CSS Unlock - reveal Personal Edition option
    console.log('[INFO] Applying CSS unlock for Personal Edition...');
    await page.evaluate(() => {
      // Unhide all hidden elements that might be the Personal option
      document.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach(el => {
        el.style.display = 'block';
      });
      
      // Specifically target the personal option class
      const personal = document.querySelector('.option-personal');
      if (personal) {
        personal.style.display = 'block';
        personal.style.visibility = 'visible';
        personal.style.opacity = '1';
      }
    });

    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'step7_css_unlock.png' });
    console.log('[INFO] CSS unlock applied');

    // Step 5: Select Personal Edition
    // Look for radio buttons or links related to Personal
    const personalRadio = await page.$('input[value="personal"], .option-personal input, #license_personal');
    if (personalRadio) {
      await personalRadio.click();
      console.log('[INFO] Personal Edition selected');
    } else {
      // Try clicking on the personal option div
      await page.evaluate(() => {
        const personal = document.querySelector('.option-personal');
        if (personal) personal.click();
      });
      console.log('[INFO] Clicked personal option div');
    }

    await page.screenshot({ path: 'step8_personal_selected.png' });

    // Click Next
    const nextBtn2 = await page.$('button[type="submit"], input[type="submit"], a.btn-primary, button.btn-primary');
    if (nextBtn2) {
      await nextBtn2.click();
      console.log('[INFO] Next clicked after Personal selection');
    }

    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'step9_after_personal.png' });

    // Step 6: Select "I don't use Unity in a professional capacity"
    const nonProRadio = await page.$('input[value="non_pro"], input[id*="non"], label[id*="non"] input');
    if (nonProRadio) {
      await nonProRadio.click();
      console.log('[INFO] Non-professional option selected');
    } else {
      // Try clicking by text content
      await page.evaluate(() => {
        const labels = document.querySelectorAll('label, div, span');
        for (const label of labels) {
          if (label.textContent && label.textContent.includes("don't use Unity in a professional")) {
            label.click();
            break;
          }
        }
      });
      console.log('[INFO] Non-professional option selected by text');
    }

    await page.screenshot({ path: 'step10_nonpro.png' });

    // Click Next/Download
    const downloadBtn = await page.$('button[type="submit"], input[type="submit"], a[download], a.btn-primary, button.btn-primary');
    if (downloadBtn) {
      await downloadBtn.click();
      console.log('[INFO] Download/Create button clicked');
    }

    // Wait for download
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: 'step11_download.png' });

    // Step 7: Find the .ulf file
    const ulfFile = fs.readdirSync('.').find(f => f.endsWith('.ulf'));
    if (ulfFile) {
      const content = fs.readFileSync(ulfFile, 'utf-8');
      console.log('[INFO] ULF file found:', ulfFile);
      console.log('=== ULF CONTENT START ===');
      console.log(content);
      console.log('=== ULF CONTENT END ===');
      
      // Write to a known location
      fs.writeFileSync('Unity_lic.ulf', content);
      console.log('[INFO] ULF saved as Unity_lic.ulf');
    } else {
      // Check downloads directory
      const downloads = fs.readdirSync('/tmp').filter(f => f.endsWith('.ulf'));
      if (downloads.length > 0) {
        const content = fs.readFileSync(path.join('/tmp', downloads[0]), 'utf-8');
        console.log('=== ULF CONTENT START ===');
        console.log(content);
        console.log('=== ULF CONTENT END ===');
        fs.writeFileSync('Unity_lic.ulf', content);
      } else {
        console.error('[ERROR] No .ulf file found');
        await page.screenshot({ path: 'error_no_ulf.png' });
        throw new Error('No .ulf file generated');
      }
    }

  } catch (err) {
    console.error('[ERROR]', err.message);
    await page?.screenshot({ path: 'error.png' }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
})();
