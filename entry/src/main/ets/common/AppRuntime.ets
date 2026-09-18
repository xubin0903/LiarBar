import { MatchEngine } from '../engine/MatchEngine';
import { LiveWindowAdapter } from '../harmony/LiveWindowAdapter';
import { MatchDirector } from './MatchDirector';

export class AppRuntime {
  static readonly engine: MatchEngine = new MatchEngine();
  static readonly liveWindow: LiveWindowAdapter = new LiveWindowAdapter();
  static readonly director: MatchDirector = new MatchDirector();

  static bootDirector(): void {
    AppRuntime.director.bind(AppRuntime.engine, AppRuntime.liveWindow);
  }
}
