import * as React from "react"
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react"
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
  
  // Generate year range (10 years before and after current)
  const startYear = Math.min(currentYear - 10, minConstraint?.year || currentYear - 10)
  const endYear = disableFuture ? currentYear : Math.max(currentYear + 5, maxConstraint?.year || currentYear + 5)
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
  
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          data-testid={dataTestId}
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {formatDisplayValue() || <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Year Column */}
          <div 
            ref={yearListRef}
            className="w-24 border-r max-h-64 overflow-y-auto scrollbar-thin"
          >
            <div className="sticky top-0 bg-white border-b px-2 py-1.5 text-xs font-medium text-gray-500">
              Year
            </div>
            {years.map((year) => {
              const isYearDisabled = disableFuture && year > currentYear
              return (
                <button
                  key={year}
                  data-year={year}
                  onClick={() => !isYearDisabled && handleYearChange(year)}
                  disabled={isYearDisabled}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left transition-colors",
                    viewYear === year 
                      ? "bg-green-100 text-green-800 font-medium" 
                      : "hover:bg-gray-100",
                    isYearDisabled && "text-gray-300 cursor-not-allowed"
                  )}
                >
                  {year}
                </button>
              )
            })}
          </div>
          
          {/* Month Grid */}
          <div className="p-3">
            <div className="text-sm font-medium text-center mb-3 text-gray-700">
              {viewYear}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MONTHS.map((month, index) => {
                const isDisabled = isMonthDisabled(viewYear, index)
                const isSelected = value && selectedYear === viewYear && selectedMonth === index
                
                return (
                  <button
                    key={month}
                    onClick={() => handleMonthSelect(index)}
                    disabled={isDisabled}
                    className={cn(
                      "px-3 py-2 text-sm rounded-md transition-colors",
                      isSelected 
                        ? "bg-green-600 text-white font-medium" 
                        : isDisabled 
                          ? "text-gray-300 cursor-not-allowed"
                          : "hover:bg-green-50 text-gray-700"
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
