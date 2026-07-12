import { useEffect } from 'react';
import type { FightVideo } from '../types';

interface VideoModalProps {
  video: FightVideo;
  onClose: () => void;
}

export default function VideoModal({ video, onClose }: VideoModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="video-overlay" onClick={onClose} role="dialog" aria-label={video.title}>
      <div className="video-frame" onClick={(e) => e.stopPropagation()}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        <div className="video-caption">
          <span className="video-title">{video.title}</span>
          <button className="panel-close video-close" onClick={onClose} aria-label="Close video">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
