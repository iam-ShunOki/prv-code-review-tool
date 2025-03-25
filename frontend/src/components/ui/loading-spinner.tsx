// frontend/src/components/ui/loading-spinner.tsx
import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  className,
}) => {
  return (
    <Loader2
      className={cn("animate-spin text-gray-500", sizeMap[size], className)}
    />
  );
};

export default LoadingSpinner;
