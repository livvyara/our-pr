import React, { useState, useEffect } from 'react';
import { 
  getFirestore, collection, addDoc, serverTimestamp, doc, getDoc 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../firebase-config'; 

// [중요] CSS 파일 import를 제거했습니다.

interface WorkLogModalProps {
  siteId: string;
  partnerUid: string;
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
      const imageUrls: string[] = [];
      for (const file of images) {
        const storageRef = ref(storage, `workLogs/${siteId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        imageUrls.push(await getDownloadURL(storageRef));
      }

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
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* 헤더 */}
        <div style={styles.header}>
          <h2 style={styles.title}>작업일지 등록</h2>
          <button onClick={onClose} style={styles.closeBtn}>&times;</button>
        </div>
        
        {/* 폼 영역 */}
        <div style={styles.formContainer}>
          
          {/* 날짜 행 (flex로 2개 나란히) */}
          <div style={styles.dateRow}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={styles.label}>작성 날짜</label>
              <input type="text" value={todayStr} disabled style={{ ...styles.input, background: '#f5f5f5', color: '#999' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={styles.label}>작업 날짜</label>
              <input type="date" value={workDate} onChange={e=>setWorkDate(e.target.value)} style={styles.input} />
            </div>
          </div>

          <div style={styles.divider} />

          {/* 입력 필드들 (Grid 레이아웃 강제 적용) */}
          <div style={styles.inputGroup}>
            <label style={styles.labelLeft}>금일 작업 공정</label>
            <textarea 
              value={todayProcess} 
              onChange={e=>setTodayProcess(e.target.value)} 
              placeholder="작업 내용을 상세히 입력하세요" 
              style={styles.textarea} 
            />
          </div>
          
          <div style={styles.inputGroup}>
            <label style={styles.labelLeft}>익일 작업 예정</label>
            <textarea 
              value={tomorrowProcess} 
              onChange={e=>setTomorrowProcess(e.target.value)} 
              placeholder="내일 예정된 작업을 입력하세요" 
              style={styles.textarea} 
            />
          </div>
          
          <div style={styles.inputGroup}>
            <label style={styles.labelLeft}>현장 특이사항</label>
            <textarea 
              value={siteIssues} 
              onChange={e=>setSiteIssues(e.target.value)} 
              placeholder="이슈 사항이 있다면 기록하세요" 
              style={styles.textarea} 
            />
          </div>
          
          <div style={styles.inputGroup}>
            <label style={styles.labelLeft}>고객 미팅 내용</label>
            <textarea 
              value={clientMeeting} 
              onChange={e=>setClientMeeting(e.target.value)} 
              placeholder="고객 요청사항 등" 
              style={styles.textarea} 
            />
          </div>

          {/* 사진 첨부 영역 */}
          <div style={styles.inputGroup}>
            <label style={styles.labelLeft}>
              현장 사진 <span style={{color:'red'}}>*</span>
              <br/><span style={{fontSize:'11px', color:'#888', fontWeight:'normal'}}>(3~6장)</span>
            </label>
            <div style={styles.fileUploadBox}>
               <input type="file" accept="image/*" multiple onChange={handleImageChange} style={{marginBottom: '10px'}} />
               <div style={styles.previewContainer}>
                   {imagePreviews.map((src, i) => (
                       <div key={i} style={styles.previewWrapper}>
                           <img src={src} alt="preview" style={styles.previewImg} />
                           <button onClick={()=>removeImage(i)} style={styles.removeBtn}>✕</button>
                       </div>
                   ))}
               </div>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div style={styles.footer}>
            <button onClick={onClose} style={styles.cancelBtn}>취소</button>
            <button onClick={handleSubmit} disabled={isSubmitting} style={styles.submitBtn}>
                {isSubmitting ? '등록 중...' : '일지 등록'}
            </button>
        </div>
      </div>
    </div>
  );
};

// [스타일 정의] 외부 CSS 파일 없이 여기서 모든 스타일을 통제합니다.
const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 9999, backdropFilter: 'blur(3px)'
  },
  modal: {
    backgroundColor: '#fff', width: '650px', maxWidth: '95%', maxHeight: '90vh',
    borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden'
  },
  header: {
    padding: '15px 20px', borderBottom: '1px solid #eee',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f8f9fa'
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 700, color: '#333' },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#888'
  },
  formContainer: { padding: '20px', overflowY: 'auto', flex: 1 },
  dateRow: { display: 'flex', gap: '20px', marginBottom: '20px' },
  divider: { height: '1px', backgroundColor: '#eee', margin: '0 0 20px 0' },
  
  // [강력한 정렬] Grid를 사용하여 라벨(120px)과 입력창(나머지)을 강제로 분할
  inputGroup: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr', // 왼쪽 120px 고정, 나머지 자동 채움
    gap: '15px',
    marginBottom: '20px',
    alignItems: 'start' // 라벨을 위쪽 라인에 맞춤
  },
  label: { fontSize: '14px', fontWeight: 600, color: '#444' },
  labelLeft: { 
    fontSize: '14px', fontWeight: 600, color: '#444', 
    paddingTop: '10px' // 입력창 텍스트 높이와 시각적 중심 맞춤
  },
  input: {
    width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '5px',
    fontSize: '14px', boxSizing: 'border-box' // 패딩 포함 크기 계산
  },
  textarea: {
    width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '5px',
    fontSize: '14px', minHeight: '80px', resize: 'vertical', fontFamily: 'inherit',
    boxSizing: 'border-box'
  },
  fileUploadBox: {
    border: '1px dashed #ccc', padding: '15px', borderRadius: '5px', backgroundColor: '#fafafa', width: '100%', boxSizing: 'border-box'
  },
  previewContainer: { display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' },
  previewWrapper: {
    position: 'relative', width: '70px', height: '70px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #eee'
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  removeBtn: {
    position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#fff',
    border: 'none', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px'
  },
  footer: {
    padding: '15px 20px', borderTop: '1px solid #eee',
    display: 'flex', justifyContent: 'flex-end', gap: '10px', backgroundColor: '#fff'
  },
  cancelBtn: {
    padding: '10px 20px', border: '1px solid #ddd', backgroundColor: '#fff', 
    color: '#666', borderRadius: '5px', cursor: 'pointer', fontWeight: 500
  },
  submitBtn: {
    padding: '10px 30px', 
    backgroundColor: '#4a90e2', // 브랜드 컬러
    border: 'none', 
    color: '#fff', 
    borderRadius: '5px', // [요청사항] 래디우스 5
    cursor: 'pointer', 
    fontWeight: 600
  }
};

export default WorkLogModal;