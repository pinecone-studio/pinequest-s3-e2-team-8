"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex w-full flex-col gap-4",
        month_caption: "relative flex h-8 items-center justify-center px-8",
        caption_label: "text-sm font-semibold text-zinc-950",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "h-8 w-8 rounded-lg border-zinc-200 bg-white p-0 hover:translate-y-0 hover:bg-zinc-50 hover:shadow-none"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "h-8 w-8 rounded-lg border-zinc-200 bg-white p-0 hover:translate-y-0 hover:bg-zinc-50 hover:shadow-none"
        ),
        weekdays: "flex",
        weekday:
          "flex-1 rounded-md text-[0.8rem] font-medium text-zinc-400",
        week: "mt-2 flex w-full",
        day: "flex-1 p-0 text-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 rounded-full p-0 font-normal text-zinc-900 hover:translate-y-0 hover:bg-zinc-100 hover:shadow-none"
        ),
        today:
          "[&>button]:rounded-full [&>button]:border [&>button]:border-zinc-300 [&>button]:bg-zinc-50 [&>button]:font-semibold [&>button]:text-zinc-950",
        selected:
          "[&>button]:!rounded-full [&>button]:!bg-zinc-950 [&>button]:!text-white [&>button]:font-semibold [&>button]:hover:!bg-zinc-950 [&>button]:hover:!text-white",
        outside:
          "text-zinc-300 [&>button]:text-zinc-300",
        disabled: "opacity-50 [&>button]:text-zinc-300",
        range_middle:
          "[&>button]:rounded-none [&>button]:bg-zinc-100 [&>button]:text-zinc-950",
        range_start:
          "[&>button]:rounded-l-full [&>button]:rounded-r-md [&>button]:bg-zinc-950 [&>button]:text-white",
        range_end:
          "[&>button]:rounded-l-md [&>button]:rounded-r-full [&>button]:bg-zinc-950 [&>button]:text-white",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClassName, orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft
              className={cn("h-4 w-4", chevronClassName)}
              {...chevronProps}
            />
          ) : (
            <ChevronRight
              className={cn("h-4 w-4", chevronClassName)}
              {...chevronProps}
            />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }
