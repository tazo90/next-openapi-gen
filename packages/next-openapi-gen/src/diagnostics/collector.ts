import type { Diagnostic } from "../shared/types.js";

export class DiagnosticsCollector {
  private readonly diagnostics: Diagnostic[] = [];

  public add(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  public getAll(): Diagnostic[] {
    return [...this.diagnostics];
  }

  public hasAny(): boolean {
    return this.diagnostics.length > 0;
  }
}
