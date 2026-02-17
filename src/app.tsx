import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TaskTree, { flattenTasks } from './components/TaskTree.js';
import InputBar from './components/InputBar.js';
import AIPrompt from './components/AIPrompt.js';
import {
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  completeTask,
  clearAllTasks,
  applyOperations,
  saveSnapshot,
  undo,
  canUndo,
  undoDepth,
  reorderTask,
  indentTask,
  type Task,
  type TaskOperation,
} from './services/tasks.js';

type InputMode = 'none' | 'add' | 'addChild' | 'edit' | 'ai' | 'confirmClear' | 'help';

export default function App() {
  const { exit } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [inputMode, setInputMode] = useState<InputMode>('none');
  const [flash, setFlash] = useState('');

  const refresh = useCallback(() => {
    setTasks(getTasks());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visibleTasks = flattenTasks(tasks, collapsedIds);
  const visibleCount = visibleTasks.length;

  useEffect(() => {
    if (selectedIndex >= visibleCount && visibleCount > 0) {
      setSelectedIndex(visibleCount - 1);
    }
  }, [visibleCount, selectedIndex]);

  const selectedTask = visibleCount > 0 ? visibleTasks[selectedIndex]?.task : null;

  // Flash message (auto-dismiss)
  useEffect(() => {
    if (flash) {
      const timer = setTimeout(() => setFlash(''), 1500);
      return () => clearTimeout(timer);
    }
  }, [flash]);

  // Mutate with undo support
  const withUndo = (fn: () => void) => {
    saveSnapshot();
    fn();
    refresh();
  };

  useInput((input, key) => {
    // Help overlay
    if (inputMode === 'help') {
      setInputMode('none');
      return;
    }

    if (inputMode !== 'none') {
      if (inputMode === 'confirmClear') {
        if (input === 'y' || input === 'Y') {
          withUndo(() => {
            clearAllTasks();
            setSelectedIndex(0);
          });
          setFlash('全タスクを削除しました');
          setInputMode('none');
        } else {
          setInputMode('none');
        }
      }
      return;
    }

    // Navigation
    if (input === 'j' || key.downArrow) {
      setSelectedIndex(i => Math.min(i + 1, visibleCount - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIndex(i => Math.max(i - 1, 0));
      return;
    }

    // Jump to top/bottom
    if (input === 'g') {
      setSelectedIndex(0);
      return;
    }
    if (input === 'G') {
      setSelectedIndex(Math.max(0, visibleCount - 1));
      return;
    }

    // Tab: jump to next root group
    if (key.tab) {
      for (let i = selectedIndex + 1; i < visibleCount; i++) {
        if (visibleTasks[i].depth === 0) {
          setSelectedIndex(i);
          return;
        }
      }
      // Wrap around
      for (let i = 0; i < selectedIndex; i++) {
        if (visibleTasks[i].depth === 0) {
          setSelectedIndex(i);
          return;
        }
      }
      return;
    }

    // Reorder task: J/K to move up/down among siblings
    if (input === 'J') {
      if (selectedTask) {
        withUndo(() => reorderTask(selectedTask.id, 'down'));
        // Move selection to follow the task
        if (selectedIndex < visibleCount - 1) {
          setSelectedIndex(i => i + 1);
        }
      }
      return;
    }
    if (input === 'K') {
      if (selectedTask) {
        withUndo(() => reorderTask(selectedTask.id, 'up'));
        if (selectedIndex > 0) {
          setSelectedIndex(i => i - 1);
        }
      }
      return;
    }

    // Indent/Outdent: > to indent (make child of prev sibling), < to outdent
    if (input === '>') {
      if (selectedTask) {
        withUndo(() => indentTask(selectedTask.id, 'indent'));
      }
      return;
    }
    if (input === '<') {
      if (selectedTask) {
        withUndo(() => indentTask(selectedTask.id, 'outdent'));
      }
      return;
    }

    // Add task
    if (input === 'a') {
      setInputMode('add');
      return;
    }

    // Add child task
    if (input === 'A') {
      if (selectedTask) {
        setInputMode('addChild');
      }
      return;
    }

    // Edit task
    if (input === 'e') {
      if (selectedTask) {
        setInputMode('edit');
      }
      return;
    }

    // Toggle done
    if (input === 'd') {
      if (selectedTask) {
        if (selectedTask.status === 'done') {
          withUndo(() => updateTask(selectedTask.id, { status: 'todo' }));
        } else {
          withUndo(() => completeTask(selectedTask.id));
        }
      }
      return;
    }

    // Delete task
    if (input === 'x') {
      if (selectedTask) {
        withUndo(() => deleteTask(selectedTask.id));
        setFlash(`「${selectedTask.title}」を削除 (u で戻す)`);
      }
      return;
    }

    // Confirm clear all
    if (input === 'X') {
      setInputMode('confirmClear');
      return;
    }

    // Undo
    if (input === 'u') {
      if (canUndo()) {
        undo();
        refresh();
        setFlash('元に戻しました');
      }
      return;
    }

    // Toggle collapse
    if (input === ' ') {
      if (selectedTask) {
        setCollapsedIds(prev => {
          const next = new Set(prev);
          if (next.has(selectedTask.id)) {
            next.delete(selectedTask.id);
          } else {
            next.add(selectedTask.id);
          }
          return next;
        });
      }
      return;
    }

    // AI prompt
    if (input === '/') {
      setInputMode('ai');
      return;
    }

    // Help
    if (input === '?') {
      setInputMode('help');
      return;
    }

    // Quit
    if (input === 'q') {
      exit();
      return;
    }
  });

  const handleAddSubmit = (value: string) => {
    withUndo(() => addTask(value));
    setInputMode('none');
  };

  const handleAddChildSubmit = (value: string) => {
    if (selectedTask) {
      withUndo(() => addTask(value, selectedTask.id));
      setCollapsedIds(prev => {
        const next = new Set(prev);
        next.delete(selectedTask.id);
        return next;
      });
    }
    setInputMode('none');
  };

  const handleEditSubmit = (value: string) => {
    if (selectedTask) {
      withUndo(() => updateTask(selectedTask.id, { title: value }));
    }
    setInputMode('none');
  };

  const handleAIApply = (ops: TaskOperation[]) => {
    withUndo(() => applyOperations(ops));
    setInputMode('none');
  };

  const handleCancel = () => {
    setInputMode('none');
  };

  // Count all tasks
  const countAll = (list: Task[]): { total: number; done: number } => {
    let total = 0;
    let done = 0;
    for (const t of list) {
      total++;
      if (t.status === 'done') done++;
      if (t.children && t.children.length > 0) {
        const sub = countAll(t.children);
        total += sub.total;
        done += sub.done;
      }
    }
    return { total, done };
  };
  const { total: totalCount, done: doneCount } = countAll(tasks);

  const renderFooter = () => {
    if (inputMode === 'add') {
      return <InputBar placeholder="タスク名..." label="+ " onSubmit={handleAddSubmit} onCancel={handleCancel} />;
    }
    if (inputMode === 'addChild') {
      return <InputBar placeholder="子タスク名..." label="+ 子: " onSubmit={handleAddChildSubmit} onCancel={handleCancel} />;
    }
    if (inputMode === 'edit' && selectedTask) {
      return <InputBar initialValue={selectedTask.title} label="✎ " onSubmit={handleEditSubmit} onCancel={handleCancel} />;
    }
    if (inputMode === 'ai') {
      return <AIPrompt tasks={tasks} onApply={handleAIApply} onCancel={handleCancel} />;
    }
    if (inputMode === 'confirmClear') {
      return (
        <Box borderStyle="round" borderColor="red" paddingX={2}>
          <Text bold color="red">全タスクを削除しますか？ </Text>
          <Text bold>y</Text><Text dimColor>/</Text><Text bold>n</Text>
        </Box>
      );
    }
    if (inputMode === 'help') {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="#585b70" paddingX={1}>
          <Text bold color="#f9e2af">キーバインド</Text>
          <Text><Text bold>j/k ↑/↓</Text><Text dimColor>  カーソル移動</Text></Text>
          <Text><Text bold>g/G</Text><Text dimColor>      先頭/末尾</Text></Text>
          <Text><Text bold>Tab</Text><Text dimColor>      次のグループへ</Text></Text>
          <Text><Text bold>J/K</Text><Text dimColor>      タスクを上下に並び替え</Text></Text>
          <Text><Text bold>{'<'}{'>'}</Text><Text dimColor>       階層を上げる/下げる</Text></Text>
          <Text><Text bold>a/A</Text><Text dimColor>      追加/子追加</Text></Text>
          <Text><Text bold>e</Text><Text dimColor>        編集</Text></Text>
          <Text><Text bold>d</Text><Text dimColor>        完了/未完了</Text></Text>
          <Text><Text bold>x/X</Text><Text dimColor>      削除/全削除</Text></Text>
          <Text><Text bold>u</Text><Text dimColor>        元に戻す (複数回可)</Text></Text>
          <Text><Text bold>Space</Text><Text dimColor>    折りたたみ</Text></Text>
          <Text><Text bold>/</Text><Text dimColor>        AI</Text></Text>
          <Text><Text bold>q</Text><Text dimColor>        終了</Text></Text>
          <Box marginTop={1}>
            <Text dimColor>何かキーを押して閉じる</Text>
          </Box>
        </Box>
      );
    }

    // Normal mode: minimal footer
    return (
      <Box justifyContent="space-between">
        <Box>
          {flash ? (
            <Text color="#a6e3a1">{flash}</Text>
          ) : (
            <Text dimColor>/:AI · ?:ヘルプ</Text>
          )}
        </Box>
        {canUndo() && <Text dimColor>u:戻す({undoDepth()})</Text>}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#585b70" paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="#f9e2af">🍞 crumb</Text>
        {totalCount > 0 && (
          <Box>
            <Text color={doneCount === totalCount ? '#a6e3a1' : '#f9e2af'}>
              {'█'.repeat(Math.round((doneCount / totalCount) * 8))}
            </Text>
            <Text dimColor>
              {'░'.repeat(8 - Math.round((doneCount / totalCount) * 8))}
            </Text>
            <Text dimColor> {doneCount}/{totalCount}</Text>
          </Box>
        )}
      </Box>

      {/* Task tree */}
      <Box flexDirection="column" flexGrow={1}>
        <TaskTree tasks={tasks} selectedIndex={selectedIndex} collapsedIds={collapsedIds} />
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        {renderFooter()}
      </Box>
    </Box>
  );
}
