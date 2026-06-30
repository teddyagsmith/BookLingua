import { runMandatoryQA } from '../lib/delivery-gate'
import fixtures from '../test-fixtures/manifest.json'

// Placeholder: in CI this would run a mini-translation pipeline.
// For now we validate that the gate/compare scripts are present and executable.

async function translateForTest(originalPath: string, _lang: string): Promise<string> {
  // In a full CI setup this would:
  // 1. Upload the fixture original to the pipeline
  // 2. Run a shortened translation (smaller chunks, fewer languages)
  // 3. Return the path to the translated file
  // For manual runs, we expect the fixture to have a pre-generated translation.
  return originalPath.replace(/original\.(docx|txt|epub)$/, 'translated-de.docx')
}

async function runSuite() {
  let allPassed = true

  for (const fixture of fixtures) {
    console.log(`\nTesting: ${fixture.name}`)

    const translatedPath = await translateForTest(fixture.originalPath, 'de')
    const qa = runMandatoryQA(fixture.originalPath, translatedPath, 'clean', 'de')

    if (!qa.passed) {
      console.error(`FAIL: ${fixture.name}`)
      console.error(qa.errors.join('\n'))
      allPassed = false
    } else {
      console.log(`PASS: ${fixture.name}`)
    }
  }

  if (!allPassed) {
    console.error('\nREGRESSION SUITE FAILED — do not deploy')
    process.exit(1)
  }
  console.log('\nAll fixtures passed.')
}

runSuite()
