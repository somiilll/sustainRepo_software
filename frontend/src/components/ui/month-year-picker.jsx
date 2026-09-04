import * as React from "react"
import { Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function MonthYearPicker({
  value,
  onChange,
  minDate,
  maxDate,
  disableFuture = false,
  placeholder = "Select month",
  className,
  id,
  "data-testid": dataTestId
}) {
  const [open, setOpen] = React.useState(false)
  
  // Parse the current value (format: YYYY-MM)
  const parseValue = (val) => {
    if (!val) return { year: new Date().getFullYear(), month: new Date().getMonth() }
    const [year, month] = val.split('-').map(Number)
    return { year, month: month - 1 }
  }
  
  const { year: selectedYear, month: selectedMonth } = parseValue(value)
  const [viewYear, setViewYear] = React.useState(selectedYear)
  
  // Calculate min/max constraints
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  
  const parseConstraint = (constraint) => {
    if (!constraint) return null
    const [year, month] = constraint.split('-').map(Number)
    return { year, month: month - 1 }
  }
  
  const minConstraint = parseConstraint(minDate)
  const maxConstraint = parseConstraint(maxDate)
  
  // Generate year range (10 years before and after current) - sorted descending (most recent first)
  const startYear = Math.min(currentYear - 10, minConstraint?.year || currentYear - 10)
  const endYear = disableFuture ? currentYear : Math.max(currentYear + 5, maxConstraint?.year || currentYear + 5)
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => endYear - i) // Descending order
  
  const isMonthDisabled = (year, month) => {
    // Check future date constraint
    if (disableFuture && (year > currentYear || (year === currentYear && month > currentMonth))) {
      return true
    }
    
    // Check min constraint
    if (minConstraint) {
      if (year < minConstraint.year || (year === minConstraint.year && month < minConstraint.month)) {
        return true
      }
    }
    
    // Check max constraint
    if (maxConstraint) {
      if (year > maxConstraint.year || (year === maxConstraint.year && month > maxConstraint.month)) {
        return true
      }
    }
    
    return false
  }
  
  const handleMonthSelect = (monthIndex) => {
    if (isMonthDisabled(viewYear, monthIndex)) return
    
    const formattedMonth = String(monthIndex + 1).padStart(2, '0')
    onChange(`${viewYear}-${formattedMonth}`)
    setOpen(false)
  }
  
  const handleYearChange = (year) => {
    setViewYear(year)
  }
  
  const formatDisplayValue = () => {
    if (!value) return null
    return `${FULL_MONTHS[selectedMonth]} ${selectedYear}`
  }
  
  // Scroll to selected year when opening
  const yearListRef = React.useRef(null)
  
  React.useEffect(() => {
    if (open && yearListRef.current) {
      const selectedYearElement = yearListRef.current.querySelector(`[data-year="${viewYear}"]`)
      if (selectedYearElement) {
        selectedYearElement.scrollIntoView({ block: 'center', behavior: 'instant' })
      }
    }
  }, [open, viewYear])

  React.useEffect(() => {
    setViewYear(selectedYear)
  }, [selectedYear])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          data-testid={dataTestId}
          variant="outline"
          className={cn(
            "w-full min-w-0 justify-start overflow-hidden px-3 text-left font-normal h-10",
            !value && "text-muted-foreground",
            className
          )}
          title={formatDisplayValue() || placeholder}
        >
          <Calendar className="h-4 w-4 shrink-0" />
          <span className={cn("min-w-0 truncate", !value && "text-gray-500")}>
            {formatDisplayValue() || placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-white shadow-lg border border-gray-200"
        align="start"
        data-testid={dataTestId ? `${dataTestId}-popover` : undefined}
      >
        <div className="flex bg-white rounded-md">
          {/* Year Column - Compact */}
          <div 
            ref={yearListRef}
            className="w-16 border-r border-gray-200 max-h-48 overflow-y-auto bg-gray-50"
          >
            <div className="sticky top-0 bg-gray-100 border-b border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 text-center">
              Year
            </div>
            {years.map((year) => {
              const isYearDisabled = disableFuture && year > currentYear
              return (
                <button
                  type="button"
                  key={year}
                  data-year={year}
                  data-testid={dataTestId ? `${dataTestId}-year-${year}` : undefined}
                  onClick={() => !isYearDisabled && handleYearChange(year)}
                  disabled={isYearDisabled}
                  className={cn(
                    "w-full px-2 py-1.5 text-xs text-center transition-colors",
                    viewYear === year 
                      ? "bg-green-600 text-white font-semibold" 
                      : "hover:bg-gray-200 text-gray-700",
                    isYearDisabled && "text-gray-300 cursor-not-allowed bg-gray-50"
                  )}
                >
                  {year}
                </button>
              )
            })}
          </div>
          
          {/* Month Grid - Compact */}
          <div className="p-2 bg-white">
            <div className="text-xs font-semibold text-center mb-2 text-gray-600">
              {viewYear}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {MONTHS.map((month, index) => {
                const isDisabled = isMonthDisabled(viewYear, index)
                const isSelected = value && selectedYear === viewYear && selectedMonth === index
                
                return (
                  <button
                    type="button"
                    key={month}
                    data-testid={dataTestId ? `${dataTestId}-month-${viewYear}-${index + 1}` : undefined}
                    onClick={() => handleMonthSelect(index)}
                    disabled={isDisabled}
                    className={cn(
                      "px-2 py-1 text-xs rounded transition-colors",
                      isSelected 
                        ? "bg-green-600 text-white font-semibold" 
                        : isDisabled 
                          ? "text-gray-300 cursor-not-allowed bg-gray-50"
                          : "hover:bg-green-100 text-gray-700 bg-white"
                    )}
                  >
                    {month}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

MonthYearPicker.displayName = "MonthYearPicker"

export { MonthYearPicker }
