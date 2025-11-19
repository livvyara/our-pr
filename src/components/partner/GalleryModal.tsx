// src/components/partner/GalleryModal.tsx

import React, { useState, useEffect, type WheelEvent } from 'react';
import './GalleryModal.css'; // (CSS 파일 임포트)

// (SiteFilesWidget에서 사용하는 타입과 동일하게)
interface FileEntry {
  id: string;
  url: string;
  name: string;
  category: string;
}

interface GalleryModalProps {
  files: FileEntry[];      // 표시할 파일 목록
  initialIndex: number;  // 처음 표시할 이미지의 인덱스
  onClose: () => void;     // 닫기 함수
}

const GalleryModal: React.FC<GalleryModalProps> = ({ files, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  
  // [⭐ 1. 추가] 이미지 이동(Pan) 상태
  const [imagePos, setImagePos] = useState({ x: 0, y: 0 }); // (translate 값)
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 }); // (드래그 시작 시 마우스 위치)

  const mainImage = files[currentIndex];

  // 1. 줌(Zoom) 핸들러 (마우스 휠)
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault(); 
    
    const zoomSpeed = 0.1;
    let newZoomLevel = zoomLevel;

    if (e.deltaY < 0) {
      newZoomLevel = Math.min(zoomLevel + zoomSpeed, 3); // (최대 3배)
    } else {
      newZoomLevel = Math.max(zoomLevel - zoomSpeed, 1); // (최소 1배)
    }
    
    setZoomLevel(newZoomLevel);

    // [⭐ 수정] 줌 레벨이 1(기본)이 되면 이동(pan) 위치 초기화
    if (newZoomLevel <= 1) {
      setImagePos({ x: 0, y: 0 });
    }
  };

  // 2. 하단 썸네일 클릭 핸들러
  const handleThumbnailClick = (index: number) => {
    setCurrentIndex(index);
    setZoomLevel(1); // (이미지 변경 시 줌 레벨 초기화)
    setImagePos({ x: 0, y: 0 }); // [⭐ 추가] 이미지 변경 시 이동(pan) 위치 초기화
  };

  // 3. 배경 클릭 시 닫기
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // 4. 키보드 이벤트 (ESC로 닫기, 좌우 화살표로 이동)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        const newIndex = (currentIndex - 1 + files.length) % files.length;
        handleThumbnailClick(newIndex); // (줌/팬 초기화 포함)
      } else if (e.key === 'ArrowRight') {
        const newIndex = (currentIndex + 1) % files.length;
        handleThumbnailClick(newIndex); // (줌/팬 초기화 포함)
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, files.length, onClose]);

  // [⭐ 5. 추가] 마우스 다운 (이동 시작)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return; // 줌 상태가 아니면 이동 불가
    e.preventDefault();
    setIsPanning(true);
    // (현재 마우스 위치 - 현재 이미지 translate) = '잡은 위치'
    setPanStart({
      x: e.clientX - imagePos.x,
      y: e.clientY - imagePos.y
    });
  };

  // [⭐ 6. 추가] 마우스 이동 (드래그)
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    e.preventDefault();
    // (현재 마우스 위치 - '잡은 위치') = 새 translate
    setImagePos({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  };

  // [⭐ 7. 추가] 마우스 업 또는 영역 이탈 (이동 종료)
  const handleMouseUpOrLeave = () => {
    setIsPanning(false);
  };

  return (
    <div className="gallery-modal-overlay" onClick={handleBackgroundClick}>
      
      <div className="gallery-modal-content">
        
        {/* 1. 닫기 버튼 */}
        <button className="gallery-modal-close-btn" onClick={onClose}>
          &times;
        </button>

        {/* 2. 메인 이미지 (확대/축소/이동 영역) */}
        <div 
          className="gallery-main-image-wrapper"
          onWheel={handleWheel} // 휠 (줌)
          onMouseDown={handleMouseDown} // [⭐ 추가]
          onMouseMove={handleMouseMove} // [⭐ 추가]
          onMouseUp={handleMouseUpOrLeave} // [⭐ 추가]
          onMouseLeave={handleMouseUpOrLeave} // [⭐ 추가]
        >
          <img 
            src={mainImage.url} 
            alt={mainImage.name}
            // [⭐ 8. 수정] 클래스 동적 적용 (커서 변경용)
            className={`gallery-main-image ${zoomLevel > 1 ? 'zoomed' : ''} ${isPanning ? 'panning' : ''}`}
            // [⭐ 9. 수정] transform에 translate(이동) 추가
            style={{ 
              transform: `scale(${zoomLevel}) translate(${imagePos.x}px, ${imagePos.y}px)` 
            }}
            draggable={false} // (브라우저 기본 이미지 드래그 방지)
          />
        </div>

        {/* 3. 하단 썸네일 목록 (파일이 2개 이상일 때만 표시) */}
        {files.length > 1 && (
          <div className="gallery-thumbnail-list">
            {files.map((file, index) => (
              <div
                key={file.id}
                className={`gallery-thumbnail-item ${index === currentIndex ? 'active' : ''}`}
                onClick={() => handleThumbnailClick(index)}
              >
                <img src={file.url} alt={file.name} />
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default GalleryModal;