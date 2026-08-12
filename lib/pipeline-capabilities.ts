// Explicitly opt in only after additive migrations and private storage policies
// have been verified. The default preserves the production legacy path.
export const HARDENED_V1_ENABLED = process.env.PIPELINE_HARDENING_V1 === 'enabled'
