"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Copy, 
  Check, 
  ExternalLink, 
  ThumbsUp, 
  ThumbsDown,
  Edit
} from "lucide-react";
import { useState } from "react";
import { AiDisclaimer } from "@/components/shared/AiDisclaimer";

interface Clause {
  id: string;
  type: string;
  text: string;
  confidence?: number;
  documentId?: string;
  documentName?: string;
  location?: {
    page?: number;
    start?: number;
    end?: number;
  };
  status?: "approved" | "rejected" | "modified" | "pending";
}

interface ClauseCardProps {
  clause: Clause;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onModify?: (id: string) => void;
  onViewInDocument?: (id: string) => void;
  showDocument?: boolean;
  showActions?: boolean;
  compact?: boolean;
}

// Map clause types to user-friendly names
const clauseTypeLabels: Record<string, string> = {
  indemnification: "Indemnification",
  limitation_of_liability: "Limitation of Liability",
  termination_for_convenience: "Termination for Convenience",
  termination_for_cause: "Termination for Cause",
  confidentiality: "Confidentiality",
  non_compete: "Non-Compete",
  non_solicitation: "Non-Solicitation",
  intellectual_property: "Intellectual Property",
  governing_law: "Governing Law",
  arbitration: "Arbitration",
  jury_waiver: "Jury Waiver",
  class_action_waiver: "Class Action Waiver",
  force_majeure: "Force Majeure",
  assignment: "Assignment",
  notice_requirements: "Notice Requirements",
  amendment: "Amendment",
  severability: "Severability",
  entire_agreement: "Entire Agreement",
  warranty_disclaimer: "Warranty Disclaimer",
  data_privacy: "Data Privacy",
  insurance_requirements: "Insurance Requirements",
  compliance_with_laws: "Compliance with Laws",
  audit_rights: "Audit Rights",
  most_favored_nation: "Most Favored Nation",
};

function getClauseLabel(type: string): string {
  return clauseTypeLabels[type] || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return "text-green-600";
  if (confidence >= 0.7) return "text-amber-600";
  return "text-red-600";
}

/**
 * ClauseCard - Displays a single extracted clause
 */
export function ClauseCard({ 
  clause, 
  onApprove, 
  onReject, 
  onModify,
  onViewInDocument,
  showDocument = true,
  showActions = true,
  compact = false
}: ClauseCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(clause.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={compact ? "p-3" : ""}>
      <CardContent className={compact ? "p-0" : "pt-4"}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-medium">
              {getClauseLabel(clause.type)}
            </Badge>
            {clause.status && clause.status !== "pending" && (
              <Badge 
                variant={
                  clause.status === "approved" ? "default" :
                  clause.status === "rejected" ? "destructive" :
                  "secondary"
                }
                className="capitalize"
              >
                {clause.status}
              </Badge>
            )}
          </div>
          {clause.confidence !== undefined && (
            <span className={`text-xs ${getConfidenceColor(clause.confidence)}`}>
              {Math.round(clause.confidence * 100)}% confidence
            </span>
          )}
        </div>

        {/* Clause text */}
        <div className="relative group">
          <p className={`text-sm ${compact ? "line-clamp-3" : ""} pr-8`}>
            {clause.text}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Document reference */}
        {showDocument && (clause.documentName || clause.location) && (
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            {clause.documentName && <span>{clause.documentName}</span>}
            {clause.location?.page && (
              <>
                <span>•</span>
                <span>Page {clause.location.page}</span>
              </>
            )}
            {onViewInDocument && (
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-xs"
                onClick={() => onViewInDocument(clause.id)}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                View
              </Button>
            )}
          </div>
        )}

        {/* Actions */}
        {showActions && (onApprove || onReject || onModify) && clause.status === "pending" && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t">
            {onApprove && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onApprove(clause.id)}
              >
                <ThumbsUp className="h-3 w-3 mr-1" />
                Approve
              </Button>
            )}
            {onModify && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onModify(clause.id)}
              >
                <Edit className="h-3 w-3 mr-1" />
                Modify
              </Button>
            )}
            {onReject && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onReject(clause.id)}
              >
                <ThumbsDown className="h-3 w-3 mr-1" />
                Reject
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * ClauseList - Displays a list of clauses grouped by type
 */
interface ClauseListProps {
  clauses: Clause[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onModify?: (id: string) => void;
  onViewInDocument?: (id: string) => void;
  showDocument?: boolean;
  groupByType?: boolean;
  compact?: boolean;
}

export function ClauseList({ 
  clauses, 
  onApprove, 
  onReject, 
  onModify,
  onViewInDocument,
  showDocument = true,
  groupByType = false,
  compact = false
}: ClauseListProps) {
  if (clauses.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No clauses extracted</p>
        </CardContent>
      </Card>
    );
  }

  if (groupByType) {
    // Group clauses by type
    const grouped = clauses.reduce<Record<string, Clause[]>>((acc, clause) => {
      if (!acc[clause.type]) acc[clause.type] = [];
      acc[clause.type].push(clause);
      return acc;
    }, {});

    const sortedTypes = Object.keys(grouped).sort();

    return (
      <div className="space-y-6">
        <AiDisclaimer variant="compact" />
        {sortedTypes.map((type) => (
          <div key={type}>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Badge variant="outline">{getClauseLabel(type)}</Badge>
              <span className="text-muted-foreground">({grouped[type].length})</span>
            </h3>
            <div className="space-y-3">
              {grouped[type].map((clause) => (
                <ClauseCard
                  key={clause.id}
                  clause={clause}
                  onApprove={onApprove}
                  onReject={onReject}
                  onModify={onModify}
                  onViewInDocument={onViewInDocument}
                  showDocument={showDocument}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AiDisclaimer variant="compact" />
      {clauses.map((clause) => (
        <ClauseCard
          key={clause.id}
          clause={clause}
          onApprove={onApprove}
          onReject={onReject}
          onModify={onModify}
          onViewInDocument={onViewInDocument}
          showDocument={showDocument}
          compact={compact}
        />
      ))}
    </div>
  );
}

/**
 * ClauseSummary - Summary of clause types found
 */
interface ClauseSummaryProps {
  clauses: Clause[];
  className?: string;
}

export function ClauseSummary({ clauses, className = "" }: ClauseSummaryProps) {
  const typeCount = new Set(clauses.map(c => c.type)).size;
  
  return (
    <Card className={className}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold">{clauses.length}</p>
            <p className="text-sm text-muted-foreground">Clauses extracted</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{typeCount}</p>
            <p className="text-sm text-muted-foreground">Clause types</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
