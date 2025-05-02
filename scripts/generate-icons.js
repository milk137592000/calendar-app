const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const svgBuffer = fs.readFileSync(path.join(__dirname, '../public/icon.svg'));
  
  // Generate favicon.ico (16x16, 32x32)
  await sharp(svgBuffer)
    .resize(32, 32)
    .toFile(path.join(__dirname, '../public/icon.png'));

  // Generate apple-touch-icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .toFile(path.join(__dirname, '../public/apple-icon.png'));

  console.log('Icons generated successfully!');
}

generateIcons().catch(console.error); 