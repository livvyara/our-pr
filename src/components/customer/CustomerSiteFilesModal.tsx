import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './CustomerSiteFilesModal.css';

// --- [High-End Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Download: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  ZoomIn: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>,
  Empty: () => <svg width="48" height="48" fill="none" stroke="#E2E8F0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
};

interface FileEntry { id: string; url: string; name: string; category: string; }
interface Props { siteId: string; partnerUid: string; onClose: () => void; }
interface Point { x: number; y: number; }

const CustomerSiteFilesModal: React.FC<Props> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  
  const [activeTab, setActiveTab] = useState<'floor-plan' | '3d-render'>('floor-plan');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Viewer State
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  
  // Drag & Touch Logic
  const isDragging = useRef(false);
  const startPos = useRef<Point | null>(null);
  const touchDistance = useRef<number | null>(null);

  // --- Fetch Data ---
  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true);
      try {
        const q = query(
            collection(db, 'users', partnerUid, 'sites', siteId, 'files'),
            where('category', 'in', ['floor-plan', '3d-render']),
            orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setFiles(snap.docs.map(d => ({ id: d.id, ...d.data() } as FileEntry)));
      } catch (e) { console.error("Error loading files", e); } 
      finally { setLoading(false); }
    };
    fetchFiles();
  }, [siteId, partnerUid, db]);

  const currentFiles = files.filter(f => f.category === activeTab);

  // --- Viewer Handlers ---
  const openViewer = (url: string) => { 
      setViewingImage(url); setScale(1); setPosition({ x: 0, y: 0 }); 
      document.body.style.overflow = 'hidden'; // Lock Body Scroll
  };
  
  const closeViewer = () => { 
      setViewingImage(null); 
      document.body.style.overflow = ''; // Unlock Body Scroll
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.min(Math.max(0.5, prev + delta), 5));
  }, []);
  
  const handleMouseDown: React.MouseEventHandler = useCallback((e) => {
      e.preventDefault(); e.stopPropagation();
      isDragging.current = true;
      startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);
  
  const handleMouseMove: React.MouseEventHandler = useCallback((e) => {
      if (!isDragging.current || !startPos.current) return;
      e.stopPropagation();
      setPosition({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  }, []);
  
  const handleMouseUp = useCallback((e: React.MouseEvent) => { e.stopPropagation(); isDragging.current = false; }, []);
  
  // Touch Handlers (Pinch Zoom & Pan)
  const getDistance = (touches: React.TouchList) => Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 2) {
          touchDistance.current = getDistance(e.touches);
          isDragging.current = false; startPos.current = null;
      } else if (e.touches.length === 1) {
          isDragging.current = true;
          startPos.current = { x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y };
          touchDistance.current = null;
      }
  }, [position]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 2 && touchDistance.current !== null) {
          const newDistance = getDistance(e.touches);
          const scaleFactor = newDistance / touchDistance.current;
          setScale(prev => Math.min(Math.max(0.5, prev * scaleFactor), 5));
          touchDistance.current = newDistance;
      } else if (isDragging.current && e.touches.length === 1 && startPos.current) {
          setPosition({ x: e.touches[0].clientX - startPos.current.x, y: e.touches[0].clientY - startPos.current.y });
      }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
      e.stopPropagation(); isDragging.current = false; touchDistance.current = null; startPos.current = null;
  }, []);
  
  const handleDownload = async (fileUrl: string, fileName: string) => {
      try {
        const response = await fetch(fileUrl, { method: 'GET' });
        if (!response.ok) throw new Error('Network error');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) { window.open(fileUrl, '_blank'); }
  };

  return (
    <div className="cf-overlay" onClick={onClose}>
      <div className="cf-container" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="cf-header">
          <div className="cf-title-group">
             <h2 className="cf-title">Project Gallery</h2>
             <span className="cf-subtitle">평면도 및 3D 시안 확인</span>
          </div>
          <button className="cf-close-btn" onClick={onClose} aria-label="닫기"><Icons.Close /></button>
        </div>

        {/* Tab Navigation */}
        <div className="cf-tabs-wrapper">
            <div className="cf-tabs">
                <button className={`cf-tab ${activeTab === 'floor-plan' ? 'active' : ''}`} onClick={() => setActiveTab('floor-plan')}>
                    평면도 (Floor Plan)
                </button>
                <button className={`cf-tab ${activeTab === '3d-render' ? 'active' : ''}`} onClick={() => setActiveTab('3d-render')}>
                    3D 렌더링 (Render)
                </button>
                <div className="cf-tab-indicator" style={{ transform: activeTab === 'floor-plan' ? 'translateX(0)' : 'translateX(100%)' }} />
            </div>
        </div>

        {/* Content Body */}
        <div className="cf-body">
            {loading ? (
                <div className="cf-loader"><div className="spinner"></div></div>
            ) : currentFiles.length === 0 ? (
                <div className="cf-empty-state">
                    <div className="icon-box"><Icons.Empty /></div>
                    <p>등록된 {activeTab === 'floor-plan' ? '평면도' : '3D 렌더링'} 이미지가 없습니다.</p>
                </div>
            ) : (
                <div className="cf-masonry-grid">
                    {currentFiles.map((file, idx) => (
                        <div key={file.id} className="cf-card" style={{ animationDelay: `${idx * 50}ms` }} onClick={() => openViewer(file.url)}>
                            <div className="cf-image-wrap">
                                <img src={file.url} alt={file.name} loading="lazy" />
                                <div className="cf-hover-overlay">
                                    <div className="cf-zoom-icon"><Icons.ZoomIn /></div>
                                </div>
                            </div>
                            <div className="cf-card-footer">
                                <span className="cf-file-name">{file.name}</span>
                                <button className="cf-download-btn" onClick={(e) => { e.stopPropagation(); handleDownload(file.url, file.name); }}>
                                    <Icons.Download />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>

      {/* Fullscreen Image Viewer */}
      {viewingImage && (
          <div 
                className="cf-viewer-overlay" 
                onClick={(e) => { e.stopPropagation(); closeViewer(); }}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            >
              <div className="cf-viewer-toolbar" onClick={e => e.stopPropagation()}>
                  <span className="cf-viewer-info">Pinch to Zoom</span>
                  <button className="cf-viewer-close" onClick={closeViewer}><Icons.Close /></button>
              </div>
              
              <div 
                className="cf-viewer-canvas" 
                onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
                onClick={e => e.stopPropagation()}
                style={{ transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`, cursor: isDragging.current ? 'grabbing' : 'grab' }}
              >
                  <img src={viewingImage} alt="Fullscreen View" draggable={false} />
              </div>
          </div>
      )}
    </div>
  );
};

export default CustomerSiteFilesModal;