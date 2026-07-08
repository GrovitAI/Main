const fs = require('fs');
const path = require('path');

const videoPath = path.join(__dirname, '../assets/Loading_Screen2.mp4');

try {
  const buffer = fs.readFileSync(videoPath);
  console.log('File size:', buffer.length, 'bytes');

  // Find 'tkhd' atom
  const tkhdOffset = buffer.indexOf(Buffer.from('tkhd'));
  if (tkhdOffset === -1) {
    console.log('Could not find tkhd atom');
    process.exit(1);
  }

  console.log('tkhd atom found at offset:', tkhdOffset);

  // Read version byte
  const version = buffer.readUInt8(tkhdOffset + 4);
  console.log('tkhd version:', version);

  let width, height;
  if (version === 0) {
    // Width starts at offset 76 from tkhd start (which is 4 + 72)
    // tkhd v0 format:
    // 1 byte version (offset 4)
    // 3 bytes flags (offset 5)
    // 4 bytes creation_time (offset 8)
    // 4 bytes modification_time (offset 12)
    // 4 bytes track_ID (offset 16)
    // 4 bytes reserved (offset 20)
    // 4 bytes duration (offset 24)
    // 8 bytes reserved (offset 28)
    // 2 bytes layer (offset 36)
    // 2 bytes alternate_group (offset 38)
    // 2 bytes volume (offset 40)
    // 2 bytes reserved (offset 42)
    // 36 bytes matrix (offset 44)
    // 4 bytes width (offset 80)
    // 4 bytes height (offset 84)
    width = buffer.readUInt32BE(tkhdOffset + 4 + 76) >> 16;
    height = buffer.readUInt32BE(tkhdOffset + 4 + 80) >> 16;
  } else if (version === 1) {
    // tkhd v1 format has 8-byte creation_time, modification_time, duration.
    // Width starts at offset 88 from tkhd start (which is 4 + 84)
    width = buffer.readUInt32BE(tkhdOffset + 4 + 88) >> 16;
    height = buffer.readUInt32BE(tkhdOffset + 4 + 92) >> 16;
  }

  console.log('Resolution:', width, 'x', height);
} catch (err) {
  console.error('Error reading file:', err);
}
