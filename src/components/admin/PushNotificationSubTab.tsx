// src/components/admin/PushNotificationSubTab.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase-config';
import './PushNotificationSubTab.css'; // (CSS는 하단에 제공)

// Cloud Functions 호출 준비
const sendPushNotification = httpsCallable(functions, 'sendPushNotification');
const logActivity = httpsCallable(functions, 'logAdminActivity');

const PushNotificationSubTab: React.FC = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [consentCount, setConsentCount] = useState(0);
  const [isCounting, setIsCounting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const db = getFirestore();

  // 1. 알림 동의 회원 수 계산
  const fetchConsentCount = useCallback(async () => {
    setIsCounting(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where("agreedNotifications", "==", true));
      const querySnapshot = await getDocs(q);
      setConsentCount(querySnapshot.size);
    } catch (error) {
      console.error("알림 동의 회원 수 조회 오류:", error);
      alert("동의 회원 수를 불러오는 데 실패했습니다.");
    } finally {
      setIsCounting(false);
    }
  }, [db]);

  useEffect(() => {
    fetchConsentCount();
  }, [fetchConsentCount]);

  // 2. 발송 버튼 클릭
  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) {
      alert('푸시 알림의 제목과 내용을 모두 입력하세요.');
      return;
    }
    if (consentCount === 0) {
      alert('발송 대상(알림 동의 회원)이 0명입니다.');
      return;
    }
    if (!window.confirm(`알림 동의 회원 ${consentCount}명에게 앱 푸시를 발송하시겠습니까?`)) {
      return;
    }

    setIsSending(true);
    try {
      // 1. 백엔드 함수 호출
      const result: any = await sendPushNotification({ title, body });

      if (result.data.success) {
        alert(`발송 요청 성공: 총 ${result.data.sentCount}명에게 발송을 시작했습니다.\n(결과는 '발송 결과' 탭에서 확인하세요.)`);
        
        // 2. 활동 로그 기록
        await logActivity({
          message: `알림 동의 회원 ${result.data.sentCount}명에게 앱 푸시를 발송했습니다. (제목: ${title})`
        });
        
        setTitle('');
        setBody('');
      } else {
        throw new Error(result.data.message || '발송 함수 실행 실패');
      }
    } catch (error: any) {
      console.error("앱 푸시 발송 오류:", error);
      alert(`발송 실패: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="sms-tab-container">
      <h3>앱 푸시발송 (단체)</h3>
      <p>
        '이메일, SMS, 앱알림 수신 동의'에 동의(O)하고 앱을 설치한 모든 회원에게 푸시 알림을 발송합니다.
      </p>
      
      <div className="consent-info-box">
        <span>현재 알림 수신 동의 회원:</span>
        <strong>{isCounting ? '조회 중...' : `${consentCount} 명`}</strong>
        <button onClick={fetchConsentCount} disabled={isCounting}>새로고침</button>
      </div>

      <div className="sms-form-group">
        <label htmlFor="pushTitle">푸시 알림 제목</label>
        <input
          type="text"
          id="pushTitle"
          className="sms-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="푸시 알림의 제목을 입력하세요"
        />
      </div>

      <div className="sms-form-group">
        <label htmlFor="pushBody">푸시 알림 내용</label>
        <textarea
          id="pushBody"
          className="sms-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="여기에 푸시 알림 내용을 입력하세요..."
          rows={8}
        />
      </div>

      <button 
        className="sms-send-button"
        onClick={handleSubmit}
        disabled={isSending || isCounting || consentCount === 0}
      >
        {isSending ? '발송 중...' : `동의 회원 ${consentCount}명에게 발송`}
      </button>
    </div>
  );
};

export default PushNotificationSubTab;