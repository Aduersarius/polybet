"use client"

import { CameraIcon, FolderIcon, PaperClipIcon } from "@heroicons/react/20/solid"
import {
  FileTrigger as FileTriggerPrimitive,
  type FileTriggerProps as FileTriggerPrimitiveProps,
} from "react-aria-components"
import { Button, buttonVariants } from "./button"
import { Loader } from "./loader"
import type { VariantProps } from "class-variance-authority"

export interface FileTriggerProps
  extends FileTriggerPrimitiveProps,
  VariantProps<typeof buttonVariants> {
  isDisabled?: boolean
  isPending?: boolean
  ref?: React.RefObject<HTMLInputElement>
  className?: string
}

export function FileTrigger({
  variant = "outline",
  size = "default",
  ref,
  className,
  ...props
}: FileTriggerProps) {
  return (
    <FileTriggerPrimitive ref={ref} {...props}>
      <Button
        className={className}
        disabled={props.isDisabled}
        variant={variant as any}
        size={size as any}
      >
        {props.children ? (
          props.children
        ) : (
          <>
            {!props.isPending ? (
              props.defaultCamera ? (
                <CameraIcon className="size-4" />
              ) : props.acceptDirectory ? (
                <FolderIcon className="size-4" />
              ) : (
                <PaperClipIcon className="size-4" />
              )
            ) : (
              <Loader />
            )}
            {props.allowsMultiple
              ? "Browse files"
              : props.acceptDirectory
                ? "Browse"
                : "Browse file"}
          </>
        )}
      </Button>
    </FileTriggerPrimitive>
  )
}
