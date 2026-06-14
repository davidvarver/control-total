"use client";

import type { ReactNode } from "react";

type ConfirmSubmitButtonProps = {
  children: ReactNode;
  className?: string;
  confirmMessage: string;
  confirmText?: string;
  confirmTitle?: string;
  disabled?: boolean;
  name?: string;
  title?: string;
  value?: string;
};

export function ConfirmSubmitButton({
  children,
  className,
  confirmMessage,
  confirmText,
  confirmTitle,
  disabled,
  name,
  title,
  value,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      name={name}
      title={title}
      onClick={(event) => {
        const title = confirmTitle ? `${confirmTitle}\n\n` : "";
        if (confirmText) {
          const answer = window.prompt(
            `${title}${confirmMessage}\n\nEscribe ${confirmText} para confirmar.`,
          );
          if (answer !== confirmText) {
            event.preventDefault();
          }
          return;
        }

        if (!window.confirm(`${title}${confirmMessage}`)) {
          event.preventDefault();
        }
      }}
      value={value}
    >
      {children}
    </button>
  );
}
