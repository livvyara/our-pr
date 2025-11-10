// src/pages/MyPage.tsx

import React, { useState, useEffect, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom'; 
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';

// [⭐ 1. 수정] 'type Timestamp' 제거
import { auth } from '../firebase-config';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
// [⭐ 2. 수정] 'type User' 제거
import { onAuthStateChanged } from 'firebase/auth';

// CSS 임포트
import './HomePage.css'; 
import './MyPage.css'; 


// 폰 번호 포맷터 (변경 없음)
const formatPhoneNumber = (rawPhone: string): string => {
  if (typeof rawPhone !== 'string' || rawPhone.length !== 11) {
    return rawPhone; 
  }
  return `${rawPhone.slice(0, 3)}-${rawPhone.slice(3, 7)}-${rawPhone.slice(7, 11)}`;
};


const MyPage: React.FC = () => {
  const navigate = useNavigate(); 

  // --- 1. 반응형/메뉴 상태 로직 (변경 없음) ---
  const [selectedMenu, setSelectedMenu] = useState('menu1');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  useEffect(() => {
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) {
          setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const handleHamburgerPressed = () => { setIsMobileMenuOpen(true); };
  const handleMenuClose = () => { setIsMobileMenuOpen(false); };

  
  // --- 2. [수정] 마이페이지 폼 상태 관리 ---

  const [isLoading, setIsLoading] = useState(true); 
  
  // [⭐ 빌드 오류 수정] currentUser state 제거
  
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [birth, setBirth] = useState(''); 
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');

  // [⭐ 90일 로직] 닉네임 관련 state 추가
  const [originalNickname, setOriginalNickname] = useState(''); 
  const [nicknameLastChanged, setNicknameLastChanged] = useState<Date | null>(null); 
  const [canChangeNickname, setCanChangeNickname] = useState(false); 
  const [isUpdatingNickname, setIsUpdatingNickname] = useState(false); 


  // [⭐ 90일 로직] Firebase 데이터 로드
  useEffect(() => {
    const db = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // [⭐ 빌드 오류 수정] setCurrentUser(user) 제거
        
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          
          setEmail(userData.email || '');
          setName(userData.name || '');
          setBirth(userData.birth || ''); 
          setPhone(formatPhoneNumber(userData.phone || ''));
          setNickname(userData.nickname || '');
          setOriginalNickname(userData.nickname || ''); 

          // 90일 로직
          let lastChangeDate: Date | null = null;
          if (userData.nicknameLastChanged && userData.nicknameLastChanged.toDate) {
            lastChangeDate = userData.nicknameLastChanged.toDate();
          } else if (userData.createdAt && userData.createdAt.toDate) {
            lastChangeDate = userData.createdAt.toDate(); 
          }
          setNicknameLastChanged(lastChangeDate);

        } else {
          console.error("No such user document!");
          alert("사용자 정보를 불러오는 데 실패했습니다.");
          navigate('/'); 
        }
      } else {
        alert("로그인이 필요합니다.");
        navigate('/login');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [navigate]); 


  // [⭐ 90일 로직] 닉네임 변경 가능 여부 계산
  useEffect(() => {
    if (!nicknameLastChanged) {
      setCanChangeNickname(false);
      return;
    }
    const now = new Date();
    const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
    const lastChangeTime = nicknameLastChanged.getTime();
    const ninetyDaysAgoTime = now.getTime() - ninetyDaysInMs;

    if (lastChangeTime < ninetyDaysAgoTime) {
      setCanChangeNickname(true);
    } else {
      setCanChangeNickname(false);
    }
  }, [nicknameLastChanged]);


  // 휴대폰 번호 하이픈 자동 입력 포맷터 (변경 없음)
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/-/g, ''); 
    if (rawValue.length > 11 || !/^\d*$/.test(rawValue)) return;
    let formattedValue = rawValue;
    if (rawValue.length > 7) {
      formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3, 7)}-${rawValue.slice(7, 11)}`;
    } else if (rawValue.length > 3) {
      formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3, 7)}`;
    }
    setPhone(formattedValue);
  };

  // [⭐ 90일 로직] 닉네임 변경 버튼 클릭 핸들러
  const handleNicknameChange = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("로그인 상태가 유효하지 않습니다. 다시 로그인해주세요.");
      return;
    }
    if (nickname.trim().length < 2) {
      alert("닉네임은 2자 이상 입력해야 합니다.");
      return;
    }
    if (nickname === originalNickname) {
      alert("현재 닉네임과 동일합니다.");
      return;
    }
    
    setIsUpdatingNickname(true);
    const db = getFirestore();
    const docRef = doc(db, "users", user.uid);

    try {
      await updateDoc(docRef, {
        nickname: nickname, 
        nicknameLastChanged: serverTimestamp() 
      });
      alert("닉네임이 성공적으로 변경되었습니다.");
      setOriginalNickname(nickname); 
      setCanChangeNickname(false); 
      setNicknameLastChanged(new Date()); 
    } catch (error) {
      console.error("닉네임 변경 오류:", error);
      alert("닉네임 변경 중 오류가 발생했습니다.");
    } finally {
      setIsUpdatingNickname(false);
    }
  };


  // 로딩 중 표시
  if (isLoading) {
    return (
      <div className="page-container">
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <h2>데이터를 불러오는 중입니다...</h2>
        </main>
      </div>
    );
  }

  return (
    <div className="page-container">
      
      {!isMobile && <RoleHeader />}

      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={handleHamburgerPressed}
      />

      {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}

      <main className="main-content" style={{ padding: isMobile ? '16px' : '32px 0' }}>
        
        <div className="mypage-container">
          <h2 className="mypage-title">마이페이지</h2>

          <div className="form-group">
            <label className="form-label" htmlFor="email">이메일 주소</label>
            <input id="email" className="form-input" value={email} disabled />
          </div>

          <div className="form-group">
            <label className="form-label">비밀번호</label>
            <div className="input-group">
              <input type="password" className="form-input" value="**********" disabled />
              <button className="form-button btn-secondary" onClick={() => navigate('/password-change')}>
                비밀번호 변경
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="nickname">닉네임</label>
            <div className="input-group">
              <input 
                type="text" 
                id="nickname" 
                className="form-input" 
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                disabled={!canChangeNickname || isUpdatingNickname} 
              />
              <button 
                className="form-button btn-primary"
                onClick={handleNicknameChange}
                disabled={!canChangeNickname || isUpdatingNickname || nickname === originalNickname}
              >
                {isUpdatingNickname ? '변경 중...' : '변경'}
              </button>
            </div>
            
            {!canChangeNickname && nicknameLastChanged && (
              <span className="form-caption">
                닉네임은 90일마다 변경할 수 있습니다.
              </span>
            )}
            {canChangeNickname && nickname === originalNickname && (
              <span className="form-caption">
                현재 닉네임과 동일합니다.
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="name">이름</label>
            <input id="name" className="form-input" value={name} disabled />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="birth">생년월일</label>
            <input id="birth" className="form-input" value={birth} disabled />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="phone">휴대폰 번호</label>
            <div className="input-group">
              <input 
                type="tel" 
                id="phone" 
                className="form-input" 
                value={phone} 
                onChange={handlePhoneChange} 
                maxLength={13}
              />
              <button 
                className="form-button btn-secondary"
                onClick={() => { /* TODO: 휴대폰 인증 로직 */ }}
              >
                인증번호 발송
              </button>
            </div>
          </div>

        </div>

      </main>

      <Footer /> 

      {isMobileMenuOpen && isMobile && (
        <MobileMenu 
            onClose={handleMenuClose}
        />
      )}
    </div>
  );
};

export default MyPage;