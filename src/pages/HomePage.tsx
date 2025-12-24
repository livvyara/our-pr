import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { 
  // [네비게이션 아이콘]
  ArrowRight, ChevronLeft,
  // [기타 아이콘]
  Lock, MessageCircle, Mail,
  User, Briefcase, Wrench, Store, Calculator, Grid, Search, MapPin,
  Hammer, HardHat, PaintBucket, Ruler, Truck, Warehouse, BrickWall, Construction,
  Home, Sofa, BedDouble, Lamp, Armchair, Bath, Droplets, Utensils,
  CreditCard, Wallet, BadgeDollarSign, Receipt, ClipboardCheck,
  Calendar, Clock, Hourglass, Timer,
  Phone, Star, Heart, Camera, Image, ShieldCheck, Zap
} from 'lucide-react';
import Header from '../components/common/Header'; 
import './HomeSurvey.css';

// --- [Type Definitions] ---
export type StepType = 'choice' | 'region' | 'result_match' | 'auth_gate'; 

export interface SurveyOption {
  id: string;
  label: string;
  icon?: string;
  nextStepId?: string | null;
  actionLink?: string | null;
  value?: string;
}

export interface SurveyStep {
  id: string;
  type: StepType;
  question: string;
  subText?: string;
  dataKey?: string;
  options: SurveyOption[];
  nextStepId?: string | null;
  
  // [Auth Gate Fields]
  kakaoUrl?: string; 
  naverUrl?: string;
  emailUrl?: string; // 이메일 회원가입 경로
  
  // [Admin Fields]
  adminTitle?: string;
  order?: number;
}

// --- [Region Data] ---
const REGIONS: { [key: string]: string[] } = {
  '서울': ['강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'],
  '경기': ['수원시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시', '동두천시', '안산시', '고양시', '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시', '의왕시', '하남시', '용인시', '파주시', '이천시', '안성시', '김포시', '화성시', '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군'],
  '인천': ['중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군'],
  '강원': ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군'],
  '대전': ['동구', '중구', '서구', '유성구', '대덕구'],
  '대구': ['중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군', '군위군'],
  '부산': ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군'],
  '울산': ['중구', '남구', '동구', '북구', '울주군'],
  '광주': ['동구', '서구', '남구', '북구', '광산구'],
  '세종': ['세종특별자치시'],
  '제주': ['제주시', '서귀포시']
};

const IconMap: { [key: string]: React.ComponentType<any> } = {
  User, Briefcase, Wrench, Store, Calculator, Grid, Search, MapPin, Lock, MessageCircle, Mail,
  Hammer, HardHat, PaintBucket, Ruler, Truck, Warehouse, BrickWall, Construction,
  Home, Sofa, BedDouble, Lamp, Armchair, Bath, Droplets, Utensils,
  CreditCard, Wallet, BadgeDollarSign, Receipt, ClipboardCheck,
  Calendar, Clock, Hourglass, Timer,
  Phone, Star, Heart, Camera, Image, ShieldCheck, Zap,
  ArrowRight, ChevronLeft // 네비게이션용
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const db = getFirestore();
  const auth = getAuth();

  // [State]
  const [surveyData, setSurveyData] = useState<Record<string, SurveyStep>>({});
  const [currentStepId, setCurrentStepId] = useState<string>('start');
  const [history, setHistory] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  
  // [Auth State]
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);

  // Region & UI State
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [matchedPartners, setMatchedPartners] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [loading, setLoading] = useState(true);

  // [1. Auth Monitor]
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthCheckLoading(false); 
    });
    return () => unsubscribe();
  }, [auth]);

  // [2. Load Data]
  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const docRef = doc(db, 'system', 'home_survey_config');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setSurveyData(snap.data().data);
        } else {
          setSurveyData({
            start: { id: 'start', type: 'choice', question: "시작", options: [], order: 0 }
          });
        }
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    fetchSurvey();
  }, []);

  // [3. Auto Pass Logic (Auth Gate)]
  useEffect(() => {
    const step = surveyData[currentStepId];
    if (loading || authCheckLoading) return;

    if (step?.type === 'auth_gate' && currentUser) {
      // 로그인 회원은 자동 패스
      const timer = setTimeout(() => {
        handleNext(step.nextStepId);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentStepId, currentUser, authCheckLoading, surveyData, loading]);

  // [Navigation Handler]
  const handleNext = (nextId: string | null | undefined, dataKey?: string, value?: any) => {
    if (isAnimating) return;
    
    if (dataKey && value) {
      setAnswers(prev => ({ ...prev, [dataKey]: value }));
    }

    if (nextId && surveyData[nextId]) {
      setIsAnimating(true);
      setTimeout(() => {
        setHistory(prev => [...prev, currentStepId]);
        setCurrentStepId(nextId);
        setSelectedCity('');
        setSelectedDistrict('');
        setIsAnimating(false);
      }, 300);
    }
  };

  const handleBack = () => {
    if (history.length === 0) return;
    setIsAnimating(true);
    setTimeout(() => {
      const newHistory = [...history];
      const prevStep = newHistory.pop();
      setHistory(newHistory);
      if (prevStep) setCurrentStepId(prevStep);
      setIsAnimating(false);
    }, 300);
  };

  // [Social Handlers]
  const handleSocialLogin = (platform: 'kakao' | 'naver', url?: string) => {
    if (!url) return alert(`${platform} 로그인 설정이 준비되지 않았습니다.`);
    window.location.href = url; 
  };

  const handleEmailSignup = (url?: string) => {
    if (url) navigate(url);
    else navigate('/signup');
  };

  if (loading || authCheckLoading) return <div className="hs-loading">잠시만 기다려주세요...</div>;

  const step = surveyData[currentStepId];
  if (!step) return <div>설정된 질문이 없습니다.</div>;

  return (
    <div className="hs-container">
      <div className="hs-bg-decoration"></div>
  

      <main className="hs-main">
        <div className={`hs-content-wrapper ${isAnimating ? 'fade-out' : 'fade-in'}`}>
          
          {history.length > 0 && step.type !== 'result_match' && (
            <button className="hs-back-btn" onClick={handleBack}>
              <ChevronLeft size={24} /> 뒤로
            </button>
          )}

          <div className="hs-question-area">
            <h1 className="hs-title">
              {step.question.split('\n').map((line, i) => <span key={i}>{line}<br/></span>)}
            </h1>
            {step.subText && (
  <div 
    className="hs-subtitle-rich"
    dangerouslySetInnerHTML={{ __html: step.subText }}
  />
)}
          </div>

          {/* --- Type 1: Choice --- */}
          {step.type === 'choice' && (
            <div className="hs-options-grid">
              {step.options.map((option) => {
                const IconComp = option.icon ? IconMap[option.icon] : null;
                return (
                  <button 
                    key={option.id} 
                    className="hs-option-card" 
                    onClick={() => {
                      if (option.actionLink) navigate(option.actionLink);
                      else handleNext(option.nextStepId, step.dataKey, option.value || option.label);
                    }}
                  >
                    <div className="hs-option-icon">{IconComp ? <IconComp size={24} /> : <div className="hs-dot" />}</div>
                    <span className="hs-option-label">{option.label}</span>
                    <div className="hs-option-arrow"><ArrowRight size={20} /></div>
                  </button>
                );
              })}
            </div>
          )}

          {/* --- Type 2: Region --- */}
          {step.type === 'region' && (
            <div className="hs-region-container">
               <div className="hs-select-group">
                <select value={selectedCity} onChange={(e) => { setSelectedCity(e.target.value); setSelectedDistrict(''); }}>
                   <option value="">시/도 선택</option>
                   {Object.keys(REGIONS).map(city => <option key={city} value={city}>{city}</option>)}
                </select>
                <select value={selectedDistrict} onChange={(e) => setSelectedDistrict(e.target.value)} disabled={!selectedCity}>
                   <option value="">시/구/군 선택</option>
                   {selectedCity && REGIONS[selectedCity]?.map((dist: string) => <option key={dist} value={dist}>{dist}</option>)}
                </select>
               </div>
               <button className={`hs-next-btn ${selectedCity && selectedDistrict ? 'active' : ''}`} onClick={() => {
                  if (!selectedCity || !selectedDistrict) return alert("지역을 선택해주세요.");
                  handleNext(step.nextStepId, step.dataKey, `${selectedCity} ${selectedDistrict}`);
               }}>다음으로 <ArrowRight size={20} /></button>
            </div>
          )}

          {/* --- Type 3: Auth Gate (3단 버튼) --- */}
          {step.type === 'auth_gate' && !currentUser && (
            <div className="hs-auth-gate-card">
              <div className="hs-auth-icon-wrap">
                <Lock size={32} />
              </div>
              <h3>회원가입하고 결과 보기</h3>
              <p>
                지금까지 선택하신 내용을 바탕으로<br/>
                딱 맞는 파트너를 찾으시겠어요?
              </p>
              
              <div className="hs-auth-btns-stack">
                <button className="hs-btn-kakao" onClick={() => handleSocialLogin('kakao', step.kakaoUrl)}>
                  <MessageCircle size={20} fill="currentColor" /> 카카오로 3초 만에 시작하기
                </button>
                
                <button className="hs-btn-naver" onClick={() => handleSocialLogin('naver', step.naverUrl)}>
                  <span className="naver-icon">N</span> 네이버로 시작하기
                </button>
                
                <button className="hs-btn-email" onClick={() => handleEmailSignup(step.emailUrl)}>
                  <Mail size={18} /> 이메일로 회원가입
                </button>
              </div>
            </div>
          )}

          {/* --- Type 4: Result --- */}
          {step.type === 'result_match' && (
            <div className="hs-result-container">
               {isSearching ? (
                <div className="hs-searching">
                  <div className="hs-spinner"></div>
                  <h3>고객님의 요청사항을 분석 중입니다...</h3>
                </div>
              ) : (
                <div className="hs-match-list">
                  <p className="hs-match-count">매칭 결과를 확인하세요!</p>
                  {/* Mock Data */}
                  <div className="hs-partner-card">
                    <div className="partner-info"><h4>730 디자인</h4><span className="partner-score">★ 4.9</span></div>
                    <div className="partner-tags"><span>#주거</span><span>#상업</span></div>
                    <button className="partner-contact-btn">상담 신청하기</button>
                  </div>
                  <button className="hs-home-btn" onClick={() => navigate('/')}>홈으로</button>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default HomePage;