import { MatchDefaults } from './MatchDefaults';
import { DeckConfig } from './DeckConfig';
import { AiPersonasConfig } from './AiPersonasConfig';
import { InteractionCapsConfig } from './InteractionCapsConfig';
import { DemoSeedConfig } from './DemoSeedConfig';
import { Logger } from '../common/Logger';

const TAG = 'ConfigRepository';

/**
 * Cocos 侧配置仓：键名/数值与 rawfile/config 一致。
 * 运行时由 loadFromObjects / loadFromJsonTexts 注入（Creator 资源或 Node 读文件）。
 * wild 等规则数只来自 deck.json — 禁止硬编码。
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

  /** Inject already-parsed JSON objects (parity / tests / Creator). */
  static loadFromObjects(
    matchDefaults: MatchDefaults,
    deckConfig: DeckConfig,
    personas: AiPersonasConfig,
    caps: InteractionCapsConfig,
    demoSeed: DemoSeedConfig
  ): void {
    ConfigRepository.matchDefaults = matchDefaults;
    ConfigRepository.deckConfig = deckConfig;
    ConfigRepository.personas = personas;
    ConfigRepository.caps = caps;
    ConfigRepository.demoSeed = demoSeed;
    ConfigRepository.ready = true;
    Logger.info(TAG, `config loaded schema=${ConfigRepository.match().schema_version}`);
  }

  /** Inject JSON text blobs (same keys as rawfile/config). */
  static loadFromJsonTexts(
    matchText: string,
    deckText: string,
    personasText: string,
    capsText: string,
    demoText: string
  ): void {
    ConfigRepository.loadFromObjects(
      JSON.parse(matchText) as MatchDefaults,
      JSON.parse(deckText) as DeckConfig,
      JSON.parse(personasText) as AiPersonasConfig,
      JSON.parse(capsText) as InteractionCapsConfig,
      JSON.parse(demoText) as DemoSeedConfig
    );
  }

  static resetForTests(): void {
    ConfigRepository.ready = false;
    ConfigRepository.matchDefaults = null;
    ConfigRepository.deckConfig = null;
    ConfigRepository.personas = null;
    ConfigRepository.caps = null;
    ConfigRepository.demoSeed = null;
  }
}
