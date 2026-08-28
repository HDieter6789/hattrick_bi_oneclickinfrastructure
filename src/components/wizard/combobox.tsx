"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface SingleComboboxProps {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

interface MultiComboboxProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

/**
 * Generic searchable single/multi-select combobox, backed by shadcn's
 * Command+Popover primitives (cmdk is already a dependency). Used for every
 * `*Picker` FabricParameterSchema input type and `multiSelect` — there is
 * deliberately one implementation, not a per-picker-type component, matching
 * the Dynamic Parameter Engine's "no per-item-type UI" rule.
 */
export function Combobox(props: SingleComboboxProps | MultiComboboxProps) {
  const { options, placeholder = "Select…", emptyText = "No matches.", className } = props;
  const [open, setOpen] = useState(false);

  if (props.multiple) {
    const selected = new Set(props.value);
    const toggle = (v: string) => {
      const next = selected.has(v) ? props.value.filter((x) => x !== v) : [...props.value, v];
      props.onChange(next);
    };
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
              {props.value.length > 0 ? `${props.value.length} selected` : placeholder}
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder="Search…" />
              <CommandList>
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem key={option.value} value={option.label} onSelect={() => toggle(option.value)}>
                      <Check className={cn("mr-2 size-4", selected.has(option.value) ? "opacity-100" : "opacity-0")} />
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {props.value.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {props.value.map((v) => {
              const label = options.find((o) => o.value === v)?.label ?? v;
              return (
                <Badge key={v} variant="secondary" className="gap-1">
                  {label}
                  <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${label}`}>
                    <X className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const selectedLabel = options.find((o) => o.value === props.value)?.label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selectedLabel ?? placeholder}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    props.onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", option.value === props.value ? "opacity-100" : "opacity-0")} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
