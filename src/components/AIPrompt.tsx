import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import type { Task, TaskOperation } from '../services/tasks.js';
import { executeAI, type PreviousProposal } from '../services/ai.js';

type Phase = 'input' | 'thinking' | 'preview' | 'revise' | 'error';

interface AIPromptProps {
  tasks: Task[];
  onApply: (ops: TaskOperation[]) => void;
  onCancel: () => void;
}

function buildNameMap(tasks: Task[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (list: Task[]) => {
    for (const t of list) {
      map.set(t.id, t.title);
      if (t.children) walk(t.children);
    }
  };
  walk(tasks);
  return map;
}

function renderOpLine(op: TaskOperation, names: Map<string, string>, addedNames: Map<string, string>): React.ReactNode {
  const name = (id: string) => names.get(id) ?? addedNames.get(id) ?? id.slice(0, 8);
  switch (op.op) {
    case 'add': {
      const parent = op.parentId ? ` (「${name(op.parentId)}」の子)` : '';
      return <Text color="#a6e3a1">+ 追加: 「{op.title}」{parent}</Text>;
    }
    case 'delete':
      return <Text color="#f38ba8">- 削除: 「{name(op.taskId)}」</Text>;
    case 'move':
      return <Text color="#f9e2af">~ 移動: 「{name(op.taskId)}」 → {op.newParentId ? `「${name(op.newParentId)}」の下` : 'ルート'}</Text>;
    case 'update':
      return <Text color="#f9e2af">~ 名前変更: 「{name(op.taskId)}」 → 「{op.title}」</Text>;
    case 'done':
      return <Text color="#a6e3a1" dimColor>✓ 完了: 「{name(op.taskId)}」</Text>;
  }
}

export default function AIPrompt({ tasks, onApply, onCancel }: AIPromptProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [prompt, setPrompt] = useState('');
  const [revisePrompt, setRevisePrompt] = useState('');
  const [operations, setOperations] = useState<TaskOperation[]>([]);
  const [lastInstruction, setLastInstruction] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      if (phase === 'revise') {
        setRevisePrompt('');
        setPhase('preview');
        return;
      }
      onCancel();
      return;
    }
    if (phase === 'preview') {
      if (key.return) {
        onApply(operations);
        return;
      }
      if (input === 'e') {
        setPhase('revise');
        return;
      }
    }
    if (key.return && phase === 'error') {
      setPhase('input');
      setPrompt('');
    }
  });

  const callAI = (instruction: string, previous?: PreviousProposal) => {
    setPhase('thinking');
    executeAI(instruction, tasks, previous)
      .then((ops) => {
        if (ops.length === 0) {
          setErrorMsg('AIから操作が返りませんでした。指示を変えて試してください。');
          setPhase('error');
          return;
        }
        setOperations(ops);
        setLastInstruction(instruction);
        setPhase('preview');
      })
      .catch(() => {
        setErrorMsg('AIとの通信に失敗しました。');
        setPhase('error');
      });
  };

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    callAI(trimmed);
  };

  const handleReviseSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    setRevisePrompt('');
    callAI(trimmed, { instruction: lastInstruction, operations });
  };

  if (phase === 'thinking') {
    return (
      <Box>
        <Text color="#f9e2af">
          <Spinner type="dots" />
        </Text>
        <Text color="#f9e2af"> AI考え中...</Text>
      </Box>
    );
  }

  if (phase === 'error') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="#f38ba8" paddingX={1}>
        <Text color="#f38ba8" bold>[!] {errorMsg}</Text>
        <Text dimColor>Enter で戻る · Esc でキャンセル</Text>
      </Box>
    );
  }

  const renderOps = () => {
    const names = buildNameMap(tasks);
    const addedNames = new Map<string, string>();
    return operations.map((op, i) => {
      if (op.op === 'add' && op.id) {
        addedNames.set(op.id, op.title);
      }
      return (
        <Box key={i} paddingLeft={1}>
          {renderOpLine(op, names, addedNames)}
        </Box>
      );
    });
  };

  if (phase === 'revise') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="#f9e2af" paddingX={1}>
        <Text bold color="#89dceb">AI提案 ({operations.length}件)</Text>
        {renderOps()}
        <Box marginTop={1}>
          <Text color="#f9e2af" bold>✎ </Text>
          <TextInput
            value={revisePrompt}
            onChange={setRevisePrompt}
            onSubmit={handleReviseSubmit}
            placeholder="修正指示を入力..."
          />
        </Box>
      </Box>
    );
  }

  if (phase === 'preview') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="#89dceb" paddingX={1}>
        <Text bold color="#89dceb">AI提案 ({operations.length}件)</Text>
        {renderOps()}
        <Box marginTop={1}>
          <Text bold>Enter</Text><Text dimColor> 適用 · </Text>
          <Text bold>e</Text><Text dimColor> 修正 · </Text>
          <Text bold>Esc</Text><Text dimColor> キャンセル</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="#89dceb" bold>✦ </Text>
      <TextInput
        value={prompt}
        onChange={setPrompt}
        onSubmit={handleSubmit}
        placeholder="自然言語で指示..."
      />
    </Box>
  );
}
