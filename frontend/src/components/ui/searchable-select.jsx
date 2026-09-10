import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export const SearchableSelect = ({
  value = '',
  options = [],
  onValueChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  disabled = false,
  testId,
  className,
}) => {
  const [open, setOpen] = React.useState(false);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 text-left text-sm transition-colors hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
            data-testid={testId}
          >
            <span className={selectedOption ? 'truncate text-stone-800' : 'truncate text-stone-500'}>
              {selectedOption?.label || placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[15rem] max-h-[calc(100vh-2rem)] overflow-hidden bg-white p-0 opacity-100" data-testid={`${testId}-menu`}>
          <Command className="max-h-[calc(100vh-2rem)] bg-white">
            <CommandInput placeholder={searchPlaceholder} data-testid={`${testId}-search-input`} />
            <CommandList className="max-h-64 overflow-y-auto overscroll-contain [touch-action:pan-y]">
              <CommandEmpty data-testid={`${testId}-empty-state`}>No matching options.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    data-testid={`${testId}-option-${option.value}`}
                  >
                    <Check className={cn('h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};