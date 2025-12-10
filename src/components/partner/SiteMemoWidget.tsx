import React, { useState, useEffect, useRef, type FormEvent } from 'react';
import { 
  getFirestore, collection, addDoc, query, orderBy, onSnapshot, 
  serverTimestamp, deleteDoc, doc, getDoc, updateDoc, Timestamp 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import './SiteMemoWidget.css';

// --- 아이콘 컴포넌트 (유지) ---
const StarIconOutline = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 2.882l2.34 6.896 7.33.62-5.45 4.755 1.6 7.15-6.82-3.95-6.82 3.95 1.6-7.15-5.45-4.755 7.33-.62L10 2.882zM10 5.17l-1.88 5.545-5.91.5-4.39 3.83.97 5.75 5.21-3.02L10 17.675l5.21 3.02.97-5.75-4.39-3.83-5.91-.5L10 5.17z" clipRule="evenodd" />
  </svg>
);
const StarIconSolid = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l2.07 6.362a1 1 0 00.95.69h6.683c.969 0 1.371 1.24.588 1.81l-5.4 3.924a1 1 0 00-.364 1.118l2.07 6.362c.3.921-.755 1.688-1.54 1.118l-5.4-3.924a1 1 0 00-1.176 0l-5.4 3.924c-.784.57-1.838-.197-1.54-1.118l2.07-6.362a1 1 0 00-.364-1.118L.49 11.789c-.783-.57-.38-1.81.588-1.81h6.683a1 1 0 00.95-.69L9.049 2.927z" />
  </svg>
);
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
  </svg>
);
const AssignmentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 11a1 1 0 10-2 0v1a1 1 0 102 0v-1zm1-1.21a4.978 4.978 0 00-1.272-3.41A5.006 5.006 0 0012 3a1 1 0 100 2c.57 0 1.117.128 1.6.347l1.761-1.76a1 1 0 10-1.414-1.415L12.182 4.07A5.022 5.022 0 008 3a5 5 0 00-4.92 4.757A4.978 4.978 0 001.272 11.17A5.006 5.006 0 004 17a1 1 0 102 0 3 3 0 01-3-3c0-.57.128-1.117.347-1.6L6.24 10.636a1 1 0 101.414 1.414l-1.76 1.76A4.978 4.978 0 008 14a5 5 0 004.92-4.757 4.978 4.978 0 001.808-3.41z" />
  </svg>
);
const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);


interface MemoData {
  id: string;
  memoContent: string;
  memoType: 'general' | 'meeting';
  createdByUid: string;
  createdByName: string;
  createdAt: Timestamp;
  meetingDate?: string;
  meetingTime?: string;
  partnerUid: string;
  siteId: string;
  siteName: string;
}

interface SiteMemoWidgetProps {
  siteId: string;
  partnerUid: string;
  siteName: string;
}

const formatMemoTimestamp = (ts: Timestamp | null | undefined): string => {
  if (!ts) return "날짜 없음";
  const d = ts.toDate();
  const Y = d.getFullYear().toString().slice(-2);
  const M = (d.getMonth() + 1).toString().padStart(2, '0');
  const D = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}`;
};

const dateToInputString = (ts: Date): string => {
    const Y = ts.getFullYear();
    const M = (ts.getMonth() + 1).toString().padStart(2, '0');
    const D = ts.getDate().toString().padStart(2, '0');
    const h = ts.getHours().toString().padStart(2, '0');
    const m = ts.getMinutes().toString().padStart(2, '0');
    return `${Y}-${M}-${D}T${h}:${m}`;
};

const SiteMemoWidget: React.FC<SiteMemoWidgetProps> = ({ siteId, partnerUid, siteName }) => {
  const [memos, setMemos] = useState<MemoData[]>([]);
  const [pinnedMemoId, setPinnedMemoId] = useState<string | null>(null);
  const [newMemoText, setNewMemoText] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');

  const [showMeetingPicker, setShowMeetingPicker] = useState(false);
  const [meetingDateTime, setMeetingDateTime] = useState<Date | null>(null);

  const memoListRef = useRef<HTMLDivElement>(null); 
  const db = getFirestore();

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const userDocRef = doc(db, 'users', currentUser.uid);
      getDoc(userDocRef).then(docSnap => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          setCurrentUserName(userData.nickname || userData.name || '관리자');
        }
      });
    }
  }, [db]);

  useEffect(() => {
    if (!partnerUid || !siteId) return;
    const siteDocRef = doc(db, 'users', partnerUid, 'sites', siteId);
    const unsubscribeSite = onSnapshot(siteDocRef, (doc) => {
      if (doc.exists()) {
        setPinnedMemoId(doc.data().pinnedMemoId || null);
      }
    });
    return () => unsubscribeSite();
  }, [db, siteId, partnerUid]);

  useEffect(() => {
    if (!partnerUid || !siteId) return;
    const memosRef = collection(db, 'users', partnerUid, 'sites', siteId, 'memos');
    const q = query(memosRef, orderBy("createdAt", "asc"));

    setIsLoading(true);
    const unsubscribeMemos = onSnapshot(q, (querySnapshot) => {
      const memoList: MemoData[] = [];
      querySnapshot.forEach((doc) => {
        memoList.push({ id: doc.id, ...doc.data() } as MemoData);
      });
      setMemos(memoList);
      setIsLoading(false);
    });
    return () => unsubscribeMemos();
  }, [db, siteId, partnerUid]); 

  useEffect(() => {
    if (memoListRef.current) {
      memoListRef.current.scrollTop = memoListRef.current.scrollHeight;
    }
  }, [memos]); 

  const handlePinMemo = async (memoId: string | null) => {
    if (!partnerUid || !siteId) return;
    const newPinnedId = pinnedMemoId === memoId ? null : memoId;
    const siteDocRef = doc(db, 'users', partnerUid, 'sites', siteId);
    try {
      await updateDoc(siteDocRef, { pinnedMemoId: newPinnedId });
    } catch (error) { console.error("메모 고정 오류:", error); }
  };
  
  const handleDeleteMemo = async (memoId: string) => {
    if (!partnerUid || !siteId) return;
    if (!window.confirm("이 메모를 삭제하시겠습니까?")) return;
    try {
      if (pinnedMemoId === memoId) await handlePinMemo(null);
      const memoDocRef = doc(db, 'users', partnerUid, 'sites', siteId, 'memos', memoId);
      await deleteDoc(memoDocRef);
    } catch (error) { console.error("메모 삭제 오류:", error); }
  };

  const handleSubmitMemo = async (e: FormEvent) => {
    e.preventDefault();
    if (newMemoText.trim() === '' || !currentUserName || !partnerUid || !siteId) {
      alert("메모 내용이 비어있습니다.");
      return;
    }
    
    setIsSubmitting(true);
    const currentUser = auth.currentUser;
    
    try {
      const memosRef = collection(db, 'users', partnerUid, 'sites', siteId, 'memos');
      
      const memoData: any = {
        memoContent: newMemoText,
        createdByUid: currentUser?.uid || 'unknown',
        createdByName: currentUserName, 
        createdAt: serverTimestamp(),
        partnerUid: partnerUid,
        siteId: siteId,
        siteName: siteName,
      };
      
      if (meetingDateTime) {
        memoData.memoType = 'meeting';
        memoData.meetingDate = meetingDateTime.toISOString().split('T')[0]; 
        memoData.meetingTime = meetingDateTime.toTimeString().split(' ')[0].substring(0, 5);
      } else {
        memoData.memoType = 'general';
      }
      
      await addDoc(memosRef, memoData);
      
      setNewMemoText('');
      setMeetingDateTime(null);
      setShowMeetingPicker(false);
      
    } catch (error) { console.error("메모 등록 오류:", error); } 
    finally { setIsSubmitting(false); }
  };

  // 렌더링용 리스트 정렬 (고정 메모 상단 + 나머지 최신순) -> 채팅형은 보통 최신이 아래로
  // 요청하신 디자인은 채팅형(카톡)과 유사하므로 고정 메모는 별도 표시하거나 상단에 둘 수 있음.
  // 여기서는 단순히 리스트를 렌더링하고 고정 스타일을 적용함.

  return (
    <div className="site-memo-widget">
      <div className="memo-header-row">
        <h3>현장 메모</h3>
      </div>
      
      {/* 메모 리스트 */}
      <div className="memo-list-area" ref={memoListRef}>
        {isLoading ? <p className="memo-empty">로딩 중...</p> : 
         memos.length === 0 ? <p className="memo-empty">등록된 메모가 없습니다.</p> :
         memos.map(memo => (
            <div key={memo.id} className={`memo-card ${pinnedMemoId === memo.id ? 'pinned' : ''}`}>
                <div className="memo-card-header">
                    <div className="memo-info">
                        <span className="memo-author">{memo.createdByName}</span>
                        <span className="memo-date">{formatMemoTimestamp(memo.createdAt)}</span>
                    </div>
                    <div className="memo-actions">
                        <button 
                            className={`btn-icon pin ${pinnedMemoId === memo.id ? 'pinned' : ''}`}
                            onClick={() => handlePinMemo(memo.id)}
                            title="고정"
                        >
                            {pinnedMemoId === memo.id ? <StarIconSolid /> : <StarIconOutline />}
                        </button>
                        <button className="btn-icon delete" onClick={() => handleDeleteMemo(memo.id)} title="삭제">
                            <DeleteIcon />
                        </button>
                    </div>
                </div>
                
                <div className="memo-content">{memo.memoContent}</div>
                
                {memo.memoType === 'meeting' && memo.meetingDate && (
                    <div className="memo-meeting-info">
                        <CalendarIcon />
                        <span>{memo.meetingDate} {memo.meetingTime}</span>
                    </div>
                )}
            </div>
         ))
        }
      </div>

      {/* 입력 영역 */}
      <div className="memo-input-container">
        {/* 툴바 (미팅, 업무지시 버튼) */}
        <div className="memo-toolbar">
            <button 
                className={`toolbar-btn ${showMeetingPicker ? 'active' : ''}`} 
                onClick={() => setShowMeetingPicker(!showMeetingPicker)}
                title="미팅 약속"
            >
                <CalendarIcon />
            </button>
            <button 
                className="toolbar-btn" 
                onClick={() => alert('업무지시 기능은 준비 중입니다.')}
                title="업무 지시"
            >
                <AssignmentIcon />
            </button>
        </div>

        {/* 날짜 선택기 (조건부 노출) */}
        {showMeetingPicker && (
            <div className="date-picker-box">
                <input 
                    type="datetime-local"
                    value={meetingDateTime ? dateToInputString(meetingDateTime) : ''}
                    onChange={(e) => setMeetingDateTime(e.target.value ? new Date(e.target.value) : null)}
                />
                <button className="btn-clear" onClick={() => { setMeetingDateTime(null); setShowMeetingPicker(false); }}>취소</button>
            </div>
        )}

        <form className="input-wrapper" onSubmit={handleSubmitMemo}>
            <textarea
                className="memo-textarea"
                placeholder={meetingDateTime ? "미팅 내용을 입력하세요..." : "메모를 입력하세요..."}
                value={newMemoText}
                onChange={(e) => setNewMemoText(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitMemo(e); }}}
            />
            <button type="submit" className="btn-send" style={{ backgroundColor: K_BRAND_COLOR }} disabled={isSubmitting}>
                등록
            </button>
        </form>
      </div>
    </div>
  );
};

export default SiteMemoWidget;