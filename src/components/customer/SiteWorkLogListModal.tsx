import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getFirestore, collection, query, orderBy, getDocs } from 'firebase/firestore';
import './SiteWorkLogListModal.css'; 

// --- [High-End Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  Back: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  Image: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Alert: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Empty: () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E5E7EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
};

interface WorkLog {
  id: string; workDate: string; todayWork: string; nextWork: string;
  issues: string; meetingLog: string; images: string[]; author: string;
}
interface Props { siteId: string; partnerUid: string; onClose: () => void; }
interface Point { x: number; y: number; }

const SiteWorkLogListModal: React.FC<Props> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<WorkLog | null>(null);
  
  // Image Viewer State
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startPos = useRef<Point | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // --- Fetch Data ---
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const q = query(collection(db, 'users', partnerUid, 'sites', siteId, 'workLogs'), orderBy('workDate', 'desc'));
        const snap = await getDocs(q);
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkLog)));
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    fetchLogs();
  }, [siteId, partnerUid, db]);

  // --- Handlers ---
  const handleLogClick = (log: WorkLog) => {
    setSelectedLog(log);
    if (listRef.current) listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToList = () => {
    setSelectedLog(null);
    if (listRef.current) listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Image Viewer Logic (Mouse & Touch) ---
  const openImageViewer = (url: string) => { setViewingImage(url); setScale(1); setPosition({ x: 0, y: 0 }); };
  const closeImageViewer = () => { setViewingImage(null); };

  const handleWheel = useCallback((e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.min(Math.max(0.5, prev + delta), 4));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      isDragging.current = true;
      startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (!isDragging.current || !startPos.current) return;
      e.stopPropagation();
      setPosition({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => { e.stopPropagation(); isDragging.current = false; }, []);

  return (
    <div className="wl-overlay" onClick={onClose}>
      <div className="wl-container" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="wl-header">
            {selectedLog ? (
                <button className="wl-back-btn" onClick={handleBackToList}>
                    <Icons.Back /> <span className="back-text">목록</span>
                </button>
            ) : (
                <div className="wl-title-group">
                    <h2 className="wl-title">Work Logs</h2>
                    <span className="wl-subtitle">공사 작업 일지</span>
                </div>
            )}
            <button className="wl-close-btn" onClick={onClose}><Icons.Close /></button>
        </div>

        {/* Body (Scrollable) */}
        <div className="wl-body" ref={listRef}>
            {loading ? (
                <div className="wl-loading"><div className="spinner"></div></div>
            ) : logs.length === 0 ? (
                <div className="wl-empty">
                    <div className="icon-box"><Icons.Empty /></div>
                    <p>등록된 작업 일지가 없습니다.</p>
                </div>
            ) : selectedLog ? (
                // --- 상세 보기 (Detail View) ---
                <div className="wl-detail-view">
                    <div className="detail-header">
                        <span className="detail-date">{selectedLog.workDate}</span>
                        <span className="detail-author">작성자: {selectedLog.author}</span>
                    </div>

                    <div className="detail-section">
                        <h4 className="section-title">작업 내용</h4>
                        <p className="section-text">{selectedLog.todayWork}</p>
                    </div>

                    {selectedLog.nextWork && (
                        <div className="detail-section">
                            <h4 className="section-title">다음 일정</h4>
                            <p className="section-text">{selectedLog.nextWork}</p>
                        </div>
                    )}

                    {selectedLog.issues && (
                        <div className="detail-card alert">
                            <div className="card-head"><Icons.Alert /> 특이사항</div>
                            <p className="card-text">{selectedLog.issues}</p>
                        </div>
                    )}

                    {selectedLog.meetingLog && (
                        <div className="detail-card note">
                            <div className="card-head">💬 미팅 기록</div>
                            <p className="card-text">{selectedLog.meetingLog}</p>
                        </div>
                    )}

                    {selectedLog.images && selectedLog.images.length > 0 && (
                        <div className="detail-gallery">
                            <h4 className="section-title">현장 사진 ({selectedLog.images.length})</h4>
                            <div className="gallery-grid">
                                {selectedLog.images.map((url, idx) => (
                                    <div key={idx} className="gallery-item" onClick={() => openImageViewer(url)}>
                                        <img src={url} alt={`현장사진 ${idx}`} loading="lazy" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                // --- 리스트 보기 (Feed Card Style) ---
                <div className="wl-list-view">
                    {logs.map((log, idx) => (
                        <article 
                            key={log.id} 
                            className="wl-card" 
                            onClick={() => handleLogClick(log)}
                            style={{ animationDelay: `${idx * 50}ms` }}
                        >
                            <div className="wl-card-head">
                                <span className="wl-date">{log.workDate}</span>
                                {log.issues && <span className="wl-badge-issue">특이사항</span>}
                            </div>
                            
                            <p className="wl-summary">{log.todayWork}</p>
                            
                            {/* 썸네일 미리보기 (최대 3장) */}
                            {log.images && log.images.length > 0 && (
                                <div className="wl-thumbs">
                                    {log.images.slice(0, 3).map((url, i) => (
                                        <div key={i} className="thumb-item">
                                            <img src={url} alt="thumb" loading="lazy" />
                                            {i === 2 && log.images.length > 3 && (
                                                <div className="thumb-more">+{log.images.length - 3}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            <div className="wl-card-foot">
                                <span className="wl-meta">작성자: {log.author}</span>
                                <span className="wl-more-link">자세히 보기 →</span>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
      </div>

      {/* Image Viewer */}
      {viewingImage && (
          <div className="viewer-overlay" onClick={closeImageViewer}>
              <button className="viewer-close" onClick={closeImageViewer}><Icons.Close /></button>
              <div 
                className="viewer-content"
                onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
                onClick={e => e.stopPropagation()}
                style={{ transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`, cursor: isDragging.current ? 'grabbing' : 'grab' }}
              >
                  <img src={viewingImage} alt="Fullscreen" draggable={false} />
              </div>
          </div>
      )}
    </div>
  );
};

export default SiteWorkLogListModal;