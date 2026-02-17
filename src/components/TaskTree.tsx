import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '../services/tasks.js';

export interface FlatTask {
  task: Task;
  depth: number;
  isLast: boolean;
  hasChildren: boolean;
  doneCount: number;
  totalCount: number;
  ancestors: boolean[];
}

export function flattenTasks(
  tasks: Task[],
  collapsedIds: Set<string>,
  depth = 0,
  ancestors: boolean[] = []
): FlatTask[] {
  const result: FlatTask[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const last = i === tasks.length - 1;
    const children = task.children ?? [];
    const hasChildren = children.length > 0;
    let doneCount = 0;
    let totalCount = 0;
    if (hasChildren) {
      totalCount = children.length;
      doneCount = children.filter(c => c.status === 'done').length;
    }
    const currentAncestors = depth === 0 ? [] : ancestors;
    result.push({ task, depth, isLast: last, hasChildren, doneCount, totalCount, ancestors: currentAncestors });
    if (hasChildren && !collapsedIds.has(task.id)) {
      result.push(...flattenTasks(children, collapsedIds, depth + 1, [...ancestors, last]));
    }
  }
  return result;
}

const STATUS_ICON: Record<Task['status'], string> = {
  todo: '\u25CB',   // ○
  done: '\u25CF',   // ●
};

interface TaskTreeProps {
  tasks: Task[];
  selectedIndex: number;
  collapsedIds: Set<string>;
}

export default function TaskTree({ tasks, selectedIndex, collapsedIds }: TaskTreeProps) {
  const flat = flattenTasks(tasks, collapsedIds);

  if (flat.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" paddingY={2}>
        <Text color="#f9e2af">{'\u25CB'}</Text>
        <Text dimColor>{'\u30BF\u30B9\u30AF\u304C\u307E\u3060\u3042\u308A\u307E\u305B\u3093'}</Text>
        <Text dimColor>{'\'a\' \u3067\u6700\u521D\u306E\u30BF\u30B9\u30AF\u3092\u8FFD\u52A0\u3057\u307E\u3057\u3087\u3046'}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {flat.map((item, index) => {
        const { task, depth, isLast, hasChildren, doneCount, totalCount, ancestors } = item;
        const isSelected = index === selectedIndex;
        const icon = STATUS_ICON[task.status];

        // Root task spacing: blank line between root-level groups (not before the first)
        const needsSpacer = depth === 0 && index > 0;

        // Build the vertical line prefix for nested tasks
        let verticalLines = '';
        if (depth > 0) {
          // For each ancestor depth level, show │ or space
          for (let d = 0; d < ancestors.length; d++) {
            verticalLines += ancestors[d] ? '   ' : '\u2502  ';
          }
        }

        // Branch character for children
        let prefix: string;
        if (depth === 0 && !hasChildren) {
          prefix = '';
        } else if (depth === 0 && hasChildren) {
          const arrow = collapsedIds.has(task.id) ? '\u25B6' : '\u25BC';  // ▶ / ▼
          prefix = `${arrow} `;
        } else {
          const branch = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';  // └── / ├──
          prefix = branch;
        }

        const progress = hasChildren ? ` [${doneCount}/${totalCount}]` : '';
        const pointer = isSelected ? '\u276F ' : '  ';
        const allDone = hasChildren && doneCount === totalCount;

        const isDone = task.status === 'done';

        return (
          <React.Fragment key={task.id}>
            {needsSpacer && <Box><Text>{' '}</Text></Box>}
            <Box>
              <Text inverse={isSelected}>
                {pointer}
              </Text>
              {depth > 0 && (
                <Text dimColor inverse={isSelected}>
                  {verticalLines}
                </Text>
              )}
              {prefix !== '' && (
                <Text dimColor={depth > 0} inverse={isSelected}>
                  {prefix}
                </Text>
              )}
              <Text
                inverse={isSelected}
                dimColor={isDone}
                strikethrough={isDone}
              >
                {icon} {task.title}
              </Text>
              {hasChildren && (
                <Text
                  inverse={isSelected}
                  color={allDone ? '#a6e3a1' : '#f9e2af'}
                >
                  {progress}
                </Text>
              )}
            </Box>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
