import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { K_BRAND_COLOR } from '../constants'; 
import './SignUpPage.css';

// Firebase Modules
import { httpsCallable } from "firebase/functions";
import { functions, auth } from '../firebase-config';
import { createUserWithEmailAndPassword } from 'firebase/auth'; 
import { doc, setDoc, getFirestore } from 'firebase/firestore'; 
import logoImage from '../assets/logo.png';


const db = getFirestore(auth.app);

// ----------------------------------------------------
// Helper Type & Constants
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
    const passwordRef = useRef<HTMLInputElement>(null);
    const passwordConfirmRef = useRef<HTMLInputElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const codeRef = useRef<HTMLInputElement>(null);
    const domainDirectRef = useRef<HTMLInputElement>(null); 
    const nameRef = useRef<HTMLInputElement>(null); // [요청 4] 추가
    const birthRef = useRef<HTMLInputElement>(null); // [요청 4] 추가
    
    // 2. 상태 변수 정의
    const [selectedDomain, setSelectedDomain] = useState<string>(DOMAIN_LIST[0]);
    const [isDirectInput, setIsDirectInput] = useState(false); 
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
    const debounceTimerRef = useRef<number | null>(null); 

    // 닉네임 상태 (자동 검사 관련)
    const [nicknameInput, setNicknameInput] = useState('');
    const [isNicknameChecked, setIsNicknameChecked] = useState(false);
    const [nicknameMessage, setNicknameMessage] = useState<string | null>(null);
    const [isCheckingNickname, setIsCheckingNickname] = useState(false);

    // [요청 3] 이메일 ID 상태 (한글 방지용)
    const [emailId, setEmailId] = useState('');
    
    // 휴대폰 입력 상태 및 유효성 (11자리)
    const [phoneNumberInput, setPhoneNumberInput] = useState('');
    const isPhoneValid = phoneNumberInput.length === 11;


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
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    // [요청 3] 이메일 아이디 한글 입력 방지 핸들러
    const handleEmailIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // 정규식을 사용하여 한글 입력을 방지합니다.
        const value = e.target.value.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, '');
        setEmailId(value);
    };


    // ⭐ 5. 닉네임 중복 확인 (디바운스를 통해 자동 호출될 함수)
    const checkNicknameAvailability = useCallback(async (nickname: string) => {
        const trimmedNickname = nickname.trim();
        
        if (!trimmedNickname) {
            setNicknameMessage(null);
            setIsNicknameChecked(false);
            return;
        }

        // 유효성 검사 (2~8자, 한글/영문/숫자)
        const nicknameRegExp = /^[a-zA-Z0-9가-힣]{2,8}$/;
        if (!nicknameRegExp.test(trimmedNickname)) {
            setNicknameMessage('2~8자, 한글/영문/숫자만 입력 가능합니다.');
            setIsNicknameChecked(false);
            return;
        }

        setIsCheckingNickname(true);
        setNicknameMessage('확인 중...');

        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const isDuplicate = ['testuser', 'admin'].includes(trimmedNickname.toLowerCase());

        setIsCheckingNickname(false);
        if (isDuplicate) {
            setNicknameMessage('중복된 닉네임입니다.');
            setIsNicknameChecked(false);
        } else {
            setNicknameMessage('사용 가능한 닉네임입니다.');
            setIsNicknameChecked(true);
        }
    }, []);

    // ⭐ 5-B. 닉네임 디바운스 useEffect
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        
        if (!nicknameInput.trim()) {
            setNicknameMessage(null);
            setIsNicknameChecked(false);
            return;
        }

        debounceTimerRef.current = window.setTimeout(() => {
            checkNicknameAvailability(nicknameInput);
        }, 500);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [nicknameInput, checkNicknameAvailability]); // 닉네임 입력 변경 시 실행


    // 6. 휴대폰 입력 변경 핸들러 (숫자 필터링)
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^0-9]/g, ''); 
        setPhoneNumberInput(value.slice(0, 11));
    };

    // 7. 이메일 주소 완성 헬퍼 함수
    const getFullEmail = (): string | null => {
        // const emailId = emailIdRef.current?.value || ''; // [요청 3] 삭제
        // [요청 3] emailId state를 직접 사용
        let domain = '';
        
        if (isDirectInput) {
            domain = domainDirectRef.current?.value || '';
        } else if (selectedDomain && selectedDomain !== '도메인선택') {
            domain = selectedDomain;
        }

        if (emailId && domain && domain !== '직접입력') { // [요청 3] emailId state 사용
            return `${emailId}@${domain}`;
        }
        return null;
    };
    
    // 8. 인증번호 발송 (Functions 호출)
    const requestVerificationCode = async () => {
        const phoneNumber = phoneNumberInput; 

        if (!isPhoneValid) { 
            alert('휴대폰 번호 11자리를 입력해주세요.'); 
            return; 
        } 
        if (verificationAttempts >= MAX_ATTEMPTS) { 
            alert('인증번호 요청 횟수(3회)를 초과하여 24시간 후에 다시 시도할 수 있습니다.'); 
            return; 
        }
        if (canRequestCodeAt && new Date() < canRequestCodeAt) { 
            alert('인증번호 요청은 24시간 후에 다시 시도할 수 있습니다.'); 
            return; 
        }
        
        setIsLoadingSend(true);
        
        try {
            const sendCode = httpsCallable(functions, 'sendVerificationCode');
            const result: any = await sendCode({ phoneNumber: phoneNumber });
            
            if (result.data && result.data.success) {
                setVerificationAttempts(prev => prev + 1);
                setLastRequestTime(new Date()); 
                startTimer();
                alert(result.data.message || '인증번호가 발송되었습니다.');
            } else {
                 alert(result.data.message || '인증번호 발송에 실패했습니다.');
            }
            
        } catch (error: any) {
            alert(`발송 오류: ${error.message || error.code || '알 수 없는 오류'}`);
        } finally {
            setIsLoadingSend(false);
             if (verificationAttempts + 1 >= MAX_ATTEMPTS) {
                 setCanRequestCodeAt(new Date(Date.now() + 24 * 60 * 60 * 1000));
             }
        }
    };

    // 9. 인증번호 확인 (Functions 호출)
    const checkVerificationCode = async () => {
        const phoneNumber = phoneNumberInput;
        const code = codeRef.current?.value || '';
        
        if (!phoneNumber || !code) { 
            alert('휴대폰 번호와 인증번호를 입력해주세요.'); 
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
            } else {
                alert(result.data.message || '인증번호 확인에 실패했습니다.');
            }

        } catch (error: any) {
            alert(`인증 오류: ${error.message || error.code || '인증 실패'}`);
            setIsPhoneVerified(false);
        } finally {
            setIsLoadingCheck(false);
        }
    };


    // ⭐ 10. 최종 회원가입 (Firebase Authentication 및 Firestore 저장)
    const finalSignUp = async (e: React.FormEvent) => {
        e.preventDefault();

        // --- [핵심] 비밀번호 및 추가 필드 유효성 검사 ---
        const password = passwordRef.current?.value || '';
        const passwordConfirm = passwordConfirmRef.current?.value || '';
        const name = nameRef.current?.value || '';
        const birth = birthRef.current?.value || '';

        // 1. 필수 유효성 검사
        if (!isNicknameChecked) { 
    alert('닉네임 중복 확인을 완료해주세요. (사용 가능한 닉네임이어야 합니다)'); 
    return; 
}
        if (!isPhoneVerified) { alert('휴대폰 인증을 완료해주세요.'); return; }
        if (!name) { alert('이름을 입력해주세요.'); return; } // [요청 4] 이름 검사
        if (!birth || birth.length !== 8) { alert('생년월일 8자리를 정확히 입력해주세요.'); return; } // [요청 4] 생년월일 검사
        if (password !== passwordConfirm) { alert('비밀번호가 일치하지 않습니다.'); return; }

        // --- [핵심] 비밀번호 정규식 검사 (가입 실패 원인) ---
        // UI 설명: 8~16자, 영문/숫자/특수문자 중 2가지 이상 조합
        let types = 0;
        if (/[A-Za-z]/.test(password)) types++; // 영문
        if (/\d/.test(password)) types++; // 숫자
        if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password)) types++; // 특수문자

        if (password.length < 8 || password.length > 16 || types < 2) {
            alert('비밀번호는 8~16자, 영문/숫자/특수문자 중 2가지 이상을 조합해야 합니다.');
            return;
        }
        
        const fullEmail = getFullEmail();
        const nickname = nicknameInput;
        const phoneNumber = phoneNumberInput; 

        if (!fullEmail) { alert('이메일 주소를 정확히 입력해주세요.'); return; }
        
        setIsLoadingSignUp(true);
        
        try {
            // 2. Firebase Authentication에 사용자 생성
            const userCredential = await createUserWithEmailAndPassword(auth, fullEmail, password);
            const user = userCredential.user;

            // 3. Firestore에 추가 정보 저장 (role: 'customer' 포함)
            await setDoc(doc(db, "users", user.uid), {
                email: fullEmail,
                nickname: nickname,
                name: name, // [요청 4] 추가
                birth: birth, // [요청 4] 추가
                phone: phoneNumber,
                role: 'customer', 
                createdAt: new Date(),
            });

            alert('회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.');
            navigate('/login'); 
            
        } catch (error: any) {
    // 👇👇👇 이 두 줄을 추가해 정확한 오류를 확인하세요
    console.error("Firebase 회원가입 오류:", error); 
    console.log("Firebase 오류 코드:", error.code);

    let message = '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.';
    if (error.code === 'auth/email-already-in-use') { message = '이미 사용 중인 이메일입니다. 다른 이메일을 사용해 주세요.'; } 
    else if (error.code === 'auth/weak-password') { message = '비밀번호는 최소 6자 이상이어야 합니다.'; }
    alert(`오류: ${message}`);
} finally {
            setIsLoadingSignUp(false);
        }
    };
    
    // 11. 헬퍼: 타이머 포맷
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
                    <Link to="/"> 
                        <img src={logoImage} alt="My WebApp Logo" className="logo-image" />
                    </Link>
                    <div className="spacing-medium"></div>

                    {/* --- 1. 이메일 (UI 및 동적 전환 적용) --- */}
                    <TitleWithDescription title="이메일" description="회원가입 후 아이디로 사용됩니다." />
                    <div className="email-row">
                        {/* [요청 3] 아이디 입력 필드 (Ref -> State) */}
                        <input 
                            type="text" 
                            placeholder="아이디" 
                            // ref={emailIdRef} // 삭제
                            value={emailId} // 추가
                            onChange={handleEmailIdChange} // 추가
                            className="signup-input email-id-input" 
                            required 
                        />
                        
                        <span className="email-at">@</span>
                        
                        {/* 도메인 입력 및 선택 박스 컨테이너 */}
                        <div className="domain-input-group"> 
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
                            {/* 2. 도메인 선택 드롭다운 (isDirectInput이 false일 때만 표시) */}
                            {!isDirectInput && (
                                <select 
                                    className="signup-input domain-select-control"
                                    value={selectedDomain}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setSelectedDomain(value);
                                        setIsDirectInput(value === '직접입력');
                                    }}
                                >
                                    <option value="도메인선택" disabled>도메인 선택</option>
                                    {DOMAIN_LIST.map(domain => (
                                        <option key={domain} value={domain}>{domain}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>
                    
                    <div className="spacing-narrow"></div>

                    {/* --- 2. 비밀번호 --- */}
                    <TitleWithDescription title="비밀번호" description="8~16자, 영문/숫자/특수문자 중 2가지 이상을 조합해주세요." />

                    <input type="password" placeholder="비밀번호" ref={passwordRef} className="signup-input" required />
                    <div className="spacing-narrow"></div>

                    {/* --- 3. 비밀번호 확인 --- */}
                    <TitleWithDescription title="비밀번호 확인" />
                    <input type="password" placeholder="비밀번호 재확인" ref={passwordConfirmRef} className="signup-input" required />
                    
                    <div className="spacing-narrow"></div>

                    {/* --- 4. 닉네임 (자동 검사 적용) --- */}
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
                    </div>
                    
                    {/* 닉네임 메시지 영역 */}
                    {isCheckingNickname && (
                        <p className="message-text checking">확인 중...</p>
                    )}
                    
                    {!isCheckingNickname && nicknameMessage && (
                        <p className={`message-text ${isNicknameChecked ? 'success' : 'error'}`}>
                            {isNicknameChecked 
                                ? <span style={{ color: 'green' }}>{nicknameMessage}</span> 
                                : <span style={{ color: 'red', fontWeight: 'bold' }}>{nicknameMessage}</span>
                            }
                        </p>
                    )}

                    <div className="spacing-narrow"></div>
                    
                    {/* --- [요청 4] 이름 입력란 추가 --- */}
                    <TitleWithDescription title="이름" />
                    <input 
                        type="text" 
                        placeholder="이름" 
                        ref={nameRef} 
                        className="signup-input" 
                        required 
                    />
                    <div className="spacing-narrow"></div>

                    {/* --- [요청 4] 생년월일 입력란 추가 --- */}
                    <TitleWithDescription title="생년월일" description="예: 19900101 (8자리)" />
                    <input 
                        type="tel" 
                        placeholder="생년월일 8자리 (예: 19900101)" 
                        ref={birthRef} 
                        className="signup-input" 
                        maxLength={8}
                        onKeyDown={e => {
                            if (!((e.key >= '0' && e.key <= '9') || e.key === 'Backspace' || e.key === 'Tab' || e.key === 'Enter' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Delete')) {
                                e.preventDefault();
                            }
                        }}
                        required 
                    />
                    <div className="spacing-narrow"></div>

                    {/* --- 5. 휴대폰 인증 (휴대폰 번호) --- */}
                    <TitleWithDescription title="휴대폰 번호" description="'-' 없이 숫자만 입력해주세요."/>
                    <div className="phone-row">
                        <input 
                            type="number" 
                            placeholder="휴대폰 번호" 
                            ref={phoneRef} 
                            className="signup-input phone-input" 
                            readOnly={isPhoneVerified} 
                            value={phoneNumberInput} 
                            onKeyDown={e => {
                                if (
                                    !((e.key >= '0' && e.key <= '9') || 
                                    e.key === 'Backspace' || 
                                    e.key === 'Tab' || 
                                    e.key === 'Enter' ||
                                    e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Delete')
                                ) {
                                    e.preventDefault();
                                }
                            }}
                            onChange={handlePhoneChange} 
                            maxLength={11} 
                            required
                        />
                        <button 
                            type="button" 
                            className="send-code-button" 
                            onClick={requestVerificationCode} 
                            disabled={isLoadingSend || isPhoneVerified || verificationAttempts >= MAX_ATTEMPTS || !isPhoneValid} 
                        >
                            {isLoadingSend ? '발송 중...' : '인증발송'}
                        </button>
                    </div>
                    <div className="spacing-small"></div>

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
                            <div className="spacing-medium"></div>
                        </>
                    )}
                    {!isCodeSent && !isPhoneVerified && <div className="spacing-medium"></div>}


                    {/* --- 최종 가입 버튼 --- */}
                    <button
                        type="submit"
                        className="final-signup-button"
                        style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }}
                        disabled={isLoadingSignUp || !isPhoneVerified || !isNicknameChecked} 
                    >
                        {isLoadingSignUp ? '가입 처리 중...' : '가입하기'}
                    </button>
                    <div className="spacing-medium"></div>

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