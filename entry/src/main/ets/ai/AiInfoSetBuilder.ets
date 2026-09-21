import { AiBuilderSource, AiInfoSet } from './AiTypes';
import { InfoSetBuilder } from './InfoSetBuilder';

/**
 * Compatibility facade. Implementation lives in InfoSetBuilder (v0.2.0 §1 / §6).
 */
export class AiInfoSetBuilder {
  static isForbiddenKey(key: string): boolean {
    return InfoSetBuilder.isForbiddenKey(key);
  }

  static build(src: AiBuilderSource): AiInfoSet {
    return InfoSetBuilder.buildInfoSet(src);
  }

  static rejectPeekKeys(keys: string[]): boolean {
    return InfoSetBuilder.rejectPeekKeys(keys);
  }
}
