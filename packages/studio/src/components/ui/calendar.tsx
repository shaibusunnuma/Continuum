"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames, SelectionState, UI } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      classNames={{
        ...defaults,
        [UI.Root]: cn("w-fit", defaults[UI.Root]),
        [UI.Months]: cn("relative flex flex-col gap-4 md:flex-row", defaults[UI.Months]),
        [UI.Month]: cn("flex w-full flex-col gap-4", defaults[UI.Month]),
        [UI.Nav]: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaults[UI.Nav],
        ),
        [UI.PreviousMonthButton]: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-80 hover:opacity-100",
          defaults[UI.PreviousMonthButton],
        ),
        [UI.NextMonthButton]: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-80 hover:opacity-100",
          defaults[UI.NextMonthButton],
        ),
        [UI.MonthCaption]: cn(
          "flex h-8 w-full items-center justify-center px-8",
          defaults[UI.MonthCaption],
        ),
        [UI.CaptionLabel]: cn("text-sm font-medium", defaults[UI.CaptionLabel]),
        [UI.Weekdays]: cn("flex", defaults[UI.Weekdays]),
        [UI.Weekday]: cn(
          "text-muted-foreground w-8 flex-1 select-none rounded-md text-[0.8rem] font-normal",
          defaults[UI.Weekday],
        ),
        [UI.Week]: cn("mt-2 flex w-full", defaults[UI.Week]),
        [UI.Day]: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center text-sm",
          defaults[UI.Day],
        ),
        [UI.DayButton]: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 font-normal aria-selected:opacity-100",
          defaults[UI.DayButton],
        ),
        [UI.MonthGrid]: cn("w-full border-collapse", defaults[UI.MonthGrid]),
        [SelectionState.selected]: cn(
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md",
          defaults[SelectionState.selected],
        ),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chClass, orientation, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("size-4", chClass)} {...chevronProps} />;
        },
        ...components,
      }}
      {...props}
    />
  );
}

export { Calendar };
