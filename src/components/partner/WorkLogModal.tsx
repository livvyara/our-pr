import React, { useState, useEffect, type ChangeEvent, type FormEvent, useRef } from 'react';
import { 
  getFirestore, collection, addDoc, serverTimestamp, doc, getDoc 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import imageCompression from 'browser-image-compression';
import { sendSystemMessage } from '../../utils/chatService'; 
import './WorkLogModal.css'; 

interface Props {
  siteId: string;
  siteName?: string; 
  partnerUid: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// --- Icons (Clean SVG) ---
const Icons = {
    Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
    Camera: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>,
    Trash: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
};

const WorkLogModal: React.FC<Props> = ({ siteId, siteName, partnerUid, onClose, onSuccess }) => {
  const db = getFirestore();
  const storage = getStorage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [writeDate] = useState(new Date().toISOString().slice(0, 10)); 
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10)); 
  
  const [todayWork, setTodayWork] = useState('');     
  const [nextWork, setNextWork] = useState('');       
  const [issues, setIssues] = useState('');           
  const [meetingLog, setMeetingLog] = useState('');   
  
  const [images, setImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('직원');

  useEffect(() => {
    const fetchUser = async () => {
        if (auth.currentUser) {
            const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
            if (snap.exists()) {
                const d = snap.data();
                setCurrentUserName(d.nickname || d.name || '직원');
            }
        }
    };
    fetchUser();
  }, [db]);

  // Image Handling
  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 6) {
        alert("사진은 최대 6장까지 첨부할 수 있습니다.");
        return;
    }

    const newFiles: File[] = [];
    const newUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const compressedFile = await imageCompression(file, {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true
            });
            newFiles.push(compressedFile);
            
            // Preview Generation
            const reader = new FileReader();
            reader.readAsDataURL(compressedFile);
            await new Promise<void>((resolve) => {
                reader.onload = () => {
                    newUrls.push(reader.result as string);
                    resolve();
                };
            });
        } catch (error) {
            console.error("이미지 처리 실패:", error);
        }
    }

    setImages(prev => [...prev, ...newFiles]);
    setPreviewUrls(prev => [...prev, ...newUrls]);
    if (e.target) e.target.value = '';
  };

  const removeImage = (index: number) => {
      setImages(prev => prev.filter((_, i) => i !== index));
      setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  // Submit Logic
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!todayWork.trim()) return alert("금일 작업 공정은 필수 입력입니다.");
    if (images.length < 3) return alert("현장 사진은 최소 3장 이상 첨부해야 합니다.");
    
    setIsSubmitting(true);

    try {
        const imageUrls: string[] = [];
        const tempId = Date.now().toString(); 

        for (let i = 0; i < images.length; i++) {
            const file = images[i];
            const storageRef = ref(storage, `users/${partnerUid}/sites/${siteId}/workLogs/${tempId}_${i}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            imageUrls.push(url);
        }

        const logData = {
            writeDate,
            workDate,
            todayWork,
            nextWork,
            issues,
            meetingLog,
            images: imageUrls,
            author: currentUserName,
            authorUid: auth.currentUser?.uid,
            createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, 'users', partnerUid, 'sites', siteId, 'workLogs'), logData);

        await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
            text: `[작업일지] ${currentUserName}님이 ${workDate} 일지를 등록했습니다.`,
            type: 'work_log',
            createdAt: serverTimestamp(),
            relatedId: docRef.id
        });

        const targetSiteName = siteName || '현장';
        const message = `[알림] ${targetSiteName} ${workDate}의 작업일지가 등록되었습니다.`;
        await sendSystemMessage(siteId, message);

        alert("작업일지가 성공적으로 등록되었습니다.");
        if (onSuccess) onSuccess();
        onClose();

    } catch (error) {
        console.error("등록 실패:", error);
        alert("일지 등록 중 오류가 발생했습니다.");
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="worklog-modal-overlay" onClick={onClose}>
      <div className="worklog-modal-content" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="worklog-header">
          <h3 className="worklog-title">작업일지 작성</h3>
          <button className="btn-close-icon" onClick={onClose} aria-label="닫기">
            <Icons.Close />
          </button>
        </div>

        {/* Body */}
        <form className="worklog-body" onSubmit={handleSubmit}>
            
            {/* 날짜 섹션 */}
            <div className="wl-grid">
                <div className="wl-form-group">
                    <label className="wl-label">작성일</label>
                    <input type="text" className="wl-input" value={writeDate} disabled />
                </div>
                <div className="wl-form-group">
                    <label className="wl-label">작업일 <span className="wl-req-dot" title="필수입력"></span></label>
                    <input 
                        type="date" 
                        className="wl-input" 
                        value={workDate} 
                        onChange={(e) => setWorkDate(e.target.value)} 
                        required 
                    />
                </div>
            </div>

            {/* 작업 내용 섹션 */}
            <div className="wl-form-group">
                <label className="wl-label">금일 작업 공정 <span className="wl-req-dot"></span></label>
                <textarea 
                    className="wl-textarea" 
                    value={todayWork} 
                    onChange={e => setTodayWork(e.target.value)} 
                    placeholder="오늘 진행한 작업 내용을 상세히 입력해주세요."
                />
            </div>

            <div className="wl-form-group">
                <label className="wl-label">익일 작업 예정</label>
                <textarea 
                    className="wl-textarea" 
                    value={nextWork} 
                    onChange={e => setNextWork(e.target.value)} 
                    placeholder="내일 진행할 작업 계획을 입력해주세요."
                    style={{ minHeight: '80px' }}
                />
            </div>

            <div className="wl-grid">
                <div className="wl-form-group">
                    <label className="wl-label">특이사항</label>
                    <textarea 
                        className="wl-textarea" 
                        value={issues} 
                        onChange={e => setIssues(e.target.value)} 
                        placeholder="이슈사항을 입력하세요."
                        style={{ minHeight: '80px' }}
                    />
                </div>
                <div className="wl-form-group">
                    <label className="wl-label">미팅 내용</label>
                    <textarea 
                        className="wl-textarea" 
                        value={meetingLog} 
                        onChange={e => setMeetingLog(e.target.value)} 
                        placeholder="고객 요청사항 등"
                        style={{ minHeight: '80px' }}
                    />
                </div>
            </div>

            {/* 파일 업로드 섹션 */}
            <div className="wl-form-group">
                <label className="wl-label">
                    현장 사진 <span className="wl-req-dot"></span>
                    <span style={{fontWeight:'normal', color:'#94a3b8', marginLeft:'8px', fontSize:'12px'}}>
                        (3~6장 필수)
                    </span>
                </label>
                
                <div 
                    className="wl-upload-zone" 
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input 
                        ref={fileInputRef}
                        type="file" 
                        multiple 
                        accept="image/*" 
                        onChange={handleImageChange} 
                        style={{display:'none'}} 
                    />
                    <div className="upload-icon-circle">
                        <Icons.Camera />
                    </div>
                    <div>
                        <div className="upload-title">사진 추가하기</div>
                        <div className="upload-desc">클릭하여 파일을 선택하거나 이곳에 드래그하세요</div>
                    </div>
                </div>

                {/* 이미지 미리보기 */}
                {previewUrls.length > 0 && (
                    <div className="wl-preview-grid">
                        {previewUrls.map((url, idx) => (
                            <div key={idx} className="wl-preview-item">
                                <img src={url} alt={`현장사진-${idx+1}`} className="wl-preview-img" />
                                <button type="button" className="btn-remove-preview" onClick={() => removeImage(idx)} title="삭제">
                                    <Icons.Trash />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </form>

        {/* Footer */}
        <div className="worklog-footer">
            <button 
                type="button" 
                className="wl-btn wl-btn-secondary" 
                onClick={onClose}
            >
                취소
            </button>
            <button 
                type="button" 
                className="wl-btn wl-btn-primary" 
                onClick={handleSubmit}
                style={{backgroundColor: K_BRAND_COLOR}} 
                disabled={isSubmitting}
            >
                {isSubmitting ? '저장 중...' : '등록 완료'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default WorkLogModal;