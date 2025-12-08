import React, { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { 
  getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, limit, orderBy, serverTimestamp, addDoc, setDoc 
} from 'firebase/firestore';
import { K_BRAND_COLOR } from '../../constants';
import './ContractInfoModal.css';

// [수정] 타입 명시적 임포트
import PaymentTermsModal, { type PaymentTermData, type PaymentItem } from './PaymentTermsModal'; 
import ContractEditorModal, { DEFAULT_CONTRACT_TEXT } from './ContractEditorModal';
import ContractPreviewModal from './ContractPreviewModal';
import SignedContractViewerModal from '../customer/SignedContractViewerModal';

interface ContractInfoModalProps {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

type SiteType = 'apartment' | 'residential' | 'commercial';

interface PartnerInfoData {
    name: string;
    owner: string;
    bizNum: string;
    phone: string;
    address: string;
}

const ContractInfoModal: React.FC<ContractInfoModalProps> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 모달 상태
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSignedViewerOpen, setIsSignedViewerOpen] = useState(false);

  // 기본 정보 State
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
  const [clientUid, setClientUid] = useState<string | null>(null);

  const [asPeriod, setAsPeriod] = useState('12'); 
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermData | null>(null);
  
  // 계약서 양식 및 도장
  const [contractContent, setContractContent] = useState('');
  const [specialTerms, setSpecialTerms] = useState('');
  const [partnerSealUrl, setPartnerSealUrl] = useState('');

  // 파트너 및 현장 정보
  const [partnerInfo, setPartnerInfo] = useState<PartnerInfoData>({ 
      name: '', owner: '', bizNum: '', phone: '', address: '' 
  });
  const [currentSiteName, setCurrentSiteName] = useState('');

  // 계약 상태 및 체결 데이터
  const [contractStatus, setContractStatus] = useState<string>(''); 
  const [signedData, setSignedData] = useState<{
      signatureUrl?: string;
      idCardUrl?: string;
      clientRRN?: string;
      signedAt?: any;
  }>({});

  // Data Loading
  useEffect(() => {
    const fetchData = async () => {
      if (!siteId) return;
      try {
        // 1. 파트너 정보 로드
        const partnerDoc = await getDoc(doc(db, 'users', partnerUid));
        if (partnerDoc.exists()) {
            const pData = partnerDoc.data();
            const pInfo = pData.partnerInfo || {};
            setPartnerInfo({
                name: pInfo.companyName || pData.companyName || '시공사(상호미입력)',
                owner: pInfo.ownerName || pInfo.repName || pData.name || '대표',
                bizNum: pInfo.businessNumber || pData.businessNumber || pInfo.bizNum || '-',
                phone: pInfo.contact || pInfo.officePhone || pData.phone || '-',
                address: pInfo.address || pInfo.officeAddress || pData.address || '-'
            });
        }

        // 2. 전역 템플릿 및 도장 로드 (기본값)
        let globalContent = DEFAULT_CONTRACT_TEXT;
        let globalSpecial = '';
        let globalSeal = '';

        const templateRef = doc(db, 'users', partnerUid, 'config', 'contractTemplate');
        const templateSnap = await getDoc(templateRef);
        if (templateSnap.exists()) {
            const tData = templateSnap.data();
            globalContent = tData.content || DEFAULT_CONTRACT_TEXT;
            globalSpecial = tData.special || '';
            globalSeal = tData.sealUrl || '';
        }
        setPartnerSealUrl(globalSeal);

        // 3. 현장 정보 로드
        const siteDocRef = doc(db, 'users', partnerUid, 'sites', siteId);
        const siteSnap = await getDoc(siteDocRef);
        
        if (siteSnap.exists()) {
          const data = siteSnap.data();
          setCurrentSiteName(data.siteName || ''); 
          setBaseAddress(data.address || '');
          
          if (data.contract) {
             setSiteType(data.contract.siteType || 'residential');
             const c = data.contract;

             setSupplyAmount(c.supplyAmount ? Number(c.supplyAmount).toLocaleString() : '');
             setVatAmount(c.vatAmount ? Number(c.vatAmount).toLocaleString() : '');
             setStartDate(c.startDate || data.startDate || '');
             setEndDate(c.endDate || data.endDate || '');
             setAptName(c.aptName || ''); setAptDong(c.aptDong || ''); setAptHo(c.aptHo || '');
             if(c.clientName) setClientName(c.clientName);
             if(c.clientPhone) setClientPhone(c.clientPhone);
             if(c.clientAddress) setClientAddress(c.clientAddress);
             if (c.asPeriod) setAsPeriod(String(c.asPeriod));
             if (c.paymentTerms) setPaymentTerms(c.paymentTerms);
             
             // 현장별 스냅샷 우선 사용
             setContractContent(c.customContent || globalContent);
             setSpecialTerms(c.specialContent || globalSpecial);
             if (c.partnerSealUrl) setPartnerSealUrl(c.partnerSealUrl);

             // 상태 및 체결 데이터
             setContractStatus(c.status || 'draft');
             setSignedData({
                 signatureUrl: c.signatureUrl,
                 idCardUrl: c.idCardUrl,
                 clientRRN: c.clientRRN,
                 signedAt: c.signedAt
             });

          } else {
             setStartDate(data.startDate || '');
             if (data.budget) {
                 setSupplyAmount(Number(data.budget).toLocaleString());
                 setVatAmount(Math.floor(Number(data.budget) * 0.1).toLocaleString());
             }
             // 계약 정보가 없으면 전역 템플릿 사용
             setContractContent(globalContent);
             setSpecialTerms(globalSpecial);
          }
        }
        
        // 4. 도급인 초대 정보 확인
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
              setClientUid(contractorUid);
              setClientName(prev => prev || userData.name || userData.nickname || '');
              setClientPhone(prev => prev || userData.phone || '');
              setClientAddress(prev => prev || userData.address || '');
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
    
    // [수정] 타입 캐스팅을 통해 unknown 에러 방지
    if (paymentTerms) {
        const items = Object.values(paymentTerms.items) as PaymentItem[];
        const totalRate = items.reduce((sum, item) => item.checked ? sum + item.rate : sum, 0);
        if (totalRate !== 100) {
            if(!confirm(`현재 결제 비율 합계가 ${totalRate}% 입니다. 그래도 저장하시겠습니까?`)) return;
        }
    }

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
        asPeriod: parseInt(asPeriod, 10),
        paymentTerms,
        customContent: contractContent, 
        specialContent: specialTerms,   
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId), { 
          contract: contractData,
          startDate: startDate, 
          endDate: endDate,
          budget: totalVal,
      });

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

  const handleTemplateSave = async (content: string, special: string, sealUrl: string) => {
      try {
          await setDoc(doc(db, 'users', partnerUid, 'config', 'contractTemplate'), {
              content, 
              special, 
              sealUrl, 
              updatedAt: serverTimestamp()
          });
          setContractContent(content);
          setSpecialTerms(special);
          setPartnerSealUrl(sealUrl);
          setIsEditorOpen(false);
          alert("계약서 양식 및 인감이 저장되었습니다.");
      } catch (e) { console.error(e); alert("양식 저장 실패"); }
  };

  const handleRequestSign = async () => {
      if (!isClientInvited || !clientUid) return alert("도급인을 먼저 초대해주세요.");
      if (!supplyAmount) return alert("계약 정보를 먼저 저장해주세요.");
      
      if (!partnerSealUrl) {
          alert("⚠️ 시공자(파트너)의 직인/인감이 등록되지 않았습니다.\n[양식 편집] 버튼을 눌러 도장 이미지를 먼저 등록해주세요.");
          return;
      }

      if (!confirm(`도급인(${clientName})에게 전자계약 체결을 요청하시겠습니까?`)) return;

      try {
          // [핵심] 현재 계약 내용과 도장을 스냅샷으로 저장
          await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId), {
              'contract.status': 'requested',
              'contract.requestedAt': serverTimestamp(),
              'contract.customContent': contractContent,
              'contract.specialContent': specialTerms,
              'contract.partnerSealUrl': partnerSealUrl 
          });

          await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
            text: `[전자계약] 도급인(${clientName})에게 계약 체결을 요청했습니다.`,
            createdAt: serverTimestamp(),
            type: 'contract_request',
            relatedId: siteId
          });

          setContractStatus('requested');
          alert("전자계약 체결 요청이 완료되었습니다.");
      } catch (e) { console.error(e); alert("요청 중 오류가 발생했습니다."); }
  };

  // [NEW] 계약서 재작성 요청 (파트너용)
  const handlePartnerRequestRewrite = async () => {
      if (!confirm("고객에게 계약서 재작성을 요청하시겠습니까?\n고객이 수락하면 현재 계약은 파기되고 수정 가능한 상태로 돌아갑니다.")) return;

      try {
          await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId), {
              'contract.rewriteStatus': 'requested',
              'contract.rewriteRequestedAt': serverTimestamp()
          });

          await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
              text: `[계약] 파트너가 계약서 재작성을 요청했습니다.`,
              createdAt: serverTimestamp(),
              type: 'contract_rewrite_request',
              relatedId: siteId
          });

          alert("재작성 요청을 보냈습니다.\n고객이 수락하면 계약서를 다시 작성할 수 있습니다.");
          setIsSignedViewerOpen(false); // 뷰어 닫기
      } catch (e) {
          console.error(e);
          alert("요청 중 오류가 발생했습니다.");
      }
  };

  const handlePaymentTerms = () => {
      if (!supplyAmount) return alert("먼저 공급가액을 입력해주세요.");
      setIsPaymentModalOpen(true);
  };
  const handleEditForm = () => setIsEditorOpen(true);
  const handlePreview = () => {
      if (!supplyAmount) return alert("공급가액을 입력해야 미리보기가 가능합니다.");
      setIsPreviewOpen(true);
  };

  // 상태별 버튼 렌더링
  const renderContractButton = () => {
      if (contractStatus === 'signed') {
          return (
              <button 
                  className="top-btn completed" 
                  onClick={() => setIsSignedViewerOpen(true)}
                  style={{backgroundColor: '#e8f5e9', color: '#2e7d32', borderColor: '#2e7d32', fontWeight:'bold'}}
              >
                  ✅ 계약 완료 (보기)
              </button>
          );
      } else if (contractStatus === 'requested') {
          return (
              <button 
                  className="top-btn disabled" 
                  disabled
                  style={{backgroundColor: '#f5f5f5', color: '#999', borderColor: '#ddd', cursor: 'not-allowed'}}
              >
                  ⏳ 서명 대기중
              </button>
          );
      } else {
          return (
              <button 
                  className="top-btn" 
                  onClick={handleRequestSign} 
                  style={{color:'#d32f2f', borderColor:'#d32f2f', fontWeight:'bold'}}
              >
                  ✍️ 전자계약 체결 요청
              </button>
          );
      }
  };

  return (
    <div className="contract-info-scope">
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="modal-header">
            <h2>계약 정보 등록</h2>
            <div className="header-actions">
                <button className="top-btn" onClick={handlePaymentTerms}>💰 공사대금 결제 방식</button>
                <button className="top-btn" onClick={handleEditForm}>📝 양식 편집</button>
                <button className="top-btn" onClick={handlePreview}>👀 미리보기</button>
                {renderContractButton()}
                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
          </div>

          <form className="contract-form" onSubmit={handleSubmit}>
            <div className="control-box">
              <div className="box-title">현장 기본 정보</div>
              <div className="form-row">
                <label>현장 구분 <span className="req">*</span></label>
                <div className="radio-group">
                  <label className="radio-label"><input type="radio" name="siteType" value="apartment" checked={siteType === 'apartment'} onChange={() => setSiteType('apartment')} /> <span>아파트</span></label>
                  <label className="radio-label"><input type="radio" name="siteType" value="residential" checked={siteType === 'residential'} onChange={() => setSiteType('residential')} /> <span>주거(일반)</span></label>
                  <label className="radio-label"><input type="radio" name="siteType" value="commercial" checked={siteType === 'commercial'} onChange={() => setSiteType('commercial')} /> <span>상업공간</span></label>
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
              <div className="form-row">
                  <label>A/S 기간</label>
                  <select className="input-modern" value={asPeriod} onChange={e => setAsPeriod(e.target.value)}>
                      <option value="0">유상 A/S (무상 없음)</option>
                      {Array.from({length: 60}, (_, i) => i + 1).map(m => (
                          <option key={m} value={m}>{m}개월 {m===12?'(1년)': m===24?'(2년)':''}</option>
                      ))}
                  </select>
              </div>
              {paymentTerms && (
                  <div className="payment-summary">
                      <label>결제 조건:</label>
                      <div className="term-tags">
                          {(Object.values(paymentTerms.items) as PaymentItem[]).filter(i => i.checked).map((item, idx) => (
                              <span key={idx} className="term-tag">
                                  {item.label} {item.rate}% ({item.date})
                              </span>
                          ))}
                      </div>
                  </div>
              )}
            </div>

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

            <div className="cim-footer-actions">
              <button type="button" className="cim-btn-cancel" onClick={onClose}>취소</button>
              <button type="submit" className="cim-btn-register" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '계약 정보 저장'}</button>
            </div>
          </form>
        </div>
      </div>

      {isPaymentModalOpen && (
          <PaymentTermsModal 
            totalSupply={parseInt(supplyAmount.replace(/,/g, '') || '0', 10)}
            initialData={paymentTerms}
            onSave={(data: PaymentTermData) => { setPaymentTerms(data); setIsPaymentModalOpen(false); }}
            onClose={() => setIsPaymentModalOpen(false)}
          />
      )}
      {isEditorOpen && (
          <ContractEditorModal
            initialContent={contractContent}
            initialSpecial={specialTerms}
            initialSealUrl={partnerSealUrl}
            onSave={handleTemplateSave}
            onClose={() => setIsEditorOpen(false)}
          />
      )}
      {isPreviewOpen && (
          <ContractPreviewModal 
            data={{
                siteName: currentSiteName, 
                address: baseAddress,
                clientName, clientPhone, clientAddress, 
                partnerName: partnerInfo.name, partnerOwner: partnerInfo.owner, partnerBizNum: partnerInfo.bizNum, partnerPhone: partnerInfo.phone, partnerAddress: partnerInfo.address, 
                startDate, endDate,
                supplyAmount: parseInt(supplyAmount.replace(/,/g, '') || '0', 10),
                vatAmount: parseInt(vatAmount.replace(/,/g, '') || '0', 10),
                totalAmount: parseInt(supplyAmount.replace(/,/g, '') || '0', 10) + parseInt(vatAmount.replace(/,/g, '') || '0', 10),
                asPeriod: parseInt(asPeriod, 10),
                paymentTerms,
                customContent: contractContent,
                specialContent: specialTerms,
                partnerSealUrl: partnerSealUrl
            }}
            onClose={() => setIsPreviewOpen(false)}
          />
      )}
      {isSignedViewerOpen && (
          <SignedContractViewerModal
              data={{
                  siteName: currentSiteName, 
                  address: baseAddress,
                  clientName, clientPhone, clientAddress, 
                  partnerName: partnerInfo.name, partnerOwner: partnerInfo.owner, partnerBizNum: partnerInfo.bizNum, partnerPhone: partnerInfo.phone, partnerAddress: partnerInfo.address, 
                  startDate, endDate,
                  supplyAmount: parseInt(supplyAmount.replace(/,/g, '') || '0', 10),
                  vatAmount: parseInt(vatAmount.replace(/,/g, '') || '0', 10),
                  totalAmount: parseInt(supplyAmount.replace(/,/g, '') || '0', 10) + parseInt(vatAmount.replace(/,/g, '') || '0', 10),
                  asPeriod: parseInt(asPeriod, 10),
                  paymentTerms,
                  customContent: contractContent,
                  specialContent: specialTerms,
                  signatureUrl: signedData.signatureUrl,
                  clientRRN: signedData.clientRRN,
                  idCardUrl: signedData.idCardUrl,
                  signedAt: signedData.signedAt,
                  partnerSealUrl: partnerSealUrl
              }}
              onClose={() => setIsSignedViewerOpen(false)}
              // [NEW] 재작성 요청 함수 전달
              onRequestRewrite={handlePartnerRequestRewrite}
          />
      )}
    </div>
  );
};

export default ContractInfoModal;