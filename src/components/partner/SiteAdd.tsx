// src/components/partner/SiteAdd.tsx

import React, { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import './SiteAdd.css'; 
import { K_BRAND_COLOR } from '../../constants'; // 브랜드 컬러

// Firebase
import { auth } from '../../firebase-config';
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';

type SiteType = 'commercial' | 'residential';

const initialFormData = {
  siteName: '',
  address: '',
  client1Name: '',
  client1Phone: '',
  client2Name: '',
  client2Phone: '',
  budget: '',
  area: '',
  startDate: '', 
  openDate: '',
  businessType: '',
  moveInDate: '',
};

interface SiteAddProps {
  partnerUid: string | null;
}

const SiteAdd: React.FC<SiteAddProps> = ({ partnerUid }) => {
  const [siteType, setSiteType] = useState<SiteType>('commercial');
  const [formData, setFormData] = useState(initialFormData);
  const [authorName, setAuthorName] = useState('직원');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const db = getFirestore();

  // 작성자 정보 가져오기
  useEffect(() => {
    const fetchAuthor = async () => {
      if (auth.currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setAuthorName(data.nickname || data.name || '직원');
          }
        } catch (e) {
          console.error("작성자 정보 로딩 실패", e);
        }
      }
    };
    fetchAuthor();
  }, [db]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBudgetChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    if (rawValue === '') {
      setFormData(prev => ({ ...prev, budget: '' }));
      return;
    }
    const numericValue = parseInt(rawValue, 10);
    setFormData(prev => ({ ...prev, budget: numericValue.toLocaleString('ko-KR') }));
  };
  
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericValue = value.replace(/[^0-9]/g, '');
    setFormData(prev => ({ ...prev, [name]: numericValue.slice(0, 11) }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    const user = auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");
    if (!partnerUid) return alert("파트너 정보를 불러오지 못했습니다.");

    setIsSubmitting(true);
    
    try {
      const rawBudget = parseInt(formData.budget.replace(/,/g, ''), 10) || 0;
      
      const commonData = {
        siteName: formData.siteName,
        address: formData.address,
        client1Name: formData.client1Name,
        client1Phone: formData.client1Phone,
        client2Name: formData.client2Name,
        client2Phone: formData.client2Phone,
        budget: rawBudget,
        area: formData.area,
        startDate: formData.startDate,
        siteType: siteType,
        createdAt: serverTimestamp(),
        partnerUid: partnerUid,
        authorUid: user.uid,
        status: '미팅중', 
      };

      let finalData;
      if (siteType === 'commercial') {
        finalData = { ...commonData, openDate: formData.openDate, businessType: formData.businessType };
      } else {
        finalData = { ...commonData, moveInDate: formData.moveInDate };
      }

      const sitesCollectionRef = collection(db, 'users', partnerUid, 'sites');
      const docRef = await addDoc(sitesCollectionRef, finalData);

      // 로그 기록
      await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
        type: '현장등록',
        content: `[현장등록] ${authorName}님이 [${formData.siteName}] 현장을 새로 등록했습니다.`,
        relatedId: docRef.id,
        partnerUid: partnerUid,
        performerUid: user.uid,
        createdAt: serverTimestamp(),
        isRead: false
      });

      alert('새 현장이 추가되었습니다.');
      setFormData(initialFormData);
      setSiteType('commercial');

    } catch (error: any) {
      console.error("현장 추가 오류:", error);
      alert('현장 추가 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="site-add-container">
      
      {/* 헤더 (목록 페이지와 통일) */}
      <div className="add-header">
        <h2>현장 추가</h2>
      </div>

      {/* 탭 (라디오 버튼) */}
      <div className="form-radio-group">
        <label className={`form-radio-label ${siteType === 'commercial' ? 'active' : ''}`}>
          <input type="radio" name="siteType" value="commercial" checked={siteType === 'commercial'} onChange={() => setSiteType('commercial')} />
          상업공간
        </label>
        <label className={`form-radio-label ${siteType === 'residential' ? 'active' : ''}`}>
          <input type="radio" name="siteType" value="residential" checked={siteType === 'residential'} onChange={() => setSiteType('residential')} />
          주거공간
        </label>
      </div>

      {/* 폼 입력 영역 */}
      <form className="site-form-grid" onSubmit={handleSubmit}>
        
        <div className="form-group">
          <label htmlFor="siteName" className="form-label">현장명 (별칭) <span className="required">*</span></label>
          <input type="text" id="siteName" name="siteName" className="form-input" value={formData.siteName} onChange={handleChange} required placeholder="예: 봉선동 카페 현장" />
        </div>
        
        <div className="form-group">
          <label htmlFor="budget" className="form-label">공사 예산</label>
          <input type="text" inputMode="numeric" id="budget" name="budget" placeholder="숫자만 입력" className="form-input" value={formData.budget} onChange={handleBudgetChange} />
        </div>

        <div className="form-group full-width">
          <label htmlFor="address" className="form-label">주소 <span className="required">*</span></label>
          <input type="text" id="address" name="address" className="form-input" value={formData.address} onChange={handleChange} required placeholder="전체 주소를 입력해주세요" />
        </div>

        <div className="form-group">
          <label htmlFor="client1Name" className="form-label">고객명1 <span className="required">*</span></label>
          <input type="text" id="client1Name" name="client1Name" className="form-input" value={formData.client1Name} onChange={handleChange} required />
        </div>
        
        <div className="form-group">
          <label htmlFor="client1Phone" className="form-label">연락처1 <span className="required">*</span></label>
          <input type="tel" id="client1Phone" name="client1Phone" className="form-input" placeholder="숫자만 11자리" value={formData.client1Phone} onChange={handlePhoneChange} required />
        </div>

        <div className="form-group">
          <label htmlFor="client2Name" className="form-label">고객명2</label>
          <input type="text" id="client2Name" name="client2Name" className="form-input" value={formData.client2Name} onChange={handleChange} />
        </div>
        
        <div className="form-group">
          <label htmlFor="client2Phone" className="form-label">연락처2</label>
          <input type="tel" id="client2Phone" name="client2Phone" className="form-input" placeholder="숫자만 11자리" value={formData.client2Phone} onChange={handlePhoneChange} />
        </div>
        
        {/* 상업공간 전용 */}
        {siteType === 'commercial' && (
          <>
            <div className="form-group">
              <label htmlFor="area" className="form-label">면적</label>
              <input type="text" id="area" name="area" placeholder="예: 30평" className="form-input" value={formData.area} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="businessType" className="form-label">업종</label>
              <input type="text" id="businessType" name="businessType" placeholder="예: 카페, 식당" className="form-input" value={formData.businessType} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="startDate" className="form-label">희망 공사 시작일</label>
              <input type="date" id="startDate" name="startDate" className="form-input" value={formData.startDate} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="openDate" className="form-label">오픈 예정일</label>
              <input type="date" id="openDate" name="openDate" className="form-input" value={formData.openDate} onChange={handleChange} />
            </div>
          </>
        )}

        {/* 주거공간 전용 */}
        {siteType === 'residential' && (
          <>
            <div className="form-group">
              <label htmlFor="area" className="form-label">면적</label>
              <input type="text" id="area" name="area" placeholder="예: 34평 (112㎡)" className="form-input" value={formData.area} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="startDate" className="form-label">희망 공사 시작일</label>
              <input type="date" id="startDate" name="startDate" className="form-input" value={formData.startDate} onChange={handleChange} />
            </div>
            <div className="form-group full-width">
              <label htmlFor="moveInDate" className="form-label">입주 예정일</label>
              <input type="date" id="moveInDate" name="moveInDate" className="form-input" value={formData.moveInDate} onChange={handleChange} />
            </div>
          </>
        )}

        <div className="submit-button-container">
          <button 
            type="submit" 
            className="submit-button"
            style={{ backgroundColor: K_BRAND_COLOR }}
            disabled={isSubmitting}
          >
            {isSubmitting ? '처리 중...' : '현장 추가'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SiteAdd;