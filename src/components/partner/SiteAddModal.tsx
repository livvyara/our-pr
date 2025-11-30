import React, { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import './SiteAddModal.css'; 

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

type SiteType = 'commercial' | 'residential';

const initialFormData = {
  siteName: '',
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

interface SiteAddModalProps {
  partnerUid: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const SiteAddModal: React.FC<SiteAddModalProps> = ({ partnerUid, onClose, onSuccess }) => {
  const [siteType, setSiteType] = useState<SiteType>('commercial');
  const [formData, setFormData] = useState(initialFormData);
  const [authorName, setAuthorName] = useState('직원');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const [detailAddress, setDetailAddress] = useState('');
  
  // 주거용 추가 주소
  const [aptName, setAptName] = useState('');
  const [aptDong, setAptDong] = useState('');
  const [aptHo, setAptHo] = useState('');

  const db = getFirestore();

  useEffect(() => {
    const fetchAuthor = async () => {
      if (auth.currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setAuthorName(data.nickname || data.name || '직원');
          }
        } catch (e) { console.error(e); }
      }
    };
    fetchAuthor();
  }, [db]);

  const handleSidoChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSido(e.target.value);
    setSigungu(''); 
  };

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
  
  // [수정] 연락처 자동 하이픈 및 숫자만 입력 (11자리)
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let val = value.replace(/[^0-9]/g, '').slice(0, 11);
    
    if (val.length > 7) {
        val = `${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7)}`;
    } else if (val.length > 3) {
        val = `${val.slice(0, 3)}-${val.slice(3)}`;
    }
    
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !partnerUid) return alert("오류: 로그인 정보가 없습니다.");

    if (!sido || !sigungu || !detailAddress) return alert("주소를 모두 입력해주세요.");

    setIsSubmitting(true);
    
    try {
      const rawBudget = parseInt(formData.budget.replace(/,/g, ''), 10) || 0;
      
      // 주소 조합
      let fullAddress = `${sido} ${sigungu} ${detailAddress}`;
      if (siteType === 'residential') {
          if (aptName) fullAddress += ` ${aptName}`;
          if (aptDong) fullAddress += ` ${aptDong}동`;
          if (aptHo) fullAddress += ` ${aptHo}호`;
      }
      
      const commonData = {
        siteName: formData.siteName,
        address: fullAddress,
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

      const docRef = await addDoc(collection(db, 'users', partnerUid, 'sites'), finalData);

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
      if (onSuccess) onSuccess();
      onClose();

    } catch (error: any) {
      console.error("현장 추가 오류:", error);
      alert('오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sam-overlay">
      <div className="sam-content">
        <div className="sam-header">
          <h2>현장 추가</h2>
          <button className="sam-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="sam-body">
          <div className="sam-radio-group compact">
            <label className={`sam-radio-label ${siteType === 'commercial' ? 'active' : ''}`}>
              <input type="radio" name="siteType" value="commercial" checked={siteType === 'commercial'} onChange={() => setSiteType('commercial')} />
              상업공간
            </label>
            <label className={`sam-radio-label ${siteType === 'residential' ? 'active' : ''}`}>
              <input type="radio" name="siteType" value="residential" checked={siteType === 'residential'} onChange={() => setSiteType('residential')} />
              주거공간
            </label>
          </div>

          <form className="sam-form" onSubmit={handleSubmit}>
            
            <div className="sam-row">
                <div className="sam-group" style={{flex: 2}}>
                    <label>현장명 (별칭) <span className="req">*</span></label>
                    <input type="text" name="siteName" value={formData.siteName} onChange={handleChange} required placeholder="예: 봉선동 카페" />
                </div>
                <div className="sam-group" style={{flex: 1}}>
                    <label>공사 예산</label>
                    <input type="text" inputMode="numeric" name="budget" value={formData.budget} onChange={handleBudgetChange} placeholder="숫자만" />
                </div>
            </div>

            <div className="sam-group">
                <label>주소 <span className="req">*</span></label>
                <div className="sam-addr-row full">
                    <select value={sido} onChange={handleSidoChange} required style={{width:'110px'}}>
                        <option value="">시/도</option>
                        {Object.keys(ADDRESS_DATA).map(area => <option key={area} value={area}>{area}</option>)}
                    </select>
                    <select value={sigungu} onChange={e => setSigungu(e.target.value)} required disabled={!sido} style={{width:'110px'}}>
                        <option value="">시/군/구</option>
                        {sido && ADDRESS_DATA[sido]?.map(dist => <option key={dist} value={dist}>{dist}</option>)}
                    </select>
                    <input 
                        type="text" 
                        value={detailAddress} 
                        onChange={e => setDetailAddress(e.target.value)} 
                        placeholder={siteType === 'residential' ? "도로명/지번" : "상세 주소"} 
                        required 
                        style={{flex: siteType === 'residential' ? 2 : 1}}
                    />
                    {siteType === 'residential' && (
                        <>
                            <input type="text" value={aptName} onChange={e => setAptName(e.target.value)} placeholder="아파트명" style={{flex:1}} />
                            <input type="text" value={aptDong} onChange={e => setAptDong(e.target.value)} placeholder="동" style={{width:'50px'}} />
                            <input type="text" value={aptHo} onChange={e => setAptHo(e.target.value)} placeholder="호" style={{width:'50px'}} />
                        </>
                    )}
                </div>
            </div>

            <div className="sam-row-4">
                <div className="sam-group">
                    <label>고객명 1 <span className="req">*</span></label>
                    <input type="text" name="client1Name" value={formData.client1Name} onChange={handleChange} required />
                </div>
                <div className="sam-group">
                    <label>연락처 1 <span className="req">*</span></label>
                    <input type="tel" name="client1Phone" value={formData.client1Phone} onChange={handlePhoneChange} placeholder="010-0000-0000" maxLength={13} required />
                </div>
                <div className="sam-group">
                    <label>고객명 2</label>
                    <input type="text" name="client2Name" value={formData.client2Name} onChange={handleChange} />
                </div>
                <div className="sam-group">
                    <label>연락처 2</label>
                    <input type="tel" name="client2Phone" value={formData.client2Phone} onChange={handlePhoneChange} placeholder="010-0000-0000" maxLength={13} />
                </div>
            </div>

            <div className="sam-row-4">
                <div className="sam-group">
                    <label>면적</label>
                    <input type="text" name="area" value={formData.area} onChange={handleChange} placeholder="30평" />
                </div>
                {siteType === 'commercial' ? (
                    <div className="sam-group">
                        <label>업종</label>
                        <input type="text" name="businessType" value={formData.businessType} onChange={handleChange} placeholder="카페" />
                    </div>
                ) : (
                    <div className="sam-group">
                        <label>입주예정</label>
                        <input type="date" name="moveInDate" value={formData.moveInDate} onChange={handleChange} />
                    </div>
                )}
                <div className="sam-group">
                    <label>공사시작</label>
                    <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} />
                </div>
                {siteType === 'commercial' ? (
                    <div className="sam-group">
                        <label>오픈예정</label>
                        <input type="date" name="openDate" value={formData.openDate} onChange={handleChange} />
                    </div>
                ) : (
                    <div className="sam-group"></div>
                )}
            </div>

            <div className="sam-footer compact">
              <button type="button" className="sam-btn-cancel" onClick={onClose}>취소</button>
              <button type="submit" className="sam-btn-save" disabled={isSubmitting}>
                {isSubmitting ? '저장...' : '등록하기'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SiteAddModal;