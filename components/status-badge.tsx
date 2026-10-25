import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getStatusDisplay, type StatusDomain } from "@/lib/status-display";

type StatusBadgeProps = {
  status: string;
  domain?: StatusDomain;
  className?: string;
};

export function StatusBadge({
  status,
  domain = "transaction",
  className,
}: StatusBadgeProps): ReactElement {
  const display = getStatusDisplay(domain, status);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={display.variant} className={cn("cursor-help", className)}>
            {display.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{display.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
