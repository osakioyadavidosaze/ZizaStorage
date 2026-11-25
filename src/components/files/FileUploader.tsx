"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import {
  Archive,
  CheckCircle2,
  File,
  FileText,
  ImagePlus,
  LoaderCircle,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Upload as TusUpload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { formatBytes, safeStorageFileName } from "@/lib/files";

const STORAGE_BUCKET = "vault";
const ACCEPTED_TYPES = [
  "image/*",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/*",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
  ".7z",
  ".rar",
  ".csv",
  ".txt",
  ".md",
].join(",");

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "zip",
  "7z",
  "rar",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "md",
]);

type UploadStatus = "queued" | "uploading" | "saving" | "complete" | "error";

type QueuedFile = {
  id: string;
  file: File;
  previewUrl?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
};

type FileUploaderProps = {
  folderId?: string | null;
  onUploadComplete?: () => void | Promise<void>;
};

function isSupportedFile(file: File) {
  const type = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  return (
    type.startsWith("image/") ||
    type === "video/mp4" ||
    type === "video/webm" ||
    type === "application/pdf" ||
    type.includes("zip") ||
    type.includes("7z") ||
    type.includes("rar") ||
    type.startsWith("text/") ||
    type.includes("wordprocessingml") ||
    type.includes("spreadsheetml") ||
    type.includes("presentationml") ||
    type === "application/msword" ||
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.ms-powerpoint" ||
    DOCUMENT_EXTENSIONS.has(extension)
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function uploadWithProgress(
  file: File,
  storagePath: string,
  accessToken: string,
  onProgress: (progress: number) => void,
) {
  const { url } = getSupabaseConfig();

  return new Promise<void>((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint: `${url.replace(/\/$/, "")}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: STORAGE_BUCKET,
        objectName: storagePath,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      uploadDataDuringCreation: true,
      chunkSize: 6 * 1024 * 1024,
      storeFingerprintForResuming: false,
      onProgress(bytesSent, bytesTotal) {
        onProgress(bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0);
      },
      onError: reject,
      onSuccess: () => resolve(),
    });

    upload.start();
  });
}

export function FileUploader({
  folderId = null,
  onUploadComplete,
}: FileUploaderProps) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const previewUrls = useRef(new Set<string>());

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    },
    [],
  );

  function addFiles(fileList: FileList | File[]) {
    if (isUploading) return;

    const selected = Array.from(fileList);
    const accepted = selected.filter(isSupportedFile);
    const rejected = selected.filter((file) => !isSupportedFile(file));

    if (rejected.length) {
      const names = rejected.slice(0, 3).map((file) => file.name).join(", ");
      const remainder = rejected.length > 3 ? ` and ${rejected.length - 3} more` : "";
      setSelectionError(`Unsupported file type: ${names}${remainder}.`);
    } else {
      setSelectionError("");
    }

    const newItems = accepted.map((file): QueuedFile => {
      const previewable = file.type.startsWith("image/") || file.type.startsWith("video/");
      const previewUrl = previewable ? URL.createObjectURL(file) : undefined;

      if (previewUrl) previewUrls.current.add(previewUrl);

      return {
        id: crypto.randomUUID(),
        file,
        previewUrl,
        status: "queued",
        progress: 0,
      };
    });

    if (newItems.length) {
      setFiles((current) => [...current, ...newItems]);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files) addFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files) addFiles(event.dataTransfer.files);
  }

  function removeFile(id: string) {
    setFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrls.current.delete(removed.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function updateFile(id: string, updates: Partial<QueuedFile>) {
    setFiles((current) =>
      current.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  }

  async function uploadFile(
    item: QueuedFile,
    supabase: ReturnType<typeof createClient>,
    userId: string,
    accessToken: string,
  ): Promise<boolean> {
    const storagePath = `${userId}/${crypto.randomUUID()}-${safeStorageFileName(item.file.name)}`;
    let cleanupNeeded = true;

    updateFile(item.id, { status: "uploading", progress: 0, error: undefined });

    try {
      await uploadWithProgress(item.file, storagePath, accessToken, (progress) => {
        updateFile(item.id, { progress });
      });

      updateFile(item.id, { status: "saving", progress: 100 });

      const { error: metadataError } = await supabase.from("files").insert({
        user_id: userId,
        folder_id: folderId,
        storage_path: storagePath,
        name: item.file.name,
        content_type: item.file.type || "application/octet-stream",
        size_bytes: item.file.size,
      });

      if (metadataError) {
        throw new Error(`File uploaded, but its details could not be saved: ${metadataError.message}`);
      }

      cleanupNeeded = false;
      updateFile(item.id, { status: "complete", progress: 100 });
      return true;
    } catch (error) {
      let message = getErrorMessage(error);

      if (cleanupNeeded) {
        const { error: cleanupError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([storagePath]);

        if (cleanupError) {
          message += ` Storage cleanup also failed: ${cleanupError.message}`;
        }
      }

      updateFile(item.id, { status: "error", error: message });
      return false;
    }
  }

  async function startUploads() {
    const pending = files.filter((item) => item.status === "queued" || item.status === "error");
    if (!pending.length || isUploading) return;

    setIsUploading(true);
    setSelectionError("");

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Your session has expired. Sign in again to upload files.");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.access_token) {
        throw new Error("Your session has expired. Sign in again to upload files.");
      }

      let completedAny = false;
      for (const item of pending) {
        completedAny = (await uploadFile(item, supabase, user.id, session.access_token)) || completedAny;
      }

      if (completedAny) {
        await onUploadComplete?.();
      }
    } catch (error) {
      const message = getErrorMessage(error);
      pending.forEach((item) => {
        updateFile(item.id, { status: "error", error: message });
      });
    } finally {
      setIsUploading(false);
    }
  }

  const pendingCount = files.filter(
    (item) => item.status === "queued" || item.status === "error",
  ).length;

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Add files to your vault</h2>
          <p className="mt-1 text-sm text-slate-500">
            Images, MP4/WebM videos, PDFs, archives, and common documents.
          </p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          Private upload
        </span>
      </div>

      <label
        htmlFor="vault-file-input"
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-8 text-center transition ${
          isDragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-slate-300 bg-slate-50/70 hover:border-indigo-400 hover:bg-indigo-50/40"
        } ${isUploading ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
          <ImagePlus className="h-6 w-6" />
        </span>
        <span className="mt-4 text-sm font-semibold text-slate-800">
          Drop files here or <span className="text-indigo-700">browse</span>
        </span>
        <span className="mt-1 text-xs text-slate-500">Select multiple files at once</span>
        <input
          id="vault-file-input"
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          disabled={isUploading}
          onChange={handleInputChange}
          className="sr-only"
        />
      </label>

      {selectionError && (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {selectionError}
        </p>
      )}

      {files.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              Upload queue <span className="text-slate-400">({files.length})</span>
            </h3>
            <button
              type="button"
              onClick={startUploads}
              disabled={isUploading || pendingCount === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isUploading
                ? "Uploading..."
                : pendingCount
                  ? `Upload ${pendingCount} file${pendingCount === 1 ? "" : "s"}`
                  : "Uploaded"}
            </button>
          </div>

          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {files.map((item) => (
              <li key={item.id} className="flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
                <FilePreview item={item} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {item.file.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatBytes(item.file.size)} · {statusLabel(item.status)}
                      </p>
                    </div>
                    {item.status === "complete" ? (
                      <CheckCircle2
                        aria-label="Upload complete"
                        className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                      />
                    ) : item.status === "uploading" || item.status === "saving" ? (
                      <LoaderCircle
                        aria-label={statusLabel(item.status)}
                        className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-indigo-600"
                      />
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeFile(item.id)}
                        disabled={isUploading}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {(item.status === "queued" ||
                    item.status === "uploading" ||
                    item.status === "saving" ||
                    item.status === "complete") && (
                    <div
                      className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-label={`Upload progress for ${item.file.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={item.progress}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] ${
                          item.status === "complete" ? "bg-emerald-500" : "bg-indigo-600"
                        }`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}

                  {item.error && (
                    <p role="alert" className="mt-2 text-xs leading-5 text-rose-700">
                      {item.error}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function statusLabel(status: UploadStatus) {
  switch (status) {
    case "queued":
      return "Ready to upload";
    case "uploading":
      return "Uploading";
    case "saving":
      return "Saving details";
    case "complete":
      return "Complete";
    case "error":
      return "Upload failed";
  }
}

function FilePreview({ item }: { item: QueuedFile }) {
  const type = item.file.type.toLowerCase();
  const extension = item.file.name.split(".").pop()?.toLowerCase();
  const previewClass = "h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100";

  if (item.previewUrl && type.startsWith("image/")) {
    return (
      <Image
        src={item.previewUrl}
        alt=""
        width={48}
        height={48}
        unoptimized
        className={`${previewClass} object-cover`}
      />
    );
  }

  if (item.previewUrl && type.startsWith("video/")) {
    return (
      <video
        src={item.previewUrl}
        muted
        preload="metadata"
        className={`${previewClass} object-cover`}
      />
    );
  }

  const Icon =
    extension === "zip" || extension === "7z" || extension === "rar"
      ? Archive
      : extension === "pdf" || DOCUMENT_EXTENSIONS.has(extension ?? "")
        ? FileText
        : type.startsWith("video/")
          ? Video
          : type.startsWith("image/")
            ? ImagePlus
            : File;

  return (
    <span className={`${previewClass} grid place-items-center text-indigo-700`}>
      <Icon className="h-5 w-5" />
    </span>
  );
}
