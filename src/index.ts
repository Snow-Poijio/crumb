import { addTask, getAllTasksFlat, completeTask, clearAllTasks } from './services/tasks.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  const { default: App } = await import('./app.js');
  const { render } = await import('ink');
  const React = await import('react');
  render(React.createElement(App));
} else if (args[0] === 'list') {
  const tasks = getAllTasksFlat();
  if (tasks.length === 0) {
    console.log('No tasks.');
  } else {
    const icon = { todo: '\u2610', done: '\u2611' } as const;
    for (const t of tasks) {
      console.log(`${icon[t.status]} ${t.title}  (${t.id.slice(0, 8)})`);
    }
  }
} else if (args[0] === 'done' && args[1]) {
  const prefix = args[1];
  const tasks = getAllTasksFlat();
  const match = tasks.filter(t => t.id.startsWith(prefix));
  if (match.length === 0) {
    console.error(`No task found matching "${prefix}".`);
    process.exit(1);
  } else if (match.length > 1) {
    console.error(`Ambiguous ID "${prefix}" matches ${match.length} tasks. Be more specific.`);
    process.exit(1);
  } else {
    completeTask(match[0].id);
    console.log(`Done: ${match[0].title}`);
  }
} else if (args[0] === 'clear') {
  const { createInterface } = await import('readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Delete all tasks? (y/N) ');
  rl.close();
  if (answer.toLowerCase() === 'y') {
    clearAllTasks();
    console.log('All tasks cleared.');
  } else {
    console.log('Cancelled.');
  }
} else {
  for (const title of args) {
    addTask(title);
    console.log(`Added: ${title}`);
  }
}
