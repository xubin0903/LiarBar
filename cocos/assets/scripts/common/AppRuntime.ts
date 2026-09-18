import { MatchEngine } from '../engine/MatchEngine';
import { MatchDirector } from './MatchDirector';

export class AppRuntime {
  static readonly engine: MatchEngine = new MatchEngine();
  static readonly director: MatchDirector = new MatchDirector();

  static bootDirector(onSnapshot?: (snap: any) => void): void {
    AppRuntime.director.bind(AppRuntime.engine, onSnapshot);
  }
}
