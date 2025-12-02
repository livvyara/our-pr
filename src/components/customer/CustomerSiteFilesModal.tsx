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
  
  // [이미지 뷰어 상태]
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  
  // 터치 및 드래그 상태 관리
  const isDragging = useRef(false);
  const startPos = useRef<Point | null>(null); // [수정] Point 타입 또는 null
  const touchDistance = useRef<number | null>(null); 

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

  // --- 뷰어 핸들러 ---
  const openViewer = (url: string) => {
      setViewingImage(url);
      setScale(1);
      setPosition({ x: 0, y: 0 });
  };
  const closeViewer = () => setViewingImage(null);

  // 마우스 휠 (PC)
  const handleWheel = useCallback((e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.min(Math.max(0.5, prev + delta), 5));
  }, []);
  
  // 마우스 드래그 시작 (PC)
  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = useCallback((e) => {
      e.preventDefault();
      isDragging.current = true;
      startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position.x, position.y]);
  
  // 마우스 드래그 이동 (PC)
  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = useCallback((e) => {
      if (!isDragging.current || startPos.current === null) return;
      setPosition({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  }, []);
  
  // 마우스 드래그 종료 (PC)
  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);
  
  // --- 터치 핸들러 (모바일) ---
  const getDistance = (touches: React.TouchList) => {
      return Math.hypot(
          touches[0].pageX - touches[1].pageX, 
          touches[0].pageY - touches[1].pageY
      );
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 2) {
          // 핀치 줌 시작
          touchDistance.current = getDistance(e.touches);
          isDragging.current = false; 
          startPos.current = null;
      } else if (e.touches.length === 1) {
          // 단일 터치 드래그 시작
          isDragging.current = true;
          startPos.current = { x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y };
          touchDistance.current = null;
      }
  }, [position.x, position.y]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
      e.stopPropagation();
      
      if (e.touches.length === 2 && touchDistance.current !== null) {
          // 핀치 줌 이동
          const newDistance = getDistance(e.touches);
          const scaleFactor = newDistance / touchDistance.current;
          setScale(prev => Math.min(Math.max(0.5, prev * scaleFactor), 5));
          touchDistance.current = newDistance;
      } else if (isDragging.current && e.touches.length === 1 && startPos.current !== null) {
          // 드래그 이동
          setPosition({ x: e.touches[0].clientX - startPos.current.x, y: e.touches[0].clientY - startPos.current.y });
      }
  }, []);

  const handleTouchEnd = useCallback(() => {
      isDragging.current = false;
      touchDistance.current = null;
      startPos.current = null;
  }, []);
  
  return (
    <div className="customer-files-modal-overlay">
      <div className="customer-files-modal-content" style={{display:'flex', flexDirection:'column'}}>
        
        <div className="customer-files-modal-header">
          <h3>📂 공사 자료실</h3>
          <button className="customer-files-modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="customer-files-modal-body" style={{display:'flex', flexDirection:'column', height:'100%'}}>
            <div className="customer-files-modal-file-tabs">
                <button className={`customer-files-modal-file-tab ${activeTab === 'floor-plan' ? 'active' : ''}`} onClick={() => setActiveTab('floor-plan')}>📐 평면도</button>
                <button className={`customer-files-modal-file-tab ${activeTab === '3d-render' ? 'active' : ''}`} onClick={() => setActiveTab('3d-render')}>🏠 3D 렌더링</button>
            </div>

            <div className="customer-files-modal-file-grid-container">
                {loading ? <div className="customer-files-modal-loading">자료를 불러오는 중...</div> : 
                 currentFiles.length === 0 ? <div className="customer-files-modal-empty"><p>등록된 {activeTab === 'floor-plan' ? '평면도' : '3D 렌더링'} 자료가 없습니다.</p></div> : 
                 <div className="customer-files-modal-file-grid">
                     {currentFiles.map(file => (
                         <div key={file.id} className="customer-files-modal-file-card">
                             <div className="customer-files-modal-file-thumb" onClick={() => openViewer(file.url)}>
                                 <img src={file.url} alt={file.name} />
                                 <div className="customer-files-modal-file-overlay">🔍 크게 보기</div>
                             </div>
                             <div className="customer-files-modal-file-info">
                                 <span className="customer-files-modal-file-name" title={file.name}>{file.name}</span>
                                 <a href={file.url} download={file.name} target="_blank" rel="noreferrer" className="customer-files-modal-btn-download">⬇ 저장</a>
                             </div>
                         </div>
                     ))}
                 </div>
                }
            </div>
        </div>
      </div>

      {viewingImage && (
          <div 
                className="image-viewer-overlay" 
                onClick={closeViewer}
                onTouchStart={handleTouchStart} 
                onTouchMove={handleTouchMove} 
                onTouchEnd={handleTouchEnd}
            >
              <div className="image-viewer-controls">
                  <button onClick={closeViewer}>닫기 (Esc)</button>
                  <span>휠/핀치: 확대/축소 | 드래그: 이동</span>
              </div>
              <div 
                className="image-viewer-content" 
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onClick={e => e.stopPropagation()}
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