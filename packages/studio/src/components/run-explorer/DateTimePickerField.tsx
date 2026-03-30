"use client";

import { useEffect, useState } from "react";
import { format, isValid, parseISO, setHours, setMilliseconds, setMinutes, setSeconds } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const selectClass =
  "h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground";

function parseValue(iso: string): { day: Date; hour: number; minute: number } | null {
  if (!iso.trim()) return null;
  const d = parseISO(iso.trim());
  if (!isValid(d)) return null;
  return {
    day: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

function toIso(day: Date, hour: number, minute: number): string {
  let d = setMilliseconds(setSeconds(setMinutes(setHours(day, hour), minute), 0), 0);
  return d.toISOString();
}

export interface DateTimePickerFieldProps {
  id?: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
}

export function DateTimePickerField({
  id,
  label,
  value,
  onChange,
  placeholder = "Pick date & time",
  className,
}: DateTimePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<Date | undefined>(undefined);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (!open) return;
    const parsed = parseValue(value);
    if (parsed) {
      setDay(parsed.day);
      setHour(parsed.hour);
      setMinute(parsed.minute);
    } else {
      setDay(undefined);
      setHour(0);
      setMinute(0);
    }
  }, [open, value]);

  const display =
    value.trim() && parseValue(value)
      ? format(parseISO(value.trim()), "MMM d, yyyy HH:mm")
      : null;

  const apply = () => {
    if (!day) {
      onChange("");
    } else {
      onChange(toIso(day, hour, minute));
    }
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setDay(undefined);
    setHour(0);
    setMinute(0);
    setOpen(false);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="font-mono text-[10px] text-muted-foreground" id={id}>
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 min-w-[11rem] justify-start gap-2 font-mono text-xs font-normal",
              !display && "text-muted-foreground",
            )}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <CalendarIcon className="size-3.5 shrink-0 opacity-70" />
            {display ?? placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col gap-3 p-3">
            <Calendar
              mode="single"
              selected={day}
              onSelect={setDay}
              defaultMonth={day ?? new Date()}
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="font-mono text-[10px] text-muted-foreground">Time</span>
              <label className="sr-only" htmlFor={`${id ?? label}-hour`}>
                Hour
              </label>
              <select
                id={`${id ?? label}-hour`}
                className={selectClass}
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
              >
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className="font-mono text-xs text-muted-foreground">:</span>
              <label className="sr-only" htmlFor={`${id ?? label}-minute`}>
                Minute
              </label>
              <select
                id={`${id ?? label}-minute`}
                className={selectClass}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-2">
              <Button type="button" variant="ghost" size="sm" className="font-mono text-xs" onClick={clear}>
                Clear
              </Button>
              <Button type="button" size="sm" className="font-mono text-xs" onClick={apply}>
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
