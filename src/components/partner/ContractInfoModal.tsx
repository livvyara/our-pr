import React, { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { 
  getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, limit, orderBy, serverTimestamp, addDoc, setDoc 
} from 'firebase/firestore';
import './a_partnerprogrammodal.css'; // [확인] 공용 디자인 시스템 연결

import PaymentTermsModal, { type PaymentTermData, type PaymentItem } from './PaymentTermsModal'; 
import ContractEditorModal, { DEFAULT_CONTRACT_TEXT } from './ContractEditorModal';
import ContractPreviewModal from './ContractPreviewModal';
import SignedContractViewerModal from '../customer/SignedContractViewerModal';
import { sendSystemMessage } from '../../utils/chatService';

// --- [High-End Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Home: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  User: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  FileText: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>,
  CreditCard: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>,
  Edit: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
  Eye: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  PenTool: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>,
  CheckCircle: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Clock: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
};

interface ContractInfoModalProps {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

type SiteType = 'apartment' | 'residential' | 'commercial';

interface PartnerInfoData {
    name: string; owner: string; bizNum: string; phone: string; address: string;
}

const ContractInfoModal: React.FC<ContractInfoModalProps> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSignedViewerOpen, setIsSignedViewerOpen] = useState(false);

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
  
  const [contractContent, setContractContent] = useState('');
  const [specialTerms, setSpecialTerms] = useState('');
  const [partnerSealUrl, setPartnerSealUrl] = useState('');

  const [partnerInfo, setPartnerInfo] = useState<PartnerInfoData>({ name: '', owner: '', bizNum: '', phone: '', address: '' });
  const [currentSiteName, setCurrentSiteName] = useState('');

  const [contractStatus, setContractStatus] = useState<string>(''); 
  const [signedData, setSignedData] = useState<{
      signatureUrl?: string; idCardUrl?: string; clientRRN?: string; signedAt?: any;
  }>({});

  useEffect(() => {
    // ... (기존 데이터 Fetch 로직 유지) ...
    const fetchData = async () => {
        if (!siteId) return;
        try {
          const partnerDoc = await getDoc(doc(db, 'users', partnerUid));
          if (partnerDoc.exists()) {
              const pData = partnerDoc.data();
              const pInfo = pData.partnerInfo || {};
              const combinedAddress = `${pInfo.city || ''} ${pInfo.district || ''} ${pInfo.addressDetail || ''}`.trim();
              setPartnerInfo({
                  name: pInfo.companyName || pData.companyName || '시공사(상호미입력)',
                  owner: pInfo.ownerName || pInfo.repName || pData.name || '대표',
                  bizNum: pInfo.businessNumber || pData.businessNumber || pInfo.bizNum || '-',
                  phone: pInfo.contact || pInfo.officePhone || pData.phone || '-',
                  address: combinedAddress || pInfo.address || pData.address || '-'
              });
          }
  
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
               
               setContractContent(c.customContent || globalContent);
               setSpecialTerms(c.specialContent || globalSpecial);
               if (c.partnerSealUrl) setPartnerSealUrl(c.partnerSealUrl);
  
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
               setContractContent(globalContent);
               setSpecialTerms(globalSpecial);
            }
          }
          
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
              content, special, sealUrl, updatedAt: serverTimestamp()
          });
          setContractContent(content);
          setSpecialTerms(special);
          setPartnerSealUrl(sealUrl);
          setIsEditorOpen(false);
          alert("계약서 양식 및 인감이 저장되었습니다.");
      } catch (e) { console.error(e); alert("양식 저장 실패"); }
  };

  const handlePreview = () => {
    if (!supplyAmount) return alert("공급가액을 입력해야 미리보기가 가능합니다.");
    setIsPreviewOpen(true);
  };

  const handleRequestSign = async () => {
      if (!isClientInvited || !clientUid) return alert("도급인을 먼저 초대해주세요.");
      if (!supplyAmount) return alert("계약 정보를 먼저 저장해주세요.");
      if (!partnerSealUrl) return alert("시공자(파트너)의 직인/인감이 등록되지 않았습니다.\n[양식 편집] 버튼을 눌러 등록해주세요.");
      if (!confirm(`도급인(${clientName})에게 전자계약 체결을 요청하시겠습니까?`)) return;

      try {
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

          await sendSystemMessage(siteId, "파트너가 전자계약서 작성을 고객님께 요청했습니다.");
          setContractStatus('requested');
          alert("전자계약 체결 요청이 완료되었습니다.");
      } catch (e) { console.error(e); alert("요청 중 오류가 발생했습니다."); }
  };

  const handlePartnerRequestRewrite = async () => {
      if (!confirm("고객에게 계약서 재작성을 요청하시겠습니까?\n고객이 수락하면 현재 계약은 파기됩니다.")) return;
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
          await sendSystemMessage(siteId, "파트너가 전자 계약서 재작성을 요청했습니다.");
          alert("재작성 요청을 보냈습니다.\n고객이 수락하면 다시 작성할 수 있습니다.");
          setIsSignedViewerOpen(false); 
      } catch (e) { console.error(e); alert("오류가 발생했습니다."); }
  };

  const renderContractButton = () => {
      if (contractStatus === 'signed') {
          return (
              <button className="ppm-btn-success" onClick={() => setIsSignedViewerOpen(true)} style={{height:'40px', padding:'0 16px', borderRadius:'8px', fontSize:'13px'}}>
                  <Icons.CheckCircle /> 계약 완료 (보기)
              </button>
          );
      } else if (contractStatus === 'requested') {
          return (
              <button className="ppm-btn-disabled" disabled style={{height:'40px', padding:'0 16px', borderRadius:'8px', fontSize:'13px'}}>
                  <Icons.Clock /> 서명 대기중
              </button>
          );
      } else {
          return (
              <button className="ppm-btn-action" onClick={handleRequestSign}>
                  <Icons.PenTool /> 전자계약 체결 요청
              </button>
          );
      }
  };

  return (
    <div className="ppm-overlay">
      <div className="ppm-container" style={{maxWidth:'800px'}}>
        
        {/* Header */}
        <div className="ppm-header">
          <div className="ppm-title">
            <h3>계약 정보 등록</h3>
            <span className="ppm-badge">현장별 계약 내용 및 공사 정보를 관리합니다.</span>
          </div>
          <button className="ppm-close-btn" onClick={onClose} aria-label="닫기">
            <Icons.Close />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="ppm-toolbar">
            <div className="ppm-toolbar-group">
                <button type="button" className="ppm-tool-btn" onClick={() => setIsPaymentModalOpen(true)}>
                    <Icons.CreditCard /> 결제 방식 설정
                </button>
                <button type="button" className="ppm-tool-btn" onClick={() => setIsEditorOpen(true)}>
                    <Icons.Edit /> 양식 편집
                </button>
                <button type="button" className="ppm-tool-btn" onClick={handlePreview}>
                    <Icons.Eye /> 미리보기
                </button>
            </div>
            <div className="ppm-toolbar-action">
                {renderContractButton()}
            </div>
        </div>

        {/* Content Scroll Area */}
        <form className="ppm-body" onSubmit={handleSubmit}>
          
          {/* Section 1: Site Info */}
          <div className="ppm-section">
            <div className="ppm-section-header">
                <span className="ppm-section-icon"><Icons.Home /></span>
                <h3 className="ppm-section-title">현장 기본 정보</h3>
            </div>
            
            <div className="ppm-grid-row">
                <div className="ppm-col full-width">
                    <label className="ppm-label">현장 구분 <span className="ppm-req">*</span></label>
                    <div className="ppm-radio-cards">
                        {[
                            { val: 'apartment', label: '아파트' },
                            { val: 'residential', label: '주거(일반)' },
                            { val: 'commercial', label: '상업공간' }
                        ].map((opt) => (
                            <label key={opt.val} className={`ppm-radio-card ${siteType === opt.val ? 'selected' : ''}`}>
                                <input type="radio" name="siteType" value={opt.val} checked={siteType === opt.val} onChange={() => setSiteType(opt.val as SiteType)} hidden />
                                <span className="ppm-radio-text">{opt.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="ppm-col full-width">
                    <label className="ppm-label">현장 주소 <span className="ppm-req">*</span></label>
                    <input type="text" value={baseAddress} onChange={e => setBaseAddress(e.target.value)} placeholder="기본 주소를 입력하세요" className="ppm-input" required />
                    
                    {siteType === 'apartment' && (
                        <div className="ppm-input-group-row">
                            <input type="text" className="ppm-input" placeholder="아파트 명" value={aptName} onChange={e => setAptName(e.target.value)} />
                            <input type="text" className="ppm-input" placeholder="동" value={aptDong} onChange={e => setAptDong(e.target.value)} />
                            <input type="text" className="ppm-input" placeholder="호수" value={aptHo} onChange={e => setAptHo(e.target.value)} />
                        </div>
                    )}
                </div>
            </div>
          </div>

          {/* Section 2: Contract Details */}
          <div className="ppm-section">
            <div className="ppm-section-header">
                <span className="ppm-section-icon"><Icons.FileText /></span>
                <h3 className="ppm-section-title">계약 및 공사 상세</h3>
            </div>

            <div className="ppm-grid-row">
                <div className="ppm-col">
                    <label className="ppm-label">공급가액 <span className="ppm-req">*</span></label>
                    <div className="ppm-input-wrapper">
                        <input type="text" value={supplyAmount} onChange={handleAmountChange} placeholder="0" className="ppm-input text-right" required />
                        <span className="ppm-input-unit">원</span>
                    </div>
                </div>
                <div className="ppm-col">
                    <label className="ppm-label">부가세 (10%)</label>
                    <div className="ppm-input-wrapper">
                        <input type="text" value={vatAmount} readOnly className="ppm-input text-right ppm-readonly" />
                        <span className="ppm-input-unit">원</span>
                    </div>
                </div>
            </div>

            <div className="ppm-grid-row">
                <div className="ppm-col">
                    <label className="ppm-label">공사 시작일</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="ppm-input" required />
                </div>
                <div className="ppm-col">
                    <label className="ppm-label">공사 종료일</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="ppm-input" required />
                </div>
            </div>

            <div className="ppm-grid-row">
                <div className="ppm-col full-width">
                    <label className="ppm-label">A/S 기간 설정</label>
                    <div className="ppm-select-wrapper">
                        <select className="ppm-select" value={asPeriod} onChange={e => setAsPeriod(e.target.value)}>
                            <option value="0">유상 A/S (무상 없음)</option>
                            {Array.from({length: 36}, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{m}개월 {m===12?'(1년)': m===24?'(2년)':''}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
                
            {paymentTerms && (
                <div className="ppm-col full-width">
                    <div className="ppm-payment-summary">
                        <span className="ppm-summary-label">결제 조건:</span>
                        <div className="ppm-tags">
                            {(Object.values(paymentTerms.items) as PaymentItem[]).filter(i => i.checked).map((item, idx) => (
                                <span key={idx} className="ppm-tag">
                                    {item.label} <strong style={{color:'#166534'}}>{item.rate}%</strong> <span style={{color:'#666', fontSize:'11px'}}>({item.date})</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
          </div>

          {/* Section 3: Client Info */}
          <div className="ppm-section">
            <div className="ppm-section-header">
                <span className="ppm-section-icon"><Icons.User /></span>
                <div className="ppm-title-row">
                    <h3 className="ppm-section-title">발주자(도급인) 정보</h3>
                    {isClientInvited && <span className="ppm-badge-connected">앱 연동됨</span>}
                </div>
            </div>

            <div className="ppm-grid-row">
                <div className="ppm-col">
                    <label className="ppm-label">성명 (상호) <span className="ppm-req">*</span></label>
                    <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="이름 입력" className="ppm-input" required />
                </div>
                <div className="ppm-col">
                    <label className="ppm-label">연락처 <span className="ppm-req">*</span></label>
                    <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="010-0000-0000" className="ppm-input" required />
                </div>
            </div>
            <div className="ppm-grid-row">
                <div className="ppm-col full-width">
                    <label className="ppm-label">주소</label>
                    <input type="text" value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="주소를 입력하세요" className="ppm-input" />
                </div>
            </div>
          </div>

        {/* Footer Actions */}
        <div className="ppm-footer" style={{display:'flex', justifyContent:'flex-end', gap:'10px'}}>
            <button type="button" className="ppm-btn-secondary" onClick={onClose} style={{width:'auto', padding:'0 24px'}}>취소</button>
            <button type="submit" className="ppm-btn-primary" disabled={isSubmitting} onClick={handleSubmit} style={{width:'auto', padding:'0 32px'}}>
                {isSubmitting ? '저장 중...' : '계약 정보 저장'}
            </button>
        </div>

        </form>
      </div>

      {/* Other Modals */}
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
              onRequestRewrite={handlePartnerRequestRewrite}
          />
      )}
    </div>
  );
};

export default ContractInfoModal;