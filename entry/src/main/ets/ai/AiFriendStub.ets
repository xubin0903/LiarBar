import { PersonaRow } from '../config/AiPersonasConfig';
import { SeededRng } from '../engine/SeededRng';
import { AiFriend } from './AiFriend';
import { PersonaId } from './PersonaId';

/** Kept name for scaffold imports. Decisions live in AiFriend. No LLM. */
export class AiFriendStub {
  private readonly inner: AiFriend = new AiFriend();

  row(id: PersonaId): PersonaRow {
    return this.inner.row(id);
  }

  thinkDelayMs(id: PersonaId): number {
    return this.inner.thinkDelayMs(id, new SeededRng(0));
  }
}
