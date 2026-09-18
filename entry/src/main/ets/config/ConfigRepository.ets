import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { Logger } from '../common/Logger';
import { MatchDefaults } from './MatchDefaults';
import { DeckConfig } from './DeckConfig';
import { AiPersonasConfig } from './AiPersonasConfig';
import { InteractionCapsConfig } from './InteractionCapsConfig';
import { DemoSeedConfig } from './DemoSeedConfig';

const TAG = 'ConfigRepository';

/**
 * Load JSON from rawfile/config at process start.
 * Deep-copy into Match.config later (engine PR) — do not re-read mid-match.
 */
export class ConfigRepository {
  private static ready: boolean = false;
  private static matchDefaults: MatchDefaults | null = null;
  private static deckConfig: DeckConfig | null = null;
  private static personas: AiPersonasConfig | null = null;
  private static caps: InteractionCapsConfig | null = null;
  private static demoSeed: DemoSeedConfig | null = null;

  static isReady(): boolean {
    return ConfigRepository.ready;
  }

  static match(): MatchDefaults {
    if (ConfigRepository.matchDefaults === null) {
      throw new Error('match_defaults.json not loaded');
    }
    return ConfigRepository.matchDefaults;
  }

  static deck(): DeckConfig {
    if (ConfigRepository.deckConfig === null) {
      throw new Error('deck.json not loaded');
    }
    return ConfigRepository.deckConfig;
  }

  static aiPersonas(): AiPersonasConfig {
    if (ConfigRepository.personas === null) {
      throw new Error('ai_personas.json not loaded');
    }
    return ConfigRepository.personas;
  }

  static interactionCaps(): InteractionCapsConfig {
    if (ConfigRepository.caps === null) {
      throw new Error('interaction_caps.json not loaded');
    }
    return ConfigRepository.caps;
  }

  static demo(): DemoSeedConfig {
    if (ConfigRepository.demoSeed === null) {
      throw new Error('demo_seed.json not loaded');
    }
    return ConfigRepository.demoSeed;
  }

  /** Deep copy for a future Match.config snapshot. */
  static snapshotMatchDefaults(): MatchDefaults {
    const text: string = JSON.stringify(ConfigRepository.match());
    const copy: MatchDefaults = JSON.parse(text) as MatchDefaults;
    return copy;
  }

  static async loadAll(context: common.UIAbilityContext): Promise<void> {
    const rm = context.resourceManager;
    ConfigRepository.matchDefaults =
      JSON.parse(ConfigRepository.decode(await rm.getRawFileContent('config/match_defaults.json'))) as MatchDefaults;
    ConfigRepository.deckConfig =
      JSON.parse(ConfigRepository.decode(await rm.getRawFileContent('config/deck.json'))) as DeckConfig;
    ConfigRepository.personas =
      JSON.parse(ConfigRepository.decode(await rm.getRawFileContent('config/ai_personas.json'))) as AiPersonasConfig;
    ConfigRepository.caps =
      JSON.parse(ConfigRepository.decode(await rm.getRawFileContent('config/interaction_caps.json'))) as InteractionCapsConfig;
    ConfigRepository.demoSeed =
      JSON.parse(ConfigRepository.decode(await rm.getRawFileContent('config/demo_seed.json'))) as DemoSeedConfig;
    ConfigRepository.ready = true;
    Logger.info(TAG, `config loaded schema=${ConfigRepository.match().schema_version}`);
  }

  private static decode(bytes: Uint8Array): string {
    const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
    return decoder.decodeToString(bytes);
  }
}
