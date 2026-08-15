const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const email = process.argv[2];
  const password = process.argv[3];
  const alfPath = process.argv[4];

  if (!email || !password || !alfPath) {
    console.error('Usage: node activate.js <email> <password> <alf-file-path>');
    process.exit(1);
  }

  if (!fs.existsSync(alfPath)) {
    console.error(`ALF file not found: ${alfPath}`);
    process.exit(1);
  }

  console.log(`[INFO] ALF file: ${alfPath} (${fs.statSync(alfPath).size} bytes)`);
  console.log('[INFO] Launching browser...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Step 1: Navigate to license page
    console.log('[INFO] Navigating to https://license.unity3d.com/manual');
    await page.goto('https://license.unity3d.com/manual', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Login - enter email
    console.log('[INFO] Entering email...');
    const emailInput = await page.waitForSelector('input[type="email"], input[name="email"], input[type="text"]', { visible: true });
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 50 });

    // Click Continue button
    const continueBtn = await page.waitForSelector('button[type="submit"], button:not([disabled])', { visible: true });
    await continueBtn.click();
    await new Promise(r => setTimeout(r, 3000));

    // Step 3: Enter password
    console.log('[INFO] Entering password...');
    const pwdInput = await page.waitForSelector('input[type="password"]', { visible: true });
    await pwdInput.click({ clickCount: 3 });
    await pwdInput.type(password, { delay: 50 });

    // Click Sign in button
    const signInBtn = await page.waitForSelector('button[type="submit"]', { visible: true });
    await signInBtn.click();
    await new Promise(r => setTimeout(r, 5000));

    // Check if we're on the upload page
    console.log('[INFO] Checking for upload page...');
    const currentUrl = page.url();
    console.log(`[INFO] Current URL: ${currentUrl}`);

    // Wait for the upload page to load
    await new Promise(r => setTimeout(r, 3000));

    // Step 4: Upload .alf file using CDP
    console.log('[INFO] Uploading .alf file...');
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      // Use CDP to set the file on the input element
      await fileInput.uploadFile(alfPath);
      console.log('[INFO] File uploaded via input element');
    } else {
      // Try clicking Browse button and intercepting the file chooser
      console.log('[INFO] No file input found, trying file chooser interception...');
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 10000 }),
        page.evaluate(() => {
          // Try to click any browse/upload button
          const btns = document.querySelectorAll('button, [role="button"]');
          for (const b of btns) {
            if (b.textContent.toLowerCase().includes('browse') || b.textContent.toLowerCase().includes('upload')) {
              b.click();
              return;
            }
          }
          // Try clicking on the file input area
          const dropArea = document.querySelector('[class*="upload"], [class*="browse"], [class*="file"]');
          if (dropArea) dropArea.click();
        })
      ]);
      await fileChooser.accept([alfPath]);
      console.log('[INFO] File uploaded via file chooser');
    }

    await new Promise(r => setTimeout(r, 3000));

    // Step 5: Click Next button
    console.log('[INFO] Clicking Next...');
    const nextBtn = await page.evaluateHandle(() => {
      const btns = document.querySelectorAll('button, [role="button"], input[type="submit"]');
      for (const b of btns) {
        if (b.textContent.toLowerCase().includes('next') || b.textContent.toLowerCase().includes('submit') || b.textContent.toLowerCase().includes('download')) {
          return b;
        }
      }
      return btns[btns.length - 1]; // fallback to last button
    });

    if (nextBtn) {
      await nextBtn.click();
      console.log('[INFO] Clicked Next/Download button');
    }
    await new Promise(r => setTimeout(r, 5000));

    // Step 6: Handle the license type selection (if needed)
    // The page might ask to select a license type
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('[INFO] Page text after Next:', pageText.substring(0, 500));

    // Look for "Personal" license option
    if (pageText.toLowerCase().includes('personal') || pageText.toLowerCase().includes('license type')) {
      console.log('[INFO] License type selection page detected');
      const personalBtn = await page.evaluateHandle(() => {
        const btns = document.querySelectorAll('button, [role="button"], label, [class*="option"], [class*="license"]');
        for (const b of btns) {
          if (b.textContent.toLowerCase().includes('personal')) {
            b.click();
            return b;
          }
        }
        return null;
      });
      await new Promise(r => setTimeout(r, 2000));

      // Click Next/Continue on license type page
      const continueBtn2 = await page.evaluateHandle(() => {
        const btns = document.querySelectorAll('button, [role="button"]');
        for (const b of btns) {
          if (!b.disabled && (b.textContent.toLowerCase().includes('next') || b.textContent.toLowerCase().includes('continue'))) {
            return b;
          }
        }
        return btns[btns.length - 1];
      });
      if (continueBtn2) {
        await continueBtn2.click();
      }
      await new Promise(r => setTimeout(r, 5000));
    }

    // Step 7: Download .ulf file
    console.log('[INFO] Looking for .ulf download...');

    // Set up download handler
    const downloadPath = path.resolve('.');
    await page.evaluate(() => {
      window.__ulfDownloaded = false;
    });

    // Listen for download
    page.on('response', async (response) => {
      const url = response.url();
      const headers = response.headers();
      if (headers['content-disposition'] && headers['content-disposition'].includes('.ulf')) {
        console.log(`[INFO] Found .ulf response: ${url}`);
        const buffer = await response.buffer();
        const ulfPath = path.join(downloadPath, 'UnityLicense.ulf');
        fs.writeFileSync(ulfPath, buffer);
        console.log(`[INFO] .ulf file saved to: ${ulfPath}`);
        window.__ulfDownloaded = true;
      }
    });

    // Also check if a download button appeared
    const downloadBtn = await page.evaluateHandle(() => {
      const btns = document.querySelectorAll('button, [role="button"], a');
      for (const b of btns) {
        if (b.textContent.toLowerCase().includes('download') || b.textContent.toLowerCase().includes('ulf')) {
          return b;
        }
      }
      return null;
    });

    if (downloadBtn) {
      console.log('[INFO] Clicking download button...');
      await downloadBtn.click();
      await new Promise(r => setTimeout(r, 5000));
    }

    // Check if .ulf was downloaded
    const ulfFiles = fs.readdirSync(downloadPath).filter(f => f.endsWith('.ulf'));
    if (ulfFiles.length > 0) {
      console.log(`[INFO] SUCCESS! .ulf file found: ${ulfFiles[0]}`);
      console.log(`[ULF_PATH] ${path.join(downloadPath, ulfFiles[0])}`);
    } else {
      // Try to find .ulf in any subdirectory
      const allUlf = require('child_process').execSync('find . -name "*.ulf" -print -quit').toString().trim();
      if (allUlf) {
        console.log(`[INFO] SUCCESS! .ulf file found: ${allUlf}`);
        console.log(`[ULF_PATH] ${allUlf}`);
      } else {
        console.log('[ERROR] No .ulf file was downloaded');
        // Take a screenshot for debugging
        await page.screenshot({ path: 'error.png' });
        console.log('[ERROR] Screenshot saved to error.png');
        process.exit(1);
      }
    }

  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    await page.screenshot({ path: 'error.png' }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
