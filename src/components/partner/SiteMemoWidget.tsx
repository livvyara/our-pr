// src/components/partner/SiteMemoWidget.tsx

import React, { useState, useEffect, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './SiteMemoWidget.css'; // (CSS 파일 임포트)

// [⭐ 1. SVG 아이콘] (생략 없음)
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
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);


// [⭐ 1. 수정] Firestore 'memos' 하위 컬렉션 문서 타입 (캘린더 호환)
interface MemoData {
  id: string; // 문서 ID
  memoContent: string;
  memoType: 'general' | 'meeting';
  createdByUid: string;
  createdByName: string; // (닉네임/이름)
  createdAt: Timestamp;
  meetingDate?: string; // (YYYY-MM-DD)
  meetingTime?: string; // (HH:MM)
  partnerUid: string;
  siteId: string;
  siteName: string;
}

// [⭐ 2. 수정] Props (siteName 추가)
interface SiteMemoWidgetProps {
  siteId: string;
  partnerUid: string; // (이 현장의 소유자인 파트너의 UID)
  siteName: string; // (캘린더 표시에 필요)
}

// Timestamp를 'YY-MM-DD HH:MM' (로그 표시용)
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

// [⭐ 3. 수정] Timestamp를 'datetime-local' input 형식(YYYY-MM-DDTHH:MM)으로 변환
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
  const [pinnedMemo, setPinnedMemo] = useState<MemoData | null>(null);
  const [newMemoText, setNewMemoText] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [currentUserName, setCurrentUserName] = useState('');

  // [⭐ 4. 수정] 미팅 약속 state
  const [showMeetingPicker, setShowMeetingPicker] = useState(false);
  const [meetingDateTime, setMeetingDateTime] = useState<Date | null>(null); // (Date 객체 또는 null)

  const memoListRef = useRef<HTMLDivElement>(null); 
  const db = getFirestore();

  // 1. (Mount) 현재 로그인한 사용자의 닉네임/이름 가져오기
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

  // 2. (Realtime) 'sites' 문서 구독 (고정된 메모 ID 가져오기)
  useEffect(() => {
    if (!partnerUid || !siteId) return;
    
    const siteDocRef = doc(db, 'users', partnerUid, 'sites', siteId);
    
    const unsubscribeSite = onSnapshot(siteDocRef, (doc) => {
      if (doc.exists()) {
        setPinnedMemoId(doc.data().pinnedMemoId || null);
      }
    }, (error) => {
      console.error("고정 메모 ID 구독 오류:", error);
    });

    return () => unsubscribeSite();
  }, [db, siteId, partnerUid]);

  // 3. (Realtime) 'memos' 하위 컬렉션 구독 (메모 목록 가져오기)
  useEffect(() => {
    if (!partnerUid || !siteId) return;
    
    const memosRef = collection(db, 'users', partnerUid, 'sites', siteId, 'memos');
    const q = query(memosRef, orderBy("createdAt", "asc")); // 오래된 순 -> 최신 순

    setIsLoading(true);
    const unsubscribeMemos = onSnapshot(q, (querySnapshot) => {
      const memoList: MemoData[] = [];
      querySnapshot.forEach((doc) => {
        memoList.push({ id: doc.id, ...doc.data() } as MemoData);
      });
      
      setMemos(memoList); // 전체 메모 목록 설정
      
      // 고정된 메모 ID가 있으면, 목록에서 찾아서 PinnedMemo state에 설정
      if (pinnedMemoId) {
        setPinnedMemo(memoList.find(m => m.id === pinnedMemoId) || null);
      } else {
        setPinnedMemo(null);
      }
      setIsLoading(false);
      
    }, (error) => {
      console.error("메모 목록 구독 오류:", error);
      setIsLoading(false);
    });

    return () => unsubscribeMemos();
  }, [db, siteId, partnerUid, pinnedMemoId]); 

  // 4. [기능] 새 메모 추가 시 스크롤 하단으로 이동
  useEffect(() => {
    if (memoListRef.current) {
      memoListRef.current.scrollTop = memoListRef.current.scrollHeight;
    }
  }, [memos]); 

  // 5. [기능] 메모 고정/해제 핸들러
  const handlePinMemo = async (memoId: string | null) => {
    if (!partnerUid || !siteId) return;
    
    const newPinnedId = pinnedMemoId === memoId ? null : memoId;
    
    const siteDocRef = doc(db, 'users', partnerUid, 'sites', siteId);
    try {
      await updateDoc(siteDocRef, {
        pinnedMemoId: newPinnedId
      });
    } catch (error) {
      console.error("메모 고정 오류:", error);
      alert("메모 고정/해제 중 오류가 발생했습니다.");
    }
  };
  
  // 6. [기능] 메모 삭제 핸들러
  const handleDeleteMemo = async (memoId: string) => {
    if (!partnerUid || !siteId) return;
    if (!window.confirm("이 메모를 삭제하시겠습니까?")) return;
    
    try {
      // (만약 고정된 메모를 삭제하는 경우, 고정 해제)
      if (pinnedMemoId === memoId) {
        await handlePinMemo(null);
      }
      
      // 'memos' 컬렉션에서 문서 삭제
      const memoDocRef = doc(db, 'users', partnerUid, 'sites', siteId, 'memos', memoId);
      await deleteDoc(memoDocRef);
      // (onSnapshot이 자동으로 목록을 갱신)
      
    } catch (error) {
      console.error("메모 삭제 오류:", error);
      alert("메모 삭제 중 오류가 발생했습니다.");
    }
  };


  // [⭐ 7. 수정] 새 메모 등록 핸들러 (캘린더 호환)
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
      
      // [핵심] 캘린더가 쿼리할 데이터
      const memoData: any = {
        memoContent: newMemoText, // [수정] text -> memoContent
        createdByUid: currentUser?.uid || 'unknown',
        createdByName: currentUserName, 
        createdAt: serverTimestamp(),
        partnerUid: partnerUid, // [추가] 캘린더 쿼리용
        siteId: siteId,         // [추가] 캘린더 이동용
        siteName: siteName,     // [추가] 캘린더 표시용
      };
      
      // [수정] 미팅 시간이 설정되었으면 캘린더 형식에 맞게 추가
      if (meetingDateTime) {
        memoData.memoType = 'meeting';
        // 'YYYY-MM-DD'
        memoData.meetingDate = meetingDateTime.toISOString().split('T')[0]; 
        // 'HH:MM'
        memoData.meetingTime = meetingDateTime.toTimeString().split(' ')[0].substring(0, 5);
      } else {
        memoData.memoType = 'general';
      }
      
      await addDoc(memosRef, memoData);
      
      setNewMemoText(''); // 입력창 비우기
      setMeetingDateTime(null); // 미팅 시간 리셋
      setShowMeetingPicker(false); // 피커 닫기
      
    } catch (error) {
      console.error("메모 등록 오류:", error);
      alert("메모 등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="memo-widget-container">
      <h3>메모</h3>
      
      {/* --- 1. 고정된 메모 --- */}
      {pinnedMemo && (
        <div className="pinned-memo-container">
          <div className="pinned-memo-header">
            
            <span className="pinned-memo-title">
              <StarIconSolid /> {pinnedMemo.createdByName}
            </span>
            
            <span className="pinned-memo-timestamp">
              {formatMemoTimestamp(pinnedMemo.createdAt)}
            </span>
            
            <button 
              className="unpin-button"
              onClick={() => handlePinMemo(null)}
              title="고정 해제"
            >
              (고정 해제)
            </button>
            
          </div>
          {/* [⭐ 8. 수정] text -> memoContent */}
          <p className="pinned-memo-content">{pinnedMemo.memoContent}</p>
          
          {/* [⭐ 9. 수정] 미팅 시간 표시 (새 형식) */}
          {pinnedMemo.memoType === 'meeting' && pinnedMemo.meetingDate && (
            <p className="pinned-memo-meeting">
              미팅 약속: {pinnedMemo.meetingDate} {pinnedMemo.meetingTime}
            </p>
          )}
        </div>
      )}

      {/* --- 2. 메모 목록 (스크롤) --- */}
      <div className="memo-list-wrapper" ref={memoListRef}>
        {isLoading && <p>메모 로딩 중...</p>}
        <ul className="memo-list">
          {memos
            .filter(memo => memo.id !== pinnedMemoId) // (고정된 메모는 제외)
            .map(memo => (
            <li key={memo.id} className="memo-item">
              
              {/* [⭐ 10. 수정] 핀/삭제 아이콘 영역 */}
              <div className="memo-actions">
                <button 
                  className={`memo-pin-button ${pinnedMemoId === memo.id ? 'pinned' : ''}`}
                  onClick={() => handlePinMemo(memo.id)}
                  title={pinnedMemoId === memo.id ? "고정 해제" : "메모 고정"}
                >
                  {pinnedMemoId === memo.id ? <StarIconSolid /> : <StarIconOutline />}
                </button>
                <button 
                  className="memo-delete-button" 
                  title="메모 삭제"
                  onClick={() => handleDeleteMemo(memo.id)}
                >
                  <DeleteIcon />
                </button>
              </div>
              
              <div className="memo-body">
                <div className="memo-header">
                  {memo.createdByName}
                  <span className="timestamp">({formatMemoTimestamp(memo.createdAt)})</span>
                </div>
                {/* [⭐ 11. 수정] text -> memoContent */}
                <p className="memo-content">{memo.memoContent}</p>
                {/* [⭐ 12. 수정] 미팅 시간 표시 (새 형식) */}
                {memo.memoType === 'meeting' && memo.meetingDate && (
                  <p className="memo-meeting-time">
                    미팅 약속: {memo.meetingDate} {memo.meetingTime}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* --- 3. 메모 입력 --- */}
      <div className="memo-input-area">
        
        {/* [⭐ 13. 수정] 하단 아이콘 바 */}
        <div className="memo-action-bar">
          <button 
            className={`memo-icon-button ${showMeetingPicker ? 'active' : ''}`} // [추가] active 클래스
            title="미팅약속 설정"
            onClick={() => setShowMeetingPicker(prev => !prev)}
          >
            <CalendarIcon />
          </button>
          <button 
            className="memo-icon-button" 
            title="업무지시 (개발예정)"
            onClick={() => alert('업무지시 기능은 개발 예정입니다.')}
          >
            <AssignmentIcon />
          </button>
        </div>

        {/* [⭐ 14. 수정] 미팅 날짜 선택 (조건부 렌더링) */}
        {showMeetingPicker && (
          <div className="datetime-picker">
            <input 
              type="datetime-local"
              value={meetingDateTime ? dateToInputString(meetingDateTime) : ''}
              onChange={(e) => setMeetingDateTime(e.target.value ? new Date(e.target.value) : null)}
            />
            <button type="button" onClick={() => { setMeetingDateTime(null); setShowMeetingPicker(false); }}>
              지우기
            </button>
          </div>
        )}

        {/* [⭐ 15. 수정] 폼 태그가 입력창 + 버튼을 감싸도록 변경 */}
        <form className="memo-input-box" onSubmit={handleSubmitMemo}>
          <textarea
            className="memo-textarea"
            placeholder={meetingDateTime ? "미팅 약속 메모를 입력하세요..." : "여기에 메모를 입력하세요..."}
            value={newMemoText}
            onChange={(e) => setNewMemoText(e.target.value)}
            disabled={isSubmitting}
          />
          <button 
            type="submit" 
            className="memo-submit-button"
            disabled={isSubmitting || newMemoText.trim() === ''} // [수정] 텍스트 필수
          >
            등록
          </button>
        </form>
      </div>
    </div>
  );
};

export default SiteMemoWidget;