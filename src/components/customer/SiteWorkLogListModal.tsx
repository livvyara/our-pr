import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, query, orderBy, getDocs } from 'firebase/firestore';
import './SiteWorkLogListModal.css'; 

interface WorkLog {
  id: string;
  workDate: string;
  todayWork: string;
  nextWork: string;
  issues: string;
  meetingLog: string;
  images: string[];
  author: string;
}

interface Props {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

const SiteWorkLogListModal: React.FC<Props> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<WorkLog | null>(null);
  
  // 이미지 뷰어 상태
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  // 애니메이션 & DOM Refs
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 1. 데이터 로드
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const q = query(
            collection(db, 'users', partnerUid, 'sites', siteId, 'workLogs'), 
            orderBy('workDate', 'desc')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkLog));
        setLogs(list);
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    fetchLogs();
  }, [siteId, partnerUid]);

  // 2. 애니메이션 실행 (데이터 로드 후)
  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        // 타이틀 등 상단 요소 즉시 노출
        const headers = document.querySelectorAll('.wl-header-anim');
        headers.forEach(el => el.classList.add('wl-active'));

        // 리스트 아이템 스크롤 감지
        observerRef.current = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('wl-active');
            }
          });
        }, { threshold: 0.1 });

        const targets = document.querySelectorAll('.wl-fade-up');
        targets.forEach(el => observerRef.current?.observe(el));
      }, 100);
    }
    return () => observerRef.current?.disconnect();
  }, [loading, selectedLog]); // 화면 전환(리스트<->상세) 시에도 재실행

  // 상세 보기 클릭 시 스크롤 상단 이동
  const handleLogClick = (log: WorkLog) => {
    setSelectedLog(log);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const handleBackToList = () => {
    setSelectedLog(null);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  // --- 이미지 뷰어 핸들러 ---
  const openImageViewer = (url: string) => { setViewingImage(url); setScale(1); setPosition({ x: 0, y: 0 }); };
  const closeImageViewer = () => { setViewingImage(null); };
  const handleWheel = (e: React.WheelEvent) => { e.stopPropagation(); const delta = e.deltaY > 0 ? -0.1 : 0.1; setScale(prev => Math.min(Math.max(0.5, prev + delta), 4)); };
  const handleMouseDown = (e: React.MouseEvent) => { isDragging.current = true; startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y }; };
  const handleMouseMove = (e: React.MouseEvent) => { if (!isDragging.current) return; setPosition({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y }); };
  const handleMouseUp = () => { isDragging.current = false; };

  return (
    <div className="wl-modal-overlay" onClick={onClose}>
      <div className="wl-modal-container wide" onClick={e => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div className="wl-modal-header">
            <div className="wl-reveal-mask">
                <h2 className="wl-modal-title wl-header-anim">공사 작업 일지</h2>
            </div>
            <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        {/* 바디 (스크롤 영역) */}
        <div className="wl-modal-body" ref={listRef}>
            {loading ? <div className="wl-loading">데이터를 불러오는 중입니다...</div> : 
             logs.length === 0 ? <div className="wl-empty wl-fade-up">등록된 작업 일지가 없습니다.</div> :
             
             // --- 상세 보기 모드 ---
             selectedLog ? (
                 <div className="log-detail-wrapper">
                     <button onClick={handleBackToList} className="btn-back wl-fade-up">← 목록으로 돌아가기</button>
                     
                     <div className="detail-content wl-fade-up" style={{transitionDelay: '0.1s'}}>
                         <div className="detail-top-row">
                             <h3 className="detail-date">{selectedLog.workDate}</h3>
                             <span className="detail-author">작성자: {selectedLog.author}</span>
                         </div>
                         
                         <div className="detail-block">
                             <strong className="block-label">작업 내용</strong>
                             <div className="block-text">{selectedLog.todayWork}</div>
                         </div>
                         
                         {selectedLog.nextWork && (
                             <div className="detail-block">
                                 <strong className="block-label">다음 일정</strong>
                                 <div className="block-text">{selectedLog.nextWork}</div>
                             </div>
                         )}

                         {selectedLog.issues && (
                             <div className="detail-block alert">
                                 <strong className="block-label alert">⚠️ 특이사항</strong>
                                 <div className="block-text">{selectedLog.issues}</div>
                             </div>
                         )}

                         {selectedLog.meetingLog && (
                             <div className="detail-block note">
                                 <strong className="block-label note">💬 미팅 기록</strong>
                                 <div className="block-text">{selectedLog.meetingLog}</div>
                             </div>
                         )}

                         {selectedLog.images && selectedLog.images.length > 0 && (
                             <div className="detail-gallery-section">
                                 <strong className="gallery-label">현장 사진</strong>
                                 <div className="gallery-grid">
                                     {selectedLog.images.map((url, idx) => (
                                         <div key={idx} className="gallery-item" onClick={() => openImageViewer(url)}>
                                             <img src={url} alt="현장사진" />
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         )}
                     </div>
                 </div>
             ) : 
             
             // --- 리스트 모드 (넓은 행 형태) ---
             (
                 <div className="log-list-container">
                     {logs.map((log, index) => (
                         <div 
                            key={log.id} 
                            onClick={() => handleLogClick(log)} 
                            className="log-row-item wl-fade-up"
                            style={{ transitionDelay: `${index * 0.05}s` }}
                         >
                             <div className="log-row-left">
                                <span className="log-row-date">{log.workDate}</span>
                             </div>
                             
                             <div className="log-row-center">
                                <p className="log-row-summary">{log.todayWork}</p>
                                {log.issues && <span className="badge-issue">특이사항 있음</span>}
                             </div>

                             <div className="log-row-right">
                                {log.images && log.images.length > 0 && (
                                     <span className="badge-photo">사진 {log.images.length}장</span>
                                )}
                                <span className="row-arrow">→</span>
                             </div>
                         </div>
                     ))}
                 </div>
             )
            }
        </div>
      </div>

      {/* 이미지 뷰어 (동일) */}
      {viewingImage && (
          <div className="image-viewer-overlay" onClick={closeImageViewer}>
              <div className="image-viewer-controls">
                  <button onClick={closeImageViewer}>닫기</button>
              </div>
              <div 
                className="image-viewer-content" 
                onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onClick={e => e.stopPropagation()}
                style={{ transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`, cursor: isDragging.current ? 'grabbing' : 'grab' }}
              >
                  <img src={viewingImage} alt="상세보기" draggable={false} />
              </div>
          </div>
      )}
    </div>
  );
};

export default SiteWorkLogListModal;