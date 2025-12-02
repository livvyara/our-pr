import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './CustomerSiteFilesModal.css';

interface FileEntry {
  id: string;
  url: string;
  name: string;
  category: string;
}

interface Props {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

interface Point { x: number; y: number; }

const CustomerSiteFilesModal: React.FC<Props> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  
  const [activeTab, setActiveTab] = useState<'floor-plan' | '3d-render'>('floor-plan');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 이미지 뷰어 상태
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  
  // 터치 및 드래그 상태 관리
  const isDragging = useRef(false);
  const startPos = useRef<Point | null>(null);
  const touchDistance = useRef<number | null>(null);

  // 애니메이션 Ref
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 1. 데이터 로드
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
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FileEntry));
        setFiles(list);
      } catch (e) { console.error("자료 로딩 실패", e); } 
      finally { setLoading(false); }
    };
    fetchFiles();
  }, [siteId, partnerUid]);

  const currentFiles = files.filter(f => f.category === activeTab);

  // 2. 애니메이션 실행
  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        const headers = document.querySelectorAll('.cf-header-anim');
        headers.forEach(el => el.classList.add('cf-active'));

        observerRef.current = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('cf-active');
            }
          });
        }, { threshold: 0.1 });

        const targets = document.querySelectorAll('.cf-fade-up');
        targets.forEach(el => observerRef.current?.observe(el));
      }, 100);
    }
    return () => observerRef.current?.disconnect();
  }, [loading, activeTab]);

  // --- 뷰어 핸들러 ---
  const openViewer = (url: string) => { setViewingImage(url); setScale(1); setPosition({ x: 0, y: 0 }); };
  
  const closeViewer = () => {
      setViewingImage(null);
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.min(Math.max(0.5, prev + delta), 5));
  }, []);
  
  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation(); // 드래그 시작 시 전파 방지
      isDragging.current = true;
      startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position.x, position.y]);
  
  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = useCallback((e) => {
      if (!isDragging.current || startPos.current === null) return;
      e.stopPropagation(); // 드래그 중 전파 방지
      setPosition({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  }, []);
  
  const handleMouseUp = useCallback((e: React.MouseEvent) => { 
      e.stopPropagation();
      isDragging.current = false; 
  }, []);
  
  // 터치 핸들러
  const getDistance = (touches: React.TouchList) => {
      return Math.hypot(
          touches[0].pageX - touches[1].pageX, 
          touches[0].pageY - touches[1].pageY
      );
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 2) {
          touchDistance.current = getDistance(e.touches);
          isDragging.current = false; 
          startPos.current = null;
      } else if (e.touches.length === 1) {
          isDragging.current = true;
          startPos.current = { x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y };
          touchDistance.current = null;
      }
  }, [position.x, position.y]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 2 && touchDistance.current !== null) {
          const newDistance = getDistance(e.touches);
          const scaleFactor = newDistance / touchDistance.current;
          setScale(prev => Math.min(Math.max(0.5, prev * scaleFactor), 5));
          touchDistance.current = newDistance;
      } else if (isDragging.current && e.touches.length === 1 && startPos.current !== null) {
          setPosition({ x: e.touches[0].clientX - startPos.current.x, y: e.touches[0].clientY - startPos.current.y });
      }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
      e.stopPropagation();
      isDragging.current = false;
      touchDistance.current = null;
      startPos.current = null;
  }, []);
  
  const handleDownload = async (fileUrl: string, fileName: string) => {
      try {
        const response = await fetch(fileUrl, { method: 'GET' });
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } catch (error) {
          console.error("다운로드 실패:", error);
          window.open(fileUrl, '_blank');
      }
  };

  return (
    <div className="cf-modal-overlay" onClick={onClose}>
      <div className="cf-modal-container wide" onClick={e => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div className="cf-modal-header">
          <div className="cf-reveal-mask">
             <h2 className="cf-modal-title cf-header-anim">공사 자료실</h2>
          </div>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        {/* 바디 */}
        <div className="cf-modal-body" ref={listRef}>
            
            {/* 탭 */}
            <div className="cf-tabs cf-fade-up">
                <button 
                    className={`cf-tab ${activeTab === 'floor-plan' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('floor-plan')}
                >
                    평면도 (Floor Plan)
                </button>
                <button 
                    className={`cf-tab ${activeTab === '3d-render' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('3d-render')}
                >
                    3D 렌더링 (Perspective)
                </button>
            </div>

            {/* 그리드 */}
            <div className="cf-grid-container">
                {loading ? <div className="cf-loading">자료를 불러오는 중...</div> : 
                 currentFiles.length === 0 ? <div className="cf-empty cf-fade-up">등록된 {activeTab === 'floor-plan' ? '평면도' : '3D 렌더링'} 자료가 없습니다.</div> : 
                 <div className="cf-file-grid">
                     {currentFiles.map((file, index) => (
                         <div 
                            key={file.id} 
                            className="cf-file-card cf-fade-up"
                            style={{ transitionDelay: `${index * 0.05}s` }}
                         >
                             <div className="cf-thumb-wrap" onClick={(e) => { e.stopPropagation(); openViewer(file.url); }}>
                                 <img src={file.url} alt={file.name} />
                                 <div className="cf-thumb-overlay">
                                     <span className="icon-zoom">🔍</span>
                                 </div>
                             </div>
                             <div className="cf-file-info">
                                 <span className="cf-file-name" title={file.name}>{file.name}</span>
                                 <button 
                                     onClick={(e) => { e.stopPropagation(); handleDownload(file.url, file.name); }} 
                                     className="btn-download"
                                 >
                                     Download
                                 </button>
                             </div>
                         </div>
                     ))}
                 </div>
                }
            </div>
        </div>
      </div>

      {/* [수정] 이미지 뷰어 오버레이 클릭 시 부모(팝업)로 이벤트 전파 방지 */}
      {viewingImage && (
          <div 
                className="image-viewer-overlay" 
                onClick={(e) => {
                    e.stopPropagation(); // [핵심] 여기서 전파를 막아야 팝업이 안 닫힙니다.
                    closeViewer();
                }}
                onTouchStart={handleTouchStart} 
                onTouchMove={handleTouchMove} 
                onTouchEnd={handleTouchEnd}
            >
              <div className="image-viewer-controls" onClick={e => e.stopPropagation()}>
                  <button onClick={(e) => {
                      e.stopPropagation(); // 버튼 클릭 시에도 전파 방지
                      closeViewer();
                  }}>닫기</button>
              </div>
              
              <div 
                className="image-viewer-content" 
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onClick={e => e.stopPropagation()} // 이미지 클릭 시 닫히지 않도록
                style={{
                    transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                    cursor: isDragging.current ? 'grabbing' : 'grab'
                }}
              >
                  <img src={viewingImage} alt="상세보기" draggable={false} />
              </div>
          </div>
      )}
    </div>
  );
};

export default CustomerSiteFilesModal;