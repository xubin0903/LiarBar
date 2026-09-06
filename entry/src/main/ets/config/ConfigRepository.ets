import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { Logger } from '../common/Logger';
import { MatchDefaults } from './MatchDefaults';
import { DeckConfig, RankCounts } from './DeckConfig';
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
      ConfigRepository.parseDeck(ConfigRepository.decode(await rm.getRawFileContent('config/deck.json')));
    ConfigRepository.personas =
      JSON.parse(ConfigRepository.decode(await rm.getRawFileContent('config/ai_personas.json'))) as AiPersonasConfig;
    ConfigRepository.caps =
      JSON.parse(ConfigRepository.decode(await rm.getRawFileContent('config/interaction_caps.json'))) as InteractionCapsConfig;
    ConfigRepository.demoSeed =
      JSON.parse(ConfigRepository.decode(await rm.getRawFileContent('config/demo_seed.json'))) as DemoSeedConfig;
    ConfigRepository.ready = true;
    Logger.info(TAG, `config loaded schema=${ConfigRepository.match().schema_version}`);
  }

  /**
   * Map deck.json keys "3"|"4"|"5"|"6" onto DeckByPlayers.n3..n6.
   * Indexed access is only used on ESObject (JSON.parse), never on typed fields.
   */
  private static parseDeck(text: string): DeckConfig {
    const raw: ESObject = JSON.parse(text);
    const rawDecks: ESObject = raw['decks'];
    const mapped: DeckConfig = {
      schema_version: raw['schema_version'] as string,
      ranks: raw['ranks'] as string[],
      wild: raw['wild'] as string,
      claimable: raw['claimable'] as string[],
      decks: {
        n3: ConfigRepository.copyRankCounts(rawDecks['3']),
        n4: ConfigRepository.copyRankCounts(rawDecks['4']),
        n5: ConfigRepository.copyRankCounts(rawDecks['5']),
        n6: ConfigRepository.copyRankCounts(rawDecks['6'])
      }
    };
    return mapped;
  }

  private static copyRankCounts(raw: ESObject): RankCounts {
    const bag: RankCounts = {
      A: raw['A'] as number,
      K: raw['K'] as number,
      Q: raw['Q'] as number,
      JOKER: raw['JOKER'] as number
    };
    return bag;
  }

  private static decode(bytes: Uint8Array): string {
    const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
    return decoder.decodeToString(bytes);
  }
}
