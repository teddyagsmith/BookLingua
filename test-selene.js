const { extractDocxSegments } = require('./lib/extract-segments');
const fs = require('fs');

async function test() {
  console.log('=== Testing Selene Grace Silver (manual formatting) ===');
  const buf = fs.readFileSync('/Users/gilbert/Downloads/watch-over-me-original.docx');
  const { segments, quality } = await extractDocxSegments(buf);

  console.log(`\nTotal: ${segments.length} segments, ${segments.filter(s => s.type === 'heading').length} headings`);

  // Show first 15 segments to check title/dedication detection
  console.log('\nFirst 15 segments:');
  segments.slice(0, 15).forEach(s => {
    const icon = s.type === 'heading' ? 'H' : 'P';
    console.log(`  [${s.id}] ${icon}${s.level}: "${s.text.slice(0, 70)}${s.text.length > 70 ? '...' : ''}" (style: ${s.styleName || 'none'})`);
  });

  // Show all headings
  console.log('\nAll headings detected:');
  segments.filter(s => s.type === 'heading').forEach(s => {
    console.log(`  [${s.id}] H${s.level}: "${s.text}"`);
  });
}

test().catch(e => console.error(e));
