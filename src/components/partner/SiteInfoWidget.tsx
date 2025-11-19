// src/components/partner/SiteInfoWidget.tsx

import React, { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import './SiteInfoWidget.css'; 
import { K_BRAND_COLOR } from '../../constants';
import { 
  getFirestore, doc, updateDoc, serverTimestamp, 
  collection, query, where, getDocs, getDoc, limit, orderBy 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import ContractorInviteModal from './ContractorInviteModal';

// --- 인터페이스 정의 ---
interface SiteData {
  siteName: string;
  address: string;
  client1Name: string;
  client1Phone: string;
  client2Name: string;
  client2Phone: string;
  budget: number;
  area: string;
  startDate: string;
  siteType: 'commercial' | 'residential';
  partnerUid: string;
  status: string;
  openDate?: string;
  businessType?: string;
  moveInDate?: string;
}

interface SiteInfoWidgetProps {
  siteData: SiteData;
  siteId: string;
  partnerUid: string;
  onSaveSuccess: (updatedData: SiteData) => void;
  widgetTitle: string; 
}

interface ContractorInfo {
  name: string;
  email: string;
  phone: string;
}

const formatNumberWithCommas = (num: number): string => {
  return num ? num.toLocaleString('ko-KR') : '';
};

const parseNumberFromCommas = (str: string): number => {
  return parseInt(str.replace(/,/g, ''), 10) || 0;
};

const STATUS_OPTIONS = [
  "미팅중", "계약대기", "계약완료", "공사전", 
  "공사중", "공사완료", "보류", "취소"
];


const SiteInfoWidget: React.FC<SiteInfoWidgetProps> = ({ 
  siteData, 
  siteId, 
  partnerUid,
  onSaveSuccess,
  widgetTitle
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  
  // 도급인 정보 상태
  const [contractorInfo, setContractorInfo] = useState<ContractorInfo | null>(null);

  const [editData, setEditData] = useState({
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
    status: '', 
  });

  const db = getFirestore();

  useEffect(() => {
    setEditData({
      siteName: siteData.siteName || '',
      address: siteData.address || '',
      client1Name: siteData.client1Name || '',
      client1Phone: siteData.client1Phone || '',
      client2Name: siteData.client2Name || '',
      client2Phone: siteData.client2Phone || '',
      budget: formatNumberWithCommas(siteData.budget),
      area: siteData.area || '',
      startDate: siteData.startDate || '',
      openDate: siteData.openDate || '',
      businessType: siteData.businessType || '',
      moveInDate: siteData.moveInDate || '',
      status: siteData.status || '미팅중', 
    });
  }, [siteData]); 

  // 도급인 정보 불러오기
  useEffect(() => {
    const fetchContractor = async () => {
      if (!siteId) return;

      try {
        const inviteQuery = query(
          collection(db, 'siteInvitations'),
          where('siteId', '==', siteId),
          where('status', '==', 'redeemed'),
          orderBy('redeemedAt', 'desc'),
          limit(1)
        );

        const inviteSnap = await getDocs(inviteQuery);

        if (!inviteSnap.empty) {
          const inviteData = inviteSnap.docs[0].data();
          const contractorUid = inviteData.redeemedBy;

          if (contractorUid) {
            const userDoc = await getDoc(doc(db, 'users', contractorUid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              setContractorInfo({
                name: userData.nickname || userData.name || '이름 없음',
                email: userData.email || '-',
                phone: userData.phone || '-'
              });
            }
          }
        }
      } catch (e: any) {
        console.error("도급인 정보 로딩 실패:", e);
        if (e.code === 'failed-precondition' || e.message.includes('index')) {
            alert("도급인 정보를 불러오려면 '색인(Index)'이 필요합니다.\nF12 콘솔의 링크를 클릭해 색인을 생성해주세요.");
        }
      }
    };

    fetchContractor();
  }, [siteId, db]);


  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  const handleBudgetChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, ''); 
    if (rawValue === '') {
      setEditData(prev => ({ ...prev, budget: '' }));
      return;
    }
    const numericValue = parseInt(rawValue, 10);
    setEditData(prev => ({ ...prev, budget: numericValue.toLocaleString('ko-KR') }));
  };
  
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericValue = value.replace(/[^0-9]/g, ''); 
    setEditData(prev => ({ ...prev, [name]: numericValue.slice(0, 11) }));
  };

  const handleUpdateSiteInfo = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    const user = auth.currentUser;
    if (!user) {
      alert("로그인이 유효하지 않습니다.");
      setIsSaving(false);
      return;
    }
    
    try {
      const dataToSaveForFirestore = {
        ...editData,
        budget: parseNumberFromCommas(editData.budget),
        updatedAt: serverTimestamp(),
      };
      
      const siteDocRef = doc(db, 'users', partnerUid, 'sites', siteId);
      await updateDoc(siteDocRef, dataToSaveForFirestore);
      
      alert('현장 정보가 저장되었습니다.');
      
      const updatedLocalSiteData: SiteData = {
        ...siteData, 
        ...editData, 
        budget: parseNumberFromCommas(editData.budget),
      };
      onSaveSuccess(updatedLocalSiteData); 

    } catch (error) {
      alert('정보 저장 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="site-info-widget">
      
      <div className="widget-title-header">
        <h3>{widgetTitle}</h3>
        <div className="site-status-selector">
          <span className="status-label">현장 상태 :</span>
          <select 
            className="status-dropdown" 
            name="status"
            value={editData.status}
            onChange={handleChange}
            disabled={isSaving}
          >
            {STATUS_OPTIONS.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      <form className="info-form-grid" onSubmit={handleUpdateSiteInfo}>
    
        <div className="form-group">
          <label htmlFor="siteName" className="form-label">현장명 <span className="required">*</span></label>
          <input type="text" id="siteName" name="siteName" className="form-input" value={editData.siteName} onChange={handleChange} required />
        </div>
        
        <div className="form-group">
          <label htmlFor="budget" className="form-label">공사 예산</label>
          <input type="text" inputMode="numeric" id="budget" name="budget" className="form-input" value={editData.budget} onChange={handleBudgetChange} />
        </div>

        <div className="form-group full-width">
          <label htmlFor="address" className="form-label">주소 <span className="required">*</span></label>
          <input type="text" id="address" name="address" className="form-input" value={editData.address} onChange={handleChange} required />
        </div>

        {/* 도급인 정보 표시 영역 */}
        {contractorInfo && (
          <>

            
            <div className="form-group">
              <label className="form-label">도급인명</label>
              <input type="text" value={contractorInfo.name} disabled className="form-input" style={{backgroundColor: '#f0f0f0', color: '#555', cursor: 'default'}} />
            </div>
            
            <div className="form-group">
              <label className="form-label">연락처</label>
              <input type="text" value={contractorInfo.phone} disabled className="form-input" style={{backgroundColor: '#f0f0f0', color: '#555', cursor: 'default'}} />
            </div>
            
            <div className="form-group full-width">
              <label className="form-label">이메일</label>
              <input type="text" value={contractorInfo.email} disabled className="form-input" style={{backgroundColor: '#f0f0f0', color: '#555', cursor: 'default'}} />
            </div>
          </>
        )}

        <div className="form-group">
          <label htmlFor="client1Name" className="form-label">고객명1 <span className="required">*</span></label>
          <input type="text" id="client1Name" name="client1Name" className="form-input" value={editData.client1Name} onChange={handleChange} required />
        </div>
        <div className="form-group">
          <label htmlFor="client1Phone" className="form-label">연락처1 <span className="required">*</span></label>
          <input type="tel" id="client1Phone" name="client1Phone" className="form-input" value={editData.client1Phone} onChange={handlePhoneChange} required />
        </div>

        <div className="form-group">
          <label htmlFor="client2Name" className="form-label">고객명2</label>
          <input type="text" id="client2Name" name="client2Name" className="form-input" value={editData.client2Name} onChange={handleChange} />
        </div>
        <div className="form-group">
          <label htmlFor="client2Phone" className="form-label">연락처2</label>
          <input type="tel" id="client2Phone" name="client2Phone" className="form-input" value={editData.client2Phone} onChange={handlePhoneChange} />
        </div>
        
        {/* 상업/주거 조건부 렌더링 (기존 코드 유지) */}
        {siteData.siteType === 'commercial' && (
          <>
            <div className="form-group">
              <label htmlFor="area" className="form-label">면적</label>
              <input type="text" id="area" name="area" className="form-input" value={editData.area} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="businessType" className="form-label">업종</label>
              <input type="text" id="businessType" name="businessType" className="form-input" value={editData.businessType} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="startDate" className="form-label">희망 공사 시작일</label>
              <input type="date" id="startDate" name="startDate" className="form-input" value={editData.startDate} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="openDate" className="form-label">오픈 예정일</label>
              <input type="date" id="openDate" name="openDate" className="form-input" value={editData.openDate} onChange={handleChange} />
            </div>
          </>
        )}

        {siteData.siteType === 'residential' && (
          <>
            <div className="form-group">
              <label htmlFor="area" className="form-label">면적</label>
              <input type="text" id="area" name="area" className="form-input" value={editData.area} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="startDate" className="form-label">희망 공사 시작일</label>
              <input type="date" id="startDate" name="startDate" className="form-input" value={editData.startDate} onChange={handleChange} />
            </div>
            <div className="form-group full-width">
              <label htmlFor="moveInDate" className="form-label">입주 예정일</label>
              <input type="date" id="moveInDate" name="moveInDate" className="form-input" value={editData.moveInDate} onChange={handleChange} />
            </div>
          </>
        )}
        
        {/* 하단 버튼 영역 */}
        <div className="info-form-actions full-width">
          
          <button 
            type="submit" 
            className="btn-save-changes"
            style={{ backgroundColor: K_BRAND_COLOR }}
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : '현장 정보 저장'}
          </button>

          {/* [⭐ 수정] 도급인 초대 버튼 (초대 완료 시 비활성화 및 텍스트 변경) */}
          <button 
            type="button"
            className="btn-invite-contractor"
            onClick={() => setIsInviteModalOpen(true)}
            // contractorInfo가 있으면 비활성화
            disabled={isSaving || !!contractorInfo}
            // 이미 초대된 경우 회색 스타일 적용 등은 CSS :disabled 로 처리됨
          >
            {contractorInfo ? '초대 완료' : '도급인 초대'}
          </button>

        </div>
      </form>

      {isInviteModalOpen && (
        <ContractorInviteModal 
          siteId={siteId} 
          siteName={editData.siteName} 
          partnerUid={partnerUid}
          clientPhone={editData.client1Phone}
          onClose={() => setIsInviteModalOpen(false)} 
        />
      )}
    </div>
  );
};

export default SiteInfoWidget;