import React, { useState, useEffect } from 'react';
import { 
  getFirestore, collection, addDoc, serverTimestamp, doc, getDoc 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../firebase-config'; 
import './WorkLogModal.css';

interface WorkLogModalProps {
  siteId: string;
  partnerUid: string; // [중요] 이 값이 '대표님 UID'여야 합니다.
  onClose: () => void;
}

const WorkLogModal: React.FC<WorkLogModalProps> = ({ siteId, partnerUid, onClose }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [workDate, setWorkDate] = useState(todayStr); 
  const [todayProcess, setTodayProcess] = useState('');
  const [tomorrowProcess, setTomorrowProcess] = useState('');
  const [siteIssues, setSiteIssues] = useState('');
  const [clientMeeting, setClientMeeting] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [siteName, setSiteName] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const db = getFirestore();
  const storage = getStorage();

  useEffect(() => {
    const fetchData = async () => {
      if (siteId && partnerUid) {
        const siteDoc = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId));
        if (siteDoc.exists()) setSiteName(siteDoc.data().siteName || '-');
      }
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setAuthorName(data.nickname || data.name || '직원');
        }
      }
    };
    fetchData();
  }, [db, partnerUid, siteId]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (images.length + files.length > 6) return alert('최대 6장까지 가능합니다.');
      setImages([...images, ...files]);
      setImagePreviews([...imagePreviews, ...files.map(f => URL.createObjectURL(f))]);
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...images]; newImages.splice(index, 1); setImages(newImages);
    const newPreviews = [...imagePreviews]; newPreviews.splice(index, 1); setImagePreviews(newPreviews);
  };

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (images.length < 3) return alert('사진은 최소 3장 이상 필요합니다.');
    if (!todayProcess || !tomorrowProcess) return alert('공정 내용을 입력해주세요.');

    setIsSubmitting(true);

    try {
      // 1. 이미지 업로드
      const imageUrls: string[] = [];
      for (const file of images) {
        const storageRef = ref(storage, `workLogs/${siteId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        imageUrls.push(await getDownloadURL(storageRef));
      }

      // 2. 작업일지 저장 (users -> partnerUid -> sites -> siteId -> workLogs)
      await addDoc(collection(db, 'users', partnerUid, 'sites', siteId, 'workLogs'), {
        date: workDate,
        siteId, siteName, partnerUid,
        authorName, authorUid: auth.currentUser?.uid,
        todayProcess, tomorrowProcess,
        siteIssues: siteIssues || '특이사항 없음',
        clientMeeting: clientMeeting || '내용 없음',
        imageUrls,
        createdAt: serverTimestamp(),
      });

      // 3. [⭐ 로그 저장 경로 확정]
      // 무조건 users -> partnerUid -> activityLogs 에 저장합니다.
      console.log(`[DEBUG] 로그 저장 시도: users/${partnerUid}/activityLogs`);
      
      await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
        type: '작업일지',
        content: `[작업일지] ${authorName}님이 [${siteName}] 현장의 ${workDate} 작업일지를 등록했습니다.`,
        relatedId: siteId,
        createdAt: serverTimestamp(),
        isRead: false
      });

      alert('등록되었습니다.');
      onClose();
    } catch (error) {
      console.error(error);
      alert('등록 중 오류 발생');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000}}>
      <div className="worklog-modal">
        <div className="modal-header"><h2>작업일지 등록</h2><button className="close-btn" onClick={onClose}>&times;</button></div>
        <div className="worklog-form">
          <div className="form-group"><label>작성 날짜</label><input type="text" value={todayStr} disabled style={{background:'#e9ecef'}} /></div>
          <div className="form-group"><label>작업 날짜</label><input type="date" value={workDate} onChange={e=>setWorkDate(e.target.value)} /></div>
          <div className="form-group"><label>금일 작업 공정</label><textarea value={todayProcess} onChange={e=>setTodayProcess(e.target.value)} placeholder="입력하세요" /></div>
          <div className="form-group"><label>익일 작업 예정 공정</label><textarea value={tomorrowProcess} onChange={e=>setTomorrowProcess(e.target.value)} placeholder="입력하세요" /></div>
          <div className="form-group"><label>금일 현장 특이사항</label><textarea value={siteIssues} onChange={e=>setSiteIssues(e.target.value)} placeholder="입력하세요" /></div>
          <div className="form-group"><label>고객 미팅 내용</label><textarea value={clientMeeting} onChange={e=>setClientMeeting(e.target.value)} placeholder="입력하세요" /></div>
          <div className="form-group" style={{display:'block'}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><label>사진 첨부 (3~6장) <span className="required">*</span></label><input type="file" accept="image/*" multiple onChange={handleImageChange} /></div>
            <div className="image-preview-container">{imagePreviews.map((src, i) => <div key={i} className="image-preview"><img src={src} /><button onClick={()=>removeImage(i)}>✕</button></div>)}</div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn-cancel" onClick={onClose}>취소</button><button className="btn-submit" onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting?'등록 중...':'일지 등록'}</button></div>
      </div>
    </div>
  );
};
export default WorkLogModal;