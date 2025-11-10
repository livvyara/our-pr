// src/pages/MyPage.tsx

import React, { useState, useEffect, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom'; 
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';

// [⭐ 수정] Firebase 모듈 (updateDoc, serverTimestamp 추가)
import { auth } from '../firebase-config';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';

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
  
  // [⭐ 1. 빌드 오류 수정] currentUser state 제거 (onAuthStateChanged의 user 직접 사용)
  // const [currentUser, setCurrentUser] = useState<User | null>(null); 
  
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [birth, setBirth] = useState(''); 
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');

  // [⭐ 2. 90일 로직] 닉네임 관련 state 추가
  const [originalNickname, setOriginalNickname] = useState(''); // DB에서 불러온 닉네임
  const [nicknameLastChanged, setNicknameLastChanged] = useState<Date | null>(null); // 마지막 변경일
  const [canChangeNickname, setCanChangeNickname] = useState(false); // 변경 가능 여부 (기본 false)
  const [isUpdatingNickname, setIsUpdatingNickname] = useState(false); // 변경 API 실행 중


  // [⭐ 3. 90일 로직] Firebase 데이터 로드 (nicknameLastChanged 추가)
  useEffect(() => {
    const db = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // [⭐ 1. 빌드 오류 수정] setCurrentUser(user) 제거
        
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          
          setEmail(userData.email || '');
          setName(userData.name || '');
          setBirth(userData.birth || ''); 
          setPhone(formatPhoneNumber(userData.phone || ''));

          // 닉네임 state 설정
          setNickname(userData.nickname || '');
          setOriginalNickname(userData.nickname || ''); // '원래' 닉네임 저장

          // [⭐ 3. 90일 로직] 마지막 변경일 로드
          // 1. nicknameLastChanged 필드 확인 (Firestore Timestamp)
          // 2. 없으면 createdAt (가입일) 필드 확인
          let lastChangeDate: Date | null = null;
          if (userData.nicknameLastChanged && userData.nicknameLastChanged.toDate) {
            lastChangeDate = userData.nicknameLastChanged.toDate();
          } else if (userData.createdAt && userData.createdAt.toDate) {
            lastChangeDate = userData.createdAt.toDate(); // 가입일을 기준으로
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


  // [⭐ 4. 90일 로직] 닉네임 변경 가능 여부 계산
  // nicknameLastChanged 날짜가 state에 설정될 때마다 실행
  useEffect(() => {
    if (!nicknameLastChanged) {
      setCanChangeNickname(false); // 날짜 정보가 없으면 변경 불가
      return;
    }

    const now = new Date();
    // 90일 (밀리초 단위)
    const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
    const lastChangeTime = nicknameLastChanged.getTime();
    const ninetyDaysAgoTime = now.getTime() - ninetyDaysInMs;

    // 마지막 변경일(lastChangeTime)이 90일 전(ninetyDaysAgoTime)보다 
    // *이전*이어야 변경 가능
    if (lastChangeTime < ninetyDaysAgoTime) {
      setCanChangeNickname(true); // [⭐ 1. 빌드 오류 수정] setCanChangeNickname 사용됨
    } else {
      setCanChangeNickname(false);
    }
  }, [nicknameLastChanged]);


  // 휴대폰 번호 하이픈 자동 입력 포맷터 (변경 없음)
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    // ... (기존 코드와 동일) ...
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

  // [⭐ 5. 90일 로직] 닉네임 변경 버튼 클릭 핸들러
  const handleNicknameChange = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("로그인 상태가 유효하지 않습니다. 다시 로그인해주세요.");
      return;
    }

    // (유효성 검사)
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
      // Firestore 문서 업데이트
      await updateDoc(docRef, {
        nickname: nickname, // 새 닉네임
        nicknameLastChanged: serverTimestamp() // 현재 서버 시간으로 변경일 업데이트
      });

      alert("닉네임이 성공적으로 변경되었습니다.");
      
      // 로컬 state 즉시 갱신 (페이지 새로고침 방지)
      setOriginalNickname(nickname); // '원래' 닉네임을 새 닉네임으로
      setCanChangeNickname(false); // 변경했으므로 90일간 다시 잠금
      setNicknameLastChanged(new Date()); // 마지막 변경일을 지금으로

    } catch (error) {
      console.error("닉네임 변경 오류:", error);
      alert("닉네임 변경 중 오류가 발생했습니다.");
    } finally {
      setIsUpdatingNickname(false);
    }
  };


  // 로딩 중 표시
  if (isLoading) {
    // ... (기존 코드와 동일) ...
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

          {/* ... (이메일, 비밀번호 폼 그룹은 동일) ... */}
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
                // [⭐ 6. 90일 로직] 닉네임 변경 가능할 때만 활성화 (기본 비활성화)
                disabled={!canChangeNickname || isUpdatingNickname} 
              />
              <button 
                className="form-button btn-primary"
                // [⭐ 7. 90일 로직] 클릭 핸들러 및 비활성화 조건 수정
                onClick={handleNicknameChange}
                disabled={!canChangeNickname || isUpdatingNickname || nickname === originalNickname}
              >
                {isUpdatingNickname ? '변경 중...' : '변경'}
              </button>
            </div>
            
            {/* [⭐ 8. 90일 로직] 비활성화 사유 안내 */}
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

          {/* ... (이름, 생년월일, 휴대폰 폼 그룹은 동일) ... */}
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