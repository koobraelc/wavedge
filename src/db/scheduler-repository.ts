import { Pool } from "pg";
import { getPool } from "./database.js";

export interface SchedulerError {
  id: number;
  task_name: string;
  error_message: string;
  error_stack: string | null;
  created_at: string;
}

export class SchedulerRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  /** Log a scheduler error and prune old entries (keep last 1000) */
  async logError(taskName: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack ?? null : null;

    await this.pool.query(
      "INSERT INTO scheduler_errors (task_name, error_message, error_stack) VALUES ($1, $2, $3)",
      [taskName, message, stack]
    );

    await this.pool.query(
      `DELETE FROM scheduler_errors WHERE id NOT IN (
        SELECT id FROM scheduler_errors ORDER BY id DESC LIMIT 1000
      )`
    );
  }

  /** Get recent errors, optionally filtered by task */
  async getRecent(limit: number = 20, taskName?: string): Promise<SchedulerError[]> {
    if (taskName) {
      const { rows } = await this.pool.query(
        "SELECT * FROM scheduler_errors WHERE task_name = $1 ORDER BY id DESC LIMIT $2",
        [taskName, limit]
      );
      return rows;
    }
    const { rows } = await this.pool.query(
      "SELECT * FROM scheduler_errors ORDER BY id DESC LIMIT $1",
      [limit]
    );
    return rows;
  }

  /** Count errors in the last N minutes */
  async countRecent(minutes: number = 60): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*) AS n FROM scheduler_errors WHERE created_at >= NOW() - INTERVAL '${minutes} minutes'`
    );
    return rows[0].n;
  }
}
