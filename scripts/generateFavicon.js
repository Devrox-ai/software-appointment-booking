const fs = require('fs');
const path = require('path');

function createFaviconIco() {
  const width = 32;
  const height = 32;
  const bpp = 32;
  const pixelBytes = width * height * 4;
  const maskBytes = (width / 8) * height; // 128 bytes
  const bihSize = 40;
  const imageSize = bihSize + pixelBytes + maskBytes; // 4264 bytes

  const buffer = Buffer.alloc(22 + imageSize);

  // ICONDIR
  buffer.writeUInt16LE(0, 0); // Reserved
  buffer.writeUInt16LE(1, 2); // Type 1 = ICO
  buffer.writeUInt16LE(1, 4); // Count = 1

  // ICONDIRENTRY
  buffer.writeUInt8(width, 6);
  buffer.writeUInt8(height, 7);
  buffer.writeUInt8(0, 8); // Colors
  buffer.writeUInt8(0, 9); // Reserved
  buffer.writeUInt16LE(1, 10); // Color planes
  buffer.writeUInt16LE(bpp, 12); // Bits per pixel
  buffer.writeUInt32LE(imageSize, 14); // Image size in bytes
  buffer.writeUInt32LE(22, 18); // Image offset

  // BITMAPINFOHEADER
  let offset = 22;
  buffer.writeUInt32LE(bihSize, offset); // biSize
  buffer.writeInt32LE(width, offset + 4); // biWidth
  buffer.writeInt32LE(height * 2, offset + 8); // biHeight (doubled for ICO mask)
  buffer.writeUInt16LE(1, offset + 12); // biPlanes
  buffer.writeUInt16LE(bpp, offset + 14); // biBitCount
  buffer.writeUInt32LE(0, offset + 16); // biCompression (BI_RGB)
  buffer.writeUInt32LE(pixelBytes + maskBytes, offset + 20); // biSizeImage
  buffer.writeInt32LE(0, offset + 24);
  buffer.writeInt32LE(0, offset + 28);
  buffer.writeUInt32LE(0, offset + 32);
  buffer.writeUInt32LE(0, offset + 36);

  offset += 40;

  // Render 32x32 geometric tech mark
  // In BMP, rows are ordered from bottom (y=0) to top (y=31)
  const navy = [0x2a, 0x17, 0x0f, 0xff]; // BGRA for #0f172a
  const blue = [0xeb, 0x63, 0x25, 0xff]; // BGRA for #2563eb
  const cyan = [0xf8, 0xbd, 0x38, 0xff]; // BGRA for #38bdf8
  const white = [0xff, 0xff, 0xff, 0xff];
  const transparent = [0x00, 0x00, 0x00, 0x00];

  const maskBuffer = Buffer.alloc(maskBytes, 0);

  for (let bmpY = 0; bmpY < height; bmpY++) {
    const visualY = (height - 1) - bmpY; // Convert to top-down coordinates
    for (let x = 0; x < width; x++) {
      const pOffset = offset + (bmpY * width + x) * 4;

      // Rounded squircle check (corner radius 6 at 32x32)
      const r = 6;
      let inCorner = false;
      if (x < r && visualY < r) {
        if ((x - r) ** 2 + (visualY - r) ** 2 > r ** 2) inCorner = true;
      } else if (x >= width - r && visualY < r) {
        if ((x - (width - 1 - r)) ** 2 + (visualY - r) ** 2 > r ** 2) inCorner = true;
      } else if (x < r && visualY >= height - r) {
        if ((x - r) ** 2 + (visualY - (height - 1 - r)) ** 2 > r ** 2) inCorner = true;
      } else if (x >= width - r && visualY >= height - r) {
        if ((x - (width - 1 - r)) ** 2 + (visualY - (height - 1 - r)) ** 2 > r ** 2) inCorner = true;
      }

      if (inCorner) {
        buffer[pOffset] = transparent[0];
        buffer[pOffset + 1] = transparent[1];
        buffer[pOffset + 2] = transparent[2];
        buffer[pOffset + 3] = transparent[3];
        // Set AND mask bit to 1 (transparent)
        const maskIndex = bmpY * (width / 8) + Math.floor(x / 8);
        maskBuffer[maskIndex] |= (0x80 >> (x % 8));
        continue;
      }

      // Default background is deep navy
      let color = navy;

      // Draw geometric hexagonal tech nexus in center (cx=16, cy=16)
      const dx = x - 16;
      const dy = visualY - 16;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Central node
      if (dist <= 3) {
        color = cyan;
      }
      // Hexagonal outer facets
      else if (Math.abs(dx) <= 9 && Math.abs(dy) <= 9) {
        if (visualY < 16 && Math.abs(dx) <= 8 - (visualY - 8) * 0.5) {
          color = cyan; // Top facet
        } else if (dx < 0 && (visualY >= 16)) {
          color = blue; // Left facet
        } else if (dx >= 0 && (visualY >= 16)) {
          color = [0x50, 0x30, 0x18, 0xff]; // Facet depth
        }
      }

      // Center white node point
      if (dist <= 1.2) {
        color = white;
      }

      buffer[pOffset] = color[0];     // B
      buffer[pOffset + 1] = color[1]; // G
      buffer[pOffset + 2] = color[2]; // R
      buffer[pOffset + 3] = color[3]; // A
    }
  }

  // Copy AND mask into buffer
  maskBuffer.copy(buffer, offset + pixelBytes);

  const outputPath = path.join(__dirname, '..', 'public', 'favicon.ico');
  fs.writeFileSync(outputPath, buffer);
  console.log('Generated favicon.ico successfully at', outputPath);
}

createFaviconIco();
