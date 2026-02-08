import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Upload, File, X, Image, FileText, Eye } from "lucide-react";

interface InsuranceFileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png";
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export function InsuranceFileUpload({
  onFileSelect,
  selectedFile,
  disabled = false,
}: InsuranceFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Invalid file type. Only PDF, JPG, and PNG files are allowed.";
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File too large. Maximum size is ${MAX_SIZE_MB}MB.`;
    }
    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      onFileSelect(file);

      // Create preview for images
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [disabled, handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleClear = useCallback(() => {
    onFileSelect(null);
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [onFileSelect, previewUrl]);

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (file: File) => {
    if (file.type === "application/pdf") {
      return <FileText className="h-8 w-8 text-red-500" />;
    }
    return <Image className="h-8 w-8 text-blue-500" />;
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowse}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className={cn(
                "rounded-full p-3 transition-colors",
                isDragging ? "bg-primary/10" : "bg-muted"
              )}
            >
              <Upload
                className={cn(
                  "h-6 w-6",
                  isDragging ? "text-primary" : "text-muted-foreground"
                )}
              />
            </div>
            <div>
              <p className="font-medium">
                {isDragging ? "Drop your file here" : "Drag and drop your file"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or{" "}
                <span className="text-primary font-medium">browse files</span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              PDF, JPG, or PNG up to {MAX_SIZE_MB}MB
            </p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center gap-3">
            {getFileIcon(selectedFile)}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {previewUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPreview(!showPreview)}
                  title="Preview"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClear}
                disabled={disabled}
                className="text-destructive hover:text-destructive"
                title="Remove file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {showPreview && previewUrl && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-64 w-full object-contain bg-white"
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive font-medium">{error}</p>
      )}
    </div>
  );
}
