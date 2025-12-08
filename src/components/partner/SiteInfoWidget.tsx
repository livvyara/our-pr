import React, { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import './SiteInfoWidget.css'; 
import { K_BRAND_COLOR } from '../../constants';
import { 
  getFirestore, doc, updateDoc, serverTimestamp, deleteDoc,
  collection, query, where, getDocs, getDoc, orderBy 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import ContractorInviteModal from './ContractorInviteModal';
import { createOrUpdateSiteChat, closeSiteChat, openSiteChat } from '../../utils/chatService';

// ... (ADDRESS_DATA 기존과 동일 - 생략) ...
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
  
  sido?: string;
  sigungu?: string;
  detailAddress?: string;
  aptName?: string;
  aptDong?: string;
  aptHo?: string;
}

interface SiteInfoWidgetProps {
  siteData: SiteData;
  siteId: string;
  partnerUid: string;
  onSaveSuccess: (updatedData: SiteData) => void;
  widgetTitle: string; 
}

interface ContractorInfo { 
    invitationId: string;
    uid: string;
    name: string; 
    email: string; 
    phone: string; 
}

const formatNumberWithCommas = (num: number): string => num ? num.toLocaleString('ko-KR') : '';
const parseNumberFromCommas = (str: string): number => parseInt(str.replace(/,/g, ''), 10) || 0;
const STATUS_OPTIONS = ["미팅중", "계약대기", "계약완료", "공사전", "공사중", "공사완료", "보류", "취소"];

const SiteInfoWidget: React.FC<SiteInfoWidgetProps> = ({ 
  siteData, siteId, partnerUid, onSaveSuccess, widgetTitle
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [contractors, setContractors] = useState<ContractorInfo[]>([]);
  
  const [siteType, setSiteType] = useState<'commercial' | 'residential'>('commercial');
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const [detailAddress, setDetailAddress] = useState('');
  const [aptName, setAptName] = useState('');
  const [aptDong, setAptDong] = useState('');
  const [aptHo, setAptHo] = useState('');

  const [editData, setEditData] = useState({
    siteName: '', address: '', client1Name: '', client1Phone: '', client2Name: '', client2Phone: '',
    budget: '', area: '', startDate: '', openDate: '', businessType: '', moveInDate: '', status: '', 
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

    if (siteData.sido || siteData.sigungu) {
        setSido(siteData.sido || '');
        setSigungu(siteData.sigungu || '');
        setDetailAddress(siteData.detailAddress || '');
        setAptName(siteData.aptName || '');
        setAptDong(siteData.aptDong || '');
        setAptHo(siteData.aptHo || '');
    } else if (siteData.address) {
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

  const fetchContractors = async () => {
    if (!siteId) return;
    try {
      const inviteQuery = query(
        collection(db, 'siteInvitations'),
        where('siteId', '==', siteId),
        where('status', '==', 'redeemed'),
        orderBy('redeemedAt', 'desc')
      );
      const inviteSnap = await getDocs(inviteQuery);
      const loadedContractors: ContractorInfo[] = [];

      for (const docSnap of inviteSnap.docs) {
          const inviteData = docSnap.data();
          const contractorUid = inviteData.redeemedBy;
          if (contractorUid) {
              const userDoc = await getDoc(doc(db, 'users', contractorUid));
              if (userDoc.exists()) {
                  const userData = userDoc.data();
                  loadedContractors.push({
                      invitationId: docSnap.id,
                      uid: contractorUid,
                      name: userData.name || '이름 없음', 
                      email: userData.email || '-',
                      phone: userData.phone || '-'
                  });
              }
          }
      }
      setContractors(loadedContractors);

      if (loadedContractors.length > 0) {
          await createOrUpdateSiteChat(
              siteId, 
              siteData.siteName || '현장', 
              partnerUid, 
              loadedContractors[0].uid 
          );
      }
    } catch (e) { console.error("도급인 로딩 실패:", e); }
  };

  useEffect(() => {
    fetchContractors();
  }, [siteId, db, partnerUid, siteData.siteName]);

  const handleRemoveContractor = async (contractor: ContractorInfo) => {
      if (!confirm(`'${contractor.name}'님을 이 현장의 도급인에서 해제하시겠습니까?`)) return;
      try {
          const inviteRef = doc(db, 'siteInvitations', contractor.invitationId);
          await deleteDoc(inviteRef); 
          alert("도급인이 해제되었습니다.");
          fetchContractors(); 
      } catch (e) {
          console.error(e);
          alert("해제 중 오류가 발생했습니다.");
      }
  };

  const handleSidoChange = (e: ChangeEvent<HTMLSelectElement>) => { setSido(e.target.value); setSigungu(''); };
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const { name, value } = e.target; setEditData(prev => ({ ...prev, [name]: value })); };
  const handleBudgetChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, ''); 
    if (rawValue === '') { setEditData(prev => ({ ...prev, budget: '' })); return; }
    setEditData(prev => ({ ...prev, budget: parseInt(rawValue, 10).toLocaleString('ko-KR') }));
  };
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target; let val = value.replace(/[^0-9]/g, '').slice(0, 11);
    if (val.length > 7) val = `${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7)}`;
    else if (val.length > 3) val = `${val.slice(0, 3)}-${val.slice(3)}`;
    setEditData(prev => ({ ...prev, [name]: val }));
  };

  const handleUpdateSiteInfo = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user) { alert("로그인 필요"); setIsSaving(false); return; }
    
    try {
      let fullAddress = (sido && sigungu) ? `${sido} ${sigungu} ${detailAddress}` : detailAddress;
      if (siteType === 'residential') {
          if (aptName) fullAddress += ` ${aptName}`;
          if (aptDong) fullAddress += ` ${aptDong}동`;
          if (aptHo) fullAddress += ` ${aptHo}호`;
      }

      const isCompleting = editData.status === '공사완료' && siteData.status !== '공사완료';
      const isReopening = siteData.status === '공사완료' && editData.status !== '공사완료';

      const dataToSaveForFirestore = {
        ...editData, address: fullAddress, budget: parseNumberFromCommas(editData.budget), siteType: siteType, 
        sido, sigungu, detailAddress, aptName, aptDong, aptHo, updatedAt: serverTimestamp(),
      };
      
      await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId), dataToSaveForFirestore);

      if (isCompleting) {
          await closeSiteChat(siteId);
          alert("공사가 완료 처리되었습니다.\n현장 채팅방이 비활성화됩니다.");
      } else if (isReopening) {
          await openSiteChat(siteId); 
          alert("현장 정보가 저장되었습니다.\n(채팅방이 다시 활성화됩니다)");
      } else {
          alert('현장 정보가 저장되었습니다.');
      }
      
      const updatedLocalSiteData: SiteData = {
        ...siteData, ...editData, address: fullAddress, budget: parseNumberFromCommas(editData.budget), siteType: siteType,
        sido, sigungu, detailAddress, aptName, aptDong, aptHo
      };
      onSaveSuccess(updatedLocalSiteData); 
    } catch (error) { alert('저장 중 오류가 발생했습니다.'); console.error(error); } finally { setIsSaving(false); }
  };

  return (
    <div className="site-info-widget compact">
      <div className="widget-header-row">
          <h3>{widgetTitle}</h3>
          <div className="header-right-group">
            <div className="site-type-toggle">
                <label className={siteType === 'commercial' ? 'active' : ''}><input type="radio" name="siteTypeEdit" value="commercial" checked={siteType === 'commercial'} onChange={() => setSiteType('commercial')} /> 상업</label>
                <label className={siteType === 'residential' ? 'active' : ''}><input type="radio" name="siteTypeEdit" value="residential" checked={siteType === 'residential'} onChange={() => setSiteType('residential')} /> 주거</label>
            </div>
            <select className="status-dropdown" name="status" value={editData.status} onChange={handleChange} disabled={isSaving}>
                {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
      </div>

      <form className="info-form-compact" onSubmit={handleUpdateSiteInfo}>
        {/* Row 1: 현장명 (50%) + 도급인 리스트 (50%) */}
        <div className="row">
            <label>현장명</label>
            <input type="text" name="siteName" className="input-f flex-1" value={editData.siteName} onChange={handleChange} required />
            
            <div className="contractor-area flex-1">
                <label style={{width:'auto', marginRight:'5px'}}>도급인</label>
                {contractors.length > 0 ? (
                    <div className="contractor-list-inline">
                        {contractors.map(ct => (
                            <div key={ct.invitationId} className="contractor-tag-inline">
                                <span>{ct.name}</span>
                                <button type="button" onClick={() => handleRemoveContractor(ct)}>×</button>
                            </div>
                        ))}
                        <button type="button" className="btn-add-mini-inline" onClick={() => setIsInviteModalOpen(true)}>+</button>
                    </div>
                ) : (
                    <button type="button" className="btn-invite-text" onClick={() => setIsInviteModalOpen(true)}>+ 초대하기</button>
                )}
            </div>
        </div>
        
        {/* Row 2: 주소 (시도 40% 확대, 시군구 10% 확대, 나머지는 자동) */}
        <div className="row">
            <label>주소</label>
            <div className="addr-group flex-1">
                <select className="input-f" value={sido} onChange={handleSidoChange} style={{flexGrow: 1.4}}> {/* 40% 더 넓게 */}
                    <option value="">시/도</option>
                    {Object.keys(ADDRESS_DATA).map(area => <option key={area} value={area}>{area}</option>)}
                </select>
                <select className="input-f" value={sigungu} onChange={e => setSigungu(e.target.value)} disabled={!sido} style={{flexGrow: 1.1}}> {/* 10% 더 넓게 */}
                    <option value="">시/군</option>
                    {sido && ADDRESS_DATA[sido]?.map(dist => <option key={dist} value={dist}>{dist}</option>)}
                </select>
                <input type="text" className="input-f" value={detailAddress} onChange={e => setDetailAddress(e.target.value)} placeholder="상세주소" style={{flexGrow: 1}} />
                {siteType === 'residential' && (
                    <>
                        <input type="text" className="input-f" value={aptName} onChange={e => setAptName(e.target.value)} placeholder="아파트" style={{width:'60px'}} />
                        <input type="text" className="input-f" value={aptDong} onChange={e => setAptDong(e.target.value)} placeholder="동" style={{width:'40px'}} />
                        <input type="text" className="input-f" value={aptHo} onChange={e => setAptHo(e.target.value)} placeholder="호" style={{width:'40px'}} />
                    </>
                )}
            </div>
        </div>

        {/* Row 3: 고객 정보 (전체 너비 균등) */}
        <div className="row">
            <label>고객1</label>
            <div className="client-grid flex-1">
                <input type="text" name="client1Name" className="input-f" value={editData.client1Name} onChange={handleChange} placeholder="이름" required />
                <input type="tel" name="client1Phone" className="input-f" value={editData.client1Phone} onChange={handlePhoneChange} placeholder="연락처" required />
                <span className="client-sep">/</span>
                <label style={{width:'auto', margin:'0 5px'}}>고객2</label>
                <input type="text" name="client2Name" className="input-f" value={editData.client2Name} onChange={handleChange} placeholder="이름" />
                <input type="tel" name="client2Phone" className="input-f" value={editData.client2Phone} onChange={handlePhoneChange} placeholder="연락처" />
            </div>
        </div>

        {/* Row 4: 상세 정보 (한 줄 배치) */}
        <div className="row">
            <label>면적</label>
            <div className="detail-grid flex-1">
                <div className="d-item"><span className="d-label"></span><input type="text" name="area" className="input-f" value={editData.area} onChange={handleChange} /></div>
                <div className="d-item"><span className="d-label">예산</span><input type="text" inputMode="numeric" name="budget" className="input-f right" value={editData.budget} onChange={handleBudgetChange} /></div>
                
                {siteType === 'commercial' ? (
                    <>
                        <div className="d-item"><span className="d-label">업종</span><input type="text" name="businessType" className="input-f" value={editData.businessType} onChange={handleChange} /></div>
                        <div className="d-item"><span className="d-label">시작</span><input type="date" name="startDate" className="input-f" value={editData.startDate} onChange={handleChange} /></div>
                        <div className="d-item"><span className="d-label">오픈</span><input type="date" name="openDate" className="input-f" value={editData.openDate} onChange={handleChange} /></div>
                    </>
                ) : (
                    <>
                        <div className="d-item"><span className="d-label">입주</span><input type="date" name="moveInDate" className="input-f" value={editData.moveInDate} onChange={handleChange} /></div>
                        <div className="d-item"><span className="d-label">시작</span><input type="date" name="startDate" className="input-f" value={editData.startDate} onChange={handleChange} /></div>
                    </>
                )}
            </div>
        </div>

        <div className="footer-actions">
            <button type="submit" className="btn-save-compact" style={{ backgroundColor: K_BRAND_COLOR }} disabled={isSaving}>
                {isSaving ? '...' : '저장'}
            </button>
        </div>
      </form>
      {isInviteModalOpen && (<ContractorInviteModal siteId={siteId} siteName={editData.siteName} partnerUid={partnerUid} clientPhone={editData.client1Phone} onClose={() => { setIsInviteModalOpen(false); fetchContractors(); }} />)}
    </div>
  );
};

export default SiteInfoWidget;