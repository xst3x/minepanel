const puppeteer = require('puppeteer');

(async () => {
    console.log("Launching browser to inspect bed texture...");
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    try {
        await page.goto('http://localhost:8082');
        
        await page.evaluate(async () => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = '/assets/minecraft/textures/entity/bed/red.png';
            });
            
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            console.log(`Image size: ${img.width}x${img.height}`);
            
            // Let's find all non-transparent bounding boxes or regions
            // We'll scan in 1x1 pixel resolution and group non-transparent pixels
            const imgData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imgData.data;
            
            // Scan each 2x2 or 4x4 block to see if it has non-transparent pixels
            const grid = [];
            for (let y = 0; y < img.height; y++) {
                let row = "";
                for (let x = 0; x < img.width; x++) {
                    const idx = (y * img.width + x) * 4;
                    const alpha = data[idx + 3];
                    if (alpha > 10) {
                        row += "#";
                    } else {
                        row += ".";
                    }
                }
                console.log(`${String(y).padStart(2, '0')}: ${row}`);
            }
        });
    } catch (e) {
        console.error("Failed to inspect bed texture", e);
    }
    await browser.close();
})();
