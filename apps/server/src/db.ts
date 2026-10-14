/**
 * Хранилище аккаунтов и друзей: SQLite через sql.js (WebAssembly, без нативных модулей).
 * База живёт в памяти и сбрасывается в файл DATA_DIR/blokha.sqlite с задержкой после изменений.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';

const require = createRequire(import.meta.url);

export class Db {
  private constructor(
    private db: Database,
    private file: string | null,
  ) {}
  private timer: NodeJS.Timeout | null = null;

  static async open(dataDir: string | null): Promise<Db> {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    let file: string | null = null;
    let db: Database;
    if (dataDir) {
      mkdirSync(dataDir, { recursive: true });
      file = path.join(dataDir, 'blokha.sqlite');
      db = existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database();
    } else db = new SQL.Database();
    const d = new Db(db, file);
    d.migrate();
    return d;
  }

  private migrate() {
    // новые колонки для старых баз
    for (const sql of ['ALTER TABLE accounts ADD COLUMN rating INTEGER NOT NULL DEFAULT 1000', 'ALTER TABLE accounts ADD COLUMN referred_by INTEGER', 'ALTER TABLE accounts ADD COLUMN referral_rewarded INTEGER NOT NULL DEFAULT 0']) {
      try {
        this.db.exec(sql);
      } catch {
        /* колонка уже есть или таблицы ещё нет — создадим ниже */
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL, provider_id TEXT NOT NULL,
        name TEXT NOT NULL, username TEXT, photo_url TEXT, avatar TEXT NOT NULL DEFAULT '🦊',
        friend_code TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
        rating INTEGER NOT NULL DEFAULT 1000, referred_by INTEGER, referral_rewarded INTEGER NOT NULL DEFAULT 0,
        UNIQUE(provider, provider_id)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, account_id INTEGER NOT NULL, created_at INTEGER NOT NULL, last_used INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        account_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS friendships (
        from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (from_id, to_id)
      );
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT, finished_at INTEGER NOT NULL,
        winner_account INTEGER, players TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, product TEXT NOT NULL, stars INTEGER NOT NULL,
        charge_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clans (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, emblem TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
        owner_id INTEGER NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clan_members (
        clan_id INTEGER NOT NULL, account_id INTEGER NOT NULL UNIQUE, role TEXT NOT NULL, joined_at INTEGER NOT NULL,
        PRIMARY KEY (clan_id, account_id)
      );
      CREATE TABLE IF NOT EXISTS rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL,
        reason TEXT NOT NULL, created_at INTEGER NOT NULL, claimed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_acc ON sessions(account_id);
      CREATE INDEX IF NOT EXISTS idx_games_time ON games(finished_at);
    `);
  }

  run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
    this.scheduleSave();
  }
  get<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T | undefined {
    const st = this.db.prepare(sql);
    st.bind(params);
    const row = st.step() ? (st.getAsObject() as T) : undefined;
    st.free();
    return row;
  }
  all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] {
    const st = this.db.prepare(sql);
    st.bind(params);
    const rows: T[] = [];
    while (st.step()) rows.push(st.getAsObject() as T);
    st.free();
    return rows;
  }

  private scheduleSave() {
    if (!this.file) return;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 500);
    this.timer.unref();
  }
  flush() {
    if (!this.file) return;
    const data = this.db.export();
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, Buffer.from(data));
    renameSync(tmp, this.file);
  }
  close() {
    if (this.timer) clearTimeout(this.timer);
    this.flush();
    this.db.close();
  }
}
