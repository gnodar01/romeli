import type { UndoEntry } from './store';

export class UndoStack {
  private done: UndoEntry[] = [];
  private undone: UndoEntry[] = [];

  constructor(private limit = 100) {}

  push(entry: UndoEntry) {
    this.done.push(entry);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
  }

  async undo(): Promise<UndoEntry | undefined> {
    const e = this.done.pop();
    if (!e) return undefined;
    await e.undo();
    this.undone.push(e);
    return e;
  }

  async redo(): Promise<UndoEntry | undefined> {
    const e = this.undone.pop();
    if (!e) return undefined;
    await e.redo();
    this.done.push(e);
    return e;
  }

  get canUndo() {
    return this.done.length > 0;
  }

  get canRedo() {
    return this.undone.length > 0;
  }
}
