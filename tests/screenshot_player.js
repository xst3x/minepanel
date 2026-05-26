const puppeteer = require('puppeteer');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async () => {
    const SECRET_KEY = process.env.JWT_SECRET || 'super-secret-dev-key';
    const token = jwt.sign({ id: 1, username: 'xst3x' }, SECRET_KEY, { expiresIn: '1h' });

    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Set viewport size
    await page.setViewport({ width: 1200, height: 900 });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    try {
        console.log("Navigating to http://localhost:8082...");
        await page.goto('http://localhost:8082');

        console.log("Injecting auth token...");
        await page.evaluate((token) => {
            localStorage.setItem('mp_token', token);
            localStorage.setItem('mp_user', 'xst3x');
            localStorage.setItem('mp_role', 'admin');
            localStorage.setItem('mp_userid', '1');
        }, token);

        console.log("Reloading...");
        await page.reload({ waitUntil: 'networkidle2' });

        console.log("Waiting for server card...");
        await page.waitForSelector('.server-card');
        await page.click('.server-card');

        console.log("Waiting for players tab...");
        await page.waitForSelector('[data-tab="players"]');
        await page.click('[data-tab="players"]');

        console.log("Waiting for player button...");
        await page.waitForSelector('button[data-uuid]', {timeout: 5000});
        await page.click('button[data-uuid]');
        
        console.log("Waiting for modal to load inventory...");
        await page.waitForSelector('.mc-slot', {timeout: 5000});
        await new Promise(r => setTimeout(r, 2000)); // wait for canvas rendering

        console.log("Taking screenshot of inventory...");
        const modal = await page.$('.modal-content');
        if (modal) {
            await modal.screenshot({ path: path.join(__dirname, 'player_modal.png') });
            console.log("Screenshot saved successfully!");
        } else {
            await page.screenshot({ path: path.join(__dirname, 'page.png') });
            console.log("Modal not found, took page screenshot instead.");
        }
    } catch (e) {
        console.error("Screenshot failed", e);
    }
    await browser.close();
})();
