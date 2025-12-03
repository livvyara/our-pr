import React, { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';

// 공통 컴포넌트
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';

// Firebase
import { auth } from '../firebase-config';
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import './PartnerApplyForm.css'; 

// [ 대한민국 주소 데이터 ]
const addressData: Record<string, string[]> = {
  '서울특별시': ['강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'],
  '부산광역시': ['강서구', '금정구', '기장군', '남구', '동구', '동래구', '부산진구', '북구', '사상구', '사하구', '서구', '수영구', '연제구', '영도구', '중구', '해운대구'],
  '대구광역시': ['군위군', '남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구'],
  '인천광역시': ['강화군', '계양구', '남동구', '동구', '미추홀구', '부평구', '서구', '연수구', '옹진군', '중구'],
  '광주광역시': ['광산구', '남구', '동구', '북구', '서구'],
  '대전광역시': ['대덕구', '동구', '서구', '유성구', '중구'],
  '울산광역시': ['남구', '동구', '북구', '울주군', '중구'],
  '세종특별자치시': ['세종시'],
  '경기도': ['수원시', '성남시', '용인시', '고양시', '부천시', '안산시', '안양시', '남양주시', '화성시', '평택시', '의정부시', '시흥시', '파주시', '김포시', '광명시', '광주시', '군포시', '오산시', '이천시', '안성시', '하남시', '의왕시', '양주시', '구리시', '포천시', '동두천시', '과천시', '여주시', '양평군', '가평군', '연천군'],
  '강원특별자치도': ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군'],
  '충청북도': ['청주시', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군'],
  '충청남도': ['천안시', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군'],
  '전북특별자치도': ['전주시', '익산시', '군산시', '정읍시', '김제시', '남원시', '완주군', '고창군', '부안군', '임실군', '순창군', '장수군', '무주군', '진안군'],
  '전라남도': ['목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군'],
  '경상북도': ['포항시', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군'],
  '경상남도': ['창원시', '김해시', '진주시', '양산시', '거제시', '통영시', '사천시', '밀양시', '함안군', '거창군', '창녕군', '고성군', '하동군', '합천군', '남해군', '함양군', '산청군', '의령군'],
  '제주특별자치도': ['제주시', '서귀포시']
};

const cityKeys = Object.keys(addressData);

const PartnerApplyForm: React.FC = () => {
  const navigate = useNavigate();

  // 레이아웃 상태
  const [selectedMenu, setSelectedMenu] = useState('menu3');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // 권한 확인 상태
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  // 폼 입력 상태
  const [companyName, setCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [ceoName, setCeoName] = useState('');
  const [selectedCity, setSelectedCity] = useState(cityKeys[0]); 
  const [selectedDistrict, setSelectedDistrict] = useState(addressData[cityKeys[0]][0]); 
  const [addressDetail, setAddressDetail] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 스크롤 애니메이션 Refs
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 권한/반응형 로직
  useEffect(() => {
    const db = getFirestore();
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().role === 'customer') {
          setUserRole('customer');
        } else {
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }
      setIsLoading(false);
    });

    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) {
          setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    
    // Animation Observer
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.1 });

    // 로딩이 끝난 후 요소 감지 시작
    if (!isLoading) {
        setTimeout(() => {
            const fadeElems = document.querySelectorAll('.paf-fade-up');
            fadeElems.forEach((el) => observerRef.current?.observe(el));
        }, 100);
    }

    return () => {
      unsubscribeAuth();
      window.removeEventListener('resize', handleResize);
      observerRef.current?.disconnect();
    };
  }, [isLoading]);

  // 핸들러 함수
  const handleMenuSelect = (key: string) => setSelectedMenu(key);
  const handleHamburgerPressed = () => setIsMobileMenuOpen(true);
  const handleMenuClose = () => setIsMobileMenuOpen(false);

  const handleBusinessNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, ''); 
    if (rawValue.length > 10) return; 
    let formattedValue = '';
    if (rawValue.length > 5) {
      formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3, 5)}-${rawValue.slice(5, 10)}`;
    } else if (rawValue.length > 3) {
      formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3, 5)}`;
    } else {
      formattedValue = rawValue;
    }
    setBusinessNumber(formattedValue);
  };

  const handleKoreanOnlyChange = (e: ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string>>) => {
    const value = e.target.value;
    const filteredValue = value.replace(/[^ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, '');
    setter(filteredValue);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, fileSetter: React.Dispatch<React.SetStateAction<File | null>>) => {
    if (e.target.files && e.target.files[0]) {
      fileSetter(e.target.files[0]);
    }
  };
  
  const handleCityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newCity = e.target.value;
    setSelectedCity(newCity);
    const newDistricts = addressData[newCity] || [];
    setSelectedDistrict(newDistricts[0] || ''); 
  };
  
  const availableDistricts = addressData[selectedCity] || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || userRole !== 'customer') { 
      alert('로그인이 필요하거나 신청 권한이 없습니다.'); return;
    }
    if (!file1) { alert('필수 첨부파일(사업자 등록증)을 등록해주세요.'); return; }
    
    setIsSubmitting(true);
    const db = getFirestore(); 
    const storage = getStorage(); 

    try {
      const file1Ref = ref(storage, `partner-applications/${user.uid}/business_license_${file1.name}`);
      await uploadBytes(file1Ref, file1);
      const file1Url = await getDownloadURL(file1Ref); 

      let file2Url: string | null = null;
      if (file2) {
        const file2Ref = ref(storage, `partner-applications/${user.uid}/construction_license_${file2.name}`);
        await uploadBytes(file2Ref, file2);
        file2Url = await getDownloadURL(file2Ref); 
      }

      const docData = {
        companyName, businessNumber, ceoName, city: selectedCity, district: selectedDistrict, addressDetail,
        contactName, contactPhone, file1Url, file2Url,
        status: 'pending', userId: user.uid, createdAt: serverTimestamp(), applicantRole: userRole
      };
      
      await addDoc(collection(db, "partnerApplications"), docData);
      alert('파트너 신청이 정상적으로 접수되었습니다.\n담당자 확인 후 연락드리겠습니다.');
      navigate('/'); 

    } catch (error: any) {
      console.error(error);
      alert('신청 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 렌더링 로직
  if (isLoading) return <div className="paf-loading-screen">잠시만 기다려주세요...</div>;

  if (userRole !== 'customer') {
    return (
      <div className="paf-page-container">
        {!isMobile && <RoleHeader />}
        <Header onMenuSelected={handleMenuSelect} isMobile={isMobile} onHamburgerPressed={handleHamburgerPressed} />
        {!isMobile && selectedMenu && (
        <SubNav 
          selectedMenuKey={selectedMenu} 
          onClose={() => setSelectedMenu('')} /* 빈 문자열로 설정하여 숨김 처리 */
        />
      )}
        
        <main className="paf-main-content">
          <div className="paf-rejection-box paf-fade-up active">
            <h2>접근 권한 제한</h2>
            <p>파트너 신청은 일반 고객 계정으로 로그인한 상태에서만 가능합니다.</p>
            <button className="paf-btn-outline" onClick={() => navigate('/')}>홈으로 돌아가기</button>
          </div>
        </main>
        
        <Footer /> 
        {isMobileMenuOpen && isMobile && <MobileMenu onClose={handleMenuClose} />}
      </div>
    );
  }

  return (
    <div className="paf-page-container">
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={handleMenuSelect} isMobile={isMobile} onHamburgerPressed={handleHamburgerPressed} />
      {!isMobile && selectedMenu && (
        <SubNav 
          selectedMenuKey={selectedMenu} 
          onClose={() => setSelectedMenu('')} /* 빈 문자열로 설정하여 숨김 처리 */
        />
      )}

      <main className="paf-main-content">
        
        <div className="paf-form-wrapper">
          {/* Header */}
          <div className="paf-header-section paf-fade-up">
            <span className="paf-subtitle">Partner Application</span>
            <h1 className="paf-title">성공을 위한<br/>최고의 파트너십.</h1>
            <p className="paf-desc">아워프로젝트의 검증된 파트너가 되어 비즈니스를 확장하세요.</p>
          </div>

          <form onSubmit={handleSubmit} className="paf-form">
            
            {/* Section 1: 기업 정보 */}
            <section className="paf-section paf-fade-up">
              <div className="paf-section-header">
                <span className="paf-section-num">01</span>
                <h3>기업 정보</h3>
              </div>
              
              <div className="paf-grid-row">
                <div className="paf-input-group">
                  <label htmlFor="companyName">상호명</label>
                  <input type="text" id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="사업자등록증 상의 상호명" />
                </div>
                <div className="paf-input-group">
                  <label htmlFor="ceoName">대표자명</label>
                  <input type="text" id="ceoName" value={ceoName} onChange={(e) => handleKoreanOnlyChange(e, setCeoName)} required placeholder="실명 입력" />
                </div>
              </div>

              <div className="paf-input-group full-width">
                <label htmlFor="businessNumber">사업자 등록번호</label>
                <input type="tel" id="businessNumber" value={businessNumber} onChange={handleBusinessNumberChange} maxLength={12} required placeholder="000-00-00000" />
              </div>
            </section>

            <div className="paf-divider"></div>

            {/* Section 2: 소재지 */}
            <section className="paf-section paf-fade-up">
              <div className="paf-section-header">
                <span className="paf-section-num">02</span>
                <h3>사업장 소재지</h3>
              </div>

              <div className="paf-grid-row">
                <div className="paf-input-group">
                  <label htmlFor="city">시/도</label>
                  <div className="paf-select-wrapper">
                    <select id="city" value={selectedCity} onChange={handleCityChange}>
                      {cityKeys.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="paf-input-group">
                  <label htmlFor="district">시/군/구</label>
                  <div className="paf-select-wrapper">
                    <select id="district" value={selectedDistrict} onChange={(e) => setSelectedDistrict(e.target.value)}>
                      {availableDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="paf-input-group full-width mt-4">
                <label htmlFor="addressDetail">상세주소</label>
                <input type="text" id="addressDetail" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)} required placeholder="나머지 주소 입력" />
              </div>
            </section>

            <div className="paf-divider"></div>

            {/* Section 3: 담당자 및 서류 */}
            <section className="paf-section paf-fade-up">
              <div className="paf-section-header">
                <span className="paf-section-num">03</span>
                <h3>담당자 및 서류 첨부</h3>
              </div>

              <div className="paf-grid-row">
                <div className="paf-input-group">
                  <label htmlFor="contactName">담당자명</label>
                  <input type="text" id="contactName" value={contactName} onChange={(e) => handleKoreanOnlyChange(e, setContactName)} required />
                </div>
                <div className="paf-input-group">
                  <label htmlFor="contactPhone">연락처</label>
                  <input type="tel" id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required placeholder="010-0000-0000" />
                </div>
              </div>

              <div className="paf-file-upload-area mt-6">
                <div className="paf-input-group">
                  <label className="file-label-text">사업자 등록증 (필수)</label>
                  <div className="paf-file-box">
                    <input type="file" id="file1" onChange={(e) => handleFileChange(e, setFile1)} accept="image/*,application/pdf" required />
                    <span className="file-custom-text">{file1 ? file1.name : "파일 선택 (PDF, JPG, PNG)"}</span>
                  </div>
                </div>

                <div className="paf-input-group mt-4">
                  <label className="file-label-text">실내건축면허증 (선택)</label>
                  <div className="paf-file-box">
                    <input type="file" id="file2" onChange={(e) => handleFileChange(e, setFile2)} accept="image/*,application/pdf" />
                    <span className="file-custom-text">{file2 ? file2.name : "파일 선택 (선택 사항)"}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Submit */}
            <div className="paf-submit-area paf-fade-up">
              <p className="paf-consent-text">
                제출 시 당사의 <a href="#">파트너 이용약관</a> 및 <a href="#">개인정보 처리방침</a>에 동의하게 됩니다.
              </p>
              <button type="submit" className="paf-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? '처리 중...' : '신청서 제출하기'}
              </button>
            </div>

          </form>
        </div>
      </main>

      <Footer /> 
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={handleMenuClose} />}
    </div>
  );
};

export default PartnerApplyForm;