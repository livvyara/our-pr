// src/components/admin/MarketingSmsSubTab.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase-config';
import './MarketingSmsSubTab.css'; // (CSS는 하단에 제공)

// Cloud Functions 호출 준비
const sendMarketingSms = httpsCallable(functions, 'sendMarketingSms');
const logActivity = httpsCallable(functions, 'logAdminActivity');

const MarketingSmsSubTab: React.FC = () => {
  const [message, setMessage] = useState('');
  const [consentCount, setConsentCount] = useState(0);
  const [isCounting, setIsCounting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const db = getFirestore();

  // 1. 마케팅 동의 회원 수 계산
  const fetchConsentCount = useCallback(async () => {
    setIsCounting(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where("agreedMarketing", "==", true));
      const querySnapshot = await getDocs(q);
      setConsentCount(querySnapshot.size);
    } catch (error) {
      console.error("마케팅 동의 회원 수 조회 오류:", error);
      alert("동의 회원 수를 불러오는 데 실패했습니다.");
    } finally {
      setIsCounting(false);
    }
  }, [db]);

  // (컴포넌트 로드 시 1회 실행)
  useEffect(() => {
    fetchConsentCount();
  }, [fetchConsentCount]);

  // 2. 발송 버튼 클릭
  const handleSubmit = async () => {
    if (!message.trim()) {
      alert('발송할 메시지를 입력하세요.');
      return;
    }
    if (consentCount === 0) {
      alert('발송 대상(마케팅 동의 회원)이 0명입니다.');
      return;
    }
    if (!window.confirm(`마케팅 동의 회원 ${consentCount}명에게 문자를 발송하시겠습니까?`)) {
      return;
    }

    setIsSending(true);
    try {
      // 1. 백엔드 함수 호출
      const result: any = await sendMarketingSms({ message: message });

      if (result.data.success) {
        alert(`발송 요청 성공: 총 ${result.data.sentCount}명에게 발송을 시작했습니다.\n(결과는 '발송 결과' 탭에서 확인하세요.)`);
        
        // 2. 활동 로그 기록
        await logActivity({
          message: `마케팅 동의 회원 ${result.data.sentCount}명에게 단체 문자를 발송했습니다. (내용: ${message.slice(0, 20)}...)`
        });
        
        setMessage(''); // 메시지 창 비우기
      } else {
        throw new Error(result.data.message || '발송 함수 실행 실패');
      }
    } catch (error: any) {
      console.error("마케팅 SMS 발송 오류:", error);
      alert(`발송 실패: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="sms-tab-container">
      <h3>마케팅 문자발송 (단체)</h3>
      <p>
        '개인정보 마케팅 활용 동의'에 동의(O)한 모든 회원에게 단체 문자를 발송합니다.
      </p>
      
      <div className="consent-info-box">
        <span>현재 마케팅 수신 동의 회원:</span>
        <strong>{isCounting ? '조회 중...' : `${consentCount} 명`}</strong>
        <button onClick={fetchConsentCount} disabled={isCounting}>새로고침</button>
      </div>

      <div className="sms-form-group">
        <label htmlFor="marketingSms">발송할 문자 내용</label>
        <textarea
          id="marketingSms"
          className="sms-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="여기에 문자 내용을 입력하세요..."
          rows={10}
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

export default MarketingSmsSubTab;