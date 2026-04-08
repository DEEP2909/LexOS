'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Upload, Search, Filter, Grid, List, Download, Trash2, Eye, Clock, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface Document {
  id: string;
  name: string;
  type: string;
  matter: string;
  status: 'processing' | 'processed' | 'failed';
  uploadedAt: string;
  uploadedBy: string;
  pages: number;
  clauses: number;
  flags: number;
}

export default function DocumentsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const documents: Document[] = [
    { id: '1', name: 'Master Services Agreement - Acme Corp.pdf', type: 'MSA', matter: 'Acme Corp Acquisition', status: 'processed', uploadedAt: '2 hours ago', uploadedBy: 'John D.', pages: 24, clauses: 18, flags: 2 },
    { id: '2', name: 'NDA - TechStart Inc.pdf', type: 'NDA', matter: 'TechStart Series B', status: 'processed', uploadedAt: '5 hours ago', uploadedBy: 'Sarah M.', pages: 8, clauses: 12, flags: 0 },
    { id: '3', name: 'Employment Agreement Draft.docx', type: 'Employment', matter: 'HR Restructure', status: 'processing', uploadedAt: '10 min ago', uploadedBy: 'Emily C.', pages: 15, clauses: 0, flags: 0 },
    { id: '4', name: 'Vendor Contract - Global Services.pdf', type: 'Vendor', matter: 'Global Services RFP', status: 'processed', uploadedAt: '1 day ago', uploadedBy: 'Mike R.', pages: 32, clauses: 24, flags: 5 },
  ];

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'processed': return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'processing': return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      case 'failed': return <AlertTriangle className="h-4 w-4 text-red-400" />;
    }
  };

  const getStatusBadge = (status: Document['status']) => {
    const styles = { processed: 'bg-green-500/20 text-green-400', processing: 'bg-blue-500/20 text-blue-400', failed: 'bg-red-500/20 text-red-400' };
    return <Badge className={styles[status]}>{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3"><FileText className="h-8 w-8 text-[#C9A84C]" />Documents</h1>
            <p className="text-slate-400 mt-2">Manage and analyze your legal documents</p>
          </div>
          <Button className="bg-[#C9A84C] hover:bg-[#B8973B] text-[#0A1628]"><Upload className="h-4 w-4 mr-2" />Upload Documents</Button>
        </div>

        <Card className={`bg-[#112240] border-2 border-dashed mb-6 transition-colors ${isDragging ? 'border-[#C9A84C] bg-[#C9A84C]/10' : 'border-slate-600'}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
          <CardContent className="py-8 text-center">
            <Upload className={`h-12 w-12 mx-auto mb-4 ${isDragging ? 'text-[#C9A84C]' : 'text-slate-500'}`} />
            <p className="text-lg font-medium mb-1">{isDragging ? 'Drop files here' : 'Drag and drop files to upload'}</p>
            <p className="text-sm text-slate-400">Supports PDF, DOCX, DOC • Max 50MB per file</p>
          </CardContent>
        </Card>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Search documents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 bg-[#112240] border-slate-700" />
          </div>
          <Button variant="outline" className="border-slate-700 text-slate-400"><Filter className="h-4 w-4 mr-2" />Filters</Button>
          <div className="flex bg-[#112240] rounded-lg p-1">
            <button onClick={() => setViewMode('list')} className={`p-2 rounded ${viewMode === 'list' ? 'bg-[#C9A84C] text-[#0A1628]' : 'text-slate-400'}`}><List className="h-4 w-4" /></button>
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded ${viewMode === 'grid' ? 'bg-[#C9A84C] text-[#0A1628]' : 'text-slate-400'}`}><Grid className="h-4 w-4" /></button>
          </div>
        </div>

        {viewMode === 'list' && (
          <Card className="bg-[#112240] border-slate-700">
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-4 text-sm font-medium text-slate-400">Document</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-400">Matter</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-400">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-400">Analysis</th>
                    <th className="text-left p-4 text-sm font-medium text-slate-400">Uploaded</th>
                    <th className="text-right p-4 text-sm font-medium text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id} className="border-b border-slate-700/50 last:border-0 hover:bg-[#0A1628]/50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[#0A1628] rounded"><FileText className="h-5 w-5 text-[#C9A84C]" /></div>
                          <div><p className="font-medium">{doc.name}</p><p className="text-sm text-slate-400">{doc.type} • {doc.pages} pages</p></div>
                        </div>
                      </td>
                      <td className="p-4"><span className="text-sm text-slate-300">{doc.matter}</span></td>
                      <td className="p-4"><div className="flex items-center gap-2">{getStatusIcon(doc.status)}{getStatusBadge(doc.status)}</div></td>
                      <td className="p-4">
                        {doc.status === 'processed' ? (
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-slate-300">{doc.clauses} clauses</span>
                            {doc.flags > 0 && <Badge className="bg-amber-500/20 text-amber-400">{doc.flags} flags</Badge>}
                          </div>
                        ) : <span className="text-sm text-slate-500">—</span>}
                      </td>
                      <td className="p-4"><div className="text-sm"><p className="text-slate-300">{doc.uploadedAt}</p><p className="text-slate-500">by {doc.uploadedBy}</p></div></td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"><Download className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <Card key={doc.id} className="bg-[#112240] border-slate-700 hover:border-[#C9A84C]/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-3 bg-[#0A1628] rounded-lg"><FileText className="h-8 w-8 text-[#C9A84C]" /></div>
                    {getStatusBadge(doc.status)}
                  </div>
                  <h3 className="font-medium mb-1 truncate">{doc.name}</h3>
                  <p className="text-sm text-slate-400 mb-3">{doc.matter}</p>
                  <div className="flex items-center justify-between text-sm text-slate-400 pt-3 border-t border-slate-700">
                    <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{doc.uploadedAt}</div>
                    {doc.status === 'processed' && <span>{doc.clauses} clauses</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
