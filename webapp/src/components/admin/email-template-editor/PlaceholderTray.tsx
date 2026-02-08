import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { insertPlaceholderAtCursor } from "./RichTextEditor";
import { Tag } from "lucide-react";

export interface PlaceholderItem {
  key: string;
  description: string;
  example: string;
}

interface PlaceholderTrayProps {
  placeholders: PlaceholderItem[];
}

export function PlaceholderTray({ placeholders }: PlaceholderTrayProps) {
  const handleInsert = (key: string) => {
    insertPlaceholderAtCursor(key);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Tag className="h-3.5 w-3.5" />
        <span className="font-medium">Insert Dynamic Content</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <TooltipProvider delayDuration={200}>
          {placeholders.map((placeholder) => (
            <Tooltip key={placeholder.key}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleInsert(placeholder.key)}
                  className="h-7 px-2.5 text-xs font-mono bg-primary/5 hover:bg-primary/10 border-primary/20 hover:border-primary/40 text-primary"
                >
                  {`{{${placeholder.key}}}`}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium">{placeholder.description}</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Example: {placeholder.example}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </div>
  );
}
