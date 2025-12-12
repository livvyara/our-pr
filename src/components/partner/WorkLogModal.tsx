import React, { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import imageCompression from 'browser-image-compression';
import { sendSystemMessage } from '../../utils/chatService'; 
import './a_partnerprogrammodal.css'; // [중요] 공통 스타일 사용

// --- [Standard Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  Camera: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Trash: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
};

interface Props {
  siteId: string; siteName?: string; partnerUid: string; onClose: () => void; onSuccess?: () => void;
}

const WorkLogModal: React.FC<Props> = ({ siteId, siteName, partnerUid, onClose, onSuccess }) => {
  const db = getFirestore();
  const storage = getStorage();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (images.length + files.length > 6) return alert("사진은 최대 6장까지 첨부할 수 있습니다.");

    const newFiles: File[] = [];
    const newUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const compressedFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
            newFiles.push(compressedFile);
            
            const reader = new FileReader();
            reader.readAsDataURL(compressedFile);
            await new Promise<void>((resolve) => {
                reader.onload = () => { newUrls.push(reader.result as string); resolve(); };
            });
        } catch (error) { console.error("Image error:", error); }
    }
    setImages(prev => [...prev, ...newFiles]);
    setPreviewUrls(prev => [...prev, ...newUrls]);
    if (e.target) e.target.value = '';
  };

  const removeImage = (index: number) => {
      setImages(prev => prev.filter((_, i) => i !== index));
      setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!todayWork.trim()) return alert("금일 작업 공정은 필수 입력입니다.");
    if (images.length < 3) return alert("현장 사진은 최소 3장 이상 첨부해야 합니다.");
    
    setIsSubmitting(true);
    try {
        const imageUrls: string[] = [];
        const tempId = Date.now().toString(); 
        for (let i = 0; i < images.length; i++) {
            const storageRef = ref(storage, `users/${partnerUid}/sites/${siteId}/workLogs/${tempId}_${i}`);
            await uploadBytes(storageRef, images[i]);
            imageUrls.push(await getDownloadURL(storageRef));
        }

        const logData = {
            writeDate, workDate, todayWork, nextWork, issues, meetingLog,
            images: imageUrls, author: currentUserName, authorUid: auth.currentUser?.uid, createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, 'users', partnerUid, 'sites', siteId, 'workLogs'), logData);
        await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
            text: `[작업일지] ${currentUserName}님이 ${workDate} 일지를 등록했습니다.`,
            type: 'work_log', createdAt: serverTimestamp(), relatedId: docRef.id
        });

        await sendSystemMessage(siteId, `[알림] ${siteName || '현장'} ${workDate}의 작업일지가 등록되었습니다.`);
        alert("작업일지가 성공적으로 등록되었습니다.");
        if (onSuccess) onSuccess();
        onClose();
    } catch (error) { console.error("Error:", error); alert("일지 등록 중 오류가 발생했습니다."); } 
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="ppm-overlay" onClick={onClose}>
      <div className="ppm-container" onClick={e => e.stopPropagation()}>
        
        {/* 공통 헤더 */}
        <div className="ppm-header">
          <div className="ppm-title">
            <h3>작업일지 작성</h3>
          </div>
          <button className="ppm-close-btn" onClick={onClose} aria-label="닫기">
            <Icons.Close />
          </button>
        </div>

        {/* 공통 바디 */}
        <div className="ppm-body">
            <form id="worklog-form" onSubmit={handleSubmit}>
                
                {/* 1. 날짜 입력 */}
                <div className="ppm-grid-row">
                    <div className="ppm-col">
                        <label className="ppm-label">작성일</label>
                        <input type="text" className="ppm-input ppm-readonly" value={writeDate} disabled />
                    </div>
                    <div className="ppm-col">
                        <label className="ppm-label">작업일 <span className="ppm-req">*</span></label>
                        <input 
                            type="date" 
                            className="ppm-input" 
                            value={workDate} 
                            onChange={(e) => setWorkDate(e.target.value)} 
                            required 
                        />
                    </div>
                </div>

                <div className="ppm-divider"></div>

                {/* 2. 사진 업로드 (공통 스타일 기반 확장) */}
                <div className="ppm-form-group">
                    <label className="ppm-label">
                        현장 사진 <span className="ppm-req">*</span> (최소 3장)
                    </label>
                    <div className="ppm-gallery-container">
                        {/* 업로드 버튼 */}
                        <div className="ppm-upload-card" onClick={() => fileInputRef.current?.click()}>
                            <div className="ppm-upload-icon"><Icons.Camera /></div>
                            <span className="ppm-upload-text">{images.length}/6</span>
                            <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleImageChange} hidden />
                        </div>
                        
                        {/* 미리보기 리스트 */}
                        {previewUrls.map((url, idx) => (
                            <div key={idx} className="ppm-preview-card">
                                <img src={url} alt={`preview-${idx}`} />
                                <button type="button" className="ppm-preview-del" onClick={() => removeImage(idx)}>
                                    <Icons.Trash />
                                </button>
                                <span className="ppm-preview-idx">{idx + 1}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="ppm-divider"></div>

                {/* 3. 텍스트 입력 (공통 폼 스타일) */}
                <div className="ppm-form-group">
                    <label className="ppm-label">금일 작업 공정 <span className="ppm-req">*</span></label>
                    <textarea 
                        className="ppm-textarea main" 
                        value={todayWork} onChange={e => setTodayWork(e.target.value)} 
                        placeholder="오늘 진행한 작업 내용을 상세히 입력해주세요."
                    />
                </div>
                
                <div className="ppm-form-group">
                    <label className="ppm-label">익일 작업 예정</label>
                    <textarea 
                        className="ppm-textarea" 
                        value={nextWork} onChange={e => setNextWork(e.target.value)} 
                        placeholder="내일 진행할 작업 계획을 입력해주세요."
                    />
                </div>

                <div className="ppm-grid-row">
                    <div className="ppm-col">
                        <label className="ppm-label" style={{color:'#ef4444'}}>특이사항 (이슈)</label>
                        <textarea 
                            className="ppm-textarea short" 
                            value={issues} onChange={e => setIssues(e.target.value)} 
                            placeholder="현장 이슈 사항"
                            style={{backgroundColor:'#fff5f5'}}
                        />
                    </div>
                    <div className="ppm-col">
                        <label className="ppm-label" style={{color:'#3182f6'}}>미팅 내용</label>
                        <textarea 
                            className="ppm-textarea short" 
                            value={meetingLog} onChange={e => setMeetingLog(e.target.value)} 
                            placeholder="고객 요청사항 등"
                            style={{backgroundColor:'#f0f9ff'}}
                        />
                    </div>
                </div>

            </form>
        </div>

        {/* 공통 푸터 */}
        <div className="ppm-footer">
            <button type="button" className="ppm-btn-secondary" onClick={onClose}>취소</button>
            <button 
                type="submit" form="worklog-form" 
                className="ppm-btn-primary" 
                disabled={isSubmitting}
            >
                {isSubmitting ? '저장 중...' : '작업일지 등록'}
            </button>
        </div>

      </div>
    </div>
  );
};

export default WorkLogModal;