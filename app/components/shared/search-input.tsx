import { Search, X } from "lucide-react";
import type { ComponentProps, MouseEvent } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

type SearchInputProps = Omit<
  ComponentProps<typeof InputGroupInput>,
  "onChange" | "type" | "value"
> & {
  /**
   * What the clear button does, when emptying the box is worth more than
   * whatever the typed value goes through (a debounce, say). Without it,
   * clearing is a change like any other.
   */
  onClear?: () => void;
  onValueChange: (value: string) => void;
  value: string;
};

/** A search box: the magnifier, the input, and a clear button once there is a query. */
function SearchInput({
  className,
  onClear,
  onValueChange,
  value,
  ...props
}: SearchInputProps) {
  return (
    <InputGroup className={className}>
      <SearchInputIcon />
      <InputGroupInput
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        {...props}
      />
      {value.length > 0 ? (
        <SearchInputClearButton
          onClear={onClear ?? (() => onValueChange(""))}
        />
      ) : null}
    </InputGroup>
  );
}

/** The magnifier, for search inputs another component renders (a combobox's). */
function SearchInputIcon() {
  return (
    <InputGroupAddon>
      <Search aria-hidden="true" />
    </InputGroupAddon>
  );
}

/**
 * The clear button, for search inputs another component renders. It hands the
 * focus back to the input of its `InputGroup`, so the reader keeps typing: a
 * press does not take the focus (a popup around the input would read that as
 * leaving), and a keyboard click returns it.
 */
function SearchInputClearButton({ onClear }: { onClear: () => void }) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClear();
    event.currentTarget
      .closest('[data-slot="input-group"]')
      ?.querySelector("input")
      ?.focus();
  }

  return (
    <InputGroupAddon align="inline-end">
      <InputGroupButton
        size="icon-xs"
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleClick}
      >
        <X aria-hidden="true" data-icon />
        <span className="sr-only">Limpiar búsqueda</span>
      </InputGroupButton>
    </InputGroupAddon>
  );
}

export { SearchInput, SearchInputClearButton, SearchInputIcon };
