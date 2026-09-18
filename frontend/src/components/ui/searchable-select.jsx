import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

const tokenizeSearchText = (value = '') => String(value)
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

const hasExactTokenPhrase = (optionTokens, searchTokens) => (
  searchTokens.length <= optionTokens.length
  && optionTokens.some((_, startIndex) => searchTokens.every(
    (token, offset) => optionTokens[startIndex + offset] === token,
  ))
);

export const SearchableSelect = ({
  value = '',
  options = [],
  onValueChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  disabled = false,
  testId,
  className,
  menuClassName,
  menuAlign = 'start',
  wrapOptionLabels = false,
  searchMatchMode,
}) => {
  const [open, setOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  const selectedOption = options.find((option) => option.value === value);
  const usesWordPrefixSearch = searchMatchMode === 'word-prefix';

  const visibleOptions = React.useMemo(() => {
    if (!usesWordPrefixSearch) return options;

    const searchTokens = tokenizeSearchText(searchText);
    if (searchTokens.length === 0) return options;

    return options
      .map((option, originalIndex) => {
        const optionTokens = tokenizeSearchText(option.label);
        const matchingTokenIndexes = searchTokens.map((searchToken) => (
          optionTokens.findIndex((optionToken) => optionToken.startsWith(searchToken))
        ));

        if (matchingTokenIndexes.some((index) => index < 0)) return null;

        return {
          option,
          originalIndex,
          exactPhrase: hasExactTokenPhrase(optionTokens, searchTokens),
          exactWordCount: searchTokens.filter((searchToken) => optionTokens.includes(searchToken)).length,
          firstMatchIndex: Math.min(...matchingTokenIndexes),
        };
      })
      .filter(Boolean)
      .sort((left, right) => (
        Number(right.exactPhrase) - Number(left.exactPhrase)
        || right.exactWordCount - left.exactWordCount
        || left.firstMatchIndex - right.firstMatchIndex
        || left.originalIndex - right.originalIndex
      ))
      .map(({ option }) => option);
  }, [options, searchText, usesWordPrefixSearch]);

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
        <PopoverContent
          align={menuAlign}
          className={cn(
            'w-[var(--radix-popover-trigger-width)] min-w-[15rem] max-h-[min(22rem,calc(100vh-2rem))] overflow-hidden bg-white p-0 opacity-100',
            menuClassName,
          )}
          data-testid={`${testId}-menu`}
        >
          <Command
            shouldFilter={!usesWordPrefixSearch}
            className="!h-auto max-h-[min(22rem,calc(100vh-2rem))] bg-white"
          >
            <CommandInput
              value={usesWordPrefixSearch ? searchText : undefined}
              onValueChange={usesWordPrefixSearch ? setSearchText : undefined}
              placeholder={searchPlaceholder}
              data-testid={`${testId}-search-input`}
            />
            <CommandList
              className="max-h-[min(18rem,calc(100vh-6rem))] min-h-0 overflow-y-scroll overscroll-contain [touch-action:pan-y]"
              onWheelCapture={(event) => event.stopPropagation()}
              onTouchMoveCapture={(event) => event.stopPropagation()}
              data-testid={`${testId}-options-scroll-area`}
            >
              <CommandEmpty data-testid={`${testId}-empty-state`}>No matching options.</CommandEmpty>
              <CommandGroup>
                {visibleOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    data-testid={`${testId}-option-${option.value}`}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        wrapOptionLabels && 'mt-0.5',
                        value === option.value ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                    <span className={cn(wrapOptionLabels ? 'whitespace-normal break-words leading-5' : 'truncate')}>
                      {option.label}
                    </span>
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