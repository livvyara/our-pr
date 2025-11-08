// src/pages/SignUpPage.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { K_BRAND_COLOR } from '../constants'; 
import './SignUpPage.css';

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
    
    // 2. 상태 변수 정의
    const [selectedDomain, setSelectedDomain] = useState<string | undefined>(DOMAIN_LIST[0]);
    const [isLoadingSend, setIsLoadingSend] = useState(false);
    const [isLoadingCheck, setIsLoadingCheck] = useState(false);
    const [isLoadingSignUp, setIsLoadingSignUp] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [verificationAttempts, setVerificationAttempts] = useState(0); 
    const [canRequestCodeAt, setCanRequestCodeAt] = useState<Date | null>(null);
    const [lastRequestTime, setLastRequestTime] = useState<Date | null>(null); 
    const [timer, setTimer] = useState(180); 
    const timerRef = useRef<number | null>(null); 

    // 닉네임 상태
    const [nicknameInput, setNicknameInput] = useState('');
    const [isNicknameChecked, setIsNicknameChecked] = useState(false);
    const [nicknameMessage, setNicknameMessage] = useState<string | null>(null);
    const [isCheckingNickname, setIsCheckingNickname] = useState(false);
    
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
        if (!nickname) {
            setNicknameMessage('닉네임을 입력해주세요.');
            setIsNicknameChecked(false);
            return;
        }

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
    
    // 6. 인증번호 발송 (시뮬레이션 및 상태 업데이트 적용)
    const requestVerificationCode = async () => {
        const phoneNumber = phoneRef.current?.value || '';

        if (!phoneNumber) { alert('휴대폰 번호를 입력해주세요.'); return; }
        if (verificationAttempts >= MAX_ATTEMPTS) { 
            alert('인증번호 요청 횟수(3회)를 초과하여 24시간 후에 다시 시도할 수 있습니다.'); return; 
        }
        if (canRequestCodeAt && new Date() < canRequestCodeAt) { 
            alert('인증번호 요청은 24시간 후에 다시 시도할 수 있습니다.'); return; 
        }
        
        setIsLoadingSend(true);
        
        try {
            await new Promise((resolve, reject) => setTimeout(() => {
                const success = Math.random() > 0.1; 
                if (success) {
                    setVerificationAttempts(prev => prev + 1); 
                    setLastRequestTime(new Date()); 
                    
                    startTimer(); 
                    alert('인증번호가 발송되었습니다.');
                    resolve(true); 
                } else {
                    reject({ message: '인증번호 발송에 실패했습니다.' });
                }
            }, 1000));
            
        } catch (error: any) {
            alert(`오류: ${error.message || '발송 실패'}`);
        } finally {
            setIsLoadingSend(false);
             if (verificationAttempts + 1 >= MAX_ATTEMPTS) {
                 setCanRequestCodeAt(new Date(Date.now() + 24 * 60 * 60 * 1000));
             }
        }
    };
    
    // 7. 인증번호 확인 (시뮬레이션)
    const checkVerificationCode = async () => {
        const code = codeRef.current?.value || '';
        if (code !== '123456') {
            alert('잘못된 인증번호입니다.');
            return;
        }
        
        setIsLoadingCheck(true);
        
        setTimeout(() => {
            setIsLoadingCheck(false);
            setIsPhoneVerified(true);
            if (timerRef.current) clearInterval(timerRef.current);
            alert('휴대폰 인증이 완료되었습니다.');
        }, 500);
    };

    // 8. 최종 회원가입 (시뮬레이션)
    const finalSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!isNicknameChecked || nicknameMessage !== '사용 가능합니다.') {
            alert('닉네임 중복 확인을 완료해주세요.');
            return;
        }
        if (!isPhoneVerified) {
            alert('휴대폰 인증을 완료해주세요.');
            return;
        }

        setIsLoadingSignUp(true);
        
        // ... 실제 서버 가입 로직 ...
        
        setTimeout(() => {
            setIsLoadingSignUp(false);
            alert('회원가입이 완료되었습니다!');
            navigate('/login');
        }, 1500);
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

                    {/* --- 1. 이메일 (동적 전환 적용) --- */}
                    <TitleWithDescription title="이메일" description="회원가입 후 아이디로 사용됩니다." />
                    <div className="email-row">
                        {/* 1. 아이디 입력 필드 */}
                        <input type="text" placeholder="아이디" ref={emailIdRef} className="signup-input email-id-input" required />
                        
                        <span className="email-at">@</span>
                        
                        {/* 2. 도메인 선택/입력 영역 */}
                        {selectedDomain === '직접입력' ? (
                            // 3-A. '직접입력' 선택 시 나타나는 도메인 입력 칸
                            <input 
                                type="text" 
                                placeholder="도메인 입력" 
                                className="signup-input domain-input-field" // 클래스 이름 변경
                                value={selectedDomain === '직접입력' ? '' : selectedDomain} // 직접입력 시 초기값 제거
                                onChange={(e) => { 
                                    setSelectedDomain(e.target.value); // 입력된 값을 상태로 저장
                                }}
                                required 
                            />
                        ) : (
                            // 3-B. 일반 도메인 선택 드롭다운 박스
                            <div className="domain-select-wrapper">
                                <input 
                                    type="text" 
                                    className="signup-input domain-text-input" 
                                    value={selectedDomain} 
                                    readOnly 
                                />
                                <select 
                                    className="signup-input domain-select"
                                    value={selectedDomain}
                                    onChange={(e) => {
                                        setSelectedDomain(e.target.value);
                                    }}
                                >
                                    {DOMAIN_LIST.map(domain => (
                                        <option key={domain} value={domain}>{domain}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* 4. '직접입력' 옵션을 제공하는 별도 드롭다운 (항상 표시) */}
                        <select 
                            className="signup-input domain-option-select" // 새로운 클래스
                            value={selectedDomain === '직접입력' ? '직접입력' : '도메인선택'}
                            onChange={(e) => {
                                setSelectedDomain(e.target.value === '직접입력' ? '직접입력' : e.target.value);
                            }}
                        >
                            <option value="도메인선택" disabled>도메인 선택</option>
                            {DOMAIN_LIST.map(domain => (
                                <option key={domain} value={domain}>{domain}</option>
                            ))}
                        </select>
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
                        <input type="tel" placeholder="휴대폰 번호" ref={phoneRef} className="signup-input" readOnly={isPhoneVerified} required />
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