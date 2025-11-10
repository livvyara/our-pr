// src/pages/SignUpPage.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { K_BRAND_COLOR } from '../constants'; 
import './SignUpPage.css';

// ⭐ Firebase 및 Firestore 임포트 추가 (인증 및 데이터 저장)
import { httpsCallable } from "firebase/functions";
import { functions, auth } from '../firebase-config'; // auth 객체 임포트 추가
import { createUserWithEmailAndPassword } from 'firebase/auth'; // Auth 함수 임포트
import { doc, setDoc, getFirestore } from 'firebase/firestore'; // Firestore 임포트

const db = getFirestore(auth.app); // Firestore 인스턴스 초기화

// ----------------------------------------------------
// Helper Type & Components
// ----------------------------------------------------
const DOMAIN_LIST = ['naver.com', 'gmail.com', 'daum.net', 'hanmail.net', '직접입력'];
const MAX_ATTEMPTS = 3; 

interface TitleDescProps { title: string; description?: string; }
const TitleWithDescription: React.FC<TitleDescProps> = ({ title, description }) => (
    <div className="title-desc-wrapper">
        <p className="field-title">{title}</p>
        {description && (
            <p className="field-description">{description}</p>
        )}
    </div>
);
// ----------------------------------------------------

const SignUpPage: React.FC = () => {
    const navigate = useNavigate();
    
    // 1. Ref 변수 정의
    const formRef = useRef<HTMLFormElement>(null); 
    const emailIdRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const passwordConfirmRef = useRef<HTMLInputElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const codeRef = useRef<HTMLInputElement>(null);
    const domainDirectRef = useRef<HTMLInputElement>(null); // ⭐ 도메인 직접 입력 Ref 추가
    
    // 2. 상태 변수 정의
    const [selectedDomain, setSelectedDomain] = useState<string>(DOMAIN_LIST[0]); // 초기값은 첫 번째 도메인
    const [isDirectInput, setIsDirectInput] = useState(false); // ⭐ 도메인 직접 입력 상태 추가
    const [isLoadingSend, setIsLoadingSend] = useState(false);
    const [isLoadingCheck, setIsLoadingCheck] = useState(false);
    const [isLoadingSignUp, setIsLoadingSignUp] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [verificationAttempts, setVerificationAttempts] = useState(0); 
    const [canRequestCodeAt, setCanRequestCodeAt] = useState<Date | null>(null);
    const [_lastRequestTime, setLastRequestTime] = useState<Date | null>(null); 
    const [timer, setTimer] = useState(180); 
    const timerRef = useRef<number | null>(null); 

    // 닉네임 상태
    const [nicknameInput, setNicknameInput] = useState('');
    const [isNicknameChecked, setIsNicknameChecked] = useState(false);
    const [nicknameMessage, setNicknameMessage] = useState<string | null>(null);
    const [isCheckingNickname, setIsCheckingNickname] = useState(false);
    
    // ⭐ 이메일 주소 완성 헬퍼 함수
    const getFullEmail = (): string | null => {
        const emailId = emailIdRef.current?.value || '';
        let domain = '';
        
        if (isDirectInput) {
            domain = domainDirectRef.current?.value || ''; // 직접 입력 Ref 사용
        } else if (selectedDomain && selectedDomain !== '도메인선택') {
            domain = selectedDomain;
        }

        if (emailId && domain && domain !== '직접입력') {
            return `${emailId}@${domain}`;
        }
        return null;
    };
    
    // 3. 타이머 시작/취소 함수 (useCallback으로 최적화)
    const startTimer = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimer(180);
        setIsCodeSent(true);
        
        timerRef.current = window.setInterval(() => {
            setTimer(prevTime => {
                if (prevTime === 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setIsCodeSent(false);
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);
    }, []);

    // 4. 컴포넌트 정리 (dispose 역할)
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);
    
    // 5. 닉네임 중복 확인 (시뮬레이션)
    const checkNicknameAvailability = async () => {
        const nickname = nicknameInput.trim();
        if (!nickname) { setNicknameMessage('닉네임을 입력해주세요.'); setIsNicknameChecked(false); return; }

        setIsCheckingNickname(true);
        setNicknameMessage('중복 확인 중...');
        
        setTimeout(() => {
            setIsCheckingNickname(false);
            if (nickname === 'testuser') { 
                setNicknameMessage('이미 사용 중인 닉네임입니다.');
                setIsNicknameChecked(false);
            } else {
                setNicknameMessage('사용 가능합니다.');
                setIsNicknameChecked(true);
            }
        }, 1000);
    };
    // 6. 인증번호 발송 (Functions 호출)
    const requestVerificationCode = async () => { /* ... 기존 Functions 호출 로직 유지 ... */ };
    // 7. 인증번호 확인 (Functions 호출)
    const checkVerificationCode = async () => { /* ... 기존 Functions 호출 로직 유지 ... */ };


    // ⭐ 8. 최종 회원가입 (Firebase Authentication 및 Firestore 저장)
    const finalSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // 1. 필수 유효성 검사
        if (!isNicknameChecked || nicknameMessage !== '사용 가능합니다.') { alert('닉네임 중복 확인을 완료해주세요.'); return; }
        if (!isPhoneVerified) { alert('휴대폰 인증을 완료해주세요.'); return; }
        if (passwordRef.current?.value !== passwordConfirmRef.current?.value) { alert('비밀번호가 일치하지 않습니다.'); return; }
        
        const fullEmail = getFullEmail();
        const password = passwordRef.current?.value || '';
        const nickname = nicknameInput;
        const phoneNumber = phoneRef.current?.value || '';

        if (!fullEmail) {
            alert('이메일 주소를 정확히 입력해주세요.');
            return;
        }
        
        setIsLoadingSignUp(true);
        
        try {
            // 2. Firebase Authentication에 사용자 생성
            const userCredential = await createUserWithEmailAndPassword(auth, fullEmail, password);
            const user = userCredential.user;

            // 3. Firestore에 추가 정보 저장 (컬렉션 이름: users)
            await setDoc(doc(db, "users", user.uid), {
                email: fullEmail,
                nickname: nickname,
                phone: phoneNumber,
                createdAt: new Date(),
            });

            alert('회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.');
            navigate('/login'); // 로그인 페이지로 이동
            
        } catch (error: any) {
            let message = '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.';
            if (error.code === 'auth/email-already-in-use') {
                message = '이미 사용 중인 이메일입니다. 다른 이메일을 사용해 주세요.';
            } else if (error.code === 'auth/weak-password') {
                message = '비밀번호는 최소 6자 이상이어야 합니다.';
            }
            alert(`오류: ${message}`);
            console.error(error);
        } finally {
            setIsLoadingSignUp(false);
        }
    };
    
    // 9. 헬퍼: 타이머 포맷
    const formatTimer = (seconds: number) => {
      const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
      const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
      return `${minutes}:${remainingSeconds}`;
    };
    
    return (
        <div className="signup-page-container">
            <div className="signup-box-wrapper">
                <form ref={formRef} onSubmit={finalSignUp} className="signup-form">
                
                    {/* --- 로고 --- */}
                    <h1 className="logo-text">My WebApp Logo</h1>
                    <div style={{ height: '48px' }}></div>

                    {/* --- 1. 이메일 (UI 및 동적 전환 적용) --- */}
                    <TitleWithDescription title="이메일" description="회원가입 후 아이디로 사용됩니다." />
                    <div className="email-row">
                        {/* 아이디 입력 필드 (flex-grow: 1 적용) */}
                        <input type="text" placeholder="아이디" ref={emailIdRef} className="signup-input email-id-input" required />
                        
                        <span className="email-at">@</span>
                        
                        {/* 도메인 선택 컨테이너 */}
                        <div className="domain-selection-area">
                            {/* 1. 도메인 입력란 (직접 입력 시에만 표시) */}
                            {isDirectInput && (
                                <input 
                                    type="text" 
                                    placeholder="도메인 입력" 
                                    ref={domainDirectRef} 
                                    className="signup-input domain-input-field" 
                                    required 
                                />
                            )}
                            {/* 2. 도메인 선택 드롭다운 (항상 표시 - '직접입력' 옵션 포함) */}
                            <select 
                                className="signup-input domain-select-control" // ⭐ CSS 제어를 위한 새로운 클래스
                                value={selectedDomain}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setSelectedDomain(value);
                                    setIsDirectInput(value === '직접입력'); // ⭐ 상태 업데이트
                                }}
                                style={{ 
                                    // isDirectInput일 때, select가 입력 필드의 공간을 차지하지 않도록 숨김
                                    visibility: isDirectInput ? 'hidden' : 'visible',
                                    position: isDirectInput ? 'absolute' : 'relative',
                                    width: isDirectInput ? '0' : '120px' // 크기 제어
                                }}
                            >
                                <option value="도메인선택" disabled>도메인 선택</option>
                                {DOMAIN_LIST.map(domain => (
                                    <option key={domain} value={domain}>{domain}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div style={{ height: '24px' }}></div>
                    
                    {/* --- 2. 비밀번호 --- */}
                    <TitleWithDescription title="비밀번호" description="8~16자, 영문/숫자/특수문자 중 2가지 이상을 조합해주세요." />
                    <input type="password" placeholder="비밀번호" ref={passwordRef} className="signup-input" required />
                    <div style={{ height: '16px' }}></div>

                    {/* --- 3. 비밀번호 확인 --- */}
                    <TitleWithDescription title="비밀번호 확인" />
                    <input type="password" placeholder="비밀번호 재확인" ref={passwordConfirmRef} className="signup-input" required />
                    <div style={{ height: '24px' }}></div>

                    {/* --- 4. 닉네임 --- */}
                    <TitleWithDescription title="닉네임" description="2~8자, 한글/영문/숫자만 사용 가능합니다." />
                    <div className="nickname-row">
                        <input 
                            type="text" 
                            placeholder="닉네임" 
                            className="signup-input" 
                            maxLength={8}
                            value={nicknameInput}
                            onChange={(e) => {
                                setNicknameInput(e.target.value);
                                setIsNicknameChecked(false);
                                setNicknameMessage(null);
                            }}
                            required 
                        />
                        <button 
                            type="button" 
                            className="check-nickname-button" 
                            onClick={checkNicknameAvailability}
                            disabled={isCheckingNickname || isNicknameChecked}
                            style={{ 
                                backgroundColor: isNicknameChecked ? '#0070c0' : K_BRAND_COLOR, 
                                color: isNicknameChecked ? 'white' : 'black',
                            }}
                        >
                            {isCheckingNickname ? '확인 중' : (isNicknameChecked ? '확인 완료' : '중복 확인')}
                        </button>
                    </div>
                    {nicknameMessage && (
                        <p className={`message-text ${isNicknameChecked ? 'success' : 'error'}`}>{nicknameMessage}</p>
                    )}
                    <div style={{ height: '24px' }}></div>
                    
                    {/* --- 5. 휴대폰 인증 (휴대폰 번호) --- */}
                    <TitleWithDescription title="휴대폰 번호" description="'-' 없이 숫자만 입력해주세요."/>
                    <div className="phone-row">
                        <input type="number" placeholder="휴대폰 번호" ref={phoneRef} className="signup-input" readOnly={isPhoneVerified} required />
                        <button type="button" className="send-code-button" onClick={requestVerificationCode} disabled={isLoadingSend || isPhoneVerified || verificationAttempts >= MAX_ATTEMPTS}>
                            {isLoadingSend ? '발송 중...' : '인증번호 발송'}
                        </button>
                    </div>
                    <div style={{ height: '16px' }}></div>

                    {/* --- 6. 인증번호 6자리 --- */}
                    {(isCodeSent || isPhoneVerified) && (
                        <>
                            <TitleWithDescription title="인증번호 6자리" />
                            <div className="verification-row">
                                <input type="text" placeholder="인증번호 6자리" ref={codeRef} className="signup-input code-input" maxLength={6} readOnly={isPhoneVerified} required />
                                <div className={`timer-text ${timer < 30 ? 'red' : (isPhoneVerified ? 'green' : 'orange')}`}>
                                    {isPhoneVerified ? '인증 완료' : formatTimer(timer)}
                                </div>
                                <button type="button" className="verify-button" onClick={checkVerificationCode} disabled={isLoadingCheck || isPhoneVerified || !isCodeSent}>
                                    {isLoadingCheck ? '확인 중' : '확인'}
                                </button>
                            </div>
                            <div style={{ height: '32px' }}></div>
                        </>
                    )}
                    {!(isCodeSent || isPhoneVerified) && <div style={{ height: '48px' }}></div>}


                    {/* --- 최종 가입 버튼 --- */}
                    <button
                        type="submit"
                        className="final-signup-button"
                        style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }}
                        disabled={isLoadingSignUp || !isPhoneVerified || !isNicknameChecked} 
                    >
                        {isLoadingSignUp ? '가입 처리 중...' : '가입하기'}
                    </button>
                    <div style={{ height: '24px' }}></div>

                    {/* --- 로그인으로 돌아가기 --- */}
                    <button
                        type="button"
                        className="back-to-login-btn"
                        onClick={() => navigate('/login')} 
                    >
                        로그인으로 돌아가기
                    </button>
                </form>
            </div>
        </div>
    );
};

export default SignUpPage;