'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  ExternalLink,
  BookOpen,
  Scale,
  FileText,
  Copy,
  CheckCircle,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export type SourceType = 'case' | 'statute' | 'regulation' | 'secondary' | 'treatise';

export interface ResearchSource {
  id: string;
  type: SourceType;
  title: string;
  citation: string;
  jurisdiction?: string;
  year?: number;
  relevanceScore?: number;
  snippet?: string;
  url?: string;
  isBookmarked?: boolean;
}

export interface ResearchResultProps {
  query: string;
  summary: string;
  sources: ResearchSource[];
  followUpQuestions?: string[];
  onBookmark?: (sourceId: string) => void;
  onCite?: (source: ResearchSource) => void;
  onAskFollowUp?: (question: string) => void;
}

export function ResearchResult({
  query,
  summary,
  sources,
  followUpQuestions = [],
  onBookmark,
  onCite,
  onAskFollowUp,
}: ResearchResultProps) {
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleSource = (id: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopyCitation = async (source: ResearchSource) => {
    await navigator.clipboard.writeText(source.citation);
    setCopiedId(source.id);
    setTimeout(() => setCopiedId(null), 2000);
    onCite?.(source);
  };

  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case 'case':
        return <Scale className="h-4 w-4 text-blue-500" />;
      case 'statute':
        return <FileText className="h-4 w-4 text-green-500" />;
      case 'regulation':
        return <FileText className="h-4 w-4 text-purple-500" />;
      case 'secondary':
        return <BookOpen className="h-4 w-4 text-orange-500" />;
      case 'treatise':
        return <BookOpen className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getSourceTypeLabel = (type: SourceType) => {
    switch (type) {
      case 'case':
        return 'Case Law';
      case 'statute':
        return 'Statute';
      case 'regulation':
        return 'Regulation';
      case 'secondary':
        return 'Secondary';
      case 'treatise':
        return 'Treatise';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Query Display */}
      <div className="text-sm text-muted-foreground">
        <span className="font-medium">Query:</span> {query}
      </div>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Research Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>
        </CardContent>
      </Card>

      {/* Sources */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Sources ({sources.length})</CardTitle>
          </div>
          <CardDescription>
            Relevant legal authorities supporting this research
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {getSourceIcon(source.type)}
                      <div className="flex-1 min-w-0">
                        <button
                          className="text-sm font-medium text-left hover:underline truncate block w-full"
                          onClick={() => toggleSource(source.id)}
                        >
                          {source.title}
                        </button>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {source.citation}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {getSourceTypeLabel(source.type)}
                      </Badge>
                      {source.relevanceScore !== undefined && (
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(source.relevanceScore * 100)}%
                        </Badge>
                      )}
                    </div>
                  </div>

                  {expandedSources.has(source.id) && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      {source.snippet && (
                        <p className="text-sm text-muted-foreground italic">
                          &ldquo;{source.snippet}&rdquo;
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        {source.jurisdiction && (
                          <Badge variant="outline" className="text-xs">
                            {source.jurisdiction}
                          </Badge>
                        )}
                        {source.year && (
                          <Badge variant="outline" className="text-xs">
                            {source.year}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyCitation(source)}
                        >
                          {copiedId === source.id ? (
                            <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 mr-1" />
                          )}
                          Copy Citation
                        </Button>
                        {onBookmark && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onBookmark(source.id)}
                          >
                            {source.isBookmarked ? (
                              <BookmarkCheck className="h-3 w-3 mr-1 text-primary" />
                            ) : (
                              <Bookmark className="h-3 w-3 mr-1" />
                            )}
                            {source.isBookmarked ? 'Saved' : 'Save'}
                          </Button>
                        )}
                        {source.url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(source.url, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    className="w-full flex items-center justify-center mt-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => toggleSource(source.id)}
                  >
                    {expandedSources.has(source.id) ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        Show more
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Follow-up Questions */}
      {followUpQuestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Suggested Follow-ups</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {followUpQuestions.map((question, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  className="text-xs h-auto py-1.5 px-3"
                  onClick={() => onAskFollowUp?.(question)}
                >
                  {question}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ResearchResult;
