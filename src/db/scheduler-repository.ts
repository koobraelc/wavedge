import type Database from "better-sqlite3";
import { getDatabase } from "./database.js";

export interface SchedulerError {
  id: number;
  task_name: string;
  error_message: string;
  error_stack: string | null;
  created_at: string;
}

export class SchedulerRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  /** Log a scheduler error and prune old entries (keep last 1000) */
  logError(taskName: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack ?? null : null;

    this.db.prepare(
      "INSERT INTO scheduler_errors (task_name, error_message, error_stack) VALUES (?, ?, ?)"
    ).run(taskName, message, stack);

    // Prune: keep last 1000 rows
    this.db.prepare(
      `DELETE FROM scheduler_errors WHERE id NOT IN (
        SELECT id FROM scheduler_errors ORDER BY id DESC LIMIT 1000
      )`
    ).run();
  }

  /** Get recent errors, optionally filtered by task */
  getRecent(limit: number = 20, taskName?: string): SchedulerError[] {
    if (taskName) {
      return this.db
        .prepare(
          "SELECT * FROM scheduler_errors WHERE task_name = ? ORDER BY id DESC LIMIT ?"
        )
        .all(taskName, limit) as SchedulerError[];
    }
    return this.db
      .prepare("SELECT * FROM scheduler_errors ORDER BY id DESC LIMIT ?")
      .all(limit) as SchedulerError[];
  }

  /** Count errors in the last N minutes */
  countRecent(minutes: number = 60): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM scheduler_errors WHERE created_at >= datetime('now', ?)"
      )
      .get(`-${minutes} minutes`) as { n: number };
    return row.n;
  }
}
