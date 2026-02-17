import db from '../db.js';
import { ulid } from 'ulid';

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'done';
  parentId: string | null;
  position: number;
  children?: Task[];
}

export interface TaskRow {
  id: string;
  title: string;
  status: 'todo' | 'done';
  parent_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export type TaskOperation =
  | { op: 'add'; id?: string; title: string; parentId?: string | null }
  | { op: 'delete'; taskId: string }
  | { op: 'move'; taskId: string; newParentId: string | null }
  | { op: 'update'; taskId: string; title: string }
  | { op: 'done'; taskId: string };

// --- Undo ---

const undoStack: TaskRow[][] = [];
const MAX_UNDO = 50;

export function saveSnapshot(): void {
  const snapshot = db.prepare('SELECT * FROM tasks').all() as TaskRow[];
  undoStack.push(snapshot);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

export function undo(): boolean {
  if (undoStack.length === 0) return false;
  const snapshot = undoStack.pop()!;
  const restore = db.transaction(() => {
    db.prepare('DELETE FROM tasks').run();
    const insert = db.prepare(
      'INSERT INTO tasks (id, title, status, parent_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const row of snapshot) {
      insert.run(row.id, row.title, row.status, row.parent_id, row.position, row.created_at, row.updated_at);
    }
  });
  restore();
  return true;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function undoDepth(): number {
  return undoStack.length;
}

// --- CRUD ---

export function addTask(title: string, parentId?: string | null): Task {
  const id = ulid();
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM tasks WHERE parent_id IS ?'
  ).get(parentId ?? null) as { pos: number };

  db.prepare(
    'INSERT INTO tasks (id, title, parent_id, position) VALUES (?, ?, ?, ?)'
  ).run(id, title, parentId ?? null, maxPos.pos);

  return { id, title, status: 'todo', parentId: parentId ?? null, position: maxPos.pos };
}

export function getTasks(): Task[] {
  const rows = db.prepare(
    'SELECT * FROM tasks ORDER BY position ASC'
  ).all() as TaskRow[];

  const map = new Map<string, Task>();
  const roots: Task[] = [];

  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      title: row.title,
      status: row.status as Task['status'],
      parentId: row.parent_id,
      position: row.position,
      children: [],
    });
  }

  for (const task of map.values()) {
    if (task.parentId && map.has(task.parentId)) {
      map.get(task.parentId)!.children!.push(task);
    } else {
      roots.push(task);
    }
  }

  return roots;
}

export function getAllTasksFlat(): Task[] {
  const rows = db.prepare(
    'SELECT * FROM tasks ORDER BY position ASC'
  ).all() as TaskRow[];

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    status: row.status as Task['status'],
    parentId: row.parent_id,
    position: row.position,
  }));
}

export function updateTask(id: string, fields: { title?: string; status?: Task['status'] }): void {
  if (fields.title !== undefined) {
    db.prepare("UPDATE tasks SET title = ?, updated_at = datetime('now') WHERE id = ?")
      .run(fields.title, id);
  }
  if (fields.status !== undefined) {
    db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(fields.status, id);
  }
}

export function deleteTask(id: string): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

export function completeTask(id: string): void {
  db.prepare("UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(id);
  autoCompleteParent(id);
}

/** 子が全部 done なら親も done にする（再帰的に上へ伝播） */
function autoCompleteParent(childId: string): void {
  const row = db.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(childId) as { parent_id: string | null } | undefined;
  if (!row?.parent_id) return;

  const parentId = row.parent_id;
  const stats = db.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
     FROM tasks WHERE parent_id = ?`
  ).get(parentId) as { total: number; done: number };

  if (stats.total > 0 && stats.total === stats.done) {
    db.prepare("UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(parentId);
    autoCompleteParent(parentId);
  }
}

export function moveTask(id: string, newParentId: string | null): void {
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM tasks WHERE parent_id IS ?'
  ).get(newParentId) as { pos: number };

  db.prepare(
    "UPDATE tasks SET parent_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(newParentId, maxPos.pos, id);
}

/** Swap position of a task with its sibling above or below */
export function reorderTask(id: string, direction: 'up' | 'down'): boolean {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  if (!task) return false;

  const siblings = db.prepare(
    'SELECT * FROM tasks WHERE parent_id IS ? ORDER BY position ASC'
  ).all(task.parent_id) as TaskRow[];

  const idx = siblings.findIndex(s => s.id === id);
  if (idx < 0) return false;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return false;

  const other = siblings[swapIdx];
  const swap = db.transaction(() => {
    db.prepare("UPDATE tasks SET position = ?, updated_at = datetime('now') WHERE id = ?")
      .run(other.position, task.id);
    db.prepare("UPDATE tasks SET position = ?, updated_at = datetime('now') WHERE id = ?")
      .run(task.position, other.id);
  });
  swap();
  return true;
}

/** Move task out to parent's level (unindent) or into previous sibling (indent) */
export function indentTask(id: string, direction: 'indent' | 'outdent'): boolean {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  if (!task) return false;

  if (direction === 'outdent') {
    // Move to grandparent level
    if (!task.parent_id) return false;
    const parent = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.parent_id) as TaskRow | undefined;
    if (!parent) return false;
    moveTask(id, parent.parent_id);
    return true;
  } else {
    // indent: make child of previous sibling
    const siblings = db.prepare(
      'SELECT * FROM tasks WHERE parent_id IS ? ORDER BY position ASC'
    ).all(task.parent_id) as TaskRow[];
    const idx = siblings.findIndex(s => s.id === id);
    if (idx <= 0) return false;
    const prevSibling = siblings[idx - 1];
    moveTask(id, prevSibling.id);
    return true;
  }
}

export function clearAllTasks(): void {
  db.prepare('DELETE FROM tasks').run();
}

export function getChildrenCount(parentId: string): { total: number; done: number } {
  const row = db.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
     FROM tasks WHERE parent_id = ?`
  ).get(parentId) as { total: number; done: number };
  return { total: row.total, done: row.done ?? 0 };
}

export function applyOperations(operations: TaskOperation[]): void {
  // Map temp IDs (e.g. "temp_1") to real ULIDs created by addTask
  const idMap = new Map<string, string>();

  const resolveId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    return idMap.get(id) ?? id;
  };

  const run = db.transaction(() => {
    for (const op of operations) {
      switch (op.op) {
        case 'add': {
          const realParentId = resolveId(op.parentId);
          const task = addTask(op.title, realParentId);
          if (op.id) {
            idMap.set(op.id, task.id);
          }
          break;
        }
        case 'delete':
          deleteTask(resolveId(op.taskId)!);
          break;
        case 'move':
          moveTask(resolveId(op.taskId)!, resolveId(op.newParentId));
          break;
        case 'update':
          updateTask(resolveId(op.taskId)!, { title: op.title });
          break;
        case 'done':
          completeTask(resolveId(op.taskId)!);
          break;
      }
    }
  });
  run();
}
