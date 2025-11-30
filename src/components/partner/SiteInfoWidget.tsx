import React, { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import './SiteInfoWidget.css'; 
import { K_BRAND_COLOR } from '../../constants';
import { 
  getFirestore, doc, updateDoc, serverTimestamp, 
  collection, query, where, getDocs, getDoc, limit, orderBy 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import ContractorInviteModal from './ContractorInviteModal';

const ADDRESS_DATA: { [key: string]: string[] } = {
  "서울특별시": ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"],
  "경기도": ["수원시", "성남시", "의정부시", "안양시", "부천시", "광명시", "평택시", "동두천시", "안산시", "고양시", "과천시", "구리시", "남양주시", "오산시", "시흥시", "군포시", "의왕시", "하남시", "용인시", "파주시", "이천시", "안성시", "김포시", "화성시", "광주시", "양주시", "포천시", "여주시", "연천군", "가평군", "양평군"],
  "광주광역시": ["동구", "서구", "남구", "북구", "광산구"],
  "대구광역시": ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군"],
  "대전광역시": ["동구", "중구", "서구", "유성구", "대덕구"],
  "부산광역시": ["중구", "서구", "동구", "영도구", "부산진구", "동래구", "남구", "북구", "해운대구", "사하구", "금정구", "강서구", "연제구", "수영구", "사상구", "기장군"],
  "인천광역시": ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"],
  "울산광역시": ["중구", "남구", "동구", "북구", "울주군"],
  "세종특별자치시": ["세종시"],
  "강원특별자치도": ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시", "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "고성군", "양양군"],
  "충청북도": ["청주시", "충주시", "제천시", "보은군", "옥천군", "영동군", "증평군", "진천군", "괴산군", "음성군", "단양군"],
  "충청남도": ["천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시", "당진시", "금산군", "부여군", "서천군", "청양군", "홍성군", "예산군", "태안군"],
  "전북특별자치도": ["전주시", "군산시", "익산시", "정읍시", "남원시", "김제시", "완주군", "진안군", "무주군", "장수군", "임실군", "순창군", "고창군", "부안군"],
  "전라남도": ["목포시", "여수시", "순천시", "나주시", "광양시", "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군"],
  "경상북도": ["포항시", "경주시", "김천시", "안동시", "구미시", "영주시", "영천시", "상주시", "문경시", "경산시", "의성군", "청송군", "영양군", "영덕군", "청도군", "고령군", "성주군", "칠곡군", "예천군", "봉화군", "울진군", "울릉군"],
  "경상남도": ["창원시", "진주시", "통영시", "사천시", "김해시", "밀양시", "거제시", "양산시", "의령군", "함안군", "창녕군", "고성군", "남해군", "하동군", "산청군", "함양군", "거창군", "합천군"],
  "제주특별자치도": ["제주시", "서귀포시"]
};
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

interface ContractorInfo { name: string; email: string; phone: string; }

const formatNumberWithCommas = (num: number): string => num ? num.toLocaleString('ko-KR') : '';
const parseNumberFromCommas = (str: string): number => parseInt(str.replace(/,/g, ''), 10) || 0;

const STATUS_OPTIONS = ["미팅중", "계약대기", "계약완료", "공사전", "공사중", "공사완료", "보류", "취소"];

const SiteInfoWidget: React.FC<SiteInfoWidgetProps> = ({ 
  siteData, siteId, partnerUid, onSaveSuccess, widgetTitle
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [contractorInfo, setContractorInfo] = useState<ContractorInfo | null>(null);

  const [siteType, setSiteType] = useState<'commercial' | 'residential'>('commercial');

  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const [detailAddress, setDetailAddress] = useState('');
  
  const [aptName, setAptName] = useState('');
  const [aptDong, setAptDong] = useState('');
  const [aptHo, setAptHo] = useState('');

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
    
    setSiteType(siteData.siteType || 'commercial');

    if (siteData.address) {
        const parts = siteData.address.split(' ');
        if (parts.length >= 2 && ADDRESS_DATA[parts[0]]) {
            setSido(parts[0]);
            setSigungu(parts[1]);
            setDetailAddress(parts.slice(2).join(' '));
        } else {
            setSido('');
            setSigungu('');
            setDetailAddress(siteData.address);
        }
    }
  }, [siteData]); 

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
      } catch (e) { console.error("도급인 로딩 실패:", e); }
    };
    fetchContractor();
  }, [siteId, db]);

  const handleSidoChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSido(e.target.value);
    setSigungu(''); 
  };

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
  
  // [수정] 연락처 자동 하이픈
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let val = value.replace(/[^0-9]/g, '').slice(0, 11);
    
    if (val.length > 7) {
        val = `${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7)}`;
    } else if (val.length > 3) {
        val = `${val.slice(0, 3)}-${val.slice(3)}`;
    }
    
    setEditData(prev => ({ ...prev, [name]: val }));
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
      let fullAddress = (sido && sigungu) ? `${sido} ${sigungu} ${detailAddress}` : detailAddress;
      if (siteType === 'residential') {
          if (aptName) fullAddress += ` ${aptName}`;
          if (aptDong) fullAddress += ` ${aptDong}동`;
          if (aptHo) fullAddress += ` ${aptHo}호`;
      }

      const dataToSaveForFirestore = {
        ...editData,
        address: fullAddress,
        budget: parseNumberFromCommas(editData.budget),
        siteType: siteType, 
        updatedAt: serverTimestamp(),
      };
      
      const siteDocRef = doc(db, 'users', partnerUid, 'sites', siteId);
      await updateDoc(siteDocRef, dataToSaveForFirestore);
      
      alert('현장 정보가 저장되었습니다.');
      
      const updatedLocalSiteData: SiteData = {
        ...siteData, 
        ...editData, 
        address: fullAddress,
        budget: parseNumberFromCommas(editData.budget),
        siteType: siteType,
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
          <span className="status-label">상태:</span>
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

      <div className="site-type-switcher" style={{marginBottom:'10px', display:'flex', gap:'10px'}}>
          <label style={{cursor:'pointer', fontWeight: siteType==='commercial'?'bold':'normal'}}>
              <input type="radio" name="siteTypeEdit" value="commercial" checked={siteType === 'commercial'} onChange={() => setSiteType('commercial')} /> 상업공간
          </label>
          <label style={{cursor:'pointer', fontWeight: siteType==='residential'?'bold':'normal'}}>
              <input type="radio" name="siteTypeEdit" value="residential" checked={siteType === 'residential'} onChange={() => setSiteType('residential')} /> 주거공간
          </label>
      </div>

      <form className="info-form-grid" onSubmit={handleUpdateSiteInfo}>
        
        <div className="info-row">
            <div className="form-group" style={{flex: 2}}>
                <label className="form-label">현장명 <span className="required">*</span></label>
                <input type="text" name="siteName" className="form-input" value={editData.siteName} onChange={handleChange} required />
            </div>
            <div className="form-group" style={{flex: 1}}>
                <label className="form-label">공사 예산</label>
                <input type="text" inputMode="numeric" name="budget" className="form-input" value={editData.budget} onChange={handleBudgetChange} />
            </div>
        </div>

        <div className="form-group full-width">
          <label className="form-label">주소 <span className="required">*</span></label>
          <div className="address-inputs-row">
            <select className="form-select addr-select" value={sido} onChange={handleSidoChange} required>
              <option value="">시/도</option>
              {Object.keys(ADDRESS_DATA).map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
            <select className="form-select addr-select" value={sigungu} onChange={e => setSigungu(e.target.value)} required disabled={!sido}>
              <option value="">시/군/구</option>
              {sido && ADDRESS_DATA[sido]?.map(dist => (
                <option key={dist} value={dist}>{dist}</option>
              ))}
            </select>
            
            <input 
                type="text" 
                className="form-input addr-detail" 
                value={detailAddress} 
                onChange={e => setDetailAddress(e.target.value)} 
                placeholder={siteType === 'residential' ? "도로명/지번" : "상세 주소"} 
                required 
                style={{flex: siteType === 'residential' ? 2 : 1}}
            />

            {siteType === 'residential' && (
                <>
                    <input type="text" className="form-input" value={aptName} onChange={e => setAptName(e.target.value)} placeholder="아파트명" style={{flex:1}} />
                    <input type="text" className="form-input" value={aptDong} onChange={e => setAptDong(e.target.value)} placeholder="동" style={{width:'50px'}} />
                    <input type="text" className="form-input" value={aptHo} onChange={e => setAptHo(e.target.value)} placeholder="호" style={{width:'50px'}} />
                </>
            )}
          </div>
        </div>

        {contractorInfo && (
          <div className="contractor-info-box">
            <p><strong>도급인:</strong> {contractorInfo.name} ({contractorInfo.phone}) | <strong>이메일:</strong> {contractorInfo.email}</p>
          </div>
        )}

        <div className="info-row-4">
            <div className="form-group">
                <label className="form-label">고객명1 <span className="required">*</span></label>
                <input type="text" name="client1Name" className="form-input" value={editData.client1Name} onChange={handleChange} required />
            </div>
            <div className="form-group">
                <label className="form-label">연락처1 <span className="required">*</span></label>
                <input type="tel" name="client1Phone" className="form-input" value={editData.client1Phone} onChange={handlePhoneChange} placeholder="010-0000-0000" maxLength={13} required />
            </div>
            <div className="form-group">
                <label className="form-label">고객명2</label>
                <input type="text" name="client2Name" className="form-input" value={editData.client2Name} onChange={handleChange} />
            </div>
            <div className="form-group">
                <label className="form-label">연락처2</label>
                <input type="tel" name="client2Phone" className="form-input" value={editData.client2Phone} onChange={handlePhoneChange} placeholder="010-0000-0000" maxLength={13} />
            </div>
        </div>
        
        <div className="info-row-4">
            <div className="form-group">
                <label className="form-label">면적</label>
                <input type="text" name="area" className="form-input" value={editData.area} onChange={handleChange} placeholder="30평" />
            </div>

            {siteType === 'commercial' ? (
              <>
                <div className="form-group">
                    <label className="form-label">업종</label>
                    <input type="text" name="businessType" className="form-input" value={editData.businessType} onChange={handleChange} placeholder="카페" />
                </div>
                <div className="form-group">
                    <label className="form-label">공사시작</label>
                    <input type="date" name="startDate" className="form-input" value={editData.startDate} onChange={handleChange} />
                </div>
                <div className="form-group">
                    <label className="form-label">오픈예정</label>
                    <input type="date" name="openDate" className="form-input" value={editData.openDate} onChange={handleChange} />
                </div>
              </>
            ) : (
              <>
                 <div className="form-group">
                    <label className="form-label">입주예정</label>
                    <input type="date" name="moveInDate" className="form-input" value={editData.moveInDate} onChange={handleChange} />
                 </div>
                 <div className="form-group">
                    <label className="form-label">공사시작</label>
                    <input type="date" name="startDate" className="form-input" value={editData.startDate} onChange={handleChange} />
                 </div>
                 <div className="form-group"></div>
              </>
            )}
        </div>
        
        <div className="info-form-actions full-width">
          <button 
            type="submit" 
            className="btn-save-changes"
            style={{ backgroundColor: K_BRAND_COLOR }}
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : '현장 정보 저장'}
          </button>

          <button 
            type="button"
            className="btn-invite-contractor"
            onClick={() => setIsInviteModalOpen(true)}
            disabled={isSaving || !!contractorInfo}
          >
            {contractorInfo ? '초대됨' : '초대'}
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