'use client';

import { useCallback, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit3,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Types for redline suggestions
export interface RedlineSuggestion {
  id: string;
  originalText: string;
  suggestedText: string;
  explanation: string;
  clauseType?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  confidence: number;
  position?: {
    start: number;
    end: number;
    page?: number;
  };
  status: 'pending' | 'accepted' | 'rejected' | 'modified';
}

interface RedlineSuggestionCardProps {
  suggestion: RedlineSuggestion;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onModify: (id: string, newText: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function RedlineSuggestionCard({
  suggestion,
  onAccept,
  onReject,
  onModify,
  isExpanded = false,
  onToggleExpand,
}: RedlineSuggestionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(suggestion.suggestedText);

  const handleModify = () => {
    onModify(suggestion.id, editedText);
    setIsEditing(false);
  };

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = () => {
    switch (suggestion.status) {
      case 'accepted':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'modified':
        return <Edit3 className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <Card className={`mb-3 ${suggestion.status !== 'pending' ? 'opacity-60' : ''}`}>
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="font-medium text-sm truncate max-w-[200px]">
              {suggestion.clauseType || 'General Change'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {suggestion.riskLevel && (
              <Badge variant="outline" className={getRiskColor(suggestion.riskLevel)}>
                {suggestion.riskLevel}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {Math.round(suggestion.confidence * 100)}%
            </Badge>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="py-3 px-4 pt-0">
          <div className="space-y-3">
            {/* Original Text */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Original</p>
              <div className="p-2 bg-red-50 border border-red-100 rounded text-sm line-through text-red-700">
                {suggestion.originalText}
              </div>
            </div>

            {/* Suggested Text */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Suggested</p>
              {isEditing ? (
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full p-2 border rounded text-sm min-h-[80px]"
                />
              ) : (
                <div className="p-2 bg-green-50 border border-green-100 rounded text-sm text-green-700">
                  {suggestion.suggestedText}
                </div>
              )}
            </div>

            {/* Explanation */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Explanation</p>
              <p className="text-sm text-muted-foreground">{suggestion.explanation}</p>
            </div>

            {/* Actions */}
            {suggestion.status === 'pending' && (
              <div className="flex gap-2 pt-2">
                {isEditing ? (
                  <>
                    <Button size="sm" onClick={handleModify}>
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setEditedText(suggestion.suggestedText);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => onAccept(suggestion.id)}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit3 className="h-3 w-3 mr-1" />
                      Modify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => onReject(suggestion.id)}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Reject
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface RedlineSuggestionsPanelProps {
  suggestions: RedlineSuggestion[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onModify: (id: string, newText: string) => void;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  isLoading?: boolean;
}

export function RedlineSuggestionsPanel({
  suggestions,
  onAccept,
  onReject,
  onModify,
  onAcceptAll,
  onRejectAll,
  isLoading = false,
}: RedlineSuggestionsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all');

  const filteredSuggestions = suggestions.filter((s) => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (filterRisk !== 'all' && s.riskLevel !== filterRisk) return false;
    return true;
  });

  const pendingCount = suggestions.filter((s) => s.status === 'pending').length;
  const acceptedCount = suggestions.filter((s) => s.status === 'accepted').length;
  const rejectedCount = suggestions.filter((s) => s.status === 'rejected').length;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Suggestions
            </CardTitle>
            <CardDescription>
              {pendingCount} pending, {acceptedCount} accepted, {rejectedCount} rejected
            </CardDescription>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterRisk} onValueChange={setFilterRisk}>
            <SelectTrigger className="w-[110px] h-8">
              <SelectValue placeholder="Risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions */}
        {pendingCount > 0 && (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onAcceptAll}
              className="text-green-600"
            >
              Accept All ({pendingCount})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onRejectAll}
              className="text-red-600"
            >
              Reject All
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden pb-3">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredSuggestions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No suggestions match your filters
            </div>
          ) : (
            filteredSuggestions.map((suggestion) => (
              <RedlineSuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAccept={onAccept}
                onReject={onReject}
                onModify={onModify}
                isExpanded={expandedId === suggestion.id}
                onToggleExpand={() =>
                  setExpandedId(expandedId === suggestion.id ? null : suggestion.id)
                }
              />
            ))
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default RedlineSuggestionsPanel;
