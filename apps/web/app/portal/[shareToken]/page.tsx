"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Loader2, 
  Scale, 
  FileText, 
  Download, 
  Clock,
  AlertTriangle,
  Shield,
  Eye,
  Calendar,
  Building2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AiDisclaimer } from "@/components/shared/AiDisclaimer";

interface SharedMatter {
  id: string;
  name: string;
  description: string;
  clientName: string;
  status: string;
  createdAt: string;
  documents: SharedDocument[];
  clauses?: SharedClause[];
  flags?: SharedFlag[];
  expiresAt: string;
  permissions: {
    viewDocuments: boolean;
    downloadDocuments: boolean;
    viewClauses: boolean;
    viewFlags: boolean;
  };
}

interface SharedDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

interface SharedClause {
  id: string;
  type: string;
  text: string;
  documentName: string;
}

interface SharedFlag {
  id: string;
  type: string;
  severity: string;
  description: string;
  documentName: string;
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
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function PortalPage() {
  const params = useParams();
  const shareToken = params.shareToken as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matter, setMatter] = useState<SharedMatter | null>(null);
  const [activeSection, setActiveSection] = useState<"documents" | "clauses" | "flags">("documents");

  useEffect(() => {
    async function fetchSharedMatter() {
      try {
        const response = await fetch(`/api/portal/${shareToken}`);
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error?.message || "Invalid or expired link");
        }
        const result = await response.json();
        setMatter(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load shared content");
      } finally {
        setIsLoading(false);
      }
    }
    fetchSharedMatter();
  }, [shareToken]);

  const handleDownload = async (documentId: string) => {
    try {
      const response = await fetch(`/api/portal/${shareToken}/documents/${documentId}/download`);
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const doc = matter?.documents.find(d => d.id === documentId);
      a.download = doc?.name || "document";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download error:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-xl bg-[hsl(var(--navy))] flex items-center justify-center">
              <Scale className="h-7 w-7 text-[hsl(var(--gold))]" />
            </div>
            <span className="text-2xl font-bold">LexOS</span>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <CardTitle className="text-2xl">Link Not Available</CardTitle>
              <CardDescription>
                {error}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center">
                This shared link may have expired or been revoked.
                Please contact the person who shared this with you.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[hsl(var(--navy))] flex items-center justify-center">
                <Scale className="h-6 w-6 text-[hsl(var(--gold))]" />
              </div>
              <span className="text-xl font-bold">LexOS</span>
              <Badge variant="secondary" className="ml-2">
                <Shield className="h-3 w-3 mr-1" />
                Secure Portal
              </Badge>
            </div>
            {matter?.expiresAt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Expires: {formatDate(matter.expiresAt)}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Matter Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">{matter?.name}</h1>
            {matter?.description && (
              <p className="text-muted-foreground mb-4">{matter.description}</p>
            )}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Client:</span>
                <span>{matter?.clientName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Created:</span>
                <span>{matter?.createdAt ? formatDate(matter.createdAt) : "N/A"}</span>
              </div>
              <Badge variant={matter?.status === "active" ? "default" : "secondary"}>
                {matter?.status}
              </Badge>
            </div>
          </div>

          {/* Section Tabs */}
          <div className="flex gap-2 mb-6 border-b">
            {matter?.permissions.viewDocuments && (
              <button
                onClick={() => setActiveSection("documents")}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeSection === "documents"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="h-4 w-4 inline mr-2" />
                Documents ({matter.documents.length})
              </button>
            )}
            {matter?.permissions.viewClauses && matter.clauses && (
              <button
                onClick={() => setActiveSection("clauses")}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeSection === "clauses"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-4 w-4 inline mr-2" />
                Clauses ({matter.clauses.length})
              </button>
            )}
            {matter?.permissions.viewFlags && matter.flags && (
              <button
                onClick={() => setActiveSection("flags")}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeSection === "flags"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <AlertTriangle className="h-4 w-4 inline mr-2" />
                Flags ({matter.flags.length})
              </button>
            )}
          </div>

          {/* Documents Section */}
          {activeSection === "documents" && (
            <div className="space-y-4">
              {matter?.documents.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No documents shared</p>
                  </CardContent>
                </Card>
              ) : (
                matter?.documents.map((doc) => (
                  <Card key={doc.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{doc.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatBytes(doc.size)} • Uploaded {formatDate(doc.uploadedAt)}
                          </p>
                        </div>
                      </div>
                      {matter.permissions.downloadDocuments && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(doc.id)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Clauses Section */}
          {activeSection === "clauses" && (
            <div className="space-y-4">
              <AiDisclaimer variant="compact" />
              {matter?.clauses?.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No clauses extracted</p>
                  </CardContent>
                </Card>
              ) : (
                matter?.clauses?.map((clause) => (
                  <Card key={clause.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{clause.type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          From: {clause.documentName}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{clause.text}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Flags Section */}
          {activeSection === "flags" && (
            <div className="space-y-4">
              <AiDisclaimer variant="compact" />
              {matter?.flags?.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No flags identified</p>
                  </CardContent>
                </Card>
              ) : (
                matter?.flags?.map((flag) => (
                  <Card key={flag.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              flag.severity === "critical"
                                ? "destructive"
                                : flag.severity === "high"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {flag.severity}
                          </Badge>
                          <span className="font-medium">{flag.type}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          From: {flag.documentName}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{flag.description}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>
              This content is shared securely via LexOS. Access is logged and monitored.
            </p>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>End-to-end encrypted</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
