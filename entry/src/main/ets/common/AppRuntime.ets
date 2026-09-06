import { MatchEngine } from '../engine/MatchEngine';
import { LiveWindowAdapter } from '../harmony/LiveWindowAdapter';

export class AppRuntime {
  static readonly engine: MatchEngine = new MatchEngine();
  static readonly liveWindow: LiveWindowAdapter = new LiveWindowAdapter();
}
