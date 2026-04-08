"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from "lucide-react";
import { useState } from "react";
import { AiDisclaimer } from "@/components/shared/AiDisclaimer";

interface Flag {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  recommendation?: string;
  documentName?: string;
  clauseType?: string;
  location?: {
    page?: number;
    paragraph?: number;
  };
  status?: "open" | "resolved" | "dismissed";
}

interface FlagCardProps {
  flag: Flag;
  onResolve?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onViewInDocument?: (id: string) => void;
  showDocument?: boolean;
  expandable?: boolean;
}

const severityConfig = {
  critical: {
    color: "bg-red-600",
    badge: "destructive" as const,
    icon: AlertTriangle,
    textColor: "text-red-600",
    bgLight: "bg-red-50 dark:bg-red-900/20",
  },
  high: {
    color: "bg-orange-500",
    badge: "default" as const,
    icon: AlertTriangle,
    textColor: "text-orange-500",
    bgLight: "bg-orange-50 dark:bg-orange-900/20",
  },
  medium: {
    color: "bg-amber-500",
    badge: "secondary" as const,
    icon: AlertTriangle,
    textColor: "text-amber-500",
    bgLight: "bg-amber-50 dark:bg-amber-900/20",
  },
  low: {
    color: "bg-green-500",
    badge: "outline" as const,
    icon: CheckCircle2,
    textColor: "text-green-500",
    bgLight: "bg-green-50 dark:bg-green-900/20",
  },
};

/**
 * FlagCard - Displays a single risk flag with actions
 */
export function FlagCard({ 
  flag, 
  onResolve, 
  onDismiss, 
  onViewInDocument,
  showDocument = true,
  expandable = true
}: FlagCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = severityConfig[flag.severity];
  const Icon = config.icon;

  return (
    <Card className={`${config.bgLight} border-l-4 ${config.color.replace('bg-', 'border-')}`}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          {/* Severity indicator */}
          <div className={`${config.color} rounded-full p-2 flex-shrink-0`}>
            <Icon className="h-4 w-4 text-white" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={config.badge} className="capitalize">
                  {flag.severity}
                </Badge>
                <span className="font-medium">{flag.type}</span>
                {flag.status && flag.status !== "open" && (
                  <Badge variant="outline" className="capitalize">
                    {flag.status}
                  </Badge>
                )}
              </div>
              {expandable && flag.recommendation && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex-shrink-0"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>

            {/* Title and Description */}
            <h4 className="font-medium mb-1">{flag.title}</h4>
            <p className="text-sm text-muted-foreground mb-3">
              {flag.description}
            </p>

            {/* Expanded content */}
            {isExpanded && flag.recommendation && (
              <div className="mb-3 p-3 bg-background rounded-lg border">
                <p className="text-sm font-medium mb-1">Recommendation:</p>
                <p className="text-sm text-muted-foreground">{flag.recommendation}</p>
              </div>
            )}

            {/* Document reference */}
            {showDocument && (flag.documentName || flag.location) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                {flag.documentName && <span>{flag.documentName}</span>}
                {flag.location?.page && (
                  <>
                    <span>•</span>
                    <span>Page {flag.location.page}</span>
                  </>
                )}
                {flag.clauseType && (
                  <>
                    <span>•</span>
                    <Badge variant="outline" className="text-xs">
                      {flag.clauseType}
                    </Badge>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            {flag.status === "open" && (onResolve || onDismiss || onViewInDocument) && (
              <div className="flex items-center gap-2 flex-wrap">
                {onResolve && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => onResolve(flag.id)}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Resolve
                  </Button>
                )}
                {onDismiss && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => onDismiss(flag.id)}
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Dismiss
                  </Button>
                )}
                {onViewInDocument && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => onViewInDocument(flag.id)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View in Document
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * FlagList - Displays a list of flags grouped by severity
 */
interface FlagListProps {
  flags: Flag[];
  onResolve?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onViewInDocument?: (id: string) => void;
  showDocument?: boolean;
  groupBySeverity?: boolean;
}

export function FlagList({ 
  flags, 
  onResolve, 
  onDismiss, 
  onViewInDocument,
  showDocument = true,
  groupBySeverity = false
}: FlagListProps) {
  if (flags.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
          <p className="font-medium mb-1">No flags identified</p>
          <p className="text-sm text-muted-foreground">
            All documents have been reviewed without issues
          </p>
        </CardContent>
      </Card>
    );
  }

  if (groupBySeverity) {
    const grouped = {
      critical: flags.filter(f => f.severity === "critical"),
      high: flags.filter(f => f.severity === "high"),
      medium: flags.filter(f => f.severity === "medium"),
      low: flags.filter(f => f.severity === "low"),
    };

    return (
      <div className="space-y-6">
        <AiDisclaimer variant="compact" />
        {(["critical", "high", "medium", "low"] as const).map((severity) => {
          if (grouped[severity].length === 0) return null;
          return (
            <div key={severity}>
              <h3 className="text-sm font-medium mb-3 capitalize flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${severityConfig[severity].color}`} />
                {severity} Priority ({grouped[severity].length})
              </h3>
              <div className="space-y-3">
                {grouped[severity].map((flag) => (
                  <FlagCard
                    key={flag.id}
                    flag={flag}
                    onResolve={onResolve}
                    onDismiss={onDismiss}
                    onViewInDocument={onViewInDocument}
                    showDocument={showDocument}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AiDisclaimer variant="compact" />
      {flags.map((flag) => (
        <FlagCard
          key={flag.id}
          flag={flag}
          onResolve={onResolve}
          onDismiss={onDismiss}
          onViewInDocument={onViewInDocument}
          showDocument={showDocument}
        />
      ))}
    </div>
  );
}

/**
 * FlagSummary - Summary card showing flag counts by severity
 */
interface FlagSummaryProps {
  flags: Flag[];
  className?: string;
}

export function FlagSummary({ flags, className = "" }: FlagSummaryProps) {
  const counts = {
    critical: flags.filter(f => f.severity === "critical").length,
    high: flags.filter(f => f.severity === "high").length,
    medium: flags.filter(f => f.severity === "medium").length,
    low: flags.filter(f => f.severity === "low").length,
  };

  const total = flags.length;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Risk Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold">{total}</div>
          <div className="flex gap-1">
            {counts.critical > 0 && (
              <Badge variant="destructive">{counts.critical} Critical</Badge>
            )}
            {counts.high > 0 && (
              <Badge>{counts.high} High</Badge>
            )}
            {counts.medium > 0 && (
              <Badge variant="secondary">{counts.medium} Medium</Badge>
            )}
            {counts.low > 0 && (
              <Badge variant="outline">{counts.low} Low</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
