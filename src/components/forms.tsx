"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText,
  className = "btn-primary",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } }) {
  if (state?.error)
    return (
      <p className="text-sm text-rose-600" role="alert">
        {state.error}
      </p>
    );
  if (state?.message)
    return (
      <p className="text-sm text-emerald-700" role="status">
        {state.message}
      </p>
    );
  return null;
}

export function CopyButton({ text, label = "Copy", className = "btn-secondary" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
