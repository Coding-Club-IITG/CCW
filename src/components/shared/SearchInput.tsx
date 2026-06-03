"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { IconSearch, IconX } from "@/components/shared/Icons";
import styles from "./SearchInput.module.scss";

type SearchInputProps = {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  className?: string;
};

export default function SearchInput({
  placeholder = "Search...",
  value: controlledValue,
  onChange,
  onSearch,
  className,
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(controlledValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue);
    }
  }, [controlledValue]);

  const handleChange = useCallback(
    (newValue: string) => {
      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && onSearch) {
      onSearch(internalValue);
    }
  }

  function handleClear() {
    handleChange("");
    onSearch?.("");
    inputRef.current?.focus();
  }

  return (
    <div className={`${styles.wrapper} ${className ?? ""}`}>
      <IconSearch className={styles.icon} width={16} height={16} />
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {value && (
        <button
          type="button"
          className={styles.clear}
          onClick={handleClear}
          aria-label="Clear search"
        >
          <IconX width={14} height={14} />
        </button>
      )}
    </div>
  );
}
