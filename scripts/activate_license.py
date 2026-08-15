#!/usr/bin/env python3
"""
Unity License Activator - Replicates the browser flow via HTTP requests.
1. Login to Unity ID
2. Upload .alf file to license.unity3d.com
3. Download .ulf file
"""

import requests
import re
import sys
import os
import json
from urllib.parse import urljoin, urlparse, parse_qs

def main():
    if len(sys.argv) < 4:
        print("Usage: python3 activate_license.py <email> <password> <alf_file_path>")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    alf_path = sys.argv[3]
    
    if not os.path.exists(alf_path):
        print(f"[ERROR] ALF file not found: {alf_path}")
        sys.exit(1)
    
    alf_content = open(alf_path, 'rb').read()
    alf_filename = os.path.basename(alf_path)
    print(f"[INFO] ALF file: {alf_path} ({len(alf_content)} bytes)")
    
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    })
    
    # Step 1: Navigate to the license page (this will redirect to login)
    print("[INFO] Navigating to license.unity3d.com/manual...")
    r = session.get('https://license.unity3d.com/manual', allow_redirects=True)
    print(f"[INFO] License page status: {r.status_code}, URL: {r.url}")
    
    # Check if we're already logged in (persistent context might have cookies)
    if 'logout' in r.text.lower() or 'upload' in r.text.lower():
        print("[INFO] Already logged in!")
    else:
        # Step 2: Login flow
        print(f"[INFO] Current URL: {r.url}")
        
        # Look for the login form
        login_url = r.url  # Should be at login.unity.com
        
        # Parse the page for form action and hidden fields
        form_action = re.search(r'action="([^"]*)"', r.text)
        csrf_token = re.search(r'name="csrf[_-]token" value="([^"]*)"', r.text, re.IGNORECASE)
        csrf_meta = re.search(r'name="csrf[_-]token"\s+content="([^"]*)"', r.text, re.IGNORECASE)
        auth_token = re.search(r'name="authenticity[_-]token"\s+value="([^"]*)"', r.text, re.IGNORECASE)
        
        print(f"[INFO] Form action: {form_action.group(1) if form_action else 'N/A'}")
        print(f"[INFO] CSRF token: {'found' if (csrf_token or csrf_meta or auth_token) else 'not found'}")
        
        token = None
        if csrf_token:
            token = csrf_token.group(1)
        elif csrf_meta:
            token = csrf_meta.group(1)
        elif auth_token:
            token = auth_token.group(1)
        
        # Step 2a: Submit email
        print(f"[INFO] Submitting email: {email}")
        
        # Try to find the email form
        email_form_data = {}
        if token:
            email_form_data['authenticity_token'] = token
            email_form_data['csrf_token'] = token
        email_form_data['user[email]'] = email
        email_form_data['user[login]'] = email
        email_form_data['email'] = email
        
        # Try posting to the current URL
        r2 = session.post(login_url, data=email_form_data, allow_redirects=True)
        print(f"[INFO] After email submit: status={r2.status_code}, URL={r2.url}")
        
        # Look for password field
        if 'password' in r2.text.lower():
            print("[INFO] Password page detected")
            
            # Parse for new CSRF token
            token2 = re.search(r'name="authenticity[_-]token"\s+value="([^"]*)"', r2.text, re.IGNORECASE)
            token2 = token2.group(1) if token2 else (re.search(r'name="csrf[_-]token"\s+content="([^"]*)"', r2.text, re.IGNORECASE) or [None])[0] if re.search(r'name="csrf[_-]token"\s+content="([^"]*)"', r2.text, re.IGNORECASE) else token
            
            # Step 2b: Submit password
            print(f"[INFO] Submitting password...")
            pwd_data = {}
            if token2:
                pwd_data['authenticity_token'] = token2
                pwd_data['csrf_token'] = token2
            pwd_data['user[password]'] = password
            pwd_data['user[email]'] = email
            pwd_data['user[login]'] = email
            pwd_data['password'] = password
            
            r3 = session.post(r2.url, data=pwd_data, allow_redirects=True)
            print(f"[INFO] After password submit: status={r3.status_code}, URL={r3.url}")
            
            # Check for security check
            if 'security-check' in r3.url or 'security' in r3.text.lower():
                print("[WARN] Security check page detected!")
                print(f"[INFO] Page content (first 500 chars): {r3.text[:500]}")
                # Try to continue past the security check
                r3 = session.get('https://license.unity3d.com/manual', allow_redirects=True)
                print(f"[INFO] After security check redirect: status={r3.status_code}, URL={r3.url}")
        else:
            print("[WARN] No password field found after email submit")
            print(f"[INFO] Page content (first 500 chars): {r2.text[:500]}")
    
    # Step 3: Navigate to the manual activation page
    print("[INFO] Navigating to license.unity3d.com/manual...")
    r = session.get('https://license.unity3d.com/manual', allow_redirects=True)
    print(f"[INFO] License page: status={r.status_code}, URL={r.url}")
    
    if 'login' in r.url.lower() or 'sign-in' in r.url.lower():
        print("[ERROR] Not logged in - still on login page")
        print(f"[INFO] Page content (first 1000 chars): {r.text[:1000]}")
        # Save page for debugging
        open('login_page.html', 'w').write(r.text)
        print("[INFO] Login page saved to login_page.html")
        sys.exit(1)
    
    # Step 4: Upload .alf file
    print("[INFO] Uploading .alf file...")
    
    # Try to find the upload API endpoint
    # The license page likely has a form or API endpoint
    upload_url = 'https://license.unity3d.com/api/activation'
    
    # Parse the page for the form action
    form_match = re.search(r'<form[^>]*action="([^"]*)"[^>]*>', r.text, re.IGNORECASE)
    if form_match:
        upload_url = urljoin('https://license.unity3d.com', form_match.group(1))
        print(f"[INFO] Found form action: {upload_url}")
    
    # Also look for API endpoints in the JavaScript
    api_match = re.search(r'["\']/(api/[^"\']*)["\']', r.text)
    if api_match:
        upload_url = urljoin('https://license.unity3d.com', api_match.group(1))
        print(f"[INFO] Found API endpoint: {upload_url}")
    
    # Look for any JavaScript fetch/axios calls
    fetch_match = re.search(r'(?:fetch|axios|XMLHttpRequest)[^"]*["\']([^"\']*)["\']', r.text)
    if fetch_match:
        upload_url = urljoin('https://license.unity3d.com', fetch_match.group(1))
        print(f"[INFO] Found fetch endpoint: {upload_url}")
    
    # Get CSRF token from the license page
    license_csrf = re.search(r'name="csrf[_-]token"\s+content="([^"]*)"', r.text, re.IGNORECASE)
    license_auth = re.search(r'name="authenticity[_-]token"\s+value="([^"]*)"', r.text, re.IGNORECASE)
    license_token = (license_csrf.group(1) if license_csrf else None) or (license_auth.group(1) if license_auth else None)
    
    # Save the license page for debugging
    open('license_page.html', 'w').write(r.text)
    print(f"[INFO] License page saved to license_page.html ({len(r.text)} chars)")
    
    # Try uploading the .alf file
    headers = {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
    }
    if license_token:
        headers['X-CSRF-Token'] = license_token
        headers['X-CSRFToken'] = license_token
    
    files = {
        'file': (alf_filename, alf_content, 'application/xml'),
    }
    
    # Try different possible endpoints
    endpoints = [
        'https://license.unity3d.com/api/activation',
        'https://license.unity3d.com/activation',
        'https://license.unity3d.com/manual',
        'https://license.unity3d.com/api/manual',
        'https://license.unity3d.com/api/v1/activation',
    ]
    
    for endpoint in endpoints:
        print(f"[INFO] Trying endpoint: {endpoint}")
        r_upload = session.post(endpoint, files=files, headers=headers, allow_redirects=True)
        print(f"[INFO] Response: status={r_upload.status_code}, content-type={r_upload.headers.get('content-type', 'N/A')}")
        
        if r_upload.status_code == 200:
            content_type = r_upload.headers.get('content-type', '')
            if 'json' in content_type:
                try:
                    data = r_upload.json()
                    print(f"[INFO] JSON response: {json.dumps(data)[:500]}")
                    
                    # Look for license content or download URL in the response
                    if 'license' in str(data).lower() or 'ulf' in str(data).lower():
                        print("[INFO] License data found in response!")
                        # Try to extract the .ulf content
                        if isinstance(data, dict):
                            for key in ['license', 'content', 'ulf', 'data', 'licenseFile']:
                                if key in data:
                                    ulf_content = data[key]
                                    if isinstance(ulf_content, str):
                                        open('UnityLicense.ulf', 'w').write(ulf_content)
                                        print(f"[INFO] .ulf file saved to UnityLicense.ulf")
                                        print(f"[ULF_PATH] UnityLicense.ulf")
                                        return
                except:
                    pass
            elif 'xml' in content_type or 'text' in content_type:
                # Check if the response IS the .ulf file
                if '<?xml' in r_upload.text or '<root>' in r_upload.text:
                    print("[INFO] XML response - likely .ulf content!")
                    open('UnityLicense.ulf', 'w').write(r_upload.text)
                    print(f"[INFO] .ulf file saved to UnityLicense.ulf")
                    print(f"[ULF_PATH] UnityLicense.ulf")
                    return
            elif r_upload.headers.get('content-disposition', '').endswith('.ulf'):
                open('UnityLicense.ulf', 'wb').write(r_upload.content)
                print(f"[INFO] .ulf file saved to UnityLicense.ulf")
                print(f"[ULF_PATH] UnityLicense.ulf")
                return
            
            # Check if there's a download link in the response
            download_match = re.search(r'href="([^"]*\.ulf[^"]*)"', r_upload.text)
            if download_match:
                download_url = urljoin('https://license.unity3d.com', download_match.group(1))
                print(f"[INFO] Found download link: {download_url}")
                r_dl = session.get(download_url)
                if r_dl.status_code == 200:
                    open('UnityLicense.ulf', 'wb').write(r_dl.content)
                    print(f"[INFO] .ulf file downloaded!")
                    print(f"[ULF_PATH] UnityLicense.ulf")
                    return
        
        # Save response for debugging
        open(f'response_{r_upload.status_code}.html', 'w').write(r_upload.text[:5000])
    
    print("[ERROR] Could not find .ulf file in any response")
    print("[INFO] Check login_page.html, license_page.html, and response_*.html for debugging")
    sys.exit(1)

if __name__ == '__main__':
    main()
