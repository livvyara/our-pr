import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, doc, updateDoc, deleteDoc, Timestamp, getDoc } from 'firebase/firestore'; // getDoc 추가
import { getAuth } from 'firebase/auth';
import NoticePermissionModal from './NoticePermissionModal'; // [NEW] Import
import './CompanyNoticePage.css';

// --- [Icons] ---
const Icons = {
  // ... (기존 아이콘들 유지)
  Megaphone: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 11l18-5v12l-18-5z"/><path d="M11.9 5.2c-1.3 0-2.4 1.3-2.9 2.8"/><path d="M3 11v8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4"/></svg>,
  Pin: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>,
  Plus: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Upload: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  File: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  Trash: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Settings: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

// ... (NoticeData 인터페이스 유지)
interface NoticeData {
  id: string;
  title: string;
  content: string;
  isImportant: boolean;
  authorName: string;
  authorUid: string;
  createdAt: any;
  attachments?: string[];
  views: number;
}

interface Props {
  partnerUid: string;
}

const CompanyNoticePage: React.FC<Props> = ({ partnerUid }) => {
  const db = getFirestore();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  // --- [State] ---
  const [notices, setNotices] = useState<NoticeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Permission State
  const [isPartner, setIsPartner] = useState(false); // 대표자 여부
  const [isManager, setIsManager] = useState(false); // 관리자 권한 여부
  const [isPermModalOpen, setIsPermModalOpen] = useState(false); // [NEW] 권한 설정 모달

  // Modal State
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<NoticeData | null>(null);

  // Form State & File Refs (기존 유지)
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isImportant, setIsImportant] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- [Effects] ---
  useEffect(() => {
    if (partnerUid && currentUser) {
      checkPermissions();
      fetchNotices();
    }
  }, [partnerUid, currentUser]);

  // [NEW] 권한 체크 로직
  const checkPermissions = async () => {
    if (!currentUser) return;
    
    // 1. 내가 대표자인지 확인 (간단히 partnerUid와 내 uid 비교)
    if (currentUser.uid === partnerUid) {
      setIsPartner(true);
      setIsManager(true); // 대표는 슈퍼 관리자
      return;
    }

    // 2. 관리자 목록에 포함되어 있는지 확인
    try {
      const configRef = doc(db, 'users', partnerUid, 'config', 'notice_permissions');
      const configSnap = await getDoc(configRef);
      if (configSnap.exists()) {
        const managers = configSnap.data().managers || [];
        if (managers.includes(currentUser.uid)) {
          setIsManager(true);
        }
      }
    } catch (e) {
      console.error("권한 확인 실패", e);
    }
  };

  const fetchNotices = async () => {
    if (!partnerUid) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'users', partnerUid, 'notices'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as NoticeData[];
      setNotices(list);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // --- [Handlers] ---
  // ... (handleOpenWrite, handleSaveNotice, file handler 등 기존 유지)
  const handleOpenWrite = () => {
    setTitle(''); setContent(''); setIsImportant(false); setAttachedFiles([]);
    setIsWriteModalOpen(true);
  };

  const handleSaveNotice = async () => {
    // ... (기존 저장 로직 동일)
    if (!title.trim() || !content.trim()) return alert("내용 입력 필요");
    setIsSubmitting(true);
    try {
        const fileNames = attachedFiles.map(f => f.name);
        await addDoc(collection(db, 'users', partnerUid, 'notices'), {
            title, content, isImportant,
            authorName: currentUser?.displayName || '직원',
            authorUid: currentUser?.uid,
            attachments: fileNames, views: 0, createdAt: Timestamp.now(),
        });
        setIsWriteModalOpen(false); fetchNotices();
    } catch(e) { console.error(e); } finally { setIsSubmitting(false); }
  };

  // [NEW] 삭제 핸들러 (권한 체크)
  const handleDeleteNotice = async () => {
    if (!selectedNotice || !currentUser) return;
    
    const isAuthor = selectedNotice.authorUid === currentUser.uid;
    if (!isAuthor && !isManager) { // 작성자도 아니고 관리자도 아니면
        alert("삭제 권한이 없습니다.");
        return;
    }

    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'users', partnerUid, 'notices', selectedNotice.id));
      setIsViewModalOpen(false);
      fetchNotices();
    } catch (e) { alert("삭제 실패"); }
  };

  // ... (handleFileSelect, handleDrop, removeFile 등 유지)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        setAttachedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };
  const removeFile = (idx: number) => setAttachedFiles(prev => prev.filter((_, i) => i !== idx));

  // --- [Helper] ---
  // 현재 사용자가 해당 공지를 수정/삭제할 수 있는지 판별
  const canManageNotice = (notice: NoticeData) => {
      if (!currentUser) return false;
      return isManager || notice.authorUid === currentUser.uid;
  };

  // Filtering
  const filteredNotices = notices.filter(n => n.title.includes(searchQuery) || n.content.includes(searchQuery));
  const pinnedNotices = filteredNotices.filter(n => n.isImportant);
  const normalNotices = filteredNotices.filter(n => !n.isImportant);

  return (
    <div className="notice-page">
      <div className="notice-header">
        <div className="header-left">
          <h2 className="page-title">사내 공지사항</h2>
          <p className="page-desc">구성원들에게 중요한 소식과 업데이트를 공유하세요.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
            {/* [NEW] 파트너에게만 보이는 설정 버튼 */}
            {isPartner && (
                <button className="btn-write btn-setting" onClick={() => setIsPermModalOpen(true)} style={{ background: 'white', color: '#555', border: '1px solid #ddd' }}>
                    <Icons.Settings />
                    <span>권한 설정</span>
                </button>
            )}
            <button className="btn-write" onClick={handleOpenWrite}>
                <Icons.Plus />
                <span>공지 작성</span>
            </button>
        </div>
      </div>

      <div className="notice-toolbar">
        <div className="search-box">
          <Icons.Search />
          <input type="text" placeholder="제목, 내용으로 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </div>

      <div className="notice-list-container">
        {loading ? <div className="loading-state">로딩 중...</div> : filteredNotices.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Icons.Megaphone /></div><p>등록된 공지사항이 없습니다.</p></div>
        ) : (
          <>
            {pinnedNotices.length > 0 && (
              <div className="pinned-section">
                <h4 className="section-label"><Icons.Pin /> 필독 공지</h4>
                <div className="notice-grid">
                  {pinnedNotices.map(n => <NoticeCard key={n.id} notice={n} onClick={() => { setSelectedNotice(n); setIsViewModalOpen(true); }} isPinned />)}
                </div>
              </div>
            )}
            <div className="normal-section">
              {pinnedNotices.length > 0 && <h4 className="section-label">전체 공지</h4>}
              <div className="notice-grid">
                {normalNotices.map(n => <NoticeCard key={n.id} notice={n} onClick={() => { setSelectedNotice(n); setIsViewModalOpen(true); }} />)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Write Modal (기존 유지) */}
      {isWriteModalOpen && (
        <div className="n-modal-overlay">
          <div className="n-modal-content write-mode">
             {/* ... (기존 작성 모달 JSX 그대로 유지) ... */}
             <div className="n-modal-header"><h3>새로운 공지 작성</h3><button onClick={() => setIsWriteModalOpen(false)} className="n-close-btn"><Icons.Close /></button></div>
             <div className="n-modal-body">
                <div className="n-input-group"><label>제목</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} /></div>
                <div className="n-input-group toggle-group">
                    <label className="toggle-label"><input type="checkbox" checked={isImportant} onChange={e => setIsImportant(e.target.checked)} /><span className="toggle-switch"></span><span className="toggle-text">상단 고정 (필독)</span></label>
                </div>
                <div className="n-input-group flex-grow"><label>내용</label><textarea value={content} onChange={e => setContent(e.target.value)} /></div>
                <div className="n-input-group">
                    <label>첨부파일</label>
                    <div className="file-drop-zone" onDragOver={e => e.preventDefault()} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                        <input type="file" multiple ref={fileInputRef} hidden onChange={handleFileSelect} />
                        <div className="drop-content"><div className="drop-icon"><Icons.Upload /></div><p>클릭 또는 드래그하여 파일 첨부</p></div>
                    </div>
                    {attachedFiles.length > 0 && <div className="file-list">{attachedFiles.map((f, i) => <div key={i} className="file-item"><Icons.File /><span>{f.name}</span><button onClick={(e) => {e.stopPropagation(); removeFile(i)}} className="file-remove">×</button></div>)}</div>}
                </div>
             </div>
             <div className="n-modal-footer"><button className="btn-cancel" onClick={() => setIsWriteModalOpen(false)}>취소</button><button className="btn-submit" onClick={handleSaveNotice} disabled={isSubmitting}>공지 등록</button></div>
          </div>
        </div>
      )}

      {/* View Modal (권한 로직 추가) */}
      {isViewModalOpen && selectedNotice && (
        <div className="n-modal-overlay">
          <div className="n-modal-content view-mode">
            <div className="n-modal-header">
                <div className="view-header-top">
                    {selectedNotice.isImportant && <span className="badge-important">필독</span>}
                    <span className="view-date">{selectedNotice.createdAt?.toDate().toLocaleDateString()}</span>
                </div>
                <div className="view-actions">
                    {/* [NEW] 권한이 있을 때만 삭제 버튼 노출 */}
                    {canManageNotice(selectedNotice) && (
                        <button onClick={handleDeleteNotice} className="btn-icon-action" title="삭제"><Icons.Trash /></button>
                    )}
                    <button onClick={() => setIsViewModalOpen(false)} className="n-close-btn"><Icons.Close /></button>
                </div>
            </div>
            {/* ... (본문 내용 동일) ... */}
            <div className="n-modal-body">
                <h2 className="view-title">{selectedNotice.title}</h2>
                <div className="view-meta"><span className="author">작성자: <strong>{selectedNotice.authorName}</strong></span><span className="views">조회 {selectedNotice.views}</span></div>
                <div className="view-divider"></div>
                <div className="view-content">{selectedNotice.content.split('\n').map((line, i) => <p key={i}>{line}</p>)}</div>
                {selectedNotice.attachments && selectedNotice.attachments.length > 0 && (
                    <div className="view-attachments"><h4>첨부파일</h4><div className="file-list">{selectedNotice.attachments.map((f, i) => <div key={i} className="file-item readonly"><Icons.File /><span>{f}</span></div>)}</div></div>
                )}
            </div>
            <div className="n-modal-footer"><button className="btn-primary-wide" onClick={() => setIsViewModalOpen(false)}>확인</button></div>
          </div>
        </div>
      )}

      {/* [NEW] 권한 설정 모달 */}
      {isPermModalOpen && (
        <NoticePermissionModal partnerUid={partnerUid} onClose={() => setIsPermModalOpen(false)} />
      )}
    </div>
  );
};

const NoticeCard: React.FC<{ notice: NoticeData, onClick: () => void, isPinned?: boolean }> = ({ notice, onClick, isPinned }) => {
  return (
    <div className={`notice-card ${isPinned ? 'pinned' : ''}`} onClick={onClick}>
      <div className="card-top">
        {isPinned && <div className="pin-icon"><Icons.Pin /></div>}
        <h3 className="card-title">{notice.title}</h3>
      </div>
      <p className="card-preview">{notice.content}</p>
      <div className="card-footer">
        <span className="card-author">{notice.authorName}</span>
        <span className="card-date">{notice.createdAt?.toDate().toLocaleDateString()}</span>
      </div>
    </div>
  );
};

export default CompanyNoticePage;