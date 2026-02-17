import {
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  completeTask,
  clearAllTasks,
  type Task,
} from './services/tasks.js';

const args = process.argv.slice(2);

// Flatten tree with numbering (1-indexed)
function numberTasks(tasks: Task[], depth = 0): { task: Task; depth: number }[] {
  const result: { task: Task; depth: number }[] = [];
  for (const task of tasks) {
    result.push({ task, depth });
    if (task.children && task.children.length > 0) {
      result.push(...numberTasks(task.children, depth + 1));
    }
  }
  return result;
}

function getNumbered() {
  return numberTasks(getTasks());
}

function resolveTask(arg: string) {
  const num = parseInt(arg, 10);
  if (isNaN(num)) {
    console.error(`"${arg}" は有効な番号ではありません。crumb list で番号を確認してください。`);
    process.exit(1);
  }
  const list = getNumbered();
  if (num < 1 || num > list.length) {
    console.error(`番号 ${num} は範囲外です。(1〜${list.length})`);
    process.exit(1);
  }
  return list[num - 1].task;
}

function printList() {
  const list = getNumbered();
  if (list.length === 0) {
    console.log('タスクなし');
    return;
  }
  const icon = { todo: '\u25CB', done: '\u25CF' } as const;
  const numWidth = String(list.length).length;
  for (let i = 0; i < list.length; i++) {
    const { task, depth } = list[i];
    const num = String(i + 1).padStart(numWidth, ' ');
    const indent = '  '.repeat(depth);
    console.log(`${num}. ${indent}${icon[task.status]} ${task.title}`);
  }
}

if (args[0] === '--help' || args[0] === '-h') {
  console.log(`🍞 crumb — マイクロタスク管理TUI

使い方:
  crumb                       TUI を起動
  crumb list                  ツリー表示（番号付き）
  crumb add "タスク名"         タスクを追加
  crumb add "A" "B" "C"       複数追加
  crumb done <番号>            完了にする
  crumb undo <番号>            未完了に戻す
  crumb edit <番号> "新しい名前"  名前を変更
  crumb rm <番号>              削除
  crumb clear                 全タスク削除
  crumb --help                このヘルプを表示

番号は crumb list で確認できます。
TUI内では ? キーでキーバインド一覧を確認できます。`);
} else if (args.length === 0) {
  const { default: App } = await import('./app.js');
  const { render } = await import('ink');
  const React = await import('react');
  render(React.createElement(App));
} else if (args[0] === 'list' || args[0] === 'ls') {
  printList();
} else if (args[0] === 'add') {
  const titles = args.slice(1);
  if (titles.length === 0) {
    console.error('タスク名を指定してください。例: crumb add "買い物"');
    process.exit(1);
  }
  for (const title of titles) {
    addTask(title);
    console.log(`+ ${title}`);
  }
} else if (args[0] === 'done') {
  if (!args[1]) { console.error('番号を指定してください。'); process.exit(1); }
  const task = resolveTask(args[1]);
  completeTask(task.id);
  console.log(`● ${task.title}`);
} else if (args[0] === 'undo') {
  if (!args[1]) { console.error('番号を指定してください。'); process.exit(1); }
  const task = resolveTask(args[1]);
  updateTask(task.id, { status: 'todo' });
  console.log(`○ ${task.title}`);
} else if (args[0] === 'edit') {
  if (!args[1] || !args[2]) {
    console.error('使い方: crumb edit <番号> "新しい名前"');
    process.exit(1);
  }
  const task = resolveTask(args[1]);
  updateTask(task.id, { title: args[2] });
  console.log(`✎ ${task.title} → ${args[2]}`);
} else if (args[0] === 'rm' || args[0] === 'delete') {
  if (!args[1]) { console.error('番号を指定してください。'); process.exit(1); }
  const task = resolveTask(args[1]);
  deleteTask(task.id);
  console.log(`- ${task.title}`);
} else if (args[0] === 'clear') {
  const { createInterface } = await import('readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('全タスクを削除しますか？ (y/N) ');
  rl.close();
  if (answer.toLowerCase() === 'y') {
    clearAllTasks();
    console.log('全タスクを削除しました。');
  } else {
    console.log('キャンセルしました。');
  }
} else {
  // 引数がコマンド名でなければタスク追加として扱う
  for (const title of args) {
    addTask(title);
    console.log(`+ ${title}`);
  }
}
