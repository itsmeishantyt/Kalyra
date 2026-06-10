import asyncio
import os
from playwright.async_api import async_playwright

async def run():
    print("Starting Playwright sharing verification...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Grant clipboard-read and clipboard-write permissions to enable navigator.clipboard.writeText
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            permissions=["clipboard-read", "clipboard-write"]
        )
        page = await context.new_page()

        # Listen to console logs
        page.on("console", lambda msg: print(f"[CONSOLE] {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"[PAGE ERROR] {err}"))

        # Navigate to a product page
        # Note: id=1 should exist in db or resolve
        url = "http://localhost:3001/product.html?id=164"
        print(f"Navigating to {url}...")
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # Check if #pdp-share-btn exists
        share_btn = await page.query_selector("#pdp-share-btn")
        if not share_btn:
            print("FAILED: #pdp-share-btn element not found!")
            await browser.close()
            return False

        print("Found share button. Clicking it...")
        # We need to run it in a way that clipboard permission works.
        # Sometimes headless chrome clipboard read requires page focus.
        await page.bring_to_front()
        await share_btn.click()

        # Wait for toast
        print("Waiting for toast notification...")
        await page.wait_for_selector("#kalyra-pdp-toast", state="visible", timeout=5000)
        toast_text = await page.locator("#kalyra-pdp-toast span").inner_text()
        print(f"Toast message text: '{toast_text}'")

        # Read clipboard contents using browser context evaluation to verify
        clipboard_content = await page.evaluate("navigator.clipboard.readText()")
        print(f"Clipboard content: '{clipboard_content}'")

        # Capture a screenshot of the toast notification
        screenshot_path = "C:/Users/Max/.gemini/antigravity-ide/brain/e0ceb993-fb05-4246-bdb0-23af4c1ea1da/screenshot_share.png"
        await page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to: {screenshot_path}")

        await browser.close()

        if "Link copied to clipboard!" in toast_text and clipboard_content == url:
            print("SUCCESS: Link successfully copied to clipboard and toast shown!")
            return True
        else:
            print("FAILED: Clipboard content or toast verification failed.")
            return False

if __name__ == "__main__":
    success = asyncio.run(run())
    import sys
    sys.exit(0 if success else 1)
