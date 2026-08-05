import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function PdfLoadingPage({ width }: { width: number }) {
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      style={{ width, maxWidth: '100%', aspectRatio: '210 / 297', minHeight: 360 }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="text-sm font-medium text-gray-500 dark:text-slate-400">Memuat preview PDF...</span>
      </div>
    </div>
  );
}

export default function UmrohPernyataanPdfPreview({ fileUrl, title }: { fileUrl: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const available = Math.max(280, container.clientWidth);
      setPageWidth(Math.min(760, available));
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setNumPages(null);
    setRenderError(false);
  }, [fileUrl]);

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-3xl" aria-label={`Preview PDF ${title}`}>
      {renderError ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-red-500">
          <AlertCircle className="h-9 w-9" />
          <p className="text-sm font-semibold">Preview PDF gagal ditampilkan.</p>
        </div>
      ) : pageWidth > 0 ? (
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: totalPages }) => setNumPages(totalPages)}
          onLoadError={() => setRenderError(true)}
          loading={<PdfLoadingPage width={pageWidth} />}
          className="flex w-full flex-col items-center gap-4"
        >
          {numPages && Array.from({ length: numPages }, (_, index) => (
            <Page
              key={`pernyataan-page-${index + 1}`}
              pageNumber={index + 1}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="max-w-full overflow-hidden rounded-lg bg-white shadow-lg"
            />
          ))}
        </Document>
      ) : (
        <PdfLoadingPage width={280} />
      )}
    </div>
  );
}
