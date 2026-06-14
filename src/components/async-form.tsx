"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useRef,
  useState,
  useTransition,
} from "react";

type AsyncFormProps = {
  action: string;
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
  confirmText?: string;
  confirmTitle?: string;
  encType?: "multipart/form-data";
  resetOnSuccess?: boolean;
  successMessage?: string;
};

export function AsyncForm({
  action,
  children,
  className,
  confirmMessage,
  confirmText,
  confirmTitle,
  encType,
  resetOnSuccess,
  successMessage = "Guardado",
}: AsyncFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");
    setError("");

    if (!confirmSubmission({ confirmMessage, confirmText, confirmTitle })) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(action, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "X-Requested-With": "fetch",
          },
          body: formData,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          setError(payload?.error ?? "No se pudo guardar.");
          return;
        }

        const payload = await response.json().catch(() => null);
        if (!payload) {
          setError(
            response.redirected
              ? "No se pudo guardar. Revisa permisos o vuelve a iniciar sesion."
              : "No se pudo confirmar el guardado.",
          );
          router.refresh();
          return;
        }

        if (resetOnSuccess) {
          formRef.current?.reset();
        }

        setMessage(successMessage);
        if (typeof payload?.redirectUrl === "string") {
          router.replace(payload.redirectUrl);
        }
        router.refresh();
        window.setTimeout(() => setMessage(""), 1800);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se pudo guardar.",
        );
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={action}
      method="post"
      encType={encType}
      onSubmit={submit}
      className={className}
      data-pending={isPending ? "true" : "false"}
    >
      <fieldset disabled={isPending} className="contents">
        {children}
      </fieldset>
      {message ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>
      ) : null}
    </form>
  );
}

function confirmSubmission({
  confirmMessage,
  confirmText,
  confirmTitle,
}: {
  confirmMessage?: string;
  confirmText?: string;
  confirmTitle?: string;
}) {
  if (!confirmMessage && !confirmTitle && !confirmText) {
    return true;
  }

  const title = confirmTitle ? `${confirmTitle}\n\n` : "";
  const message = confirmMessage ?? "Confirma esta accion.";

  if (confirmText) {
    const answer = window.prompt(
      `${title}${message}\n\nEscribe ${confirmText} para confirmar.`,
    );
    return answer === confirmText;
  }

  return window.confirm(`${title}${message}`);
}
