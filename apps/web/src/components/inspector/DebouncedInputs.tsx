import { useState, useEffect, useRef, type ChangeEvent } from 'react';

export interface DebouncedNumberInputProps {
  readonly label: string;
  readonly value: number | undefined;
  readonly testId: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}

export function DebouncedNumberInput({
  label,
  value,
  testId,
  min,
  max,
  step = 10,
  unit = 'mm',
  disabled = false,
  onChange,
}: DebouncedNumberInputProps) {
  const [localVal, setLocalVal] = useState<string>(
    value !== undefined && !Number.isNaN(value) ? String(value) : '',
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalVal(value !== undefined && !Number.isNaN(value) ? String(value) : '');
  }, [value]);

  const commit = (valStr: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const parsed = Number.parseFloat(valStr);
    if (!Number.isNaN(parsed) && parsed !== value) {
      onChange(parsed);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextStr = e.target.value;
    setLocalVal(nextStr);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      commit(nextStr);
    }, 200);
  };

  const handleBlur = () => {
    commit(localVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit(localVal);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="number"
          data-testid={testId}
          value={localVal}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            outline: 'none',
          }}
        />
        {unit && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{unit}</span>}
      </div>
    </div>
  );
}

export interface DebouncedTextInputProps {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
  readonly onChange: (value: string) => void;
}

export function DebouncedTextInput({ label, value, testId, onChange }: DebouncedTextInputProps) {
  const [localVal, setLocalVal] = useState<string>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const commit = (valStr: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (valStr !== value) {
      onChange(valStr);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextStr = e.target.value;
    setLocalVal(nextStr);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      commit(nextStr);
    }, 200);
  };

  const handleBlur = () => {
    commit(localVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit(localVal);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</label>
      <input
        type="text"
        data-testid={testId}
        value={localVal}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          padding: '5px 8px',
          fontSize: '12px',
          borderRadius: '4px',
          backgroundColor: 'var(--bg-card)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
          outline: 'none',
        }}
      />
    </div>
  );
}
