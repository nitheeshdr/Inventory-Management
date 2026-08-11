"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Right-hand slide-over used for every master record editor. */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-[min(34rem,100vw)] flex-col border-l border-border bg-surface shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-semibold text-fg">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-xs text-fg-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </Dialog.Close>
          </div>

          <div className="scroll-thin flex-1 overflow-y-auto p-4">{children}</div>

          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
