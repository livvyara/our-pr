import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, query, orderBy, getDocs } from 'firebase/firestore';
import './SiteWorkLogListModal.css'; 

interface WorkLog {
  id: string;
  workDate: string;
  todayWork: string;
  nextWork: string;
  issues: string; // 특이사항
  meetingLog: string; // 미팅내용
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

  // --- 이미지 뷰어 핸들러 ---
  const openImageViewer = (url: string) => {
      setViewingImage(url);
      setScale(1);
      setPosition({ x: 0, y: 0 });
  };

  const closeImageViewer = () => {
      setViewingImage(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.min(Math.max(0.5, prev + delta), 4)); // 0.5 ~ 4배 줌
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      isDragging.current = true;
      startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      setPosition({
          x: e.clientX - startPos.current.x,
          y: e.clientY - startPos.current.y
      });
  };

  const handleMouseUp = () => {
      isDragging.current = false;
  };

  return (
    <div className="modal-overlay" style={{zIndex: 3000}}>
      <div className="modal-content" style={{width:'600px', maxHeight:'85vh', display:'flex', flexDirection:'column'}}>
        
        {/* 헤더 */}
        <div style={{padding:'15px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <h3 style={{margin:0}}>📋 작업 일지</h3>
            <button onClick={onClose} style={{background:'none', border:'none', fontSize:'24px', cursor:'pointer'}}>×</button>
        </div>

        {/* 바디 */}
        <div style={{flex:1, overflowY:'auto', padding:'20px', backgroundColor:'#f8f9fa'}}>
            {loading ? <p style={{textAlign:'center'}}>로딩 중...</p> : 
             logs.length === 0 ? <p style={{textAlign:'center', color:'#999'}}>등록된 작업 일지가 없습니다.</p> :
             
             // 상세 보기 모드
             selectedLog ? (
                 <div className="log-detail-view">
                     <button onClick={() => setSelectedLog(null)} style={{marginBottom:'15px', padding:'5px 10px', border:'1px solid #ddd', background:'white', borderRadius:'4px', cursor:'pointer'}}>← 목록으로</button>
                     <div style={{background:'white', padding:'25px', borderRadius:'8px', border:'1px solid #eee'}}>
                         <h4 style={{margin:'0 0 20px 0', borderBottom:'2px solid #333', paddingBottom:'10px', fontSize:'18px'}}>{selectedLog.workDate} 작업일지</h4>
                         
                         <div style={{marginBottom:'20px'}}>
                             <strong style={{display:'block', marginBottom:'8px', color:'#1976d2', fontSize:'14px'}}>■ 금일 작업 공정</strong>
                             <div style={{whiteSpace:'pre-wrap', fontSize:'15px', lineHeight:'1.6'}}>{selectedLog.todayWork}</div>
                         </div>
                         
                         {selectedLog.nextWork && (
                             <div style={{marginBottom:'20px'}}>
                                 <strong style={{display:'block', marginBottom:'8px', color:'#1976d2', fontSize:'14px'}}>■ 익일 작업 예정</strong>
                                 <div style={{whiteSpace:'pre-wrap', fontSize:'15px', lineHeight:'1.6'}}>{selectedLog.nextWork}</div>
                             </div>
                         )}

                         {/* [추가] 특이사항 */}
                         {selectedLog.issues && (
                             <div style={{marginBottom:'20px'}}>
                                 <strong style={{display:'block', marginBottom:'8px', color:'#d32f2f', fontSize:'14px'}}>■ 금일 현장 특이사항</strong>
                                 <div style={{whiteSpace:'pre-wrap', fontSize:'15px', lineHeight:'1.6', background:'#fff5f5', padding:'10px', borderRadius:'4px'}}>{selectedLog.issues}</div>
                             </div>
                         )}

                         {/* [추가] 고객 미팅 내용 */}
                         {selectedLog.meetingLog && (
                             <div style={{marginBottom:'20px'}}>
                                 <strong style={{display:'block', marginBottom:'8px', color:'#388e3c', fontSize:'14px'}}>■ 고객 미팅 내용</strong>
                                 <div style={{whiteSpace:'pre-wrap', fontSize:'15px', lineHeight:'1.6', background:'#f1f8e9', padding:'10px', borderRadius:'4px'}}>{selectedLog.meetingLog}</div>
                             </div>
                         )}

                         {/* 사진 갤러리 */}
                         {selectedLog.images && selectedLog.images.length > 0 && (
                             <div style={{marginTop:'30px', borderTop:'1px dashed #ddd', paddingTop:'20px'}}>
                                 <strong style={{display:'block', marginBottom:'10px', color:'#555'}}>첨부 사진 ({selectedLog.images.length})</strong>
                                 <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'10px'}}>
                                     {selectedLog.images.map((url, idx) => (
                                         <img 
                                            key={idx} 
                                            src={url} 
                                            alt="현장사진" 
                                            style={{width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:'6px', border:'1px solid #eee', cursor:'zoom-in'}} 
                                            onClick={() => openImageViewer(url)} 
                                         />
                                     ))}
                                 </div>
                             </div>
                         )}
                     </div>
                 </div>
             ) : 
             
             // 리스트 모드 (카드형)
             (
                 <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                     {logs.map(log => (
                         <div key={log.id} onClick={() => setSelectedLog(log)} style={{
                             background:'white', padding:'15px', borderRadius:'8px', border:'1px solid #eee', cursor:'pointer', transition:'all 0.2s'
                         }}
                         onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                         onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                         >
                             <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                                <div style={{fontWeight:'bold', fontSize:'16px', color:'#333'}}>{log.workDate}</div>
                                <div style={{fontSize:'12px', color:'#999'}}>작성자: {log.author}</div>
                             </div>
                             <div style={{color:'#555', fontSize:'14px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:'8px'}}>
                                 {log.todayWork}
                             </div>
                             <div style={{display:'flex', gap:'10px'}}>
                                {log.images && log.images.length > 0 && (
                                     <span style={{fontSize:'12px', color:'#1976d2', background:'#e3f2fd', padding:'2px 6px', borderRadius:'4px'}}>📷 사진 {log.images.length}</span>
                                )}
                                {log.issues && (
                                     <span style={{fontSize:'12px', color:'#d32f2f', background:'#ffebee', padding:'2px 6px', borderRadius:'4px'}}>⚠️ 특이사항</span>
                                )}
                             </div>
                         </div>
                     ))}
                 </div>
             )
            }
        </div>
      </div>

      {/* [이미지 뷰어 오버레이] */}
      {viewingImage && (
          <div className="image-viewer-overlay" onClick={closeImageViewer}>
              <div className="image-viewer-controls">
                  <button onClick={closeImageViewer}>닫기 (Esc)</button>
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
      
      <style>{`
          .image-viewer-overlay {
              position: fixed; top: 0; left: 0; right: 0; bottom: 0;
              background: rgba(0,0,0,0.9); z-index: 4000;
              display: flex; justify-content: center; align-items: center;
              overflow: hidden;
          }
          .image-viewer-controls {
              position: absolute; top: 20px; right: 20px; z-index: 4001;
              display: flex; gap: 15px; align-items: center;
              color: white; font-size: 14px;
          }
          .image-viewer-controls button {
              background: rgba(255,255,255,0.2); border: 1px solid white; color: white;
              padding: 8px 16px; border-radius: 20px; cursor: pointer;
          }
          .image-viewer-content {
              transition: transform 0.1s ease-out;
              display: flex; justify-content: center; align-items: center;
          }
          .image-viewer-content img {
              max-width: 90vw; max-height: 90vh;
              object-fit: contain;
              box-shadow: 0 0 20px rgba(0,0,0,0.5);
          }
      `}</style>
    </div>
  );
};

export default SiteWorkLogListModal;