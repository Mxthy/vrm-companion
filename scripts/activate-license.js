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
  console.log('[INFO] Launching browser with stealth settings...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(90000);

  // Set realistic user agent and headers to avoid headless detection
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => {
    // Overwrite the `navigator.webdriver` property to avoid detection
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Add a fake `plugins` array
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    // Add a fake `languages` array
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  // Configure download behavior
  const downloadPath = process.cwd();
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });

  try {
    // Step 1: Navigate to license page
    console.log('[INFO] Navigating to https://license.unity3d.com/manual');
    await page.goto('https://license.unity3d.com/manual', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for page to fully load
    await new Promise((r) => setTimeout(r, 3000));

    // Check if we need to login (redirected to login page)
    const currentUrl = page.url();
    console.log(`[INFO] Current URL after navigation: ${currentUrl}`);

    // Check if we're on the upload page already (already logged in)
    const hasLicenseField = await page.$('input[name="licenseFile"]');
    if (hasLicenseField) {
      console.log('[INFO] Already on upload page - skipping login');
    } else {
      // Need to login
      console.log('[INFO] Login required...');

      // Wait for page to load
      await new Promise((r) => setTimeout(r, 2000));

      // Try to find the email input field
      console.log('[INFO] Looking for email input...');
      let emailInput = await page.$('input[type="email"]');
      
      if (!emailInput) {
        // Try other selectors
        emailInput = await page.$('input[name="email"], input[name="conversations_create_session_form[email]"], input[type="text"]');
      }
      
      if (!emailInput) {
        // Maybe we need to click a "sign in" or "login" link first
        console.log('[INFO] No email input found, looking for login link...');
        const loginLink = await page.$('a[href*="login"], a[href*="sign-in"], a[rel="nofollow"]');
        if (loginLink) {
          await loginLink.click();
          await new Promise((r) => setTimeout(r, 3000));
          emailInput = await page.$('input[type="email"], input[type="text"]');
        }
      }

      if (!emailInput) {
        console.log('[ERROR] Could not find email input field');
        await page.screenshot({ path: 'error.png', fullPage: true });
        const html = await page.content();
        fs.writeFileSync('error.html', html);
        console.log('[ERROR] Screenshot and HTML saved');
        process.exit(1);
      }

      // Enter email
      console.log('[INFO] Entering email...');
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email, { delay: 30 });

      // Click Continue/Submit
      console.log('[INFO] Clicking continue...');
      let submitBtn = await page.$('button[type="submit"], input[type="submit"], button:not([disabled])');
      if (submitBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
          submitBtn.click(),
        ]);
      }

      await new Promise((r) => setTimeout(r, 5000));

      // Check for security check
      let url = page.url();
      console.log(`[INFO] After email submit, URL: ${url}`);

      if (url.includes('security-check') || url.includes('security')) {
        console.log('[INFO] Security check page detected!');
        console.log('[INFO] Waiting for security check to complete...');
        await new Promise((r) => setTimeout(r, 15000));
        
        // Take a screenshot to see what's on the page
        await page.screenshot({ path: 'security_check.png', fullPage: true });
        console.log('[INFO] Security check screenshot saved');
        
        // Get page text to understand what the security check is
        const pageText = await page.evaluate(() => document.body.innerText);
        console.log(`[INFO] Security check page text: ${pageText.substring(0, 500)}`);
        
        // Try to find a verification code input
        const codeInput = await page.$('input[type="text"], input[type="tel"], input[name*="code"], input[name*="verify"], input[name*="otp"]');
        if (codeInput) {
          console.log('[INFO] Verification code input found!');
          // Try to read verification code from email via IMAP
          console.log('[INFO] Attempting to read verification code from email...');
          try {
            const { execSync } = require('child_process');
            // Use Python to read email via IMAP
            execSync(`pip install imap-tools 2>/dev/null`, { stdio: 'ignore' });
            const code = execSync(
              `python3 -c "
import imaplib, email, re, time, sys
from email.header import decode_header

# Try Gmail IMAP
mail = imaplib.IMAP4_SSL('imap.gmail.com')
mail.login('${email}', '${password}')
mail.select('inbox')

# Search for recent Unity emails
status, messages = mail.search(None, '(FROM "unity" UNSEEN)')
if status != 'OK':
    # Try all recent
    status, messages = mail.search(None, '(FROM "unity")')
    
mail_ids = messages[0].split()
for mid in reversed(mail_ids[-5:]):
    status, msg_data = mail.fetch(mid, '(RFC822)')
    for response_part in msg_data:
        if isinstance(response_part, tuple):
            msg = email.message_from_bytes(response_part[1])
            body = ''
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == 'text/plain':
                        body = part.get_payload(decode=True).decode(errors='replace')
                        break
            else:
                body = msg.get_payload(decode=True).decode(errors='replace')
            # Find verification code (usually 6 digits)
            codes = re.findall(r'\\b(\\d{6})\\b', body)
            if codes:
                print(codes[0])
                sys.exit(0)
print('NO_CODE')
"`,
              { timeout: 30000 }
            ).toString().trim();
            
            if (code && code !== 'NO_CODE') {
              console.log(`[INFO] Verification code found: ${code}`);
              await codeInput.type(code, { delay: 50 });
              const verifyBtn = await page.$('button[type="submit"], input[type="submit"], button:not([disabled])');
              if (verifyBtn) {
                await Promise.all([
                  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
                  verifyBtn.click(),
                ]);
              }
            } else {
              console.log('[ERROR] No verification code found in email');
              await page.screenshot({ path: 'error.png', fullPage: true });
              process.exit(1);
            }
          } catch (imapErr) {
            console.log(`[ERROR] IMAP failed: ${imapErr.message}`);
            await page.screenshot({ path: 'error.png', fullPage: true });
            process.exit(1);
          }
        } else {
          // Maybe it's just a loading page, wait more
          console.log('[INFO] No code input found, waiting more...');
          await new Promise((r) => setTimeout(r, 15000));
          url = page.url();
          console.log(`[INFO] After waiting, URL: ${url}`);
        }
      }

      // Enter password
      console.log('[INFO] Looking for password field...');
      let pwdInput = await page.$('input[type="password"]');
      
      if (!pwdInput) {
        // Wait more and try again
        await new Promise((r) => setTimeout(r, 5000));
        pwdInput = await page.$('input[type="password"]');
      }
      
      if (!pwdInput) {
        console.log('[ERROR] Could not find password input');
        await page.screenshot({ path: 'error.png', fullPage: true });
        const html = await page.content();
        fs.writeFileSync('error.html', html);
        console.log(`[INFO] Page text: ${(await page.evaluate(() => document.body.innerText)).substring(0, 500)}`);
        process.exit(1);
      }

      console.log('[INFO] Entering password...');
      await pwdInput.click({ clickCount: 3 });
      await pwdInput.type(password, { delay: 30 });

      // Click Sign in
      console.log('[INFO] Clicking Sign in...');
      let signInBtn = await page.$('button[type="submit"], input[type="submit"], input[name="commit"]');
      if (signInBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
          signInBtn.click(),
        ]);
      }

      await new Promise((r) => setTimeout(r, 8000));

      // Handle possible 2FA / ToS / security check
      url = page.url();
      console.log(`[INFO] After sign in, URL: ${url}`);

      // Check for ToS acceptance
      const tosBtn = await page.$('button[name="conversations_accept_updated_tos_form[accept]"], button[class*="accept"], button[class*="agree"]');
      if (tosBtn) {
        console.log('[INFO] Accepting Terms of Service...');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
          tosBtn.click(),
        ]);
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Check for 2FA email
      const tfaEmailInput = await page.$('input[name="conversations_email_tfa_required_form[code]"], input[name*="code"], input[name*="verify"]');
      if (tfaEmailInput) {
        console.log('[INFO] 2FA (Email) detected, reading code...');
        try {
          const { execSync } = require('child_process');
          const code = execSync(
            `python3 -c "
import imaplib, email, re, sys
mail = imaplib.IMAP4_SSL('imap.gmail.com')
mail.login('${email}', '${password}')
mail.select('inbox')
status, messages = mail.search(None, '(FROM "unity" UNSEEN)')
if status != 'OK':
    status, messages = mail.search(None, '(FROM "unity")')
mail_ids = messages[0].split()
for mid in reversed(mail_ids[-5:]):
    status, msg_data = mail.fetch(mid, '(RFC822)')
    for response_part in msg_data:
        if isinstance(response_part, tuple):
            msg = email.message_from_bytes(response_part[1])
            body = ''
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == 'text/plain':
                        body = part.get_payload(decode=True).decode(errors='replace')
                        break
            else:
                body = msg.get_payload(decode=True).decode(errors='replace')
            codes = re.findall(r'\\b(\\d{6})\\b', body)
            if codes:
                print(codes[0])
                sys.exit(0)
print('NO_CODE')
"`,
            { timeout: 30000 }
          ).toString().trim();
          
          if (code && code !== 'NO_CODE') {
            console.log(`[INFO] 2FA code: ${code}`);
            await tfaEmailInput.type(code, { delay: 50 });
            const verifyBtn = await page.$('input[name="commit"], button[type="submit"], input[type="submit"]');
            if (verifyBtn) {
              await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
                verifyBtn.click(),
              ]);
            }
          }
        } catch (e) {
          console.log(`[ERROR] 2FA code retrieval failed: ${e.message}`);
        }
      }

      // Check for security check again
      url = page.url();
      if (url.includes('security-check') || url.includes('security')) {
        console.log('[INFO] Security check page after login, waiting...');
        await new Promise((r) => setTimeout(r, 20000));
        await page.screenshot({ path: 'security_after.png', fullPage: true });
        const pageText = await page.evaluate(() => document.body.innerText);
        console.log(`[INFO] Page text: ${pageText.substring(0, 500)}`);
      }

      await new Promise((r) => setTimeout(r, 5000));
    }

    // Step 4: Check if we're on the upload page
    console.log('[INFO] Checking for upload page...');
    const currentUrl2 = page.url();
    console.log(`[INFO] Current URL: ${currentUrl2}`);

    // Wait for license file input
    console.log('[INFO] Waiting for license file input...');
    let licenseInput = await page.$('input[name="licenseFile"], input[type="file"]');

    if (!licenseInput) {
      // Maybe we need to wait more for the SPA to load
      console.log('[INFO] License input not found immediately, waiting...');
      await new Promise((r) => setTimeout(r, 10000));
      licenseInput = await page.$('input[name="licenseFile"], input[type="file"]');
    }

    if (!licenseInput) {
      console.log('[ERROR] Could not find license file input');
      await page.screenshot({ path: 'error.png', fullPage: true });
      const html = await page.content();
      fs.writeFileSync('error.html', html);
      console.log(`[INFO] Page text: ${(await page.evaluate(() => document.body.innerText)).substring(0, 1000)}`);
      process.exit(1);
    }

    // Step 5: Upload .alf file using CDP
    console.log('[INFO] Uploading .alf file...');
    await licenseInput.uploadFile(alfPath);
    console.log('[INFO] File uploaded!');

    await new Promise((r) => setTimeout(r, 2000));

    // Step 6: Click Next/Submit
    console.log('[INFO] Clicking Next/Submit...');
    let nextBtn = await page.$('input[name="commit"], button[type="submit"], button:not([disabled])');
    if (nextBtn) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
        nextBtn.click(),
      ]);
    }
    await new Promise((r) => setTimeout(r, 5000));

    // Step 7: Select Personal license type
    console.log('[INFO] Looking for license type selection...');
    const personalRadio = await page.$('input[id="type_personal"], input[value="personal"], input[name="type"][value="personal"]');
    if (personalRadio) {
      console.log('[INFO] Selecting Personal license...');
      await page.evaluate((s) => document.querySelector(s).click(), 'input[id="type_personal"], input[value="personal"]');
      await new Promise((r) => setTimeout(r, 1000));
    } else {
      console.log('[INFO] No license type selection found, checking page...');
      await page.screenshot({ path: 'after_upload.png', fullPage: true });
      const pageText = await page.evaluate(() => document.body.innerText);
      console.log(`[INFO] Page text: ${pageText.substring(0, 500)}`);
    }

    // Select license capacity (option3 = "I don't use Unity in a professional capacity")
    const capacityRadio = await page.$('input[id="option3"], input[name="personal_capacity"]');
    if (capacityRadio) {
      console.log('[INFO] Selecting license capacity...');
      await page.evaluate((s) => document.querySelector(s).click(), 'input[id="option3"]');
      await new Promise((r) => setTimeout(r, 1000));

      // Click Next button
      const nextBtn2 = await page.$('input[class="btn mb10"], button:not([disabled])');
      if (nextBtn2) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
          nextBtn2.click(),
        ]);
      }

      // Click final submit
      await new Promise((r) => setTimeout(r, 3000));
      const submitBtn2 = await page.$('input[name="commit"], button[type="submit"]');
      if (submitBtn2) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
          submitBtn2.click(),
        ]);
      }
    }

    // Step 8: Wait for .ulf download
    console.log('[INFO] Waiting for .ulf file download...');
    let ulfFound = false;
    for (let i = 0; i < 30; i++) {
      const files = fs.readdirSync(downloadPath);
      const ulfFile = files.find((f) => f.endsWith('.ulf'));
      if (ulfFile) {
        console.log(`[INFO] SUCCESS! .ulf file downloaded: ${ulfFile}`);
        console.log(`[ULF_PATH] ${path.join(downloadPath, ulfFile)}`);
        ulfFound = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!ulfFound) {
      console.log('[ERROR] No .ulf file was downloaded');
      await page.screenshot({ path: 'error.png', fullPage: true });
      const html = await page.content();
      fs.writeFileSync('error.html', html);
      console.log(`[INFO] Page text: ${(await page.evaluate(() => document.body.innerText)).substring(0, 1000)}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    await page.screenshot({ path: 'error.png', fullPage: true }).catch(() => {});
    const html = await page.content();
    fs.writeFileSync('error.html', html);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
