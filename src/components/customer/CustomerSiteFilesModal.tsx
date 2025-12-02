import React, { useState, useEffect, useRef } from 'react';
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

const CustomerSiteFilesModal: React.FC<Props> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  
  const [activeTab, setActiveTab] = useState<'floor-plan' | '3d-render'>('floor-plan');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // [이미지 뷰어 상태]
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

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

  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.min(Math.max(0.5, prev + delta), 5));
  };
  const handleMouseDown = (e: React.MouseEvent) => {
      isDragging.current = true;
      startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      setPosition({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  };
  const handleMouseUp = () => { isDragging.current = false; };

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
          <div className="image-viewer-overlay" onClick={closeViewer}>
              <div className="image-viewer-controls">
                  <button onClick={closeViewer}>닫기 (Esc)</button>
                  <span>휠: 확대/축소 | 드래그: 이동</span>
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