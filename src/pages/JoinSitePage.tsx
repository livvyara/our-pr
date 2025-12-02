import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { auth, functions } from '../firebase-config';
import './JoinSitePage.css'; // [변경] 파일명 일치시킴
import logoSrc from '../assets/logo.png'; 
import { createOrUpdateSiteChat } from '../utils/chatService';

const redeemSiteInvitation = httpsCallable(functions, 'redeemSiteInvitation');

type StatusType = 'checking' | 'ready' | 'requiresLogin' | 'processing' | 'success' | 'error';

const JoinSitePage: React.FC = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const location = useLocation(); // [NEW] 현재 위치 파악용
  const db = getFirestore();

  const [status, setStatus] = useState<StatusType>('checking');
  const [message, setMessage] = useState('초대 정보를 확인하고 있습니다...');
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // 초대장 정보 (사이트명 등 표시용)
  const [inviteInfo, setInviteInfo] = useState<{siteId: string, siteName: string, partnerUid: string} | null>(null);

  useEffect(() => {
    if (!inviteId) {
      setStatus('error');
      setMessage('유효하지 않은 초대 링크입니다.');
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        
        try {
          // 1. 초대장 정보 조회
          const inviteDoc = await getDoc(doc(db, 'siteInvitations', inviteId));
          if (inviteDoc.exists()) {
            const iData = inviteDoc.data();
            setInviteInfo({
                siteId: iData.siteId,
                siteName: iData.siteName,
                partnerUid: iData.partnerUid
            });
            
            // [NEW] 로그인 후 돌아왔을 때 localStorage 정리
            localStorage.removeItem('returnTo'); 
          } else {
             setStatus('error');
             setMessage('존재하지 않거나 만료된 초대장입니다.');
             return;
          }

          // 2. 사용자 권한 확인 (파트너 계정 차단)
          const userDocRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userDocRef);
          
          if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.role === 'partner' || userData.role === 'sub_partner') {
              setStatus('error');
              setMessage(`파트너 계정(${userData.role})으로는\n고객 초대를 수락할 수 없습니다.\n일반 고객 계정으로 로그인해주세요.`);
              return;
            }
            setStatus('ready');
            setMessage(`'${inviteDoc.data()?.siteName}' 현장에\n고객님을 초대합니다.`);
          } else {
            // 신규 유저 등 데이터가 없는 경우
            setStatus('ready');
            setMessage('현장 고객 초대를 수락하시겠습니까?');
          }
        } catch (e) {
          console.error("확인 중 오류", e);
          setStatus('error');
          setMessage('정보를 확인하는 중 오류가 발생했습니다.');
        }
      } else {
        // [중요] 비로그인 상태: 로그인 후 돌아올 주소를 저장
        // (localStorage를 사용하면 브라우저를 닫았다 열어도 기억할 수 있어 더 강력합니다)
        localStorage.setItem('returnTo', location.pathname); 
        
        setStatus('requiresLogin');
        setMessage('초대를 수락하려면\n로그인 또는 회원가입이 필요합니다.');
      }
    });

    return () => unsubscribe();
  }, [inviteId, db, location.pathname]);

  const handleAcceptClick = async () => {
    if (!currentUser || !inviteId) return;
    
    setStatus('processing');
    setMessage('현장 등록을 진행 중입니다...');

    try {
      const result: any = await redeemSiteInvitation({ inviteId });

      if (result.data.success) {
        // 채팅방 생성/동기화
        if (inviteInfo) {
            await createOrUpdateSiteChat(
                inviteInfo.siteId, 
                inviteInfo.siteName, 
                inviteInfo.partnerUid, 
                currentUser.uid
            );
        }

        setStatus('success');
        const sName = result.data.siteName || inviteInfo?.siteName || '현장';
        setMessage(`'${sName}'\n현장이 등록되었습니다!`);
        
        // 성공 메시지를 보여주기 위해 잠시 대기 후 이동
        setTimeout(() => {
          navigate('/myproject'); 
        }, 2500);
      } else {
        throw new Error(result.data.message || '수락 실패');
      }
    } catch (error: any) {
      console.error("초대 수락 오류:", error);
      setStatus('error');
      
      if (error.message?.includes('not-found')) {
          setMessage('이미 삭제되었거나 유효하지 않은 초대입니다.');
      } else if (error.message?.includes('already')) {
          setMessage('이미 참여 중이거나 만료된 초대입니다.');
      } else {
          setMessage(`오류가 발생했습니다.\n${error.message}`);
      }
    }
  };

  return (
    <div className="join-site-container">
      <div className="join-site-card">
        {/* 로고 영역 */}
        <div className="join-site-header">
          <img src={logoSrc} alt="Logo" className="join-site-logo" />
        </div>

        {/* 상태 아이콘/로딩 */}
        <div className="join-site-icon-area">
            {(status === 'checking' || status === 'processing') && <div className="join-spinner"></div>}
            {status === 'success' && <div className="join-icon success">🎉</div>}
            {status === 'error' && <div className="join-icon error">⚠️</div>}
            {(status === 'ready' || status === 'requiresLogin') && <div className="join-icon invite">📩</div>}
        </div>
        
        {/* 메시지 영역 */}
        <div className="join-site-content">
            <h2 className="join-site-title">
                {status === 'success' ? '환영합니다!' : '현장 초대장'}
            </h2>
            <p className="join-site-message">
                {message}
            </p>
        </div>

        {/* 액션 버튼 영역 */}
        <div className="join-site-actions">
          
          {status === 'ready' && (
            <button onClick={handleAcceptClick} className="join-btn primary">
              초대 수락하고 시작하기
            </button>
          )}

          {status === 'requiresLogin' && (
            <div className="join-auth-buttons">
              <Link to="/login" className="join-btn primary">로그인</Link>
              <Link to="/signup" className="join-btn secondary">회원가입</Link>
            </div>
          )}
          
          {status === 'success' && (
             <Link to="/" className="join-btn primary">
                 내 현장으로 이동
             </Link>
          )}

          {/* 에러가 아닐 때만 메인으로 가기 표시 (선택사항) */}
          <Link to="/" className="join-link-home">
            메인 페이지로 이동
          </Link>
        </div>

      </div>
      
      <div className="join-site-footer">
          Safe Construction with OurProject
      </div>
    </div>
  );
};

export default JoinSitePage;