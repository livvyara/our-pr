import React, { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
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

const WorkLogModal: React.FC<Props> = ({ siteId, siteName, partnerUid, onClose, onSuccess }) => {
  const db = getFirestore();
  const storage = getStorage();

  // --- [Form States] ---
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

  // [이미지 핸들러]
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
  };

  const removeImage = (index: number) => {
      setImages(prev => prev.filter((_, i) => i !== index));
      setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  // [제출 핸들러]
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!todayWork) return alert("금일 작업 공정을 입력해주세요.");
    
    // [수정] 사진 최소 3장 검사
    if (images.length < 3) {
        return alert("작업 사진을 최소 3장 이상 첨부해야 합니다.");
    }
    
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

        // 채팅방 알림 전송
        const targetSiteName = siteName || '현장';
        const message = `[알림] ${targetSiteName} ${workDate}의 작업일지가 등록 됐습니다.`;
        await sendSystemMessage(siteId, message);

        alert("작업일지가 등록되었습니다.");
        if (onSuccess) onSuccess();
        onClose();

    } catch (error) {
        console.error("등록 실패:", error);
        alert("오류가 발생했습니다.");
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="worklog-modal-overlay">
      <div className="worklog-modal-content">
        <div className="worklog-header">
          <h3>작업일지 등록</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form className="worklog-body" onSubmit={handleSubmit}>
            
            <div className="wl-row">
                <div className="wl-label">작성 날짜</div>
                <div className="wl-value read-only">{writeDate}</div>
            </div>
            
            <div className="wl-row">
                <div className="wl-label">작업 날짜</div>
                <div className="wl-value">
                    <input 
                        type="date" 
                        className="wl-input" 
                        value={workDate} 
                        onChange={(e) => setWorkDate(e.target.value)} 
                        required 
                    />
                </div>
            </div>

            <div className="wl-section">
                <label>금일 작업 공정</label>
                <textarea 
                    className="wl-textarea" 
                    value={todayWork} 
                    onChange={e => setTodayWork(e.target.value)} 
                    placeholder="입력하세요"
                />
            </div>

            <div className="wl-section">
                <label>익일 작업 예정 공정</label>
                <textarea 
                    className="wl-textarea" 
                    value={nextWork} 
                    onChange={e => setNextWork(e.target.value)} 
                    placeholder="입력하세요"
                />
            </div>

            <div className="wl-section">
                <label>금일 현장 특이사항</label>
                <textarea 
                    className="wl-textarea" 
                    value={issues} 
                    onChange={e => setIssues(e.target.value)} 
                    placeholder="입력하세요"
                />
            </div>

            <div className="wl-section">
                <label>고객 미팅 내용</label>
                <textarea 
                    className="wl-textarea" 
                    value={meetingLog} 
                    onChange={e => setMeetingLog(e.target.value)} 
                    placeholder="입력하세요"
                />
            </div>

            <div className="wl-section">
                <label>사진 첨부 (3~6장) <span className="req">*</span></label>
                <div className="file-upload-box">
                    <label htmlFor="wl-file-upload" className="btn-file-select">파일 선택</label>
                    <input 
                        id="wl-file-upload" 
                        type="file" 
                        multiple 
                        accept="image/*" 
                        onChange={handleImageChange} 
                        style={{display:'none'}} 
                    />
                    <span className="file-info">
                        {images.length === 0 ? '선택된 파일 없음' : `${images.length}개 파일 선택됨`}
                    </span>
                </div>
                <div className="preview-grid">
                    {previewUrls.map((url, idx) => (
                        <div key={idx} className="preview-item">
                            <img src={url} alt={`preview-${idx}`} />
                            <button type="button" className="btn-remove-img" onClick={() => removeImage(idx)}>×</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="worklog-footer">
                <button type="button" className="btn-cancel" onClick={onClose}>취소</button>
                <button type="submit" className="btn-submit" style={{backgroundColor: K_BRAND_COLOR}} disabled={isSubmitting}>
                    {isSubmitting ? '등록 중...' : '일지 등록'}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default WorkLogModal;