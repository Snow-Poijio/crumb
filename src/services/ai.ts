import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Task, TaskOperation } from './tasks.js';

const statusIcon: Record<Task['status'], string> = {
  todo: '☐',
  done: '☑',
};

export function formatTree(tasks: Task[], indent = 0): string {
  const lines: string[] = [];
  for (const task of tasks) {
    const prefix = '  '.repeat(indent);
    lines.push(`${prefix}[${task.id}] ${statusIcon[task.status]} ${task.title}`);
    if (task.children && task.children.length > 0) {
      lines.push(formatTree(task.children, indent + 1));
    }
  }
  return lines.join('\n');
}

function extractJSON(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }
  const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }
  return JSON.parse(text);
}

export interface PreviousProposal {
  instruction: string;
  operations: TaskOperation[];
}

export async function executeAI(
  instruction: string,
  currentTasks: Task[],
  previous?: PreviousProposal,
): Promise<TaskOperation[]> {
  const tree = currentTasks.length > 0
    ? formatTree(currentTasks)
    : '(タスクなし)';

  let previousContext = '';
  if (previous) {
    previousContext = `
## 前回の提案（修正が必要）:
ユーザーの前回の指示: 「${previous.instruction}」
あなたの前回の提案:
${JSON.stringify({ operations: previous.operations }, null, 2)}

ユーザーはこの提案に対して修正を求めています。以下の修正指示に従い、前回の提案を改善した新しい操作リストを返してください。
`;
  }

  const prompt = `あなたはタスク管理アシスタントです。
現在のタスクツリーとユーザーの指示を受け取り、適用すべき操作のリストをJSON形式で返してください。

## 入力について:
ユーザーの指示は音声入力（文字起こし）の場合があります。以下を考慮してください:
- 誤変換・誤字脱字は文脈から推測して適切に補正する（例: 「りりーす」→「リリース」、「たすく」→「タスク」）
- 句読点がない、話し言葉的な表現でも意図を汲み取る
- 同音異義語の誤変換に注意する（例: 「完了して」と「感慮して」）
- タスクのタイトルを生成する際は、補正済みの正しい表記を使う

## 現在のタスクツリー:
${tree}
${previousContext}
## ユーザーの指示:
${instruction}

## 操作フォーマット:
以下の操作が使えます。JSONの配列で返してください。

- タスク追加: { "op": "add", "id": "temp_1", "title": "タスク名", "parentId": "親タスクID or null" }
- タスク削除: { "op": "delete", "taskId": "タスクID" }
- タスク移動: { "op": "move", "taskId": "タスクID", "newParentId": "新しい親ID or null" }
- タスク更新: { "op": "update", "taskId": "タスクID", "title": "新しいタイトル" }
- タスク完了: { "op": "done", "taskId": "タスクID" }

## 重要なルール:
- 既存タスクを参照するときは、ツリーに表示されている実際のID（[...]内の文字列）を使ってください。
- 新しいタスクを追加する場合は、"id" フィールドに一時ID（"temp_1", "temp_2", ...）を割り当ててください。
- 新しく追加するタスクの子タスクを同時に追加する場合、parentId に親の一時ID（例: "temp_1"）を指定してください。
- 親タスクの add は子タスクの add より前に記述してください。

## レスポンス形式:
必ず以下のJSON形式のみで応答してください。説明文は不要です。

{ "operations": [ ... ] }`;

  try {
    const result = query({
      prompt,
      options: {
        model: 'sonnet',
        maxTurns: 1,
      },
    });

    for await (const message of result) {
      if (message.type === 'assistant') {
        const textContent = message.message.content
          .filter((block: { type: string }) => block.type === 'text')
          .map((block: { type: string; text?: string }) => block.text ?? '')
          .join('');

        if (!textContent) continue;

        const parsed = extractJSON(textContent) as
          | { operations: TaskOperation[] }
          | TaskOperation[];

        if (Array.isArray(parsed)) {
          return parsed;
        }
        if (parsed && Array.isArray(parsed.operations)) {
          return parsed.operations;
        }
      }
    }

    return [];
  } catch {
    return [];
  }
}
