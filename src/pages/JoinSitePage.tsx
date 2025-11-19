// src/pages/JoinSitePage.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase-config';
import './JoinCompanyPage.css'; // [⭐] 기존 스타일 재사용 (CSS 파일명 확인 필요)
import logoSrc from '../assets/logo.png'; // [⭐] 로고 경로 (Header.tsx 참고)

// [⭐] 도급인 초대 수락 함수 (백엔드 구현 필요)
// 만약 아직 구현 안 되었다면 functions/index.js 에 redeemSiteInvitation 추가 필요
const redeemSiteInvitation = httpsCallable(functions, 'redeemSiteInvitation');

type StatusType = 'checking' | 'ready' | 'requiresLogin' | 'processing' | 'success' | 'error';

const JoinSitePage: React.FC = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<StatusType>('checking');
  const [message, setMessage] = useState('초대 정보를 확인 중입니다...');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!inviteId) {
      setStatus('error');
      setMessage('유효하지 않은 초대 링크입니다.');
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setStatus('ready');
        setMessage('아래 버튼을 눌러 현장 도급인으로 합류하세요.');
        
        // 로그인 완료 후 처리를 위해 저장했던 ID 삭제
        localStorage.removeItem('pendingSiteInviteId'); 
      } else {
        // 비로그인 시 초대 ID 저장 (로그인 후 리다이렉트용)
        localStorage.setItem('pendingSiteInviteId', inviteId);
        setStatus('requiresLogin');
        setMessage('초대를 수락하려면 먼저 로그인이 필요합니다.');
      }
    });

    return () => unsubscribe();
  }, [inviteId]);

  // 수락 버튼 핸들러
  const handleAcceptClick = async () => {
    if (!currentUser || !inviteId) return;

    setStatus('processing');
    setMessage('초대장을 처리하는 중입니다...');

    try {
      const result: any = await redeemSiteInvitation({ inviteId });

      if (result.data.success) {
        setStatus('success');
        const siteName = result.data.siteName || '현장';
        setMessage(`[${siteName}] 현장의 도급인으로 등록되었습니다!\n3초 후 현장 상세 페이지로 이동합니다.`);
        
        // 현장 상세 페이지로 이동 (siteId 필요)
        const siteId = result.data.siteId;
        setTimeout(() => {
          if (siteId) {
            navigate(`/program/site-detail/${siteId}`);
          } else {
            navigate('/program/dashboard');
          }
        }, 3000);

      } else {
        throw new Error(result.data.message || '수락 실패');
      }

    } catch (error: any) {
      console.error("초대 수락 오류:", error);
      setStatus('error');
      
      if (error.code === 'not-found') {
        setMessage('유효하지 않거나 이미 만료된 초대입니다.');
      } else if (error.code === 'already-exists') {
        setMessage('이미 참여 중이거나 사용된 초대 코드입니다.');
      } else if (error.code === 'permission-denied') {
        setMessage('권한이 없거나 본인이 초대한 링크입니다.');
      } else {
        setMessage(`오류가 발생했습니다: ${error.message}`);
      }
    }
  };

  return (
    <div className="join-page-container">
      <div className="join-status-box">
        
        {/* [⭐ 추가] 로고 및 문구 */}
        <div style={{ marginBottom: '30px' }}>
          <img src={logoSrc} alt="Logo" style={{ height: '40px', marginBottom: '15px' }} />
          <h3 style={{ margin: 0, fontSize: '18px', color: '#333', fontWeight: 'bold' }}>
            아워프로젝트로 공사하면<br />공사가 안전해 집니다.
          </h3>
        </div>

        {/* 상태별 로딩/메시지 */}
        {(status === 'checking' || status === 'processing') && <div className="loader"></div>}
        
        <p className={`join-message ${status}`} style={{ whiteSpace: 'pre-line' }}>
          {message}
        </p>

        {/* 상태별 버튼 액션 */}
        <div className="join-actions" style={{ flexDirection: 'column', gap: '10px' }}>
          
          {status === 'ready' && (
            <button onClick={handleAcceptClick} className="join-button">
              초대 수락하기
            </button>
          )}

          {status === 'requiresLogin' && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <Link to="/login" className="join-button">로그인</Link>
              <Link to="/signup" className="join-button secondary">회원가입</Link>
            </div>
          )}

          {status === 'success' && (
             <Link to="/program/dashboard" className="join-button">즉시 이동</Link>
          )}

          {/* [⭐ 추가] 홈으로 돌아가기 (모든 상태에서 하단에 표시) */}
          <Link 
            to="/" 
            style={{ 
              display: 'block', marginTop: '15px', color: '#999', textDecoration: 'none', fontSize: '14px' 
            }}
          >
            홈으로 돌아가기
          </Link>
        </div>

      </div>
    </div>
  );
};

export default JoinSitePage;