"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  Download,
  Share2,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Edit,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AiDisclaimer } from "@/components/shared/AiDisclaimer";
import type { Suggestion } from "@/components/RedlineEditor";

// Dynamic imports for heavy components
const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px]">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  ),
});

const RedlineEditor = dynamic(() => import("@/components/RedlineEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px]">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  ),
});

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  status: string;
  uploadedAt: string;
  pageCount: number;
  pdfUrl?: string;
}

interface Clause {
  id: string;
  type: string;
  text: string;
  confidence: number;
  location: { page: number; start: number; end: number };
  status: "pending" | "approved" | "rejected" | "modified";
}

interface RawSuggestion {
  id?: string;
  clauseId?: string;
  originalText?: string;
  suggestedText?: string;
  rationale?: string;
  reason?: string;
  confidence?: number;
  status?: "pending" | "accepted" | "rejected";
  clauseType?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const matterId = params.id as string;
  const docId = params.docId as string;

  const [document, setDocument] = useState<Document | null>(null);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState<"split" | "pdf" | "redline">("split");
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [selectedClause, setSelectedClause] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");

  useEffect(() => {
    async function fetchDocument() {
      try {
        const [docRes, clausesRes, suggestionsRes] = await Promise.all([
          fetch(`/api/documents/${docId}`),
          fetch(`/api/documents/${docId}/clauses`),
          fetch(`/api/documents/${docId}/suggestions`),
        ]);

        if (docRes.ok) {
          const docData = await docRes.json();
          setDocument(docData.data);
        }

        if (clausesRes.ok) {
          const clausesData = await clausesRes.json();
          setClauses(clausesData.data || []);
          // Build initial editor content from clauses
          const content = clausesData.data
            ?.map((c: Clause) => `<p data-clause-id="${c.id}">${c.text}</p>`)
            .join("\n\n");
          setEditorContent(content || "");
        }

        if (suggestionsRes.ok) {
          const suggestionsData = await suggestionsRes.json();
          const normalizedSuggestions: Suggestion[] = (suggestionsData.data || []).map(
            (suggestion: RawSuggestion, index: number) => ({
              id: suggestion.id || `suggestion-${index}`,
              type: "replacement",
              originalText: suggestion.originalText || "",
              suggestedText: suggestion.suggestedText || "",
              reason: suggestion.reason || suggestion.rationale || "AI suggestion",
              rationale: suggestion.rationale || suggestion.reason,
              confidence: suggestion.confidence || 0,
              clauseType: suggestion.clauseType,
              riskLevel: suggestion.riskLevel,
              position: { from: 0, to: 0 },
              status: suggestion.status || "pending",
            })
          );
          setSuggestions(normalizedSuggestions);
        }
      } catch (err) {
        console.error("Failed to fetch document:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDocument();
  }, [docId]);

  const handleAcceptSuggestion = async (suggestionId: string) => {
    try {
      const response = await fetch(`/api/documents/${docId}/suggestions/${suggestionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });

      if (response.ok) {
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === suggestionId ? { ...s, status: "accepted" as const } : s
          )
        );
      }
    } catch (err) {
      console.error("Failed to accept suggestion:", err);
    }
  };

  const handleRejectSuggestion = async (suggestionId: string) => {
    try {
      const response = await fetch(`/api/documents/${docId}/suggestions/${suggestionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });

      if (response.ok) {
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === suggestionId ? { ...s, status: "rejected" as const } : s
          )
        );
      }
    } catch (err) {
      console.error("Failed to reject suggestion:", err);
    }
  };

  const handleExport = async (format: "docx" | "pdf" | "redline") => {
    try {
      const response = await fetch(`/api/documents/${docId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, content: editorContent }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = window.document.createElement("a");
        a.href = url;
        a.download = `${document?.name || "document"}.${format}`;
        window.document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        window.document.body.removeChild(a);
      }
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/matters/${matterId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Matter
              </Button>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h1 className="font-semibold truncate max-w-md">
                  {document?.name || "Document"}
                </h1>
              </div>
              {pendingSuggestions.length > 0 && (
                <Badge variant="secondary">
                  {pendingSuggestions.length} AI suggestions
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex items-center border rounded-lg p-1">
                <Button
                  variant={activeView === "split" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView("split")}
                >
                  Split
                </Button>
                <Button
                  variant={activeView === "pdf" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView("pdf")}
                >
                  PDF
                </Button>
                <Button
                  variant={activeView === "redline" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView("redline")}
                >
                  Redline
                </Button>
              </div>

              <Button variant="outline" size="sm" onClick={() => handleExport("docx")}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("pdf")}>
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("redline")}>
                    Export with Redlines
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div
          className={`grid gap-6 ${
            activeView === "split" ? "lg:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {/* PDF Panel */}
          {(activeView === "split" || activeView === "pdf") && (
            <Card className="h-[calc(100vh-200px)] overflow-hidden">
              <CardHeader className="py-3 border-b flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  Original Document
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setZoom((z) => Math.max(50, z - 10))}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground w-12 text-center">
                    {zoom}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setZoom((z) => Math.min(200, z + 10))}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {currentPage} / {document?.pageCount || 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((p) =>
                        Math.min(document?.pageCount || 1, p + 1)
                      )
                    }
                    disabled={currentPage >= (document?.pageCount || 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-60px)] overflow-auto">
                {document?.pdfUrl ? (
                  <PDFViewer
                    fileUrl={document.pdfUrl}
                    fileName={document.name || "document"}
                    readOnly={false}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">PDF not available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Redline Editor Panel */}
          {(activeView === "split" || activeView === "redline") && (
            <Card className="h-[calc(100vh-200px)] overflow-hidden">
              <CardHeader className="py-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    Redline Editor
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    Track Changes On
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-60px)] overflow-hidden">
                <RedlineEditor
                  documentId={docId}
                  initialContent={editorContent}
                  suggestions={suggestions.filter((s) => s.status === "pending")}
                  onSave={async (content) => {
                    setEditorContent(content);
                  }}
                  onSuggestionAction={async (suggestionId, action) => {
                    if (action === "accept") {
                      await handleAcceptSuggestion(suggestionId);
                    } else {
                      await handleRejectSuggestion(suggestionId);
                    }
                  }}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* AI Suggestions Panel */}
        {pendingSuggestions.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                AI Redline Suggestions ({pendingSuggestions.length})
              </CardTitle>
              <AiDisclaimer variant="compact" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">
                            {Math.round((suggestion.confidence ?? 0) * 100)}% confidence
                          </Badge>
                        </div>
                        <div className="grid gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Original:
                            </p>
                            <p className="text-sm line-through text-red-500">
                              {suggestion.originalText}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Suggested:
                            </p>
                            <p className="text-sm text-green-600">
                              {suggestion.suggestedText}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Rationale:
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {suggestion.rationale || suggestion.reason}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcceptSuggestion(suggestion.id)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRejectSuggestion(suggestion.id)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
