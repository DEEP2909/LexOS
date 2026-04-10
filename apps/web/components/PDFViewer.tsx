'use client';

/**
 * EvidentIS Document Viewer
 * PDF viewer with annotation support using react-pdf
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Maximize2,
  Minimize2,
  Search,
  X,
  Highlighter,
  MessageSquare,
  StickyNote,
  FileText,
  Layers,
} from 'lucide-react';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

// ============================================================================
// TYPES
// ============================================================================

interface Annotation {
  id: string;
  pageNumber: number;
  type: 'highlight' | 'comment' | 'note';
  position: { x: number; y: number; width?: number; height?: number };
  content?: string;
  author: string;
  createdAt: string;
  color?: string;
}

interface PDFViewerProps {
  fileUrl: string;
  fileName: string;
  annotations?: Annotation[];
  onAnnotationAdd?: (annotation: Omit<Annotation, 'id' | 'createdAt'>) => void;
  onAnnotationDelete?: (annotationId: string) => void;
  onDownload?: () => void;
  readOnly?: boolean;
}

interface Highlight {
  pageNumber: number;
  text: string;
  rects: DOMRect[];
}

// ============================================================================
// TOOLBAR BUTTON COMPONENT
// ============================================================================

const ToolbarButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, active, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-2 rounded transition-colors ${
      active
        ? 'bg-[#C9A84C] text-[#0A1628]'
        : 'text-gray-400 hover:text-white hover:bg-gray-700'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {children}
  </button>
);

// ============================================================================
// THUMBNAIL SIDEBAR
// ============================================================================

const ThumbnailSidebar: React.FC<{
  numPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  fileUrl: string;
}> = ({ numPages, currentPage, onPageSelect, fileUrl }) => {
  return (
    <div className="w-32 bg-[#0A1628] border-r border-gray-700 overflow-y-auto">
      <div className="p-2 space-y-2">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            onClick={() => onPageSelect(pageNum)}
            className={`w-full p-1 rounded border-2 transition-colors ${
              pageNum === currentPage
                ? 'border-[#C9A84C]'
                : 'border-transparent hover:border-gray-600'
            }`}
          >
            <div className="bg-white rounded overflow-hidden">
              <Document file={fileUrl} loading="">
                <Page
                  pageNumber={pageNum}
                  width={100}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            </div>
            <span className="text-xs text-gray-400 mt-1 block">{pageNum}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// ANNOTATION LAYER
// ============================================================================

const AnnotationLayer: React.FC<{
  annotations: Annotation[];
  pageNumber: number;
  scale: number;
  onAnnotationClick: (annotation: Annotation) => void;
}> = ({ annotations, pageNumber, scale, onAnnotationClick }) => {
  const pageAnnotations = annotations.filter(a => a.pageNumber === pageNumber);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageAnnotations.map((annotation) => (
        <div
          key={annotation.id}
          className="absolute pointer-events-auto cursor-pointer"
          style={{
            left: annotation.position.x * scale,
            top: annotation.position.y * scale,
            width: annotation.position.width ? annotation.position.width * scale : 24,
            height: annotation.position.height ? annotation.position.height * scale : 24,
          }}
          onClick={() => onAnnotationClick(annotation)}
        >
          {annotation.type === 'highlight' && (
            <div
              className="w-full h-full opacity-40"
              style={{ backgroundColor: annotation.color || '#FFEB3B' }}
            />
          )}
          {annotation.type === 'comment' && (
            <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
              <MessageSquare className="w-3 h-3 text-yellow-900" />
            </div>
          )}
          {annotation.type === 'note' && (
            <div className="w-6 h-6 bg-blue-400 rounded-full flex items-center justify-center shadow-lg">
              <StickyNote className="w-3 h-3 text-blue-900" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// SEARCH PANEL
// ============================================================================

const SearchPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  results: { page: number; text: string }[];
  onResultClick: (page: number) => void;
}> = ({ isOpen, onClose, onSearch, results, onResultClick }) => {
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 w-80 bg-[#112240] border-l border-gray-700 h-full z-10">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h3 className="font-medium">Search Document</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSearch} className="p-4">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full px-3 py-2 bg-[#0A1628] border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </form>

      <div className="overflow-y-auto max-h-[calc(100%-120px)]">
        {results.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm text-center">
            {query ? 'No results found' : 'Enter a search term'}
          </p>
        ) : (
          <div className="p-2 space-y-2">
            {results.map((result, index) => (
              <button
                key={index}
                onClick={() => onResultClick(result.page)}
                className="w-full text-left p-3 rounded bg-[#0A1628] hover:bg-gray-700 transition-colors"
              >
                <div className="text-xs text-[#C9A84C] mb-1">Page {result.page}</div>
                <div className="text-sm text-gray-300 line-clamp-2">{result.text}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// ANNOTATION POPUP
// ============================================================================

const AnnotationPopup: React.FC<{
  annotation: Annotation | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}> = ({ annotation, onClose, onDelete }) => {
  if (!annotation) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#112240] rounded-lg shadow-xl w-96 max-w-[90vw]">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            {annotation.type === 'highlight' && <Highlighter className="w-4 h-4 text-yellow-400" />}
            {annotation.type === 'comment' && <MessageSquare className="w-4 h-4 text-yellow-400" />}
            {annotation.type === 'note' && <StickyNote className="w-4 h-4 text-blue-400" />}
            <span className="font-medium capitalize">{annotation.type}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="text-sm text-gray-400 mb-2">
            By {annotation.author} · {new Date(annotation.createdAt).toLocaleDateString()}
          </div>
          {annotation.content && (
            <p className="text-gray-300">{annotation.content}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
          <button
            onClick={() => {
              onDelete(annotation.id);
              onClose();
            }}
            className="px-3 py-1.5 text-red-400 hover:bg-red-400/10 rounded text-sm"
          >
            Delete
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN VIEWER COMPONENT
// ============================================================================

export const PDFViewer: React.FC<PDFViewerProps> = ({
  fileUrl,
  fileName,
  annotations = [],
  onAnnotationAdd,
  onAnnotationDelete,
  onDownload,
  readOnly = false,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showThumbnails, setShowThumbnails] = useState<boolean>(true);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [annotationMode, setAnnotationMode] = useState<'none' | 'highlight' | 'comment' | 'note'>('none');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Handle document load success
  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  }, []);

  // Handle document load error
  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF document');
    setIsLoading(false);
  }, []);

  // Navigation
  const goToPage = useCallback((page: number) => {
    const validPage = Math.max(1, Math.min(page, numPages));
    setCurrentPage(validPage);
  }, [numPages]);

  const goToPreviousPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  // Zoom
  const zoomIn = useCallback(() => {
    setScale(s => Math.min(s + 0.25, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setScale(s => Math.max(s - 0.25, 0.5));
  }, []);

  const fitToWidth = useCallback(() => {
    if (containerRef.current && pageRef.current) {
      const containerWidth = containerRef.current.clientWidth - (showThumbnails ? 128 : 0) - 48;
      const pageWidth = 612; // Standard PDF width in points
      setScale(containerWidth / pageWidth);
    }
  }, [showThumbnails]);

  // Rotation
  const rotate = useCallback(() => {
    setRotation(r => (r + 90) % 360);
  }, []);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Search
  const handleSearch = useCallback((query: string) => {
    // In a real implementation, this would search the PDF text content
    // For now, we'll return mock results
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    // Mock search results
    setSearchResults([
      { page: 1, text: `...${query} found in first paragraph...` },
      { page: 3, text: `...another instance of ${query}...` },
    ]);
  }, []);

  // Print
  const handlePrint = useCallback(() => {
    const printWindow = window.open(fileUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }, [fileUrl]);

  // Handle page click for annotations
  const handlePageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (annotationMode === 'none' || readOnly || !onAnnotationAdd) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    const content = annotationMode === 'note' || annotationMode === 'comment'
      ? window.prompt('Enter annotation text:') ?? undefined
      : undefined;

    if (annotationMode !== 'highlight' && !content) return;

    onAnnotationAdd({
      pageNumber: currentPage,
      type: annotationMode,
      position: { x, y },
      content,
      author: 'Current User', // In real app, use actual user
      color: annotationMode === 'highlight' ? '#FFEB3B' : undefined,
    });

    setAnnotationMode('none');
  }, [annotationMode, currentPage, scale, readOnly, onAnnotationAdd]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          goToPreviousPage();
          break;
        case 'ArrowRight':
        case 'PageDown':
          goToNextPage();
          break;
        case 'Home':
          goToPage(1);
          break;
        case 'End':
          goToPage(numPages);
          break;
        case '+':
        case '=':
          if (e.ctrlKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
        case 'f':
          if (e.ctrlKey) {
            e.preventDefault();
            setShowSearch(s => !s);
          }
          break;
        case 'Escape':
          setShowSearch(false);
          setAnnotationMode('none');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousPage, goToNextPage, goToPage, numPages, zoomIn, zoomOut]);

  return (
    <div 
      ref={containerRef}
      className="flex flex-col h-full bg-[#0A1628]"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#112240] border-b border-gray-700">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#C9A84C]" />
          <span className="text-sm font-medium truncate max-w-[200px]">{fileName}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Thumbnails toggle */}
          <ToolbarButton
            onClick={() => setShowThumbnails(!showThumbnails)}
            active={showThumbnails}
            title="Toggle thumbnails"
          >
            <Layers className="w-4 h-4" />
          </ToolbarButton>

          <div className="w-px h-6 bg-gray-600 mx-1" />

          {/* Zoom controls */}
          <ToolbarButton onClick={zoomOut} disabled={scale <= 0.5} title="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </ToolbarButton>
          <span className="text-sm text-gray-400 w-16 text-center">
            {Math.round(scale * 100)}%
          </span>
          <ToolbarButton onClick={zoomIn} disabled={scale >= 3.0} title="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </ToolbarButton>

          <div className="w-px h-6 bg-gray-600 mx-1" />

          {/* Rotation */}
          <ToolbarButton onClick={rotate} title="Rotate">
            <RotateCw className="w-4 h-4" />
          </ToolbarButton>

          <div className="w-px h-6 bg-gray-600 mx-1" />

          {/* Annotation tools */}
          {!readOnly && (
            <>
              <ToolbarButton
                onClick={() => setAnnotationMode(annotationMode === 'highlight' ? 'none' : 'highlight')}
                active={annotationMode === 'highlight'}
                title="Highlight"
              >
                <Highlighter className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => setAnnotationMode(annotationMode === 'comment' ? 'none' : 'comment')}
                active={annotationMode === 'comment'}
                title="Add comment"
              >
                <MessageSquare className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => setAnnotationMode(annotationMode === 'note' ? 'none' : 'note')}
                active={annotationMode === 'note'}
                title="Add note"
              >
                <StickyNote className="w-4 h-4" />
              </ToolbarButton>

              <div className="w-px h-6 bg-gray-600 mx-1" />
            </>
          )}

          {/* Search */}
          <ToolbarButton
            onClick={() => setShowSearch(!showSearch)}
            active={showSearch}
            title="Search (Ctrl+F)"
          >
            <Search className="w-4 h-4" />
          </ToolbarButton>

          {/* Fullscreen */}
          <ToolbarButton onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </ToolbarButton>

          <div className="w-px h-6 bg-gray-600 mx-1" />

          {/* Print & Download */}
          <ToolbarButton onClick={handlePrint} title="Print">
            <Printer className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={onDownload ?? (() => window.open(fileUrl, '_blank'))} title="Download">
            <Download className="w-4 h-4" />
          </ToolbarButton>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Thumbnail sidebar */}
        {showThumbnails && numPages > 0 && (
          <ThumbnailSidebar
            numPages={numPages}
            currentPage={currentPage}
            onPageSelect={goToPage}
            fileUrl={fileUrl}
          />
        )}

        {/* PDF content */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-6 bg-gray-800">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <X className="w-12 h-12 text-red-500 mb-4" />
              <p className="text-red-400 text-lg">{error}</p>
              <p className="text-gray-500 text-sm mt-2">Please try again or contact support</p>
            </div>
          )}

          {!isLoading && !error && (
            <div 
              ref={pageRef}
              className={`relative ${annotationMode !== 'none' ? 'cursor-crosshair' : ''}`}
              onClick={handlePageClick}
            >
              <Document
                file={fileUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center h-96">
                    <div className="animate-spin w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full" />
                  </div>
                }
              >
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  rotate={rotation}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-2xl"
                />
              </Document>

              {/* Annotation overlay */}
              <AnnotationLayer
                annotations={annotations}
                pageNumber={currentPage}
                scale={scale}
                onAnnotationClick={setSelectedAnnotation}
              />
            </div>
          )}
        </div>

        {/* Search panel */}
        <SearchPanel
          isOpen={showSearch}
          onClose={() => setShowSearch(false)}
          onSearch={handleSearch}
          results={searchResults}
          onResultClick={(page) => {
            goToPage(page);
            setShowSearch(false);
          }}
        />
      </div>

      {/* Navigation footer */}
      <div className="flex items-center justify-center gap-4 px-4 py-2 bg-[#112240] border-t border-gray-700">
        <ToolbarButton onClick={() => goToPage(1)} disabled={currentPage === 1} title="First page">
          <ChevronsLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={goToPreviousPage} disabled={currentPage === 1} title="Previous page">
          <ChevronLeft className="w-4 h-4" />
        </ToolbarButton>

        <div className="flex items-center gap-2">
          <input
            type="number"
            value={currentPage}
            onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
            min={1}
            max={numPages}
            className="w-12 px-2 py-1 text-center bg-[#0A1628] border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-[#C9A84C]"
          />
          <span className="text-gray-400 text-sm">of {numPages}</span>
        </div>

        <ToolbarButton onClick={goToNextPage} disabled={currentPage === numPages} title="Next page">
          <ChevronRight className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => goToPage(numPages)} disabled={currentPage === numPages} title="Last page">
          <ChevronsRight className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Annotation mode indicator */}
      {annotationMode !== 'none' && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-[#C9A84C] text-[#0A1628] rounded-full text-sm font-medium shadow-lg">
          Click on the document to add {annotationMode}
          <button
            onClick={() => setAnnotationMode('none')}
            className="ml-2 hover:opacity-70"
          >
            <X className="w-4 h-4 inline" />
          </button>
        </div>
      )}

      {/* Annotation popup */}
      <AnnotationPopup
        annotation={selectedAnnotation}
        onClose={() => setSelectedAnnotation(null)}
        onDelete={onAnnotationDelete || (() => {})}
      />
    </div>
  );
};

export default PDFViewer;
