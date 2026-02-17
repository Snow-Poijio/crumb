import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface InputBarProps {
  placeholder?: string;
  initialValue?: string;
  label?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export default function InputBar({ placeholder, initialValue = '', label, onSubmit, onCancel }: InputBarProps) {
  const [value, setValue] = useState(initialValue);

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleSubmit = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  };

  return (
    <Box>
      <Text>{label ?? '> '}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={placeholder}
      />
    </Box>
  );
}
