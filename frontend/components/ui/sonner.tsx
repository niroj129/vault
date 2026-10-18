"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "day" ? "light" : "dark"

  return (
    <Sonner
      theme={theme}
      position="top-right"
      closeButton
      richColors
      offset={{ top: 72 }}
      mobileOffset={{ top: 72, left: 16, right: 16 }}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // rich toasts use our contrast-checked palette instead of the library's pastel defaults
          "--success-bg": "var(--popover)", "--success-text": "var(--success)", "--success-border": "var(--success)",
          "--info-bg": "var(--popover)", "--info-text": "var(--info)", "--info-border": "var(--info)",
          "--warning-bg": "var(--popover)", "--warning-text": "var(--warning)", "--warning-border": "var(--warning)",
          "--error-bg": "var(--popover)", "--error-text": "var(--destructive-text)", "--error-border": "var(--destructive-text)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
