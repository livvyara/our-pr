import React, { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { 
  getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, limit, orderBy, serverTimestamp, addDoc 
} from 'firebase/firestore';
import { K_BRAND_COLOR } from '../../constants';
import './ContractInfoModal.css';

interface ContractInfoModalProps {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

type SiteType = 'apartment' | 'residential' | 'commercial';

const ContractInfoModal: React.FC<ContractInfoModalProps> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State Definitions
  const [siteType, setSiteType] = useState<SiteType>('residential');
  const [supplyAmount, setSupplyAmount] = useState(''); 
  const [vatAmount, setVatAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [baseAddress, setBaseAddress] = useState('');
  const [aptName, setAptName] = useState('');
  const [aptDong, setAptDong] = useState('');
  const [aptHo, setAptHo] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [isClientInvited, setIsClientInvited] = useState(false);

  // Data Loading
  useEffect(() => {
    const fetchData = async () => {
      if (!siteId) return;
      try {
        const siteDocRef = doc(db, 'users', partnerUid, 'sites', siteId);
        const siteSnap = await getDoc(siteDocRef);
        
        if (siteSnap.exists()) {
          const data = siteSnap.data();
          setBaseAddress(data.address || '');
          
          // 1. 계약 정보가 있으면 계약 정보 우선 사용
          if (data.contract) {
             setSiteType(data.contract.siteType || 'residential');
             
             const loadedSupply = data.contract.supplyAmount 
               ? Number(data.contract.supplyAmount)
               : (Number(data.contract.totalAmount || 0) - Number(data.contract.vatAmount || 0));
               
             setSupplyAmount(loadedSupply > 0 ? loadedSupply.toLocaleString() : '');
             setVatAmount(Number(data.contract.vatAmount).toLocaleString() || '');
             
             // 날짜 로딩 (contract 필드 우선)
             setStartDate(data.contract.startDate || data.startDate || '');
             setEndDate(data.contract.endDate || data.endDate || '');

             setAptName(data.contract.aptName || '');
             setAptDong(data.contract.aptDong || '');
             setAptHo(data.contract.aptHo || '');
             
             if(data.contract.clientName) setClientName(data.contract.clientName);
             if(data.contract.clientPhone) setClientPhone(data.contract.clientPhone);
             if(data.contract.clientAddress) setClientAddress(data.contract.clientAddress);
          } else {
             // 2. 계약 정보가 없으면 현장 기본 정보 사용
             setStartDate(data.startDate || '');
             // 예산(budget)을 공급가액으로 추정하여 표시 (선택사항)
             if (data.budget) {
                 setSupplyAmount(Number(data.budget).toLocaleString());
                 setVatAmount(Math.floor(Number(data.budget) * 0.1).toLocaleString());
             }
          }
        }
        
        // 도급인 초대 정보 확인
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
              setIsClientInvited(true);
              // 이미 입력된 값이 없다면 자동 채움
              if (!clientName) setClientName(userData.name || userData.nickname || '');
              if (!clientPhone) setClientPhone(userData.phone || '');
            }
          }
        }
      } catch (e) { console.error("데이터 로드 실패:", e); }
    };
    fetchData();
  }, [db, siteId, partnerUid]);

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    if (!rawValue) { setSupplyAmount(''); setVatAmount(''); return; }
    const numValue = parseInt(rawValue, 10);
    setSupplyAmount(numValue.toLocaleString('ko-KR'));
    const vat = Math.floor(numValue * 0.1); 
    setVatAmount(vat.toLocaleString('ko-KR'));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplyAmount || !startDate || !endDate) return alert("필수 항목을 입력해주세요.");
    setIsSubmitting(true);
    try {
      const supplyVal = parseInt(supplyAmount.replace(/,/g, ''), 10);
      const vatVal = parseInt(vatAmount.replace(/,/g, ''), 10);
      const totalVal = supplyVal + vatVal;

      const contractData = {
        siteType,
        supplyAmount: supplyVal,
        vatAmount: vatVal,
        totalAmount: totalVal,
        startDate, endDate, address: baseAddress,
        aptName: siteType === 'apartment' ? aptName : '',
        aptDong: siteType === 'apartment' ? aptDong : '',
        aptHo: siteType === 'apartment' ? aptHo : '',
        clientName, clientPhone, clientAddress,
        updatedAt: serverTimestamp()
      };
      
      // [핵심] contract 필드와 루트 필드 동기화
      await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId), { 
          contract: contractData,
          startDate: startDate, 
          endDate: endDate,
          budget: totalVal,
      });

      // [수정] addDoc 사용 (import 추가됨)
      await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
        text: `[계약등록] 현장 계약 정보가 업데이트되었습니다.`,
        createdAt: serverTimestamp(),
        type: 'contract_update',
        relatedId: siteId
      });

      alert("계약 정보가 저장되었습니다.");
      onClose();
    } catch (e) { console.error(e); alert("오류가 발생했습니다."); } 
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="contract-info-scope">
      <div className="modal-overlay">
        <div className="modal-container">
          
          <div className="modal-header">
            <h2>계약 정보 등록</h2>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>

          <form className="contract-form" onSubmit={handleSubmit}>
            
            {/* 1. 현장 기본 정보 */}
            <div className="control-box">
              <div className="box-title">현장 기본 정보</div>
              
              <div className="form-row">
                <label>현장 구분 <span className="req">*</span></label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input type="radio" name="siteType" value="apartment" checked={siteType === 'apartment'} onChange={() => setSiteType('apartment')} /> 
                    <span>아파트</span>
                  </label>
                  <label className="radio-label">
                    <input type="radio" name="siteType" value="residential" checked={siteType === 'residential'} onChange={() => setSiteType('residential')} /> 
                    <span>주거(일반)</span>
                  </label>
                  <label className="radio-label">
                    <input type="radio" name="siteType" value="commercial" checked={siteType === 'commercial'} onChange={() => setSiteType('commercial')} /> 
                    <span>상업공간</span>
                  </label>
                </div>
              </div>

              <div className="form-row vertical">
                <label>현장 주소 <span className="req">*</span></label>
                <input type="text" value={baseAddress} onChange={e => setBaseAddress(e.target.value)} placeholder="기본 주소를 입력하세요" className="input-modern full" required />
                
                {siteType === 'apartment' && (
                  <div className="apt-row">
                    <input type="text" className="input-modern" placeholder="아파트 명" value={aptName} onChange={e => setAptName(e.target.value)} />
                    <input type="text" className="input-modern" placeholder="동" value={aptDong} onChange={e => setAptDong(e.target.value)} />
                    <input type="text" className="input-modern" placeholder="호수" value={aptHo} onChange={e => setAptHo(e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            {/* 2. 계약 및 공사 상세 */}
            <div className="control-box">
              <div className="box-title">계약 및 공사 상세</div>
              
              <div className="form-row split">
                <div className="form-group">
                  <label>공급가액 <span className="req">*</span></label>
                  <input type="text" value={supplyAmount} onChange={handleAmountChange} placeholder="0" className="input-modern right" required />
                </div>
                <div className="form-group">
                  <label>부가세 (10%)</label>
                  <input type="text" value={vatAmount} readOnly className="input-modern right readonly" />
                </div>
              </div>

              <div className="form-row split">
                <div className="form-group">
                  <label>공사 시작일</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-modern" required />
                </div>
                <div className="form-group">
                  <label>공사 종료일</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-modern" required />
                </div>
              </div>
            </div>

            {/* 3. 발주자 정보 */}
            <div className="control-box">
              <div className="box-header">
                <div className="box-title">발주자(도급인) 정보</div>
                {isClientInvited && <span className="status-badge">연동됨</span>}
              </div>

              <div className="form-row split">
                <div className="form-group">
                  <label>성명 (상호)</label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="이름 입력" className="input-modern" required />
                </div>
                <div className="form-group">
                  <label>연락처</label>
                  <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="010-0000-0000" className="input-modern" required />
                </div>
              </div>
              
              <div className="form-row vertical">
                <label>주소</label>
                <input type="text" value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="도급인 주소를 입력하세요" className="input-modern full" />
              </div>
            </div>

            {/* 푸터 */}
            <div className="cim-footer-actions">
              <button type="button" className="cim-btn-cancel" onClick={onClose}>
                취소
              </button>
              <button type="submit" className="cim-btn-register" disabled={isSubmitting}>
                {isSubmitting ? '저장 중...' : '계약 정보 등록'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
};

export default ContractInfoModal;