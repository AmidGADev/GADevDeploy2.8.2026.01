import { useState, useRef } from "react";
import { Camera, X, Loader2, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

interface Photo {
  id: string;
  storageKey: string;
  filename: string;
  caption: string | null;
}

interface ChecklistPhotoUploadProps {
  photos: Photo[];
  onUpload: (file: File, caption?: string) => Promise<void>;
  onDelete: (photoId: string) => Promise<void>;
  disabled?: boolean;
}

export function ChecklistPhotoUpload({
  photos,
  onUpload,
  onDelete,
  disabled = false,
}: ChecklistPhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setIsUploadDialogOpen(true);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      await onUpload(selectedFile, caption || undefined);
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setCaption("");
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteClick = (photo: Photo) => {
    setSelectedPhoto(photo);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedPhoto) return;

    setIsDeleting(true);
    try {
      await onDelete(selectedPhoto.id);
      setIsDeleteDialogOpen(false);
      setSelectedPhoto(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelUpload = () => {
    setIsUploadDialogOpen(false);
    setSelectedFile(null);
    setCaption("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const getPhotoUrl = (storageKey: string) => {
    return `${API_BASE_URL}/api/files/${storageKey}`;
  };

  return (
    <div className="space-y-3">
      {/* Photos Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative group aspect-square rounded-lg overflow-hidden border bg-muted"
            >
              <img
                src={getPhotoUrl(photo.storageKey)}
                alt={photo.caption || photo.filename}
                className="w-full h-full object-cover"
              />
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                  <p className="text-xs text-white truncate">{photo.caption}</p>
                </div>
              )}
              {!disabled && (
                <button
                  onClick={() => handleDeleteClick(photo)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Photo Button */}
      {!disabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="w-full"
          >
            <ImagePlus className="h-4 w-4 mr-2" />
            Add Photo
          </Button>
        </>
      )}

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Photo</DialogTitle>
            <DialogDescription>
              Add a photo with an optional caption
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {previewUrl && (
              <div className="aspect-video rounded-lg overflow-hidden border bg-muted">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div>
              <Label htmlFor="caption">Caption (optional)</Label>
              <Input
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Describe this photo..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelUpload}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
