import asyncio
import os
from playwright.async_api import async_playwright

async def run():
    print("Starting Playwright screenshots...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        
        # Privacy policy
        page = await context.new_page()
        print("Navigating to Privacy Policy page...")
        await page.goto("http://localhost:3001/privacy.html", wait_until="networkidle")
        await page.wait_for_timeout(2000)
        screenshot_privacy = "C:/Users/Max/.gemini/antigravity-ide/brain/e0ceb993-fb05-4246-bdb0-23af4c1ea1da/screenshot_privacy.png"
        await page.screenshot(path=screenshot_privacy)
        print(f"Privacy screenshot saved: {screenshot_privacy}")

        # Terms & conditions
        print("Navigating to Terms & Conditions page...")
        await page.goto("http://localhost:3001/terms.html", wait_until="networkidle")
        await page.wait_for_timeout(2000)
        screenshot_terms = "C:/Users/Max/.gemini/antigravity-ide/brain/e0ceb993-fb05-4246-bdb0-23af4c1ea1da/screenshot_terms.png"
        await page.screenshot(path=screenshot_terms)
        print(f"Terms screenshot saved: {screenshot_terms}")

        await browser.close()
    print("Screenshots complete.")

if __name__ == "__main__":
    asyncio.run(run())
