"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
/** A password box with a reveal toggle, so people can check what they typed. */
export function PasswordInput({
  name,
  autoComplete,
  minLength = 8,
  maxLength = 128,
  required = true,
  mr = false,
  inputRef,
  onChange,
  describedBy,
  invalid,
}: {
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  mr?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <span className="password-input">
      <input
        ref={inputRef}
        name={name}
        type={shown ? "text" : "password"}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={onChange}
        required={required}
      />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-pressed={shown}
        aria-label={
          shown
            ? mr
              ? "पासवर्ड लपवा"
              : "Hide password"
            : mr
              ? "पासवर्ड दाखवा"
              : "Show password"
        }
      >
        {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  );
}
