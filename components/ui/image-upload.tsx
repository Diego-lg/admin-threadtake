"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ImagePlus,
  Trash,
  X,
  Upload,
  RefreshCw,
  Folder,
  ArrowLeft,
} from "lucide-react"; // Added Folder, ArrowLeft
import Image from "next/image";
import axios from "axios"; // Import axios
import { toast } from "react-hot-toast"; // Import toast

interface ImageUploadProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  onRemove: (value: string) => void;
  value: string[];
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  disabled,
  onChange,
  onRemove,
  value,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  // State for API response
  const [folders, setFolders] = useState<{ name: string; prefix: string }[]>(
    []
  );
  const [images, setImages] = useState<
    { key: string; url: string; lastModified?: Date }[]
  >([]);
  const [currentPrefix, setCurrentPrefix] = useState(""); // State for current folder prefix
  const [showImageSelector, setShowImageSelector] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // For fetching existing images
  const [isUploading, setIsUploading] = useState(false); // For upload process

  useEffect(() => {
    setIsMounted(true);
    // TODO: Fetch existing images if needed (e.g., from Cloudflare)
    // Don't fetch initially, fetch when modal opens
  }, []);

  // Fetch folders and images for a given prefix
  const fetchExistingImages = async (prefix: string) => {
    setIsLoading(true);
    setFolders([]); // Clear previous state
    setImages([]);
    try {
      const response = await axios.get<{
        folders: { name: string; prefix: string }[];
        images: { key: string; url: string; lastModified?: Date }[];
        currentPrefix: string;
      }>(`/api/r2-images?prefix=${encodeURIComponent(prefix)}`); // Pass prefix

      setFolders(response.data.folders || []);
      setImages(response.data.images || []);
      setCurrentPrefix(response.data.currentPrefix || ""); // Update current prefix state
    } catch (error) {
      console.error(`Error fetching images for prefix "${prefix}":`, error);
      toast.error("Failed to load image library.");
    } finally {
      setIsLoading(false);
    }
  };

  // TODO: Implement function to delete image from Cloudflare
  const deleteImage = async (url: string) => {
    try {
      setIsDeleting(url);
      console.log("Deleting image:", url);
      // Placeholder: Replace with actual Cloudflare deletion logic & API call
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate API call

      // Remove from existingImages state
      // Refetch current folder after delete
      fetchExistingImages(currentPrefix);

      // If this image was also in the selected values, remove it there too
      if (value.includes(url)) {
        onRemove(url);
      }
      console.log("Image deleted successfully (simulated)");
    } catch (error) {
      console.error("Error deleting image:", error);
    } finally {
      setIsDeleting(null);
    }
  };

  // TODO: Implement handler for successful Cloudflare upload
  const onUploadSuccess = (uploadedUrl: string) => {
    onChange(uploadedUrl);
    // Add the new image to the existingImages list if managing them here
    // Instead of just adding the URL, refetch the list to get the latest state from R2
    // Or, if the API returns the object details on upload, add that object here.
    // For simplicity now, just refetch after upload.
    // Refetch current folder after upload
    fetchExistingImages(currentPrefix);
    console.log("Upload successful:", uploadedUrl);
  };

  const openImageBrowser = () => {
    // Reset to root folder when opening modal
    fetchExistingImages("");
    setShowImageSelector(true);
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {value.map((url) => (
          <div
            key={url}
            className="relative w-[200px] h-[200px] rounded-md overflow-hidden border border-zinc-200"
          >
            <div className="z-10 absolute top-2 right-2">
              <Button
                type="button"
                onClick={() => onRemove(url)}
                variant="destructive"
                size="icon"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
            <Image fill className="object-cover" alt="image" src={url} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <Button
          type="button"
          onClick={openImageBrowser}
          variant="outline"
          className="border-zinc-300 hover:bg-zinc-100"
        >
          <ImagePlus className="h-4 w-4 mr-2" />
          Upload an image
        </Button>
      </div>

      {/* Image Selector Modal */}
      {showImageSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-black text-white rounded-xl shadow-xl border border-zinc-700 overflow-hidden">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-medium tracking-tight">
                  Select an Image{" "}
                  {currentPrefix && (
                    <span className="text-sm text-zinc-400 ml-2">
                      ({currentPrefix})
                    </span>
                  )}
                </h3>
                <Button
                  onClick={() => setShowImageSelector(false)}
                  variant="outline"
                  size="icon"
                  className="rounded-full border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Upload Button in Modal */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex-1">
                  {/* TODO: Replace with Cloudflare Upload Component/Logic */}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={disabled}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      setIsUploading(true);
                      console.log("File selected:", file.name, file.type);

                      try {
                        // 1. Get the signed URL from our API
                        const signedUrlResponse = await fetch(
                          "/api/upload-url",
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              filename: file.name,
                              contentType: file.type,
                            }),
                          }
                        );

                        if (!signedUrlResponse.ok) {
                          throw new Error(
                            `Failed to get signed URL: ${signedUrlResponse.statusText}`
                          );
                        }

                        const { uploadUrl, publicUrl } =
                          await signedUrlResponse.json();
                        console.log("Got signed URL:", uploadUrl);
                        console.log("Public URL:", publicUrl);

                        // 2. Upload the file directly to R2 using the signed URL
                        const uploadResponse = await fetch(uploadUrl, {
                          method: "PUT",
                          body: file,
                          headers: {
                            "Content-Type": file.type,
                          },
                        });

                        if (!uploadResponse.ok) {
                          // Attempt to read error from R2 response if possible
                          let r2Error = "Upload failed";
                          try {
                            const errorText = await uploadResponse.text();
                            console.error(
                              "R2 Upload Error Response:",
                              errorText
                            );
                            r2Error = `Failed to upload to R2: ${
                              uploadResponse.statusText
                            } - ${errorText.substring(0, 100)}`; // Limit error length
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                          } catch (error) {
                            r2Error = `Failed to upload to R2: ${uploadResponse.statusText}`;
                          }
                          throw new Error(r2Error);
                        }

                        console.log("File uploaded successfully to R2.");

                        // 3. Call the success handler with the public URL
                        onUploadSuccess(publicUrl);
                      } catch (error) {
                        console.error("Upload failed:", error);
                        // TODO: Show error toast to user
                      } finally {
                        setIsUploading(false);
                        // Reset file input value so the same file can be selected again if needed
                        e.target.value = "";
                      }
                    }}
                    className="hidden" // Basic styling, replace as needed
                    id="cloudflare-upload-input"
                  />
                  <Button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("cloudflare-upload-input")
                        ?.click()
                    }
                    disabled={disabled || isUploading} // Disable while uploading
                    variant="secondary"
                    className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                  >
                    {isUploading ? (
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {isUploading ? "Uploading..." : "Upload new image"}
                  </Button>
                </div>
                <div className="flex items-center">
                  {/* Refresh button might need different logic for Cloudflare */}
                  <Button
                    onClick={() => fetchExistingImages(currentPrefix)} // Refresh current prefix
                    variant="outline"
                    size="sm"
                    className="ml-2 border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                    disabled={isLoading}
                  >
                    <div
                      className={`h-4 w-4 mr-1 ${
                        isLoading ? "animate-spin" : ""
                      }`}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                      />
                    </div>
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Back Button */}
              {currentPrefix && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Calculate parent prefix (handle potential trailing slash)
                    const prefixTrimmed = currentPrefix.endsWith("/")
                      ? currentPrefix.slice(0, -1)
                      : currentPrefix;
                    const lastSlashIndex = prefixTrimmed.lastIndexOf("/");
                    const parentPrefix =
                      lastSlashIndex === -1
                        ? ""
                        : prefixTrimmed.substring(0, lastSlashIndex + 1);
                    fetchExistingImages(parentPrefix);
                  }}
                  className="mb-2 text-zinc-400 hover:text-white"
                  disabled={isLoading}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
              )}

              {/* Folder and Image Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[60vh] overflow-y-auto p-1">
                {/* Render Folders */}
                {folders.map((folder) => (
                  <div
                    key={folder.prefix}
                    className="relative group aspect-square overflow-hidden rounded-md bg-zinc-900 border border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-800 transition-colors"
                    onClick={() => fetchExistingImages(folder.prefix)}
                  >
                    <Folder className="h-12 w-12 text-zinc-500 mb-2" />
                    <span className="text-xs text-center text-zinc-300 break-words px-1">
                      {folder.name}
                    </span>
                  </div>
                ))}

                {/* Render Images */}
                {images.map((image) => (
                  <div
                    key={image.key} // Use key for uniqueness
                    className="relative group aspect-square overflow-hidden rounded-md bg-zinc-800"
                  >
                    <div className="relative w-full h-full">
                      <Image
                        src={image.url} // Use image.url
                        alt="Uploaded Image"
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover cursor-pointer transition-all duration-300"
                        onClick={() => {
                          onChange(image.url); // Pass image.url
                          setShowImageSelector(false);
                        }}
                      />
                    </div>
                    <div
                      className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300"
                      onClick={() => {
                        onChange(image.url); // Pass image.url
                        setShowImageSelector(false);
                      }}
                    >
                      <span className="text-xs font-medium text-white px-3 py-1.5 rounded-full bg-black bg-opacity-50 pointer-events-none">
                        Select
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteImage(image.url); // Pass image.url
                        }}
                        disabled={isDeleting === image.url}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full transition-colors"
                        aria-label="Delete image"
                      >
                        {isDeleting === image.url ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <Trash className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}

                {/* Loading / Empty State */}
                {isLoading && (
                  <div className="col-span-full flex items-center justify-center py-12 text-zinc-400">
                    Loading...
                  </div>
                )}
                {!isLoading && folders.length === 0 && images.length === 0 && (
                  <div className="col-span-full flex items-center justify-center py-12 text-zinc-400">
                    {currentPrefix
                      ? "This folder is empty."
                      : "No images or folders found."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
