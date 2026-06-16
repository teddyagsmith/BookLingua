const { extractDocxSegments, segmentsToText, textToSegments } = require('./lib/extract-segments');
const fs = require('fs');

async function test() {
  console.log('Testing HJ Chammas (proper styles)...');
  const hjBuf = fs.readFileSync('/Users/gilbert/Downloads/hj-chammas-original.docx');
  const hjSegments = await extractDocxSegments(hjBuf);
  console.log(`\nTotal: ${hjSegments.length} segments, ${hjSegments.filter(s => s.type === 'heading').length} headings`);
  hjSegments.slice(0, 8).forEach(s => {
    const icon = s.type === 'heading' ? 'H' : 'P';
    console.log(`  [${s.id}] ${icon}${s.level}: "${s.text.slice(0, 60)}..." (style: ${s.styleName || 'none'})`);
  });

  console.log('\n\nTesting Selene Grace Silver (manual formatting)...');
  const selBuf = fs.readFileSync('/Users/gilbert/Downloads/watch-over-me-original.docx');
  const selSegments = await extractDocxSegments(selBuf);
  console.log(`\nTotal: ${selSegments.length} segments, ${selSegments.filter(s => s.type === 'heading').length} headings`);
  selSegments.slice(0, 8).forEach(s => {
    const icon = s.type === 'heading' ? 'H' : 'P';
    console.log(`  [${s.id}] ${icon}${s.level}: "${s.text.slice(0, 60)}..." (style: ${s.styleName || 'none'})`);
  });

  // Test round-trip
  console.log('\n\n=== Round-trip test ===');
  const text = segmentsToText(selSegments.slice(0, 5));
  console.log('Serialized:');
  console.log(text.slice(0, 500));
  console.log('\nDeserialized:');
  const back = textToSegments(text);
  back.forEach(s => console.log(`  [${s.id}] ${s.type} L${s.level}: "${s.text.slice(0, 40)}..."`));
}

test().catch(e => console.error(e));
