import { execSync } from 'child_process'

export interface GateResult {
  passed: boolean
  gateOutput: string
  compareOutput: string
  errors: string[]
}

export function runMandatoryQA(
  originalPath: string,
  translatedPath: string,
  mode: 'clean' | 'review',
  lang: string
): GateResult {
  const errors: string[] = []
  let gateOutput = ''
  let compareOutput = ''

  try {
    gateOutput = execSync(
      `python3 scripts/booklingua_gate.py "${translatedPath}" /tmp/gate_out.docx --mode ${mode} --lang ${lang}`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    )
  } catch (e: any) {
    errors.push('GATE FAILED:\n' + (e.stdout || e.message))
  }

  try {
    compareOutput = execSync(
      `python3 scripts/booklingua_compare.py "${originalPath}" "${translatedPath}" --lang ${lang}`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    )
  } catch (e: any) {
    errors.push('COMPARE FAILED:\n' + (e.stdout || e.message))
  }

  return {
    passed: errors.length === 0,
    gateOutput,
    compareOutput,
    errors,
  }
}
