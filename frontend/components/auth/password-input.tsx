"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type ComponentProps } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/** Password field with a show/hide toggle (44px target, labelled, state announced). */
export const PasswordInput = forwardRef<HTMLInputElement, ComponentProps<"input">>(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput ref={ref} type={show ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-sm" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
          {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
});
