"use client"

import { TextArea, type TextAreaProps } from "react-aria-components"
import { twJoin } from "tailwind-merge"
import { cx } from "@/lib/primitive"

export function Textarea({ className, ...props }: TextAreaProps) {
  return (
    <span data-slot="control" className="relative block w-full">
      <TextArea
        {...props}
        className={cx(
          twJoin([
            "field-sizing-content relative block min-h-16 w-full appearance-none rounded-lg px-[calc(0.875rem-1px)] py-[calc(0.625rem-1px)] sm:px-[calc(0.75rem-1px)] sm:py-[calc(0.375rem-1px)]",
            "text-base/6 text-fg placeholder:text-muted-fg sm:text-sm/6",
            "border border-input enabled:hover:border-muted-fg/30",
            "outline-hidden focus:border-ring/70 focus:ring-3 focus:ring-ring/20 focus:enabled:hover:border-ring/80",
            "invalid:border-danger-subtle-fg/70 focus:invalid:border-danger-subtle-fg/70 focus:invalid:ring-danger-subtle-fg/20 invalid:enabled:hover:border-danger-subtle-fg/80 invalid:focus:enabled:hover:border-danger-subtle-fg/80",
            "disabled:bg-muted forced-colors:in-disabled:text-[GrayText]",
            "in-disabled:bg-muted forced-colors:in-disabled:text-[GrayText]",
            "dark:scheme-dark",
          ]),
          className,
        )}
      />
    </span>
  )
}
