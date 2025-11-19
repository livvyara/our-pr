// src/components/admin/DirectSmsSubTab.tsx

import React, { useState, useMemo } from 'react';
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase-config';
import './DirectSmsSubTab.css'; // (CSS는 하단에 제공)

// Cloud Functions 호출 준비
const sendDirectSms = httpsCallable(functions, 'sendDirectSms');
const logActivity = httpsCallable(functions, 'logAdminActivity');

interface FoundUser {
  uid: string;
  name: string;
  nickname: string;
  phone: string;
}

const DirectSmsSubTab: React.FC = () => {
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<FoundUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const db = getFirestore();

  // 1. 회원 검색 (닉네임 또는 이메일)
  const handleSearchUser = async () => {
    if (!searchTerm.trim()) {
      alert('검색할 닉네임 또는 이메일을 입력하세요.');
      return;
    }
    setIsSearching(true);
    setSearchResult(null);
    
    try {
      const usersRef = collection(db, 'users');
      // 닉네임으로 먼저 검색
      let q = query(usersRef, where("nickname", "==", searchTerm));
      let snapshot = await getDocs(q);
      
      // 닉네임 결과가 없으면 이메일로 검색
      if (snapshot.empty) {
        q = query(usersRef, where("email", "==", searchTerm));
        snapshot = await getDocs(q);
      }
      
      if (snapshot.empty) {
        alert('해당 닉네임 또는 이메일을 가진 사용자를 찾을 수 없습니다.');
      } else {
        // (1명만 찾았다고 가정)
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        if (!userData.phone) {
          alert('오류: 해당 유저는 휴대폰 번호가 등록되어 있지 않습니다.');
        } else {
          setSearchResult({
            uid: userDoc.id,
            name: userData.name,
            nickname: userData.nickname,
            phone: userData.phone,
          });
        }
      }
    } catch (error) {
      console.error("회원 검색 오류:", error);
      alert("회원 검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
    }
  };

  // 2. 특정 회원에게 발송
  const handleSubmit = async () => {
    if (!message.trim()) {
      alert('발송할 메시지를 입력하세요.');
      return;
    }
    if (!searchResult) {
      alert('문자를 발송할 회원을 먼저 검색해주세요.');
      return;
    }

    if (!window.confirm(`[${searchResult.nickname}]님에게 문자를 발송하시겠습니까?\n(수신번호: ${searchResult.phone})`)) {
      return;
    }

    setIsSending(true);
    try {
      // 1. 백엔드 함수 호출
      const result: any = await sendDirectSms({
        message: message,
        targetUid: searchResult.uid,
      });

      if (result.data.success) {
        alert(`[${searchResult.nickname}]님에게 발송 요청 성공.\n(결과는 '발송 결과' 탭에서 확인하세요.)`);
        
        // 2. 활동 로그 기록
        await logActivity({
          message: `[${searchResult.nickname}]님에게 특정 문자를 발송했습니다. (내용: ${message.slice(0, 20)}...)`
        });
        
        setMessage('');
        setSearchTerm('');
        setSearchResult(null);
      } else {
        throw new Error(result.data.message || '발송 함수 실행 실패');
      }
    } catch (error: any) {
      console.error("특정 SMS 발송 오류:", error);
      alert(`발송 실패: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="sms-tab-container">
      <h3>특정 문자발송</h3>
      <p>
        특정 회원 1명을 검색하여 문자를 발송합니다.
      </p>
      
      {/* 1. 회원 검색 */}
      <div className="sms-form-group">
        <label htmlFor="userSearch">회원 검색 (닉네임 또는 이메일)</label>
        <div className="search-bar-group">
          <input
            type="text"
            id="userSearch"
            className="sms-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="검색할 닉네임 또는 이메일"
          />
          <button onClick={handleSearchUser} disabled={isSearching}>
            {isSearching ? '검색 중...' : '검색'}
          </button>
        </div>
      </div>

      {/* 2. 검색 결과 */}
      {searchResult && (
        <div className="search-result-box">
          <strong>대상:</strong> {searchResult.name} ({searchResult.nickname}) | <strong>연락처:</strong> {searchResult.phone}
          <button className="clear-target" onClick={() => setSearchResult(null)}>X</button>
        </div>
      )}
      
      {/* 3. 문자 내용 */}
      <div className="sms-form-group">
        <label htmlFor="directSms">발송할 문자 내용</label>
        <textarea
          id="directSms"
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
        disabled={isSending || isSearching || !searchResult}
      >
        {isSending ? '발송 중...' : (searchResult ? `[${searchResult.nickname}]님에게 발송` : '발송 대상 검색 필요')}
      </button>
    </div>
  );
};

export default DirectSmsSubTab;