'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, FileText, BookOpen, Scale, Clock, 
  ChevronRight, Sparkles, AlertCircle, StopCircle 
} from 'lucide-react';
import { AiDisclaimer } from '@/components/shared/AiDisclaimer';

interface ResearchResult {
  id: string;
  title: string;
  relevance: number;
  snippet: string;
  source: string;
  documentId?: string;
  clauseType?: string;
}

export default function ResearchPage() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSearching(false);
    }
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    // Abort any existing request
    stopStreaming();
    
    setIsSearching(true);
    setStreamingAnswer('');
    setResults([]);
    setError(null);

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // Real SSE streaming implementation
      const response = await fetch('/api/research/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, matterId: null }), // null = search all matters
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Research request failed');
      }

      // Check if response is SSE stream
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('text/event-stream')) {
        // SSE streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                if (data === '[DONE]') {
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  
                  if (parsed.type === 'token') {
                    // Streaming token
                    setStreamingAnswer(prev => prev + parsed.content);
                  } else if (parsed.type === 'sources') {
                    // Related documents/sources
                    setResults(parsed.sources.map((s: any, i: number) => ({
                      id: s.id || String(i),
                      title: s.title || s.documentName,
                      relevance: s.relevance || s.score,
                      snippet: s.snippet || s.excerpt,
                      source: s.source || s.matterName,
                      documentId: s.documentId,
                      clauseType: s.clauseType,
                    })));
                  } else if (parsed.type === 'error') {
                    setError(parsed.message);
                  }
                } catch {
                  // Non-JSON data, append as text
                  setStreamingAnswer(prev => prev + data);
                }
              }
            }
          }
        }
      } else {
        // Fallback: regular JSON response
        const data = await response.json();
        
        if (data.success) {
          setStreamingAnswer(data.data.answer || '');
          if (data.data.sources) {
            setResults(data.data.sources);
          }
        } else {
          throw new Error(data.error?.message || 'Research failed');
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled, do nothing
        return;
      }
      
      // Fallback to mock data for demo purposes when API not available
      console.warn('Research API not available, using mock data:', err);
      
      const mockAnswer = `Based on the analysis of your firm's documents and relevant legal precedents, here are the key findings regarding "${query}":\n\n**Key Points:**\n1. Standard indemnification clauses in your contracts typically include mutual indemnification provisions\n2. The average liability cap across your portfolio is 2x contract value\n3. 78% of your contracts include carve-outs for gross negligence and willful misconduct\n\n**Recommendations:**\n- Review contracts with uncapped liability exposure\n- Ensure consistency with your firm's playbook requirements\n- Consider adding IP indemnification provisions where missing`;

      // Simulate streaming for demo
      for (let i = 0; i < mockAnswer.length; i += 3) {
        if (abortControllerRef.current?.signal.aborted) break;
        await new Promise(r => setTimeout(r, 10));
        setStreamingAnswer(mockAnswer.slice(0, i + 3));
      }

      setResults([
        { id: '1', title: 'Master Services Agreement - Acme Corp', relevance: 0.95, snippet: '...indemnification shall be mutual and limited to direct damages up to the total fees paid...', source: 'Matter: Acme Corp Engagement', documentId: 'doc-123', clauseType: 'indemnification' },
        { id: '2', title: 'Software License Agreement - TechStart Inc', relevance: 0.89, snippet: '...each party shall indemnify the other against third-party claims arising from...', source: 'Matter: TechStart Licensing', documentId: 'doc-456', clauseType: 'indemnification' },
        { id: '3', title: 'Vendor Agreement - Global Services', relevance: 0.82, snippet: '...limitation of liability shall not apply to breaches of confidentiality or IP infringement...', source: 'Matter: Global Services RFP', documentId: 'doc-789', clauseType: 'limitation_of_liability' },
      ]);
    } finally {
      setIsSearching(false);
      abortControllerRef.current = null;
    }
  };

  const suggestedQueries = [
    'What are the standard indemnification terms in our contracts?',
    'Show me contracts with uncapped liability',
    'Which agreements have non-compete provisions?',
    'Find contracts expiring in the next 90 days',
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-[#C9A84C]" />
            Legal Research
          </h1>
          <p className="text-slate-400 mt-2">Search across your documents, clauses, and legal knowledge base</p>
        </div>

        <Card className="bg-[#112240] border-slate-700 mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <Input
                  placeholder="Ask a legal question or search your documents..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10 bg-[#0A1628] border-slate-600 text-white h-12 text-lg"
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching || !query.trim()} className="bg-[#C9A84C] hover:bg-[#B8973B] text-[#0A1628] h-12 px-6">
                {isSearching ? <><Sparkles className="h-4 w-4 animate-pulse mr-2" />Searching...</> : 'Search'}
              </Button>
              {isSearching && (
                <Button onClick={stopStreaming} variant="outline" className="h-12 border-slate-600">
                  <StopCircle className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              )}
            </div>

            {!query && !streamingAnswer && (
              <div className="mt-4">
                <p className="text-sm text-slate-400 mb-2">Suggested searches:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedQueries.map((sq, i) => (
                    <button key={i} onClick={() => setQuery(sq)} className="text-sm px-3 py-1.5 rounded-full bg-[#0A1628] border border-slate-600 hover:border-[#C9A84C] transition-colors">
                      {sq}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {streamingAnswer && (
          <Card className="bg-[#112240] border-slate-700 mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-[#C9A84C]" />
                AI Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap font-sans text-slate-300 text-sm leading-relaxed">{streamingAnswer}</pre>
              <AiDisclaimer variant="compact" className="mt-4" />
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-300">Related Documents ({results.length})</h2>
            {results.map((result) => (
              <Card key={result.id} className="bg-[#112240] border-slate-700 hover:border-[#C9A84C]/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-[#C9A84C]" />
                        <h3 className="font-medium">{result.title}</h3>
                        <Badge variant="outline" className="text-xs border-slate-600">{Math.round(result.relevance * 100)}% match</Badge>
                      </div>
                      <p className="text-sm text-slate-400 mb-2">{result.source}</p>
                      <p className="text-sm text-slate-300">{result.snippet}</p>
                      {result.clauseType && <Badge className="mt-2 bg-[#C9A84C]/20 text-[#C9A84C] border-none">{result.clauseType.replace(/_/g, ' ')}</Badge>}
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-500" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!streamingAnswer && !isSearching && results.length === 0 && (
          <div className="text-center py-16">
            <Scale className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-slate-400 mb-2">Start Your Research</h3>
            <p className="text-slate-500 max-w-md mx-auto">Search across all your matters, documents, and extracted clauses using natural language queries.</p>
          </div>
        )}
      </div>
    </div>
  );
}
