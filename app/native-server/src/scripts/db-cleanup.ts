#!/usr/bin/env node

/**
 * db-cleanup.ts
 *
 * Cleans up orphaned and invalid data from the agent database.
 *
 * Handles:
 * - Schema migration (pending column additions)
 * - Foreign key violations (orphan sessions/messages)
 * - Invalid projects (missing required fields)
 * - Empty sessions (no messages, can optionally delete)
 * - Database statistics report
 *
 * Usage:
 *   npm run db:cleanup              # Dry run - show what would be cleaned
 *   npm run db:cleanup -- --apply   # Actually perform cleanup
 *   npm run db:cleanup -- --stats   # Show statistics only, no changes
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { getAgentDataDir, getDatabasePath } from '../agent/storage';

// ============================================================================
// Types
// ============================================================================

interface CleanupStats {
  projects: {
    total: number;
    invalid: number;
    deleted: number;
  };
  sessions: {
    total: number;
    orphan: number;
    deleted: number;
  };
  messages: {
    total: number;
    orphan: number;
    deleted: number;
  };
  migrations: {
    applied: string[];
  };
  foreignKeyViolations: number;
}

interface CleanupOptions {
  apply: boolean;
  statsOnly: boolean;
  dbPath?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function colorText(text: string, color: 'green' | 'yellow' | 'red' | 'blue'): string {
  if (!process.stdout.isTTY) return text;
  const codes: Record<string, string> = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
  };
  const reset = '\x1b[0m';
  return `${codes[color]}${text}${reset}`;
}

function badge(status: 'ok' | 'warn' | 'error' | 'info'): string {
  const badges = {
    ok: colorText('[OK]', 'green'),
    warn: colorText('[WARN]', 'yellow'),
    error: colorText('[ERROR]', 'red'),
    info: colorText('[INFO]', 'blue'),
  };
  return badges[status];
}

// ============================================================================
// Schema Migration
// ============================================================================

interface Migration {
  name: string;
  check: (db: Database.Database) => boolean;
  apply: (db: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    name: 'Add active_claude_session_id to projects',
    check: (db) => columnExists(db, 'projects', 'active_claude_session_id'),
    apply: (db) => db.exec('ALTER TABLE projects ADD COLUMN active_claude_session_id TEXT'),
  },
  {
    name: 'Add use_ccr to projects',
    check: (db) => columnExists(db, 'projects', 'use_ccr'),
    apply: (db) => db.exec('ALTER TABLE projects ADD COLUMN use_ccr TEXT'),
  },
  {
    name: 'Add enable_chrome_mcp to projects',
    check: (db) => columnExists(db, 'projects', 'enable_chrome_mcp'),
    apply: (db) =>
      db.exec("ALTER TABLE projects ADD COLUMN enable_chrome_mcp TEXT NOT NULL DEFAULT '1'"),
  },
  {
    name: 'Add metadata to messages',
    check: (db) => columnExists(db, 'messages', 'metadata'),
    apply: (db) => db.exec('ALTER TABLE messages ADD COLUMN metadata TEXT'),
  },
];

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function runMigrations(db: Database.Database, apply: boolean): string[] {
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (!migration.check(db)) {
      if (apply) {
        console.log(`  ${badge('info')} Applying: ${migration.name}`);
        migration.apply(db);
        applied.push(migration.name);
      } else {
        console.log(`  ${badge('warn')} Missing: ${migration.name}`);
        applied.push(migration.name + ' (pending)');
      }
    }
  }
  return applied;
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Find and optionally delete invalid projects.
 * Invalid = missing id, name, or root_path.
 */
function cleanupInvalidProjects(
  db: Database.Database,
  apply: boolean,
): { total: number; deleted: number } {
  const projects = db.prepare('SELECT id, name, root_path FROM projects').all() as Array<{
    id: string | null;
    name: string | null;
    root_path: string | null;
  }>;

  const total = projects.length;
  const invalid = projects.filter((p) => !p.id || !p.name || !p.root_path);

  if (invalid.length === 0) {
    console.log(`  ${badge('ok')} All ${total} projects are valid`);
    return { total, deleted: 0 };
  }

  console.log(`  ${badge('warn')} Found ${invalid.length} invalid project(s):`);
  for (const p of invalid) {
    console.log(
      `    - id=${p.id || 'NULL'}, name=${p.name || 'NULL'}, root_path=${p.root_path || 'NULL'}`,
    );
  }

  if (apply) {
    const ids = invalid.map((p) => p.id).filter(Boolean);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const deleted = db.prepare(`DELETE FROM projects WHERE id IN (${placeholders})`).run(...ids);
      console.log(`  ${badge('ok')} Deleted ${deleted.changes} invalid project(s)`);
      return { total, deleted: deleted.changes };
    }
  } else {
    console.log(`  ${badge('warn')} Run with --apply to delete invalid projects`);
  }

  return { total, deleted: 0 };
}

/**
 * Find and optionally delete orphan sessions (project no longer exists).
 */
function cleanupOrphanSessions(
  db: Database.Database,
  apply: boolean,
): { total: number; orphan: number; deleted: number } {
  const allSessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as {
    count: number;
  };
  const total = allSessions.count;

  const orphans = db
    .prepare(
      `SELECT s.id, s.name, s.project_id, s.engine_name
       FROM sessions s
       LEFT JOIN projects p ON s.project_id = p.id
       WHERE p.id IS NULL`,
    )
    .all() as Array<{ id: string; name: string | null; project_id: string; engine_name: string }>;

  if (orphans.length === 0) {
    console.log(`  ${badge('ok')} No orphan sessions (${total} total)`);
    return { total, orphan: 0, deleted: 0 };
  }

  console.log(`  ${badge('warn')} Found ${orphans.length} orphan session(s):`);
  for (const s of orphans.slice(0, 10)) {
    console.log(
      `    - "${s.name || 'unnamed'}" (engine: ${s.engine_name}, project: ${s.project_id.slice(0, 8)}...)`,
    );
  }
  if (orphans.length > 10) {
    console.log(`    ... and ${orphans.length - 10} more`);
  }

  if (apply) {
    const ids = orphans.map((s) => s.id);
    const placeholders = ids.map(() => '?').join(',');
    const deleted = db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...ids);
    console.log(`  ${badge('ok')} Deleted ${deleted.changes} orphan session(s)`);
    return { total, orphan: orphans.length, deleted: deleted.changes };
  } else {
    console.log(`  ${badge('warn')} Run with --apply to delete orphan sessions`);
  }

  return { total, orphan: orphans.length, deleted: 0 };
}

/**
 * Find and optionally delete orphan messages (session no longer exists).
 * Note: messages table has no FK constraint to sessions, so orphans can accumulate.
 */
function cleanupOrphanMessages(
  db: Database.Database,
  apply: boolean,
): { total: number; orphan: number; deleted: number } {
  const allMessages = db.prepare('SELECT COUNT(*) as count FROM messages').get() as {
    count: number;
  };
  const total = allMessages.count;

  const orphans = db
    .prepare(
      `SELECT m.id, m.session_id, m.role, m.content, m.project_id
       FROM messages m
       LEFT JOIN sessions s ON m.session_id = s.id
       WHERE s.id IS NULL`,
    )
    .all() as Array<{
    id: string;
    session_id: string;
    role: string;
    content: string;
    project_id: string;
  }>;

  if (orphans.length === 0) {
    console.log(`  ${badge('ok')} No orphan messages (${total} total)`);
    return { total, orphan: 0, deleted: 0 };
  }

  console.log(`  ${badge('warn')} Found ${orphans.length} orphan message(s):`);
  for (const m of orphans.slice(0, 5)) {
    const preview = m.content.slice(0, 60) + (m.content.length > 60 ? '...' : '');
    console.log(
      `    - session=${m.session_id.slice(0, 8)}..., role=${m.role}, preview="${preview}"`,
    );
  }
  if (orphans.length > 5) {
    console.log(`    ... and ${orphans.length - 5} more`);
  }

  if (apply) {
    const ids = orphans.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const deleted = db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids);
    console.log(`  ${badge('ok')} Deleted ${deleted.changes} orphan message(s)`);
    return { total, orphan: orphans.length, deleted: deleted.changes };
  } else {
    console.log(`  ${badge('warn')} Run with --apply to delete orphan messages`);
  }

  return { total, orphan: orphans.length, deleted: 0 };
}

/**
 * Check for foreign key violations in messages->projects.
 */
function checkForeignKeys(db: Database.Database): number {
  db.exec('PRAGMA foreign_keys = ON');
  const violations = db.pragma('foreign_key_check') as Array<{
    table: string;
    rowid: number;
    parent: string;
    fkid: number;
  }>;

  if (violations.length === 0) {
    console.log(`  ${badge('ok')} No foreign key violations`);
    return 0;
  }

  console.log(`  ${badge('warn')} Found ${violations.length} foreign key violation(s):`);
  for (const v of violations.slice(0, 10)) {
    console.log(`    - table=${v.table}, parent=${v.parent}, rowid=${v.rowid}`);
  }
  if (violations.length > 10) {
    console.log(`    ... and ${violations.length - 10} more`);
  }

  return violations.length;
}

// ============================================================================
// Statistics
// ============================================================================

function printStats(db: Database.Database): void {
  const stats = [
    { label: 'Projects', query: 'SELECT COUNT(*) as count FROM projects' },
    { label: 'Sessions', query: 'SELECT COUNT(*) as count FROM sessions' },
    { label: 'Messages', query: 'SELECT COUNT(*) as count FROM messages' },
  ];

  console.log(`\n${colorText('Database Statistics', 'blue')}`);
  console.log('─'.repeat(40));
  for (const { label, query } of stats) {
    const result = db.prepare(query).get() as { count: number };
    console.log(`  ${label.padEnd(12)} ${result.count}`);
  }

  // Check database size
  const dbPath = getDatabasePath();
  try {
    const fs = require('fs');
    if (fs.existsSync(dbPath)) {
      const size = fs.statSync(dbPath).size;
      const sizeStr =
        size > 1024 * 1024
          ? `${(size / (1024 * 1024)).toFixed(2)} MB`
          : size > 1024
            ? `${(size / 1024).toFixed(1)} KB`
            : `${size} B`;
      console.log(`  ${'DB Size'.padEnd(12)} ${sizeStr}`);
    }
  } catch {
    // ignore
  }
}

// ============================================================================
// Main
// ============================================================================

function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  return {
    apply: args.includes('--apply'),
    statsOnly: args.includes('--stats'),
    dbPath: args.find((a) => a.startsWith('--db='))?.slice(5),
  };
}

function showHelp(): void {
  console.log(`
${colorText('Chrome MCP Agent Database Cleanup', 'blue')}

Usage:
  npm run db:cleanup              # Dry run - show issues
  npm run db:cleanup -- --apply   # Perform cleanup
  npm run db:cleanup -- --stats   # Show statistics only
  npm run db:cleanup -- --db=/path/to/agent.db  # Custom database path

What it cleans:
  - Schema migrations (missing columns)
  - Invalid projects (missing name, id, or root_path)
  - Orphan sessions (project no longer exists)
  - Orphan messages (session no longer exists)
  - Foreign key violations
`);
}

async function main(): Promise<number> {
  const options = parseArgs();

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
    return 0;
  }

  return runCleanup(options);
}

/**
 * Public entry point for CLI integration.
 */
export async function runDbCleanup(options: CleanupOptions): Promise<number> {
  return runCleanup(options);
}

async function runCleanup(options: CleanupOptions): Promise<number> {
  const dbPath = options.dbPath || getDatabasePath();
  const db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  console.log(`${colorText('Chrome MCP Agent Database Cleanup', 'blue')}`);
  console.log(`Database: ${dbPath}`);
  console.log(
    `Mode: ${options.apply ? colorText('APPLY (changes will be made)', 'red') : options.statsOnly ? colorText('STATS ONLY', 'blue') : colorText('DRY RUN (no changes)', 'yellow')}`,
  );
  console.log('');

  // Stats only mode
  if (options.statsOnly) {
    printStats(db);
    db.close();
    return 0;
  }

  // Run cleanup steps
  console.log(`${colorText('1. Schema Migrations', 'blue')}`);
  const migrations = runMigrations(db, options.apply);
  if (migrations.length === 0) {
    console.log(`  ${badge('ok')} Schema is up to date`);
  }
  console.log('');

  console.log(`${colorText('2. Projects', 'blue')}`);
  const projectStats = cleanupInvalidProjects(db, options.apply);
  console.log('');

  console.log(`${colorText('3. Sessions', 'blue')}`);
  const sessionStats = cleanupOrphanSessions(db, options.apply);
  console.log('');

  console.log(`${colorText('4. Messages', 'blue')}`);
  const messageStats = cleanupOrphanMessages(db, options.apply);
  console.log('');

  console.log(`${colorText('5. Foreign Key Check', 'blue')}`);
  const fkViolations = checkForeignKeys(db);
  console.log('');

  // Summary
  const hasIssues =
    migrations.some((m) => m.includes('pending')) ||
    projectStats.deleted > 0 ||
    sessionStats.orphan > 0 ||
    messageStats.orphan > 0 ||
    fkViolations > 0;

  console.log(`${colorText('Summary', 'blue')}`);
  console.log('─'.repeat(40));
  if (!hasIssues) {
    console.log(`  ${badge('ok')} Database is clean - no issues found`);
  } else if (!options.apply) {
    console.log(`  ${badge('warn')} Issues found. Run with --apply to fix.`);
  } else {
    console.log(`  ${badge('ok')} Cleanup complete.`);
  }

  printStats(db);

  db.close();
  return hasIssues && !options.apply ? 1 : 0;
}

if (require.main === module) {
  main()
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
      console.error(`${badge('error')} Cleanup failed:`, error);
      process.exit(1);
    });
}
