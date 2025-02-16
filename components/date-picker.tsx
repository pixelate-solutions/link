import * as React from "react";
import { addHours, format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  value?: Date;
  onChange?: (date?: Date) => void;
  disabled?: boolean;
  children?: React.ReactNode;
};

export const DatePicker = ({ value, onChange, disabled, children }: DatePickerProps) => {
  value = addHours(value || new Date, 12)
  return (
    <Popover>
      <PopoverTrigger asChild>
        {children ? (
          children
        ) : (
          <Button
            disabled={disabled}
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "PPP") : <span>Pick a date</span>}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <Calendar mode="single" selected={value} onSelect={onChange} disabled={disabled} />
      </PopoverContent>
    </Popover>
  );
};
