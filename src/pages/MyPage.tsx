// src/pages/MyPage.tsx

import React, { useState, useEffect, type ChangeEvent, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu';
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';

// [⭐ 수정] Firebase 모듈
import { auth, functions } from '../firebase-config'; // [수정] functions 임포트
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore'; // [수정] serverTimestamp 제거
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from "firebase/functions"; // [추가]

// CSS 임포트
import './MyPage.css';

// [⭐ 추가] 파트너 정보 탭 컴포넌트
import PartnerInfoTab from '../components/mypage/PartnerInfoTab';

// [⭐ 추가] 탭 라벨 맵
const ROLE_TAB_LABELS: Record<string, string> = {
  partner: "파트너 정보",
  seller: "셀러 정보",
  contract: "협력사 정보",
};

// 폰 번호 포맷터
const formatPhoneNumber = (rawPhone: string): string => {
  if (typeof rawPhone !== 'string') return rawPhone;
  const numericPhone = rawPhone.replace(/-/g, '');
  if (numericPhone.length !== 11) {
    return rawPhone;
  }
  return `${numericPhone.slice(0, 3)}-${numericPhone.slice(3, 7)}-${numericPhone.slice(7, 11)}`;
};

// [⭐ 추가] 타이머 포맷
const formatTimer = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};


const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const db = getFirestore();
  const timerRef = useRef<number | null>(null);

  // --- 1. 레이아웃 상태 ---
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
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);

  // [⭐ 추가] 권한 및 탭 상태
  const [userRole, setUserRole] = useState<string>('customer');
  const [activeTab, setActiveTab] = useState('basic');
  const [partnerInfo, setPartnerInfo] = useState<any>(null);

  // [기본 정보] State
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [originalNickname, setOriginalNickname] = useState('');
  const [originalPhone, setOriginalPhone] = useState('');

  // [⭐ 1. 추가] 선택 약관 State
  const [agreedMarketing, setAgreedMarketing] = useState(false);
  const [agreedNotifications, setAgreedNotifications] = useState(false);
  const [originalAgreedMarketing, setOriginalAgreedMarketing] = useState(false);
  const [originalAgreedNotifications, setOriginalAgreedNotifications] = useState(false);

  // [⭐ 3. (추가)] 휴대폰 번호 변경 로직 State
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoadingSend, setIsLoadingSend] = useState(false);
  const [isLoadingCheck, setIsLoadingCheck] = useState(false);
  const [isLoadingSave, setIsLoadingSave] = useState(false);
  const [timer, setTimer] = useState(180);

  // [⭐ 추가] 타이머 시작/정리
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(180);
    setIsCodeSent(true);

    timerRef.current = window.setInterval(() => {
      setTimer(prevTime => {
        if (prevTime === 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsCodeSent(false); // 시간 초과 시 다시 보낼 수 있도록
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    // 컴포넌트 언마운트 시 타이머 정리
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);


  // [⭐ 2. 수정] Firebase 데이터 로드 (선택 약관 추가)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUserUid(user.uid);
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();

          // 1. 기본 정보 로드
          setEmail(userData.email || '');
          setName(userData.name || '');
          setBirth(userData.birth || '');
          const formattedPhone = formatPhoneNumber(userData.phone || '');
          setPhone(formattedPhone);
          setOriginalPhone(formattedPhone);
          setNickname(userData.nickname || '');
          setOriginalNickname(userData.nickname || '');

          // [⭐ 추가] 선택 약관 정보 로드
          setAgreedMarketing(userData.agreedMarketing || false);
          setAgreedNotifications(userData.agreedNotifications || false);
          setOriginalAgreedMarketing(userData.agreedMarketing || false);
          setOriginalAgreedNotifications(userData.agreedNotifications || false);

          // 2. role 및 partnerInfo 로드
          const role = userData.role || 'customer';
          setUserRole(role);

          if (ROLE_TAB_LABELS[role]) {
            setPartnerInfo(userData.partnerInfo || {});
          }

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
  }, [navigate, db]);


  // [⭐ 4. (수정)] 휴대폰 번호 포맷 및 인증 리셋 핸들러
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

    if (formattedValue !== originalPhone) {
      setIsPhoneVerified(false);
      setIsCodeSent(false);
      setVerificationCode('');
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // [⭐ 5. (추가)] 인증번호 발송 (SignUpPage 참고)
  const requestVerificationCode = async () => {
    const phoneNumber = phone.replace(/-/g, ''); // 포맷 제거
    if (phoneNumber.length !== 11) {
      alert('휴대폰 번호 11자리를 입력해주세요.');
      return;
    }

    setIsLoadingSend(true);
    try {
      const sendCode = httpsCallable(functions, 'sendVerificationCode');
      const result: any = await sendCode({ phoneNumber: phoneNumber });

      if (result.data && result.data.success) {
        startTimer();
        alert(result.data.message || '인증번호가 발송되었습니다.');
      } else {
        alert(result.data.message || '인증번호 발송에 실패했습니다.');
      }
    } catch (error: any) {
      alert(`발송 오류: ${error.message || '알 수 없는 오류'}`);
    } finally {
      setIsLoadingSend(false);
    }
  };

  // [⭐ 6. (추가)] 인증번호 확인 (SignUpPage 참고)
  const checkVerificationCode = async () => {
    const phoneNumber = phone.replace(/-/g, ''); // 포맷 제거
    const code = verificationCode.trim();

    if (!code || code.length !== 6) {
      alert('인증번호 6자리를 입력해주세요.');
      return;
    }

    setIsLoadingCheck(true);
    try {
      const checkCode = httpsCallable(functions, 'checkVerificationCodeForSignup');
      const result: any = await checkCode({
        phoneNumber: phoneNumber,
        code: code
      });

      if (result.data && result.data.success) {
        if (timerRef.current) clearInterval(timerRef.current);
        alert(result.data.message || '휴대폰 번호가 인증되었습니다.');
        setIsPhoneVerified(true); 
        setIsCodeSent(false); 
        setIsEditingPhone(false); 
      } else {
        alert(result.data.message || '인증번호 확인에 실패했습니다.');
      }
    } catch (error: any) {
      alert(`인증 오류: ${error.message || '인증 실패'}`);
    } finally {
      setIsLoadingCheck(false);
    }
  };

  // [⭐ 3. 수정] 변경정보 저장 (선택 약관 동의 여부 추가)
  const handleSaveChanges = async () => {
    if (!currentUserUid) return;

    setIsLoadingSave(true);
    const updates: Record<string, any> = {};

    // 1. 닉네임 변경 확인
    const newNickname = nickname.trim();
    if (newNickname !== originalNickname) {
      if (newNickname.length < 2 || newNickname.length > 8) {
        alert('닉네임은 2~8자 사이여야 합니다.');
        setIsLoadingSave(false);
        return;
      }
      updates.nickname = newNickname;
    }

    // 2. 휴대폰 번호 변경 확인
    const newPhone = phone.replace(/-/g, '');
    if (phone !== originalPhone) {
      if (!isPhoneVerified) {
        alert('휴대폰 번호가 변경되었으나 인증이 완료되지 않았습니다.');
        setIsLoadingSave(false);
        return;
      }
      updates.phone = newPhone; // -(하이픈) 없는 순수 숫자로 저장
    }

    // [⭐ 추가] 3. 마케팅 동의 변경 확인
    if (agreedMarketing !== originalAgreedMarketing) {
      updates.agreedMarketing = agreedMarketing;
    }

    // [⭐ 추가] 4. 알림 수신 동의 변경 확인
    if (agreedNotifications !== originalAgreedNotifications) {
      updates.agreedNotifications = agreedNotifications;
    }


    if (Object.keys(updates).length === 0) {
      alert('변경된 정보가 없습니다.');
      setIsLoadingSave(false);
      return;
    }

    // 5. Firestore에 업데이트
    try {
      const docRef = doc(db, "users", currentUserUid);
      await updateDoc(docRef, updates);

      alert('정보가 성공적으로 변경되었습니다.');

      // 원본 정보 업데이트
      if (updates.nickname) {
        setOriginalNickname(updates.nickname);
      }
      if (updates.phone) {
        setOriginalPhone(phone); // 포맷된 폰 번호로 원본 업데이트
        setIsPhoneVerified(false); // 인증 상태 초기화
      }
      // [⭐ 추가] 원본 약관 정보 업데이트
      if (updates.agreedMarketing !== undefined) {
        setOriginalAgreedMarketing(updates.agreedMarketing);
      }
      if (updates.agreedNotifications !== undefined) {
        setOriginalAgreedNotifications(updates.agreedNotifications);
      }

    } catch (error) {
      console.error("정보 변경 오류:", error);
      alert("정보 변경 중 오류가 발생했습니다.");
    } finally {
      setIsLoadingSave(false);
    }
  };


  // --- 렌더링 로직 ---

  if (isLoading) {
    return <div>로딩 중...</div>;
  }

  const roleTabLabel = ROLE_TAB_LABELS[userRole];

  return (
    <div className="page-container">


      <main className="main-content" style={{ padding: isMobile ? '16px' : '32px 0' }}>

        <div className="mypage-container">
          <h2 className="mypage-title">마이페이지</h2>

          {/* 탭 네비게이션 */}
          {roleTabLabel && (
            <div className="tab-nav-container">
              <button
                className={`tab-nav-button ${activeTab === 'basic' ? 'active' : ''}`}
                onClick={() => setActiveTab('basic')}
              >
                기본정보
              </button>
              <button
                className={`tab-nav-button ${activeTab === 'role' ? 'active' : ''}`}
                onClick={() => setActiveTab('role')}
              >
                {roleTabLabel}
              </button>
            </div>
          )}

          {/* --- 5-A: 기본정보 탭 --- */}
          {activeTab === 'basic' && (
            <div>
              {/* 이메일 주소 */}
              <div className="form-group">
                <label className="form-label" htmlFor="email">이메일 주소</label>
                <input id="email" className="form-input" value={email} disabled />
              </div>

              {/* 비밀번호 */}
              <div className="form-group">
                <label className="form-label">비밀번호</label>
                <div className="input-group">
                  <input type="password" className="form-input" value="**********" disabled />
                  <button className="form-button btn-secondary" onClick={() => navigate('/password-change')}>
                    비밀번호 변경
                  </button>
                </div>
              </div>

              {/* 닉네임 */}
              <div className="form-group">
                <label className="form-label" htmlFor="nickname">닉네임</label>
                <input
                  type="text"
                  id="nickname"
                  className="form-input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={8}
                />
              </div>

              {/* 이름 */}
              <div className="form-group">
                <label className="form-label" htmlFor="name">이름</label>
                <input id="name" className="form-input" value={name} disabled />
              </div>

              {/* 생년월일 */}
              <div className="form-group">
                <label className="form-label" htmlFor="birth">생년월일</label>
                <input id="birth" className="form-input" value={birth} disabled />
              </div>

              {/* 휴대폰 번호 */}
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
                    disabled={!isEditingPhone} // [수정]
                  />
                  {!isEditingPhone ? (
                    <button
                      className="form-button btn-secondary"
                      onClick={() => setIsEditingPhone(true)}
                    >
                      번호 변경
                    </button>
                  ) : (
                    <button
                      className="form-button btn-secondary"
                      onClick={requestVerificationCode}
                      disabled={isLoadingSend || isPhoneVerified || phone === originalPhone}
                    >
                      {isPhoneVerified ? '인증완료' : (isLoadingSend ? '발송 중...' : '인증번호 발송')}
                    </button>
                  )}
                </div>
              </div>

              {/* 인증번호 입력란 */}
              {isCodeSent && !isPhoneVerified && (
                <div className="form-group">
                  <label className="form-label" htmlFor="verificationCode">인증번호</label>
                  <div className="input-group">
                    <input
                      type="tel"
                      id="verificationCode"
                      className="form-input"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      maxLength={6}
                      placeholder="인증번호 6자리"
                    />
                    <span className="timer-text">{formatTimer(timer)}</span>
                    <button
                      className="form-button btn-primary"
                      onClick={checkVerificationCode}
                      disabled={isLoadingCheck}
                    >
                      {isLoadingCheck ? '확인 중...' : '확인'}
                    </button>
                  </div>
                </div>
              )}

              {/* [⭐ 4. 추가] 선택 약관 동의 */}
              <div className="form-group">
                <label className="form-label">선택 동의</label>
                <div className="agreement-row">
                  {/* 마케팅 동의 */}
                  <div className="agree-item">
                    <input 
                      type="checkbox" 
                      id="agreeMarketing" 
                      checked={agreedMarketing}
                      onChange={(e) => setAgreedMarketing(e.target.checked)}
                    />
                    <label htmlFor="agreeMarketing">
                      [선택] 개인정보 마케팅 활용 동의
                    </label>
                  </div>
                  {/* 알림 수신 동의 */}
                  <div className="agree-item">
                    <input 
                      type="checkbox" 
                      id="agreeNotifications" 
                      checked={agreedNotifications}
                      onChange={(e) => setAgreedNotifications(e.target.checked)}
                    />
                    <label htmlFor="agreeNotifications">
                      [선택] 이메일, SMS, 앱알림 수신 동의
                    </label>
                  </div>
                </div>
              </div>


              {/* 변경정보 저장 버튼 */}
              <div className="form-group" style={{ marginTop: '48px' }}>
                <button
                  className="form-button btn-save-changes" 
                  onClick={handleSaveChanges}
                  disabled={isLoadingSave}
                >
                  {isLoadingSave ? '저장 중...' : '변경정보 저장'}
                </button>
              </div>

            </div>
          )}

          {/* --- 5-B: 파트너/셀러/협력사 정보 탭 --- */}
          {activeTab === 'role' && partnerInfo && currentUserUid && (
            <PartnerInfoTab
              initialData={partnerInfo}
              userRole={userRole}
              userId={currentUserUid}
              roleTabLabel={roleTabLabel} 
            />
          )}

        </div>
      </main>

      <Footer />
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={handleMenuClose} />}
    </div>
  );
};

export default MyPage;