const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // URL of the website to download
    const url = 'https://wallstreetpepe.com';
    await page.goto(url, { waitUntil: 'networkidle2' });

    const baseDir = __dirname;

    // Function to sanitize filenames
    const sanitizeFilename = (filename) => filename.replace(/[<>:"\/\\|?*\s]/g, '_');

    // Create directories for resources
    const createDir = (dirPath) => {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    };

    const imagesDir = path.join(baseDir, 'images');
    const stylesDir = path.join(baseDir, 'styles');
    const scriptsDir = path.join(baseDir, 'scripts');
    createDir(imagesDir);
    createDir(stylesDir);
    createDir(scriptsDir);

    // Save the HTML
    const html = await page.content();
    fs.writeFileSync(path.join(baseDir, 'index.html'), html);

    // Intercept requests to download CSS, JS, and image resources
    page.on('response', async (response) => {
        try {
            const url = response.url();
            const contentType = response.headers()['content-type'];

            if (contentType) {
                let filePath = '';
                if (contentType.includes('image')) {
                    const filename = sanitizeFilename(path.basename(url));
                    filePath = path.join(imagesDir, filename);
                } else if (contentType.includes('text/css')) {
                    const filename = sanitizeFilename(path.basename(url));
                    filePath = path.join(stylesDir, filename);
                } else if (contentType.includes('application/javascript')) {
                    const filename = sanitizeFilename(path.basename(url));
                    filePath = path.join(scriptsDir, filename);
                }

                if (filePath) {
                    const buffer = await response.buffer();
                    fs.writeFileSync(filePath, buffer);
                    console.log(`Downloaded: ${url}`);
                }
            }
        } catch (err) {
            console.error(`Failed to download resource: ${response.url()}`);
            console.error(err.message);
        }
    });

    // Download and save images used in the HTML
    const images = await page.$$eval('img', (imgs) => imgs.map((img) => img.src));
    for (const image of images) {
        try {
            const viewSource = await page.goto(image);
            const filename = sanitizeFilename(path.basename(image));
            const filePath = path.join(imagesDir, filename);
            fs.writeFileSync(filePath, await viewSource.buffer());
        } catch (err) {
            console.error(`Failed to download image: ${image}`);
            console.error(err.message);
        }
    }

    // Close the browser
    await browser.close();

    console.log('Website and resources downloaded successfully!');
})();
