import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
// [수정] Firestore 접근을 위해 추가
import { getFirestore, doc, getDoc } from 'firebase/firestore'; 
import { auth, functions } from '../firebase-config';
import './JoinCompanyPage.css'; 

const redeemInvitation = httpsCallable(functions, 'redeemCompanyInvitation');

// 상태 타입
type StatusType = 'checking' | 'ready' | 'requiresLogin' | 'processing' | 'success' | 'error';

const JoinCompanyPage: React.FC = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const db = getFirestore();

  const [status, setStatus] = useState<StatusType>('checking');
  const [message, setMessage] = useState('초대 정보를 확인 중입니다...');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!inviteId) {
      setStatus('error');
      setMessage('유효하지 않은 초대 링크입니다 (코드가 없음).');
      return;
    }

    // 1. 로그인 및 권한 상태 확인
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        
        try {
            // [중요] 사용자 등급(role) 확인 로직 추가
            const userDocRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userDocRef);
            
            if (userSnap.exists()) {
                const userData = userSnap.data();
                const userRole = userData.role;

                // [조건] 오직 'customer' 등급만 수락 가능
                if (userRole === 'customer') {
                    setStatus('ready');
                    setMessage('아래 버튼을 눌러 파트너사 직원으로 합류하세요.');
                } else {
                    // partner, sub_partner, admin 등은 수락 불가
                    setStatus('error');
                    setMessage(`현재 계정의 등급(${userRole})으로는\n초대를 수락할 수 없습니다.\n(일반 고객 계정만 직원 등록이 가능합니다)`);
                }
            } else {
                // 문서가 없는 경우 (예외적 상황, 보통 customer로 간주하거나 에러 처리)
                // 안전을 위해 에러 처리 혹은 회원가입 유도
                setStatus('error');
                setMessage('사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
            }
        } catch (e) {
            console.error("등급 확인 실패", e);
            setStatus('error');
            setMessage('사용자 정보를 확인하는 중 오류가 발생했습니다.');
        }

        // (이전에 저장된 pendingInviteId가 있다면 삭제)
        localStorage.removeItem('pendingInviteId'); 
      } else {
        localStorage.setItem('pendingInviteId', inviteId);
        setStatus('requiresLogin');
        setMessage('초대를 수락하려면 먼저 로그인이 필요합니다.');
      }
    });

    return () => unsubscribe();
  }, [inviteId, db]);

  // 2. 사용자가 버튼을 눌렀을 때 실행될 핸들러
  const handleAcceptClick = () => {
    if (currentUser && inviteId) {
      redeemInvite(currentUser.uid, inviteId);
    }
  };

  // 3. 초대 수락 API 호출
  const redeemInvite = async (uid: string, id: string) => {
    setStatus('processing'); 
    setMessage('초대장을 처리하는 중입니다...');

    try {
      const result: any = await redeemInvitation({ inviteId: id });

      if (result.data.success) {
        setStatus('success');
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
        
        {/* 로딩 스피너 */}
        {(status === 'checking' || status === 'processing') && (
          <div className="loader"></div>
        )}
        
        {/* 메시지 표시 (줄바꿈 지원) */}
        <p className={`join-message ${status}`} style={{whiteSpace: 'pre-line'}}>
          {message}
        </p>

        {/* 로그인 상태 & customer 등급일 때만 수락 버튼 표시 */}
        {status === 'ready' && (
          <div className="join-actions">
              <button onClick={handleAcceptClick} className="join-button">
                초대 수락하기
              </button>
          </div>
        )}

        {/* 비로그인 상태 */}
        {status === 'requiresLogin' && (
          <div className="join-actions">
            <Link to="/login" className="join-button">로그인</Link>
            <Link to="/signup" className="join-button secondary">회원가입</Link>
          </div>
        )}
        
        {/* 에러 상태 (홈으로 or 로그아웃 후 다른 계정 로그인 유도) */}
        {(status === 'error') && (
           <div className="join-actions">
             <Link to="/" className="join-button secondary">홈으로 돌아가기</Link>
           </div>
        )}
        
        {/* 성공 상태 */}
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