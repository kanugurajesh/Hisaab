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
      {pending ? (
        <>
          <Spinner />
          {pendingText ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Spinner() {
  return <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } }) {
  if (state?.error)
    return (
      <p className="animate-enter text-sm text-rose-600" role="alert">
        {state.error}
      </p>
    );
  if (state?.message)
    return (
      <p className="animate-enter text-sm text-emerald-700" role="status">
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
      {copied ? (
        <span key="copied" className="inline-block animate-pop">
          Copied ✓
        </span>
      ) : (
        label
      )}
    </button>
  );
}
