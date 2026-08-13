import modelConfig from '../config/booklingua-models.json'

export const BOOKLINGUA_MODEL_CONFIG = Object.freeze(modelConfig)

export type BookLinguaModelStage = 'translation' | 'editorial' | 'launch-pack' | 'normal'

export function modelForStage(stage: BookLinguaModelStage): string {
  if (stage === 'launch-pack') return BOOKLINGUA_MODEL_CONFIG.launchPack
  if (stage === 'editorial') return BOOKLINGUA_MODEL_CONFIG.editorial
  if (stage === 'translation') return BOOKLINGUA_MODEL_CONFIG.translation
  return BOOKLINGUA_MODEL_CONFIG.normal
}
