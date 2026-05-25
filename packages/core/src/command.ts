/**
 * Command-паттерн + стек Undo/Redo. Заложен с Фазы 0 (CLAUDE принцип 5).
 * Принцип 7: команды СЕРИАЛИЗУЕМЫ (`type` — дискриминатор) → задел под realtime-совместную работу.
 */

export interface Command {
  /** Сериализуемый тип команды (для будущего op-log / синхронизации). */
  readonly type: string;
  /** Применить изменение. */
  do(): void;
  /** Откатить изменение (должно быть точной инверсией `do`). */
  undo(): void;
}

export type StackListener = (stack: CommandStack) => void;

export class CommandStack {
  private past: Command[] = [];
  private future: Command[] = [];
  private listeners = new Set<StackListener>();

  /** Выполнить команду и положить в историю (очищает redo). */
  execute(cmd: Command): void {
    cmd.do();
    this.past.push(cmd);
    this.future.length = 0;
    this.notify();
  }

  undo(): void {
    const cmd = this.past.pop();
    if (!cmd) return;
    cmd.undo();
    this.future.push(cmd);
    this.notify();
  }

  redo(): void {
    const cmd = this.future.pop();
    if (!cmd) return;
    cmd.do();
    this.past.push(cmd);
    this.notify();
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Подписка на изменения стека (для обновления UI). Возвращает отписку. */
  subscribe(listener: StackListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this);
  }
}
