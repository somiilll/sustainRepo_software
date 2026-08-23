import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const TrainingViewer = ({ assignmentId, viewer, getAuthHeader, onProgress }) => {
  const [pageIndex, setPageIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const lastMediaSecond = useRef(0);

  const record = async (event) => {
    setIsSaving(true);
    try {
      const response = await axios.post(`${API}/supplier-assessment/my-assessment/trainings/${assignmentId}/consumption-events`, event, { headers: getAuthHeader() });
      onProgress(response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not save training progress');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (viewer.viewer_type === 'pages') record({ event_type: 'page_view', unit_index: pageIndex + 1 });
  }, [pageIndex]); // The page itself is the consumption unit.

  const recordMedia = (element, force = false) => {
    const position = Math.floor(element.currentTime || 0);
    if (force || position - lastMediaSecond.current >= 10) {
      lastMediaSecond.current = position;
      record({ event_type: 'media_progress', position_seconds: element.currentTime || 0 });
    }
  };

  if (viewer.viewer_type === 'pages') return <div className="space-y-4" data-testid="training-page-viewer">
    <div className="relative overflow-hidden border bg-stone-100" data-testid="training-page-canvas"><img src={viewer.page_urls[pageIndex]} alt={`Training page ${pageIndex + 1}`} className="mx-auto max-h-[58vh] w-auto max-w-full object-contain" draggable="false" data-testid={`training-page-image-${pageIndex + 1}`} /></div>
    <div className="flex items-center justify-between gap-3"><Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => setPageIndex((current) => current - 1)} data-testid="training-page-previous-button"><ChevronLeft className="h-4 w-4" />Previous</Button><span className="text-sm font-medium text-stone-700" data-testid="training-page-indicator">Page {pageIndex + 1} of {viewer.page_count}</span><Button variant="outline" size="sm" disabled={pageIndex === viewer.page_count - 1} onClick={() => setPageIndex((current) => current + 1)} data-testid="training-page-next-button">Next<ChevronRight className="h-4 w-4" /></Button></div>
    {isSaving && <p className="flex items-center gap-2 text-xs text-stone-500" data-testid="training-progress-saving"><Loader2 className="h-3 w-3 animate-spin" />Saving progress</p>}
  </div>;

  const MediaTag = viewer.viewer_type === 'video' ? 'video' : 'audio';
  return <div className="space-y-4" data-testid={`training-${viewer.viewer_type}-player`}>
    <MediaTag src={viewer.asset_url} controls controlsList="nodownload" className={viewer.viewer_type === 'video' ? 'aspect-video w-full bg-black' : 'w-full'} onContextMenu={(event) => event.preventDefault()} onTimeUpdate={(event) => recordMedia(event.currentTarget)} onEnded={(event) => recordMedia(event.currentTarget, true)} data-testid="training-media-element" />
    <Progress value={0} className="invisible" data-testid="training-media-progress-placeholder" />
    {isSaving && <p className="flex items-center gap-2 text-xs text-stone-500" data-testid="training-progress-saving"><Loader2 className="h-3 w-3 animate-spin" />Saving progress</p>}
  </div>;
};