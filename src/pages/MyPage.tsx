// src/pages/MyPage.tsx

import React, { useState, useEffect, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom'; 
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
import Footer from '../components/common/Footer';

// [⭐ 추가] RoleHeader 임포트
import RoleHeader from '../components/common/RoleHeader';

// Firebase 모듈
import { auth } from '../firebase-config';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';

// CSS 임포트
import './HomePage.css'; // 스티키 푸터용 (page-container, main-content)
import './MyPage.css'; // 마이페이지 폼 전용 CSS


// 폰 번호 포맷터
const formatPhoneNumber = (rawPhone: string): string => {
  if (typeof rawPhone !== 'string' || rawPhone.length !== 11) {
    return rawPhone; // 원본 반환
  }
  return `${rawPhone.slice(0, 3)}-${rawPhone.slice(3, 7)}-${rawPhone.slice(7, 11)}`;
};


const MyPage: React.FC = () => {
  const navigate = useNavigate(); 

  // --- 1. HomePage의 반응형/메뉴 상태 로직 (그대로 사용) ---
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

  // (Header/SubNav용 핸들러)
  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const handleHamburgerPressed = () => { setIsMobileMenuOpen(true); };
  const handleMenuClose = () => { setIsMobileMenuOpen(false); };

  
  // --- 2. [수정] 마이페이지 폼 상태 관리 ---

  const [isLoading, setIsLoading] = useState(true); 
  const [currentUser, setCurrentUser] = useState<User | null>(null); 
  
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [birth, setBirth] = useState(''); 
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');

  const [canChangeNickname, setCanChangeNickname] = useState(true);


  // Firebase 데이터 로드
  useEffect(() => {
    const db = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          
          setEmail(userData.email || '');
          setName(userData.name || '');
          setNickname(userData.nickname || '');
          setBirth(userData.birth || ''); 
          setPhone(formatPhoneNumber(userData.phone || ''));

          // TODO: 닉네임 변경 90일 제한 로직 구현

        } else {
          console.error("No such user document!");
          alert("사용자 정보를 불러오는 데 실패했습니다.");
          navigate('/'); // 홈으로
        }
      } else {
        alert("로그인이 필요합니다.");
        navigate('/login');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [navigate]); // navigate를 의존성 배열에 추가


  // 휴대폰 번호 하이픈 자동 입력 포맷터 (사용자 입력 시)
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/-/g, ''); 
    
    if (rawValue.length > 11 || !/^\d*$/.test(rawValue)) {
      return;
    }

    let formattedValue = rawValue;
    if (rawValue.length > 7) {
      formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3, 7)}-${rawValue.slice(7, 11)}`;
    } else if (rawValue.length > 3) {
      formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3, 7)}`;
    }
    
    setPhone(formattedValue);
  };
  
  // [추가] 로딩 중 표시
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
      
      {/* [⭐ 추가] 
          모바일이 아닐 때만 RoleHeader를 렌더링합니다. 
      */}
      {!isMobile && <RoleHeader />}

      {/* 1. 헤더 */}
      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={handleHamburgerPressed}
      />

      {/* 2. 서브메뉴 (데스크톱 전용) */}
      {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}

      {/* 3. 메인 콘텐츠 (마이페이지 폼) */}
      <main className="main-content" style={{ padding: isMobile ? '16px' : '32px 0' }}>
        
        <div className="mypage-container">
          <h2 className="mypage-title">마이페이지</h2>

          {/* --- 이메일 (변경 불가) --- */}
          <div className="form-group">
            <label className="form-label" htmlFor="email">이메일 주소</label>
            <input 
              type="email" 
              id="email" 
              className="form-input" 
              value={email} 
              disabled 
            />
          </div>

          {/* --- 비밀번호 (변경 가능) --- */}
          <div className="form-group">
            <label className="form-label">비밀번호</label>
            <div className="input-group">
              <input 
                type="password" 
                className="form-input" 
                value="**********" 
                disabled 
              />
              <button 
                className="form-button btn-secondary"
                onClick={() => navigate('/password-change')}
              >
                비밀번호 변경
              </button>
            </div>
          </div>

          {/* --- 닉네임 (90일 1회 변경) --- */}
          <div className="form-group">
            <label className="form-label" htmlFor="nickname">닉네임</label>
            <div className="input-group">
              <input 
                type="text" 
                id="nickname" 
                className="form-input" 
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                disabled={!canChangeNickname} 
              />
              <button 
                className="form-button btn-primary"
                disabled={!canChangeNickname}
                onClick={() => { /* TODO: 닉네임 변경 로직 (Firebase 업데이트) */ }}
              >
                변경
              </button>
            </div>
            {!canChangeNickname && (
              <span className="form-caption">
                닉네임은 마지막 변경일로부터 90일 후에 변경할 수 있습니다.
              </span>
            )}
          </div>

          {/* --- 이름 (변경 불가) --- */}
          <div className="form-group">
            <label className="form-label" htmlFor="name">이름</label>
            <input 
              type="text" 
              id="name" 
              className="form-input" 
              value={name} 
              disabled 
            />
          </div>

          {/* --- 생년월일 (변경 불가) --- */}
          <div className="form-group">
            <label className="form-label" htmlFor="birth">생년월일</label>
            <input 
              type="text" 
              id="birth"
              className="form-input" 
              value={birth}
              disabled 
            />
          </div>

          {/* --- 휴대폰 번호 (인증 후 변경) --- */}
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
                onClick={() => { /* TODO: 휴대폰 인증 로직 (회원가입과 동일) */ }}
              >
                인증번호 발송
              </button>
            </div>
            {/* TODO: 인증번호 입력창 (인증번호 발송 시 표시) */}
          </div>

        </div>

      </main>

      {/* 4. 푸터 */}
      <Footer /> 

      {/* 5. 모바일 메뉴 (오버레이) */}
      {isMobileMenuOpen && isMobile && (
        <MobileMenu 
            onClose={handleMenuClose}
        />
      )}
    </div>
  );
};

export default MyPage;