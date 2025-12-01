import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { auth, functions } from '../firebase-config';
import './JoinCompanyPage.css'; 
import logoSrc from '../assets/logo.png'; 
// [NEW] 채팅 서비스 임포트
import { createOrUpdateSiteChat } from '../utils/chatService';

const redeemSiteInvitation = httpsCallable(functions, 'redeemSiteInvitation');

type StatusType = 'checking' | 'ready' | 'requiresLogin' | 'processing' | 'success' | 'error';

const JoinSitePage: React.FC = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const db = getFirestore();

  const [status, setStatus] = useState<StatusType>('checking');
  const [message, setMessage] = useState('초대 정보를 확인 중입니다...');
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // 초대장 정보 임시 저장 (채팅방 생성용)
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
            // 1. 초대장 정보 미리 가져오기
            const inviteDoc = await getDoc(doc(db, 'siteInvitations', inviteId));
            if (inviteDoc.exists()) {
                const iData = inviteDoc.data();
                setInviteInfo({
                    siteId: iData.siteId,
                    siteName: iData.siteName,
                    partnerUid: iData.partnerUid
                });
            }

            // 2. 사용자 등급 확인
            const userDocRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userDocRef);
            
            if (userSnap.exists()) {
                const userData = userSnap.data();
                if (userData.role === 'partner' || userData.role === 'sub_partner') {
                    setStatus('error');
                    setMessage(`현재 계정(${userData.role})으로는\n도급인 초대를 수락할 수 없습니다.\n(일반 고객 계정으로 로그인해주세요)`);
                    return;
                }
                setStatus('ready');
                setMessage('아래 버튼을 눌러 현장 도급인(고객)으로 합류하세요.');
            } else {
                setStatus('ready');
                setMessage('현장 도급인(고객) 초대를 수락하시겠습니까?');
            }
        } catch (e) {
            console.error("사용자 확인 실패", e);
            setStatus('error');
            setMessage('사용자 정보를 확인하는 중 오류가 발생했습니다.');
        }
      } else {
        localStorage.setItem('pendingSiteInviteId', inviteId);
        setStatus('requiresLogin');
        setMessage('초대를 수락하려면 먼저 로그인이 필요합니다.');
      }
    });

    return () => unsubscribe();
  }, [inviteId, db]);

  const handleAcceptClick = async () => {
    if (!currentUser || !inviteId) return;
    
    setStatus('processing');
    setMessage('초대를 수락하는 중입니다...');

    try {
      // 1. 초대 수락 API 호출
      const result: any = await redeemSiteInvitation({ inviteId });

      if (result.data.success) {
        
        // 2. [NEW] 즉시 채팅방 생성/동기화 (나 자신을 포함)
        if (inviteInfo) {
            await createOrUpdateSiteChat(
                inviteInfo.siteId, 
                inviteInfo.siteName, 
                inviteInfo.partnerUid, 
                currentUser.uid // 도급인(나) UID
            );
        }

        setStatus('success');
        const sName = result.data.siteName || '현장';
        setMessage(`[${sName}] 현장의 도급인으로 등록되었습니다!\n잠시 후 이동합니다.`);
        
        setTimeout(() => {
          navigate('/'); 
        }, 3000);
      } else {
        throw new Error(result.data.message || '수락 실패');
      }
    } catch (error: any) {
      console.error("초대 수락 오류:", error);
      setStatus('error');
      
      if (error.message && error.message.includes('not-found')) {
          setMessage('유효하지 않거나 삭제된 초대장입니다.');
      } else if (error.message && error.message.includes('already')) {
          setMessage('이미 수락되었거나 만료된 초대장입니다.');
      } else {
          setMessage(`오류가 발생했습니다: ${error.message}`);
      }
    }
  };

  return (
    <div className="join-page-container">
      <div className="join-status-box" style={{padding: '40px 30px'}}>
        <div style={{ marginBottom: '35px', textAlign: 'center' }}>
          <img src={logoSrc} alt="Logo" style={{ height: '50px', marginBottom: '15px' }} />
          <h3 style={{ margin: 0, fontSize: '20px', color: '#333', fontWeight: '800', lineHeight: '1.4' }}>
            아워프로젝트로 공사하면<br />공사가 안전해집니다.
          </h3>
        </div>

        {(status === 'checking' || status === 'processing') && <div className="loader"></div>}
        
        <p className={`join-message ${status}`} style={{ whiteSpace: 'pre-line', fontSize: '15px', marginBottom:'30px' }}>
          {message}
        </p>

        <div className="join-actions" style={{ flexDirection: 'column', gap: '12px', width: '100%' }}>
          
          {status === 'ready' && (
            <button onClick={handleAcceptClick} className="join-button" style={{width: '100%'}}>
              초대 수락하기
            </button>
          )}

          {status === 'requiresLogin' && (
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <Link to="/login" className="join-button" style={{flex:1, textAlign:'center'}}>로그인</Link>
              <Link to="/signup" className="join-button secondary" style={{flex:1, textAlign:'center'}}>회원가입</Link>
            </div>
          )}
          
          {status === 'success' && (
             <Link to="/" className="join-button" style={{width: '100%', textAlign:'center'}}>홈으로 이동</Link>
          )}

          <Link 
            to="/" 
            style={{ 
              display: 'block', marginTop: '20px', color: '#999', 
              textDecoration: 'underline', fontSize: '13px', textAlign: 'center' 
            }}
          >
            메인 페이지로 돌아가기
          </Link>
        </div>

      </div>
    </div>
  );
};

export default JoinSitePage;