"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Archive,
  Check,
  ChevronDown,
  File,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  Image as ImageIcon,
  List,
  LoaderCircle,
  Play,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { FileUploader } from "@/components/files/FileUploader";
import { formatBytes, safeStorageFileName } from "@/lib/files";
import { createClient } from "@/utils/supabase/client";
import { signOut } from "@/app/dashboard/actions";

const STORAGE_BUCKET = "vault";
const STORAGE_QUOTA_BYTES = 5 * 1024 ** 3;
const FILE_COLUMNS = "id,user_id,folder_id,storage_path,name,content_type,size_bytes,created_at";

type VaultFile = {
  id: string;
  user_id: string;
  folder_id: string | null;
  storage_path: string;
  name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

type VaultFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

type ViewFilter = "all" | "images" | "videos" | "documents" | `folder:${string}`;
type ViewMode = "grid" | "list";

type ActiveFile = {
  file: VaultFile;
  signedUrl?: string;
  loading: boolean;
  error?: string;
};

type DashboardClientProps = {
  userId: string;
  userEmail: string;
};

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function fileCategory(file: VaultFile) {
  const type = (file.content_type ?? "").toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/") || extension === "mp4" || extension === "webm") return "video";
  return "document";
}

export function DashboardClient({ userId, userEmail }: DashboardClientProps) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [folderName, setFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [fileAction, setFileAction] = useState<"download" | "rename" | "delete" | null>(null);
  const [fileActionError, setFileActionError] = useState("");

  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setDataError("");

    try {
      const supabase = createClient();
      const [
        { data: fileRows, error: fileError },
        { data: folderRows, error: folderLoadError },
      ] = await Promise.all([
        supabase
          .from("files")
          .select(FILE_COLUMNS)
          .order("created_at", { ascending: false }),
        supabase.from("folders").select("id,name,parent_id,created_at").order("name"),
      ]);

      if (fileError) throw new Error(`Could not load files: ${fileError.message}`);
      if (folderLoadError) throw new Error(`Could not load folders: ${folderLoadError.message}`);

      const loadedFiles = (fileRows ?? []) as VaultFile[];
      setFiles(loadedFiles);
      setFolders((folderRows ?? []) as VaultFolder[]);
      setUsedBytes(loadedFiles.reduce((total, item) => total + item.size_bytes, 0));
    } catch (error) {
      setDataError(messageFromError(error));
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!activeFile) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !fileAction) setActiveFile(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFile, fileAction]);

  const selectedFolderId = filter.startsWith("folder:") ? filter.slice("folder:".length) : null;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const visibleFiles = useMemo(() => {
    const query = search.trim().toLowerCase();

    return files.filter((file) => {
      const category = fileCategory(file);
      const matchesFilter =
        filter === "all" ||
        (filter === "images" && category === "image") ||
        (filter === "videos" && category === "video") ||
        (filter === "documents" && category === "document") ||
        (selectedFolderId !== null && file.folder_id === selectedFolderId);

      return matchesFilter && (!query || file.name.toLowerCase().includes(query));
    });
  }, [files, filter, search, selectedFolderId]);

  const usagePercent = Math.min((usedBytes / STORAGE_QUOTA_BYTES) * 100, 100);
  const currentTitle =
    filter === "all"
      ? "All Files"
      : filter === "images"
        ? "Images"
        : filter === "videos"
          ? "Videos"
          : filter === "documents"
            ? "Documents"
            : selectedFolder?.name ?? "Folder";

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) {
      setFolderError("Enter a folder name.");
      return;
    }
    if (name.length > 255) {
      setFolderError("Folder names must be 255 characters or fewer.");
      return;
    }

    setFolderError("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("folders")
        .insert({ user_id: userId, parent_id: null, name })
        .select("id,name,parent_id,created_at")
        .single();

      if (error) throw new Error(`Could not create folder: ${error.message}`);

      const createdFolder = data as VaultFolder;
      setFolders((current) =>
        [...current, createdFolder].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setFolderName("");
      setIsCreatingFolder(false);
      setFilter(`folder:${createdFolder.id}`);
    } catch (error) {
      setFolderError(messageFromError(error));
    }
  }

  async function openFile(file: VaultFile) {
    setActiveFile({ file, loading: true });
    setRenameValue(file.name);
    setIsRenaming(false);
    setFileActionError("");

    try {
      const { data, error } = await createClient()
        .storage.from(STORAGE_BUCKET)
        .createSignedUrl(file.storage_path, 60 * 60);
      if (error) throw error;

      setActiveFile((current) =>
        current?.file.id === file.id
          ? { file, signedUrl: data.signedUrl, loading: false }
          : current,
      );
    } catch (error) {
      setActiveFile((current) =>
        current?.file.id === file.id
          ? { file, loading: false, error: messageFromError(error) }
          : current,
      );
    }
  }

  async function downloadFile(file: VaultFile) {
    setFileAction("download");
    setFileActionError("");

    try {
      const { data, error } = await createClient()
        .storage.from(STORAGE_BUCKET)
        .createSignedUrl(file.storage_path, 60, { download: file.name });

      if (error) throw error;

      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = file.name;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setFileActionError(`Could not download file: ${messageFromError(error)}`);
    } finally {
      setFileAction(null);
    }
  }

  async function renameFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeFile) return;

    const name = renameValue.trim();
    if (!name) {
      setFileActionError("File name cannot be empty.");
      return;
    }
    if (name.length > 255) {
      setFileActionError("File names must be 255 characters or fewer.");
      return;
    }
    if (name === activeFile.file.name) {
      setIsRenaming(false);
      return;
    }

    setFileAction("rename");
    setFileActionError("");
    const supabase = createClient();
    const oldPath = activeFile.file.storage_path;
    const newPath = `${userId}/${crypto.randomUUID()}-${safeStorageFileName(name)}`;

    try {
      const { error: moveError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .move(oldPath, newPath);

      if (moveError) throw new Error(`Could not rename stored file: ${moveError.message}`);

      const { data, error: updateError } = await supabase
        .from("files")
        .update({ name, storage_path: newPath })
        .eq("id", activeFile.file.id)
        .select(FILE_COLUMNS)
        .single();

      if (updateError) {
        const { error: rollbackError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .move(newPath, oldPath);
        const rollbackNote = rollbackError
          ? ` Storage rollback failed: ${rollbackError.message}`
          : "";
        throw new Error(`Could not save the new file name: ${updateError.message}.${rollbackNote}`);
      }

      const renamedFile = data as VaultFile;
      setFiles((current) =>
        current.map((file) => (file.id === renamedFile.id ? renamedFile : file)),
      );
      setIsRenaming(false);
      setFileAction(null);
      await openFile(renamedFile);
    } catch (error) {
      setFileActionError(messageFromError(error));
    } finally {
      setFileAction(null);
    }
  }

  async function deleteFile(file: VaultFile) {
    if (!window.confirm(`Delete "${file.name}" from your vault?`)) return;

    setFileAction("delete");
    setFileActionError("");
    const supabase = createClient();

    try {
      const { data: deletedRow, error: deleteError } = await supabase
        .from("files")
        .delete()
        .eq("id", file.id)
        .select("id")
        .maybeSingle();

      if (deleteError) throw new Error(`Could not remove file details: ${deleteError.message}`);
      if (!deletedRow) throw new Error("This file is no longer in your collection. Refresh and try again.");

      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([file.storage_path]);

      if (storageError) {
        const { error: restoreError } = await supabase.from("files").insert({
          id: file.id,
          user_id: file.user_id,
          folder_id: file.folder_id,
          storage_path: file.storage_path,
          name: file.name,
          content_type: file.content_type,
          size_bytes: file.size_bytes,
          created_at: file.created_at,
        });

        const restoreMessage = restoreError
          ? ` Metadata restore failed: ${restoreError.message}`
          : " File details were restored.";
        throw new Error(`Could not remove the stored file: ${storageError.message}.${restoreMessage}`);
      }

      setFiles((current) => current.filter((entry) => entry.id !== file.id));
      setUsedBytes((current) => Math.max(0, current - file.size_bytes));
      setActiveFile(null);
    } catch (error) {
      setFileActionError(messageFromError(error));
    } finally {
      setFileAction(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="border-b border-slate-200 bg-white md:fixed md:inset-y-0 md:z-20 md:flex md:w-64 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold tracking-tight text-slate-900">Ziza Storage</p>
            <p className="text-xs text-slate-500">Personal media vault</p>
          </div>
        </div>

        <nav
          aria-label="File filters"
          className="px-3 pb-3 md:block md:flex-1 md:space-y-1 md:overflow-y-auto md:py-3"
        >
          <div className="flex gap-1 overflow-x-auto md:block md:space-y-1">
            <SidebarItem
              active={filter === "all"}
              icon={<Folder className="h-[18px] w-[18px]" />}
              label="All Files"
              count={files.length}
              onClick={() => setFilter("all")}
            />
            <SidebarItem
              active={filter === "images"}
              icon={<ImageIcon className="h-[18px] w-[18px]" />}
              label="Images"
              count={files.filter((file) => fileCategory(file) === "image").length}
              onClick={() => setFilter("images")}
            />
            <SidebarItem
              active={filter === "videos"}
              icon={<Play className="h-[18px] w-[18px]" />}
              label="Videos"
              count={files.filter((file) => fileCategory(file) === "video").length}
              onClick={() => setFilter("videos")}
            />
            <SidebarItem
              active={filter === "documents"}
              icon={<FileText className="h-[18px] w-[18px]" />}
              label="Documents"
              count={files.filter((file) => fileCategory(file) === "document").length}
              onClick={() => setFilter("documents")}
            />
          </div>

          <div className="mt-3 md:mt-8">
            <div className="flex items-center justify-between px-3 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Folders
            </p>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder((current) => !current);
                setFolderError("");
              }}
              aria-label="Create folder"
              className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-indigo-700"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>

            {isCreatingFolder && (
              <form onSubmit={createFolder} className="mx-2 mb-2 space-y-2 rounded-lg bg-slate-50 p-2">
                <input
                  autoFocus
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  placeholder="Folder name"
                  aria-label="Folder name"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                {folderError && <p className="text-xs text-rose-700">{folderError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingFolder(false)}
                    className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded bg-indigo-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-800"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}
            <div className="flex gap-1 overflow-x-auto md:block md:space-y-1">
              {folders.map((folder) => (
                <SidebarItem
                  key={folder.id}
                  active={filter === `folder:${folder.id}`}
                  icon={<Folder className="h-[18px] w-[18px]" />}
                  label={folder.name}
                  onClick={() => setFilter(`folder:${folder.id}`)}
                />
              ))}
            </div>
            {!folders.length && !isCreatingFolder && (
              <p className="px-3 py-2 text-xs text-slate-400">No folders yet</p>
            )}
          </div>
        </nav>

        <div className="border-t border-slate-100 px-5 py-3 md:p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Storage</p>
            <p className="text-[11px] text-slate-500">{usagePercent.toFixed(0)}%</p>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Storage used"
            aria-valuemin={0}
            aria-valuemax={STORAGE_QUOTA_BYTES}
            aria-valuenow={Math.min(usedBytes, STORAGE_QUOTA_BYTES)}
          >
            <div
              className="h-full rounded-full bg-indigo-600 transition-[width]"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {formatBytes(usedBytes)} of 5 GiB used
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 md:ml-64">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-5 backdrop-blur sm:px-8">
          <div className="relative hidden w-full max-w-md sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search files..."
              aria-label="Search files"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-slate-500 sm:block">
              {userEmail}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-indigo-700">Your collection</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                {currentTitle}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {visibleFiles.length} {visibleFiles.length === 1 ? "file" : "files"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative sm:hidden">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search"
                  aria-label="Search files"
                  className="h-10 w-36 rounded-lg border border-slate-200 bg-white pl-9 pr-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Grid view"
                  aria-pressed={viewMode === "grid"}
                  className={`grid h-8 w-9 place-items-center rounded-md ${
                    viewMode === "grid" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Grid2X2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                  className={`grid h-8 w-9 place-items-center rounded-md ${
                    viewMode === "list" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {dataError && (
            <div role="alert" className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <span>{dataError}</span>
              <button
                type="button"
                onClick={() => void refreshData()}
                className="shrink-0 font-semibold underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="mt-8 grid min-h-52 place-items-center rounded-2xl border border-slate-200 bg-white">
              <LoaderCircle className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : visibleFiles.length ? (
            <div className={`mt-7 ${viewMode === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}`}>
              {visibleFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  mode={viewMode}
                  onOpen={() => void openFile(file)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                <Folder className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-semibold text-slate-900">
                {search ? "No files match your search" : "Nothing here yet"}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
                {search
                  ? "Try another name or clear the search."
                  : "Upload files below to start building your collection."}
              </p>
            </div>
          )}

          <FileUploader
            folderId={selectedFolderId}
            onUploadComplete={() => refreshData(true)}
          />
        </main>
      </div>

      {activeFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !fileAction) setActiveFile(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-modal-title"
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 id="file-modal-title" className="truncate font-semibold text-slate-900">
                  {activeFile.file.name}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatBytes(activeFile.file.size_bytes)} · {formattedDate(activeFile.file.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveFile(null)}
                aria-label="Close preview"
                disabled={Boolean(fileAction)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-48 flex-1 overflow-auto bg-slate-950 p-4 sm:p-8">
              {activeFile.loading ? (
                <div className="grid min-h-64 place-items-center">
                  <LoaderCircle className="h-7 w-7 animate-spin text-white" />
                </div>
              ) : activeFile.error ? (
                <p role="alert" className="mx-auto max-w-lg py-16 text-center text-sm text-rose-200">
                  Preview unavailable: {activeFile.error}
                </p>
              ) : activeFile.signedUrl && fileCategory(activeFile.file) === "image" ? (
                <div className="relative mx-auto h-[65vh] max-h-[680px] w-full">
                  <Image
                    src={activeFile.signedUrl}
                    alt={activeFile.file.name}
                    fill
                    unoptimized
                    sizes="(max-width: 900px) 100vw, 900px"
                    className="object-contain"
                  />
                </div>
              ) : activeFile.signedUrl && fileCategory(activeFile.file) === "video" ? (
                <video
                  src={activeFile.signedUrl}
                  controls
                  autoPlay
                  className="mx-auto max-h-[68vh] max-w-full"
                />
              ) : (
                <div className="grid min-h-64 place-items-center text-center text-slate-300">
                  <div>
                    <DocumentIcon file={activeFile.file} className="mx-auto h-12 w-12" />
                    <p className="mt-4 text-sm">Preview is not available for this file type.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              {isRenaming ? (
                <form onSubmit={renameFile} className="flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    maxLength={255}
                    aria-label="New file name"
                    className="h-10 min-w-48 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="submit"
                    disabled={Boolean(fileAction)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                  >
                    {fileAction === "rename" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRenaming(false);
                      setRenameValue(activeFile.file.name);
                    }}
                    disabled={Boolean(fileAction)}
                    className="h-10 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    {fileActionError && (
                      <p role="alert" className="max-w-xl text-sm text-rose-700">
                        {fileActionError}
                      </p>
                    )}
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadFile(activeFile.file)}
                      disabled={Boolean(fileAction)}
                      className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {fileAction === "download" ? "Preparing..." : "Download"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRenaming(true);
                        setRenameValue(activeFile.file.name);
                        setFileActionError("");
                      }}
                      disabled={Boolean(fileAction)}
                      className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteFile(activeFile.file)}
                      disabled={Boolean(fileAction)}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {fileAction === "delete" ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              )}
              {isRenaming && fileActionError && (
                <p role="alert" className="mt-2 text-sm text-rose-700">
                  {fileActionError}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SidebarItem({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition md:w-full ${
        active
          ? "bg-indigo-50 font-semibold text-indigo-800"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <span className={active ? "text-indigo-700" : "text-slate-400"}>{icon}</span>
      <span className="max-w-36 truncate md:flex-1">{label}</span>
      {count !== undefined && (
        <span className="hidden text-xs text-slate-400 md:block">{count}</span>
      )}
    </button>
  );
}

function FileCard({
  file,
  mode,
  onOpen,
}: {
  file: VaultFile;
  mode: ViewMode;
  onOpen: () => void;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const isImage = fileCategory(file) === "image";

  useEffect(() => {
    if (!isImage) return;

    let active = true;
    async function loadThumbnail() {
      const { data, error } = await createClient()
        .storage.from(STORAGE_BUCKET)
        .createSignedUrl(file.storage_path, 5 * 60);
      if (active && !error) setThumbnailUrl(data.signedUrl);
    }

    void loadThumbnail();
    return () => {
      active = false;
    };
  }, [file.storage_path, isImage]);

  const artwork =   <FileArtwork file={file} mode={mode} thumbnailUrl={thumbnailUrl} />;
  const details = (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-sm font-semibold text-slate-800">{file.name}</span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span>{formatBytes(file.size_bytes)}</span>
        <span aria-hidden="true">·</span>
        <span>{formattedDate(file.created_at)}</span>
      </span>
    </span>
  );

  if (mode === "list") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200 hover:shadow-sm"
      >
        {artwork}
        {details}
        <ChevronDown className="h-4 w-4 -rotate-90 text-slate-400" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
    >
      <span className="block h-44 overflow-hidden bg-slate-100">{artwork}</span>
      <span className="flex items-center gap-3 p-4">{details}</span>
    </button>
  );
}

function FileArtwork({
  file,
  mode,
  thumbnailUrl,
}: {
  file: VaultFile;
  mode: ViewMode;
  thumbnailUrl: string | null;
}) {
  const category = fileCategory(file);
  const sizeClass =
    mode === "grid" ? "h-full w-full" : "h-12 w-12 shrink-0 rounded-lg";

  if (category === "image" && thumbnailUrl) {
    return (
      <span className={`relative block overflow-hidden ${sizeClass}`}>
        <Image
          src={thumbnailUrl}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover"
        />
      </span>
    );
  }

  if (category === "video") {
    return (
      <span className={`grid place-items-center ${sizeClass} bg-violet-50 text-violet-700`}>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
      </span>
    );
  }

  const Icon =
    category === "image"
      ? ImageIcon
      : file.name.toLowerCase().endsWith(".zip")
        ? Archive
        : FileText;
  return (
    <span className={`grid place-items-center ${sizeClass} bg-indigo-50 text-indigo-700`}>
      <Icon className="h-6 w-6" />
    </span>
  );
}

function DocumentIcon({ file, className }: { file: VaultFile; className: string }) {
  const category = fileCategory(file);
  const Icon =
    category === "video"
      ? Play
      : file.name.toLowerCase().endsWith(".zip")
        ? Archive
        : category === "image"
          ? ImageIcon
          : File;

  return <Icon className={className} />;
}
