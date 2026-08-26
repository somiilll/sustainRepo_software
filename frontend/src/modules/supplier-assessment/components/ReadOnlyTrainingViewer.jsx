import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';

export const ReadOnlyTrainingViewer = ({ viewer }) => {
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => { setPageIndex(0); }, [viewer]);

  if (viewer.viewer_type === 'pages') return <div className="space-y-4" data-testid="admin-training-pages-viewer">
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-stone-950"><img src={viewer.page_urls[pageIndex]} alt={`Training page ${pageIndex + 1}`} className="h-full w-full object-contain" data-testid="admin-training-page-image" /></div>
    <div className="flex items-center justify-between gap-3"><Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => setPageIndex((current) => current - 1)} data-testid="admin-training-previous-page-button"><ChevronLeft className="h-4 w-4" />Previous</Button><span className="text-sm font-medium text-stone-700" data-testid="admin-training-page-indicator">Page {pageIndex + 1} of {viewer.page_count}</span><Button variant="outline" size="sm" disabled={pageIndex === viewer.page_count - 1} onClick={() => setPageIndex((current) => current + 1)} data-testid="admin-training-next-page-button">Next<ChevronRight className="h-4 w-4" /></Button></div>
  </div>;
  if (viewer.viewer_type === 'video') return <video src={viewer.asset_url} controls controlsList="nodownload" className="aspect-video w-full bg-black" data-testid="admin-training-video-viewer" />;
  return <audio src={viewer.asset_url} controls controlsList="nodownload" className="w-full" data-testid="admin-training-audio-viewer" />;
};