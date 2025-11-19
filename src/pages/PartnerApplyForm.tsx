// src/pages/PartnerApplyForm.tsx

import React, { useState, useEffect, type ChangeEvent } from 'react';
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

// CSS
import './HomePage.css'; // 스티키 푸터 레이아웃
import './PartnerApplyForm.css'; // 폼 CSS

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

  // --- 1. 레이아웃 상태 ---
  const [selectedMenu, setSelectedMenu] = useState('menu3');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // --- 2. 권한 확인 상태 ---
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  // --- 3. 폼 입력 상태 ---
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


  // --- 4. 권한/반응형 로직 ---
  useEffect(() => {
    const db = getFirestore();
    // 1. 권한 확인
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        // [수정] customer일 때만 role을 설정
        if (docSnap.exists() && docSnap.data().role === 'customer') {
          setUserRole('customer');
        } else {
          setUserRole(null); // customer가 아니면 null
        }
      } else {
        setUserRole(null); // 비로그인
      }
      setIsLoading(false);
    });

    // 2. 반응형 처리
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) {
          setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      unsubscribeAuth();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // --- 5. 핸들러 함수 ---
  const handleMenuSelect = (key: string) => setSelectedMenu(key);
  const handleHamburgerPressed = () => setIsMobileMenuOpen(true);
  const handleMenuClose = () => setIsMobileMenuOpen(false);

  // 사업자등록번호 핸들러
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

  // 한글 전용 핸들러
  const handleKoreanOnlyChange = (e: ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string>>) => {
    const value = e.target.value;
    const filteredValue = value.replace(/[^ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, '');
    setter(filteredValue);
  };

  // 파일 첨부 핸들러
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, fileSetter: React.Dispatch<React.SetStateAction<File | null>>) => {
    if (e.target.files && e.target.files[0]) {
      fileSetter(e.target.files[0]);
    }
  };
  
  // 시/도 변경 핸들러
  const handleCityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newCity = e.target.value;
    setSelectedCity(newCity);
    const newDistricts = addressData[newCity] || [];
    setSelectedDistrict(newDistricts[0] || ''); 
  };
  
  const availableDistricts = addressData[selectedCity] || [];

  // 폼 제출 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const user = auth.currentUser;
    // [수정] userRole(state) 재확인
    if (!user || userRole !== 'customer') { 
      alert('로그인이 필요하거나 신청 권한이 없습니다.');
      return;
    }
    
    if (!file1) { // file1(사업자등록증)만 필수
      alert('필수 첨부파일(사업자 등록증)을 등록해주세요.');
      return;
    }
    
    setIsSubmitting(true);
    const db = getFirestore(); 
    const storage = getStorage(); 

    try {
      // --- 1. 파일 업로드 (Storage) ---
      const file1Ref = ref(storage, `partner-applications/${user.uid}/business_license_${file1.name}`);
      await uploadBytes(file1Ref, file1);
      const file1Url = await getDownloadURL(file1Ref); 

      let file2Url: string | null = null;
      if (file2) {
        const file2Ref = ref(storage, `partner-applications/${user.uid}/construction_license_${file2.name}`);
        await uploadBytes(file2Ref, file2);
        file2Url = await getDownloadURL(file2Ref); 
      }

      // --- 2. 폼 데이터 저장 (Firestore) ---
      const docData = {
        companyName,
        businessNumber,
        ceoName,
        city: selectedCity,
        district: selectedDistrict,
        addressDetail,
        contactName,
        contactPhone,
        
        file1Url: file1Url, 
        file2Url: file2Url, // (null 또는 URL)

        // 관리자용 데이터
        status: 'pending', 
        userId: user.uid, 
        createdAt: serverTimestamp(),
        applicantRole: userRole // Firestore 규칙 검사용
      };
      
      await addDoc(collection(db, "partnerApplications"), docData);

      alert('파트너 신청이 정상적으로 접수되었습니다.');
      navigate('/'); 

    } catch (error: any) {
      if (error.code === 'storage/unauthorized') {
        alert('파일 업로드 권한이 없습니다. (Storage 보안 규칙 확인 필요)');
      } else if (error.code === 'permission-denied') {
        alert('데이터베이스 쓰기 권한이 없습니다. (Firestore 보안 규칙 확인 필요)');
      } else {
        alert('신청 중 오류가 발생했습니다.');
      }
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };


  // --- 6. 렌더링 로직 ---

  // 6-A: 로딩 중
  if (isLoading) {
    return (
      <div className="page-container">
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <h2>권한을 확인 중입니다...</h2>
        </main>
      </div>
    );
  }

  // 6-B: 권한 없음 (customer가 아님)
  if (userRole !== 'customer') {
    return (
      <div className="page-container">
        {!isMobile && <RoleHeader />}
        <Header onMenuSelected={handleMenuSelect} isMobile={isMobile} onHamburgerPressed={handleHamburgerPressed} />
        {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}
        
        <main className="main-content partnerapplyform" style={{ padding: isMobile ? '16px' : '32px 20px' }}>
          <div className="rejection-box"> 
            <h2 className="rejection-text">파트너로 신청할 수 있는 회원 등급이 아닙니다.</h2>
            <button className="home-button" onClick={() => navigate('/')}>
              홈으로 돌아가기
            </button>
          </div>
        </main>
        
        <Footer /> 
        {isMobileMenuOpen && isMobile && <MobileMenu onClose={handleMenuClose} />}
      </div>
    );
  }

  // 6-C: [정상] 파트너 신청 폼
  return (
    <div className="page-container">
      {!isMobile && <RoleHeader />}
      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={handleHamburgerPressed}
      />
      {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}

      <main className="main-content" style={{ padding: isMobile ? '16px' : '32px 20px' }}>
        
        <div className="partnerapplyform">
          
          <h2 className="apply-form-title">파트너 신청 (인테리어 업체)</h2>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="companyName" className="form-label">상호명</label>
              <input type="text" id="companyName" className="form-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </div>

            <div className="form-group">
              <label htmlFor="businessNumber" className="form-label">사업자 등록번호</label>
              <input 
                type="tel" 
                id="businessNumber" 
                className="form-input" 
                value={businessNumber} 
                onChange={handleBusinessNumberChange} 
                maxLength={12} 
                placeholder="숫자만 입력 (000-00-00000)"
                required 
              />
            </div>

            <div className="form-group">
              <label htmlFor="ceoName" className="form-label">대표자명</label>
              <input 
                type="text" 
                id="ceoName" 
                className="form-input" 
                value={ceoName} 
                onChange={(e) => handleKoreanOnlyChange(e, setCeoName)} 
                placeholder="한글만 입력"
                required 
              />
            </div>

            {/* 소재지 (시/도 + 군/구) */}
            <div className="location-row">
              <div className="form-group">
                <label htmlFor="city" className="form-label">시/도</label>
                <select 
                  id="city" 
                  className="form-select" 
                  value={selectedCity} 
                  onChange={handleCityChange} 
                >
                  {cityKeys.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="district" className="form-label">시/군/구</label>
                <select 
                  id="district" 
                  className="form-select" 
                  value={selectedDistrict} 
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                >
                  {availableDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {/* 상세주소 */}
            <div className="form-group">
              <label htmlFor="addressDetail" className="form-label">상세주소</label>
              <input type="text" id="addressDetail" className="form-input" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)} required />
            </div>

            {/* 파일 첨부 1 (필수) */}
            <div className="form-group">
              <label htmlFor="file1" className="form-label">사업자 등록증</label>
              <input type="file" id="file1" className="form-file-input" onChange={(e) => handleFileChange(e, setFile1)} accept="image/*,application/pdf" required />
            </div>

            {/* 파일 첨부 2 (선택) */}
            <div className="form-group">
              <label htmlFor="file2" className="form-label">실내건축면허증</label>
              <input type="file" id="file2" className="form-file-input" onChange={(e) => handleFileChange(e, setFile2)} accept="image/*,application/pdf" />
            </div>
            <p className="form-caption">
              실내건축공사업 면허증은 필수 첨부가 아닙니다. 
            </p>

            {/* 담당자명 */}
            <div className="form-group">
              <label htmlFor="contactName" className="form-label">담당자명</label>
              <input 
                type="text" 
                id="contactName" 
                className="form-input" 
                value={contactName} 
                onChange={(e) => handleKoreanOnlyChange(e, setContactName)} 
                placeholder="한글만 입력"
                required 
              />
            </div>

            {/* 연락처 */}
            <div className="form-group">
              <label htmlFor="contactPhone" className="form-label">연락처</label>
              <input type="tel" id="contactPhone" className="form-input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required />
            </div>

            {/* 제출 버튼 */}
            <button 
  type="submit" 
  className="submit-button" 
  disabled={isSubmitting}
>
              {isSubmitting ? '신청 중...' : '파트너 신청하기'}
            </button>
          </form>
        </div>
      </main>

      <Footer /> 
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={handleMenuClose} />}
    </div>
  );
};

export default PartnerApplyForm;