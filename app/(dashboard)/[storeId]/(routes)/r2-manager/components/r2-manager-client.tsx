"use client";

import { useState, useEffect, useCallback } from "react";
import { Heading } from "@/components/ui/heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Trash2,
  RefreshCw,
  HardDrive,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  Folder,
} from "lucide-react";

/**
 * R2 File Manager Client Component
 */
export function R2ManagerClient() {
  // Stats state
  const [stats, setStats] = useState<{
    r2Stats: {
      totalFiles: number;
      totalSize: number;
      sizeByFolder: Record<string, { count: number; size: number }>;
    };
    dbSummary: {
      totalFiles: number;
      activeFiles: number;
      totalSize: number;
    };
    recommendations: Array<{
      type: string;
      description: string;
      estimatedFiles: number;
      estimatedSpace: number;
    }>;
    bucketStatus: {
      isConfigured: boolean;
      bucketName: string;
      publicBucketUrl: string;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Files state
  const [files, setFiles] = useState<
    Array<{
      key: string;
      size: number;
      lastModified: string;
      sizeFormatted: string;
    }>
  >([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesToken, setFilesToken] = useState<string | undefined>();
  const [filesTruncated, setFilesTruncated] = useState(false);

  // Cleanup dialog state
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupType, setCleanupType] = useState<string>("");
  const [cleanupConfig, setCleanupConfig] = useState<{
    olderThanDays: number | null;
    largerThanBytes: number | null;
    maxFiles: number;
    dryRun: boolean;
  }>({
    olderThanDays: null,
    largerThanBytes: null,
    maxFiles: 100,
    dryRun: true,
  });
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    deletedCount: number;
    freedSpaceFormatted: string;
    errors: string[];
    dryRun: boolean;
    deletedFiles: Array<{ key: string; sizeFormatted: string }>;
  } | null>(null);

  // Selected files for deletion
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fetch initial stats
  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/r2/manager?action=stats");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch stats");
      }
      setStats(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch files
  const fetchFiles = useCallback(async (continuationToken?: string) => {
    try {
      setFilesLoading(true);
      const url = new URL("/api/r2/manager", window.location.origin);
      url.searchParams.set("action", "list");
      url.searchParams.set("maxKeys", "50");
      if (continuationToken) {
        url.searchParams.set("token", continuationToken);
      }

      const response = await fetch(url.toString());
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch files");
      }

      if (continuationToken) {
        setFiles((prev) => [...prev, ...data.data.files]);
      } else {
        setFiles(data.data.files);
      }
      setFilesToken(data.data.nextToken);
      setFilesTruncated(data.data.isTruncated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Handle cleanup
  const handleCleanup = async () => {
    try {
      setCleanupLoading(true);
      const response = await fetch("/api/r2/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cleanup",
          criteria: {
            olderThanDays: cleanupConfig.olderThanDays,
            largerThanBytes: cleanupConfig.largerThanBytes,
            maxFiles: cleanupConfig.maxFiles,
            dryRun: cleanupConfig.dryRun,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Cleanup failed");
      }
      setCleanupResult(data.data);
      if (!cleanupConfig.dryRun) {
        // Refresh stats after cleanup
        fetchStats();
        setFiles([]);
        fetchFiles();
      }
    } catch (err: any) {
      setCleanupResult({
        deletedCount: 0,
        freedSpaceFormatted: "0 Bytes",
        errors: [err.message],
        dryRun: cleanupConfig.dryRun,
        deletedFiles: [],
      });
    } finally {
      setCleanupLoading(false);
    }
  };

  // Handle file deletion
  const handleDeleteFiles = async () => {
    try {
      setCleanupLoading(true);
      const response = await fetch("/api/r2/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-files",
          fileKeys: Array.from(selectedFiles),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Delete failed");
      }
      // Refresh
      fetchStats();
      setFiles([]);
      fetchFiles();
      setSelectedFiles(new Set());
      setDeleteDialogOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCleanupLoading(false);
    }
  };

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Toggle file selection
  const toggleFileSelection = (key: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setSelectedFiles(newSelection);
  };

  // Select/deselect all
  const toggleAllFiles = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.key)));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading storage stats...</span>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <Alert variant="destructive" className="mb-4">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Heading
          title="R2 Storage Manager"
          description="Manage your Cloudflare R2 bucket files"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchStats} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setCleanupType("manual");
              setCleanupDialogOpen(true);
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Cleanup Files
          </Button>
        </div>
      </div>

      {/* Bucket Status */}
      {stats?.bucketStatus && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Bucket Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Badge
                variant={
                  stats.bucketStatus.isConfigured ? "default" : "destructive"
                }
              >
                {stats.bucketStatus.isConfigured ? (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Connected
                  </>
                ) : (
                  <>
                    <XCircle className="w-3 h-3 mr-1" />
                    Not Configured
                  </>
                )}
              </Badge>
              {stats.bucketStatus.isConfigured && (
                <>
                  <span className="text-sm text-muted-foreground">
                    Bucket: {stats.bucketStatus.bucketName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    URL: {stats.bucketStatus.publicBucketUrl}
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Storage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6" />
              {stats?.r2Stats.totalFiles.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <HardDrive className="w-6 h-6" />
              {formatBytes(stats?.r2Stats.totalSize || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Files (DB)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-500" />
              {stats?.dbSummary.activeFiles.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {stats?.recommendations && stats.recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Cleanup Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div>
                    <p className="font-medium">{rec.description}</p>
                    <p className="text-sm text-muted-foreground">
                      ~{rec.estimatedFiles.toLocaleString()} files ·{" "}
                      {formatBytes(rec.estimatedSpace)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCleanupType(rec.type);
                      if (rec.type === "old_files") {
                        setCleanupConfig({
                          ...cleanupConfig,
                          olderThanDays: 90,
                          largerThanBytes: null,
                        });
                      } else if (rec.type === "temp_files") {
                        setCleanupConfig({
                          ...cleanupConfig,
                          olderThanDays: 7,
                          largerThanBytes: null,
                        });
                      } else if (rec.type === "large_files") {
                        setCleanupConfig({
                          ...cleanupConfig,
                          olderThanDays: null,
                          largerThanBytes: 10 * 1024 * 1024,
                        });
                      }
                      setCleanupDialogOpen(true);
                    }}
                  >
                    Clean Up
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Files List */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Folder className="w-5 h-5" />
              Files ({files.length}
              {filesTruncated && "+"})
            </CardTitle>
            <div className="flex gap-2">
              {selectedFiles.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected ({selectedFiles.size})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchFiles()}
                disabled={filesLoading}
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${filesLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filesLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No files found. Click refresh to load files.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={
                          selectedFiles.size === files.length &&
                          files.length > 0
                        }
                        onChange={toggleAllFiles}
                      />
                    </TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Last Modified</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file) => (
                    <TableRow key={file.key}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.key)}
                          onChange={() => toggleFileSelection(file.key)}
                        />
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        <span title={file.key}>{file.key}</span>
                      </TableCell>
                      <TableCell>{file.sizeFormatted}</TableCell>
                      <TableCell>
                        {new Date(file.lastModified).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            if (confirm(`Delete ${file.key}?`)) {
                              await fetch("/api/r2/manager", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "delete-file",
                                  fileKey: file.key,
                                }),
                              });
                              fetchStats();
                              setFiles([]);
                              fetchFiles();
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filesTruncated && (
                <div className="mt-4 text-center">
                  <Button
                    variant="outline"
                    onClick={() => fetchFiles(filesToken)}
                    disabled={filesLoading}
                  >
                    Load More
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Cleanup Dialog */}
      <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cleanup Files</DialogTitle>
            <DialogDescription>
              Remove old or large files to free up storage space.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Files older than</label>
              <select
                className="w-full border rounded-md p-2"
                value={cleanupConfig.olderThanDays || ""}
                onChange={(e) =>
                  setCleanupConfig({
                    ...cleanupConfig,
                    olderThanDays: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  })
                }
              >
                <option value="">Any age</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
                <option value="180">6 months</option>
                <option value="365">1 year</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Files larger than</label>
              <select
                className="w-full border rounded-md p-2"
                value={cleanupConfig.largerThanBytes || ""}
                onChange={(e) =>
                  setCleanupConfig({
                    ...cleanupConfig,
                    largerThanBytes: e.target.value
                      ? parseInt(e.target.value) * 1024 * 1024
                      : null,
                  })
                }
              >
                <option value="">Any size</option>
                <option value="1">1 MB</option>
                <option value="5">5 MB</option>
                <option value="10">10 MB</option>
                <option value="50">50 MB</option>
                <option value="100">100 MB</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Maximum files to delete
              </label>
              <input
                type="number"
                className="w-full border rounded-md p-2"
                value={cleanupConfig.maxFiles}
                min="1"
                max="1000"
                onChange={(e) =>
                  setCleanupConfig({
                    ...cleanupConfig,
                    maxFiles: parseInt(e.target.value) || 100,
                  })
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dryRun"
                checked={cleanupConfig.dryRun}
                onChange={(e) =>
                  setCleanupConfig({
                    ...cleanupConfig,
                    dryRun: e.target.checked,
                  })
                }
              />
              <label htmlFor="dryRun" className="text-sm">
                Dry run (preview only, don't delete)
              </label>
            </div>

            {cleanupResult && (
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">
                  {cleanupResult.dryRun ? "Preview" : "Result"}
                </h4>
                <p className="text-sm">
                  {cleanupResult.deletedCount} files would be deleted
                </p>
                <p className="text-sm text-muted-foreground">
                  Space to free: {cleanupResult.freedSpaceFormatted}
                </p>
                {cleanupResult.errors.length > 0 && (
                  <div className="mt-2 text-sm text-red-500">
                    {cleanupResult.errors.map((err, i) => (
                      <p key={i}>Error: {err}</p>
                    ))}
                  </div>
                )}
                {!cleanupResult.dryRun &&
                  cleanupResult.deletedFiles.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-sm cursor-pointer">
                        Show deleted files ({cleanupResult.deletedFiles.length})
                      </summary>
                      <div className="mt-1 max-h-32 overflow-y-auto text-xs">
                        {cleanupResult.deletedFiles.map((f) => (
                          <div key={f.key} className="truncate">
                            {f.key}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCleanupDialogOpen(false);
                setCleanupResult(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCleanup}
              disabled={cleanupLoading}
              variant={cleanupConfig.dryRun ? "outline" : "destructive"}
            >
              {cleanupLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : cleanupConfig.dryRun ? (
                "Preview"
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Selected Files</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedFiles.size} file(s)? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFiles}
              disabled={cleanupLoading}
            >
              {cleanupLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
