const puppeteer = require('puppeteer');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

(async () => {
    // Generate valid JWT token for admin user
    const SECRET_KEY = process.env.JWT_SECRET;
    if (!SECRET_KEY) {
        console.error("FATAL ERROR: JWT_SECRET not found in .env");
        process.exit(1);
    }
    const token = jwt.sign({ id: 1, username: 'xst3x' }, SECRET_KEY, { expiresIn: '1h' });

    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    try {
        console.log("Navigating to http://localhost:8082...");
        await page.goto('http://localhost:8082');

        console.log("Injecting auth token into localStorage...");
        await page.evaluate((token) => {
            localStorage.setItem('mp_token', token);
            localStorage.setItem('mp_user', 'xst3x');
            localStorage.setItem('mp_role', 'admin');
            localStorage.setItem('mp_userid', '1');
        }, token);

        console.log("Reloading page to authenticate...");
        await page.reload({ waitUntil: 'networkidle2' });

        console.log("Waiting for server card...");
        await page.waitForSelector('.server-card');
        console.log("Clicking server card...");
        await page.click('.server-card');

        console.log("Waiting for players tab...");
        await page.waitForSelector('[data-tab="players"]');
        console.log("Clicking players tab...");
        await page.click('[data-tab="players"]');

        console.log("Waiting for player list item...");
        await page.waitForSelector('button[data-uuid]', {timeout: 5000});
        console.log("Clicking player list item...");
        await page.click('button[data-uuid]');
        
        console.log("Waiting 1 second...");
        await new Promise(r => setTimeout(r, 1000));
        console.log("Integration test completed successfully!");
    } catch (e) {
        console.error("Test failed", e);
        process.exitCode = 1;
    }
    await browser.close();
})();
