"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Download, 
  Eye, 
  MoreHorizontal, 
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  status: "pending" | "processing" | "completed" | "error";
  uploadedAt: string;
  pageCount?: number;
  clauseCount?: number;
  flagCount?: number;
}

interface DocumentCardProps {
  document: Document;
  onView?: (id: string) => void;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusIcon(status: Document["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "processing":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: Document["status"]) {
  const variants: Record<Document["status"], "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    processing: "secondary",
    error: "destructive",
    pending: "outline",
  };
  
  return (
    <Badge variant={variants[status]} className="capitalize">
      {status}
    </Badge>
  );
}

/**
 * DocumentCard - Displays a single document with status and actions
 */
export function DocumentCard({ 
  document, 
  onView, 
  onDownload, 
  onDelete,
  showActions = true 
}: DocumentCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="flex items-center gap-4 py-4">
        {/* Icon */}
        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="h-6 w-6 text-primary" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{document.name}</p>
            {getStatusIcon(document.status)}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{formatBytes(document.size)}</span>
            <span>•</span>
            <span>{formatDate(document.uploadedAt)}</span>
            {document.pageCount && (
              <>
                <span>•</span>
                <span>{document.pageCount} pages</span>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        {document.status === "completed" && (
          <div className="hidden md:flex items-center gap-4 text-sm">
            {document.clauseCount !== undefined && (
              <div className="text-center">
                <p className="font-semibold">{document.clauseCount}</p>
                <p className="text-muted-foreground text-xs">Clauses</p>
              </div>
            )}
            {document.flagCount !== undefined && (
              <div className="text-center">
                <p className="font-semibold text-amber-600">{document.flagCount}</p>
                <p className="text-muted-foreground text-xs">Flags</p>
              </div>
            )}
          </div>
        )}

        {/* Status Badge */}
        {getStatusBadge(document.status)}

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-2">
            {onView && document.status === "completed" && (
              <Button variant="ghost" size="sm" onClick={() => onView(document.id)}>
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {onDownload && (
              <Button variant="ghost" size="sm" onClick={() => onDownload(document.id)}>
                <Download className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    className="text-red-600"
                    onClick={() => onDelete(document.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * DocumentList - Displays a list of documents
 */
interface DocumentListProps {
  documents: Document[];
  onView?: (id: string) => void;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
}

export function DocumentList({ 
  documents, 
  onView, 
  onDownload, 
  onDelete,
  emptyMessage = "No documents found"
}: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          document={doc}
          onView={onView}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
