import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
// import './GalleryModal.css'; // (CSS는 하단 <style> 태그로 포함됨)

interface FileEntry {
  id: string;
  url: string;
  name: string;
  category: string;
}

interface Props {
  files: FileEntry[];
  initialIndex: number;
  onClose: () => void;
  siteId: string;
  partnerUid: string;
}

const GalleryModal: React.FC<Props> = ({ files, initialIndex, onClose, siteId, partnerUid }) => {
  const db = getFirestore();
  const storage = getStorage();

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [fileList, setFileList] = useState(files);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const currentFile = fileList[currentIndex];

  useEffect(() => {
      if (currentFile) setEditName(currentFile.name);
      // 이미지 변경 시 줌 초기화
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setIsEditing(false);
  }, [currentIndex, currentFile]);

  const handleNext = () => setCurrentIndex(prev => (prev + 1) % fileList.length);
  const handlePrev = () => setCurrentIndex(prev => (prev - 1 + fileList.length) % fileList.length);

  const handleSaveName = async () => {
      if (!editName.trim()) return;
      try {
          const fileRef = doc(db, 'users', partnerUid, 'sites', siteId, 'files', currentFile.id);
          await updateDoc(fileRef, { name: editName });
          
          const newList = [...fileList];
          newList[currentIndex] = { ...currentFile, name: editName };
          setFileList(newList);
          
          setIsEditing(false);
      } catch (e) {
          console.error(e);
          alert("수정 실패");
      }
  };

  const handleDelete = async () => {
      if (!confirm("정말 삭제하시겠습니까?")) return;
      try {
          const fileRefFromUrl = ref(storage, currentFile.url);
          await deleteObject(fileRefFromUrl);

          const docRef = doc(db, 'users', partnerUid, 'sites', siteId, 'files', currentFile.id);
          await deleteDoc(docRef);

          const newList = fileList.filter((_, i) => i !== currentIndex);
          if (newList.length === 0) {
              onClose();
          } else {
              setFileList(newList);
              setCurrentIndex(prev => (prev >= newList.length ? newList.length - 1 : prev));
          }
          alert("삭제되었습니다.");
      } catch (e) {
          console.error(e);
          alert("삭제 중 오류가 발생했습니다.");
      }
  };

  const handleWheel = (e: React.WheelEvent) => {
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

  // 원본 파일명인지 확인하는 헬퍼
  const isRawFilename = (name: string) => {
      return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(name);
  };

  if (!currentFile) return null;

  // [NEW] 고객에게 노출되는 카테고리인지 확인 ('평면도', '3D 렌더링'만 해당)
  const isCustomerVisibleCategory = ['floor-plan', '3d-render'].includes(currentFile.category);

  return (
    <div className="gallery-overlay">
        <button className="btn-gallery-close" onClick={onClose}>×</button>
        
        <div className="gallery-content">
            <div 
                className="gallery-image-area"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                <img 
                    src={currentFile.url} 
                    alt="view" 
                    draggable={false}
                    style={{
                        transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                        cursor: isDragging.current ? 'grabbing' : 'grab'
                    }}
                />
            </div>

            <div className="gallery-controls">
                <button className="nav-btn prev" onClick={handlePrev}>‹</button>
                
                <div className="file-meta">
                    {isEditing ? (
                        <div className="edit-box">
                            <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                            <button className="btn-save-name" onClick={handleSaveName}>저장</button>
                            <button className="btn-cancel-edit" onClick={() => setIsEditing(false)}>취소</button>
                        </div>
                    ) : (
                        <div className="info-wrapper">
                            <div className="info-box">
                                <span className="f-name">{currentFile.name}</span>
                                <button className="btn-edit-name" onClick={() => setIsEditing(true)} title="이름 수정">✏️</button>
                                <span className="f-count">({currentIndex + 1} / {fileList.length})</span>
                            </div>
                            
                            {/* [수정됨] 고객 노출 카테고리이고 파일명이 원본일 때만 안내 문구 표시 */}
                            {isCustomerVisibleCategory && isRawFilename(currentFile.name) && (
                                <div className="rename-warning">
                                    * 파일명을 변경해 주세요. 고객이 어떤 위치의 자료인지 알기 쉬워 집니다.
                                </div>
                            )}
                        </div>
                    )}
                    <div className="action-box">
                        <button className="btn-delete-file" onClick={handleDelete}>삭제</button>
                    </div>
                </div>

                <button className="nav-btn next" onClick={handleNext}>›</button>
            </div>
        </div>

        <style>{`
            .gallery-overlay {
                position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.95); z-index: 3000;
                display: flex; flex-direction: column;
            }
            .btn-gallery-close {
                position: absolute; top: 20px; right: 30px; background: none; border: none; color: white; font-size: 40px; cursor: pointer; z-index: 3002;
                opacity: 0.7; transition: opacity 0.2s;
            }
            .btn-gallery-close:hover { opacity: 1; }

            .gallery-content {
                flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden;
            }
            .gallery-image-area {
                flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden;
            }
            .gallery-image-area img {
                max-width: 90vw; max-height: 80vh; object-fit: contain; transition: transform 0.1s linear;
                box-shadow: 0 0 30px rgba(0,0,0,0.5);
            }
            
            .gallery-controls {
                height: 100px; background: rgba(0,0,0,0.85); 
                display: flex; align-items: center; justify-content: space-between; 
                padding: 0 40px; z-index: 3001;
                backdrop-filter: blur(10px);
                border-top: 1px solid rgba(255,255,255,0.1);
            }
            .nav-btn {
                background: none; border: none; color: white; font-size: 50px; cursor: pointer; padding: 0 20px; opacity: 0.7; transition: opacity 0.2s;
            }
            .nav-btn:hover { opacity: 1; }
            
            .file-meta {
                display: flex; flex-direction: column; align-items: center; gap: 8px; color: white; flex: 1;
            }
            
            .info-wrapper { display: flex; flex-direction: column; align-items: center; }
            
            .info-box { display: flex; align-items: center; gap: 10px; font-size: 18px; }
            .f-name { font-weight: bold; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .f-count { font-size: 14px; color: #aaa; }
            
            .btn-edit-name { background: none; border: none; cursor: pointer; font-size: 16px; opacity: 0.8; }
            .btn-edit-name:hover { opacity: 1; transform: scale(1.1); }

            .edit-box { display: flex; gap: 8px; align-items: center; }
            .edit-box input { 
                padding: 6px 10px; border-radius: 4px; border: none; color: #333; font-size: 14px; width: 250px; 
            }
            .btn-save-name { padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; font-weight: bold; background: #1976d2; color: white; }
            .btn-cancel-edit { padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; font-weight: bold; background: #555; color: white; }
            
            .btn-delete-file { 
                background: none; color: #e74c3c; border: 1px solid #e74c3c; 
                padding: 4px 12px; border-radius: 20px; font-size: 12px; cursor: pointer; opacity: 0.8; transition: all 0.2s;
            }
            .btn-delete-file:hover { background: #e74c3c; color: white; opacity: 1; }

            .rename-warning {
                font-size: 13px;
                color: #ffca28; /* 노란색 계열 */
                background-color: rgba(255, 255, 255, 0.1);
                padding: 4px 10px;
                border-radius: 12px;
                margin-top: 4px;
                animation: fadeIn 0.5s;
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
    </div>
  );
};

export default GalleryModal;