// src/pages/JoinCompanyPage.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase-config';
import './JoinCompanyPage.css'; 

const redeemInvitation = httpsCallable(functions, 'redeemCompanyInvitation');

// 상태 타입: 로딩중 -> (대기/로그인필요) -> 처리중 -> 성공/에러
type StatusType = 'checking' | 'ready' | 'requiresLogin' | 'processing' | 'success' | 'error';

const JoinCompanyPage: React.FC = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<StatusType>('checking');
  const [message, setMessage] = useState('초대 정보를 확인 중입니다...');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!inviteId) {
      setStatus('error');
      setMessage('유효하지 않은 초대 링크입니다 (코드가 없음).');
      return;
    }

    // 1. 로그인 상태 확인 (자동 실행 X, 상태만 변경)
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setStatus('ready'); // [⭐ 수정] 바로 실행하지 않고 '대기' 상태로
        setMessage('아래 버튼을 눌러 파트너사 직원으로 합류하세요.');
        
        // (이전에 저장된 pendingInviteId가 있다면 삭제)
        localStorage.removeItem('pendingInviteId'); 
      } else {
        localStorage.setItem('pendingInviteId', inviteId);
        setStatus('requiresLogin');
        setMessage('초대를 수락하려면 먼저 로그인이 필요합니다.');
      }
    });

    return () => unsubscribe();
  }, [inviteId]);

  // 2. [⭐ 추가] 사용자가 버튼을 눌렀을 때 실행될 핸들러
  const handleAcceptClick = () => {
    if (currentUser && inviteId) {
      redeemInvite(currentUser.uid, inviteId);
    }
  };

  // 3. 초대 수락 API 호출
  const redeemInvite = async (uid: string, id: string) => {
    setStatus('processing'); // 처리 중 상태
    setMessage('초대장을 처리하는 중입니다...');

    try {
      const result: any = await redeemInvitation({ inviteId: id });

      if (result.data.success) {
        setStatus('success');
        // [⭐ 수정] 백엔드에서 받은 회사명 표시
        const companyName = result.data.companyName || '파트너사';
        setMessage(`[${companyName}]의 직원으로 등록되었습니다!\n3초 후 파트너 페이지로 이동합니다.`);
        
        setTimeout(() => {
          navigate('/program/dashboard');
        }, 3000);

      } else {
        throw new Error(result.data.message || '초대 수락 실패');
      }

    } catch (error: any) {
      console.error("초대 수락 오류:", error);
      setStatus('error');
      
      if (error.code === 'not-found') {
        setMessage('유효하지 않거나 존재하지 않는 초대 코드입니다.');
      } else if (error.code === 'already-exists') {
        setMessage('이미 사용되었거나 만료된 초대 코드입니다.');
      } else {
        setMessage(`오류가 발생했습니다: ${error.message}`);
      }
    }
  };


  return (
    <div className="join-page-container">
      <div className="join-status-box">
        
        {/* 로딩 스피너 (체크 중 또는 처리 중) */}
        {(status === 'checking' || status === 'processing') && (
          <div className="loader"></div>
        )}
        
        {/* 메시지 표시 */}
        <p className={`join-message ${status}`}>
          {message}
        </p>

        {/* [⭐ 수정] 로그인 상태일 때 -> 수락 버튼 표시 */}
        {status === 'ready' && (
          <div className="join-actions">
             <button onClick={handleAcceptClick} className="join-button">
               초대 수락하기
             </button>
          </div>
        )}

        {/* 비로그인 상태 -> 로그인 버튼 */}
        {status === 'requiresLogin' && (
          <div className="join-actions">
            <Link to="/login" className="join-button">로그인</Link>
            <Link to="/signup" className="join-button secondary">회원가입</Link>
          </div>
        )}
        
        {/* 에러/성공 상태 */}
        {(status === 'error') && (
           <div className="join-actions">
             <Link to="/" className="join-button secondary">홈으로 돌아가기</Link>
           </div>
        )}
        
        {status === 'success' && (
           <div className="join-actions">
             <Link to="/program/dashboard" className="join-button">즉시 이동</Link>
           </div>
        )}
      </div>
    </div>
  );
};

export default JoinCompanyPage;