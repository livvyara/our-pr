import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getFirestore, collection, query, where, getDocs, doc, getDoc, orderBy, updateDoc 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import { onAuthStateChanged } from 'firebase/auth';

// 유틸 & 컴포넌트
import { sendSystemMessage } from '../../utils/chatService';
import ChatWidget from '../../components/common/ChatWidget';

// 모달
import CustomerConstructionScheduleModal from '../../components/customer/CustomerConstructionScheduleModal';
import SiteWorkLogListModal from '../../components/customer/SiteWorkLogListModal';
import CustomerSiteFilesModal from '../../components/customer/CustomerSiteFilesModal';
import CustomerChangeOrderModal from '../../components/customer/CustomerChangeOrderModal'; 
import ElectronicContractSignModal from '../../components/customer/ElectronicContractSignModal'; 
import SignedContractViewerModal from '../../components/customer/SignedContractViewerModal';

import './MyProjectPage.css'; 

const db = getFirestore();

// --- [High-End SVG Icons] ---
// Stroke width와 Linecap을 통일하여 아이콘의 시각적 일관성 확보
const Icons = {
  Schedule: () => <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
  Worklog: () => <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  Files: () => <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>,
  Cost: () => <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>,
  Estimate: () => <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17h6"/><path d="M9 13h6"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Contract: () => <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 15.5L14 18l-2.5-2.5"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>,
  Insurance: () => <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
  ArrowDown: () => <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  Chat: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
};

// Types
interface MySiteData {
  inviteId: string;
  siteId: string;
  partnerUid: string;
  siteName: string;
  status: string;
  address: string;
  startDate: string;
  endDate?: string;
  partnerName?: string;
  partnerPhone?: string;
  partnerEmail?: string;
  budget?: number;
  area?: string;
  siteType?: string;
  contractSupply?: number;
  contractVat?: number;
  changeOrderTotal?: number;
  contractStatus?: string; 
  contractRewriteStatus?: string; 
  fullContractData?: any;
}

const MyProjectPage: React.FC = () => {
  const navigate = useNavigate();
  
  // State
  const [mySites, setMySites] = useState<MySiteData[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPageLoaded, setIsPageLoaded] = useState(false);

  // Modal State
  const [modalState, setModalState] = useState<{
      type: 'schedule' | 'worklog' | 'files' | 'estimate' | 'contract' | 'view_contract' | 'insurance' | 'changeOrder' | null;
      siteId: string;
      partnerUid: string;
      contractData?: any; 
  } | null>(null);

  // --- Initialize ---
  useEffect(() => {
    // 애니메이션 트리거
    requestAnimationFrame(() => setIsPageLoaded(true));
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) await fetchMyProjects(user.uid);
      else setLoadingData(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  // --- Data Fetching ---
  const fetchMyProjects = async (uid: string) => {
      try {
      const q = query(collection(db, 'siteInvitations'), where('redeemedBy', '==', uid), where('status', '==', 'redeemed'), orderBy('redeemedAt', 'desc'));
      const snapshot = await getDocs(q);
      const sites: MySiteData[] = [];

      for (const d of snapshot.docs) {
        const inv = d.data();
        const { siteId, partnerUid } = inv;

        const [siteSnap, partnerSnap] = await Promise.all([
            getDoc(doc(db, 'users', partnerUid, 'sites', siteId)),
            getDoc(doc(db, 'users', partnerUid))
        ]);

        if (siteSnap.exists()) {
          const sData = siteSnap.data();
          const pData = partnerSnap.exists() ? partnerSnap.data() : {};
          const pInfo = pData.partnerInfo || {};
          const contract = sData.contract || {};
          const partnerAddress = `${pInfo.city || ''} ${pInfo.district || ''} ${pInfo.addressDetail || ''}`.trim() || pInfo.address || '';

          // 변경 견적 합산
          let changeTotal = 0;
          try {
              const coSnap = await getDocs(query(collection(db, 'users', partnerUid, 'sites', siteId, 'changeOrders'), where('status', '==', 'approved')));
              coSnap.forEach(co => { changeTotal += Number(co.data().totalAmount || 0); });
          } catch (e) { console.error("CO Fetch Error", e); }

          // 전체 계약 데이터 구성
          const fullContractData = {
              siteName: sData.siteName, address: sData.address,
              clientName: contract.clientName || '', clientPhone: contract.clientPhone || '', clientAddress: contract.clientAddress || '',
              partnerName: pInfo.companyName || pData.companyName || '시공사',
              partnerOwner: pInfo.ownerName || pData.name || '대표',
              partnerBizNum: pInfo.businessNumber || pData.businessNumber || '',
              partnerPhone: pInfo.contact || pData.phone || '',
              partnerAddress: partnerAddress,
              startDate: contract.startDate || sData.startDate, endDate: contract.endDate || sData.endDate,
              supplyAmount: contract.supplyAmount || 0, vatAmount: contract.vatAmount || 0, totalAmount: contract.totalAmount || 0,
              asPeriod: contract.asPeriod || 12, paymentTerms: contract.paymentTerms || null,
              customContent: contract.customContent || '', specialContent: contract.specialContent || '',
              signatureUrl: contract.signatureUrl || '', clientRRN: contract.clientRRN || '',
              idCardUrl: contract.idCardUrl || '', signedAt: contract.signedAt || null, partnerSealUrl: contract.partnerSealUrl || '' 
          };

          sites.push({
            inviteId: d.id, siteId, partnerUid,
            siteName: sData.siteName, status: sData.status || '진행중',
            address: sData.address || '', startDate: sData.startDate || '', endDate: sData.endDate || '',
            budget: sData.budget, area: sData.area, siteType: sData.siteType,
            partnerName: pInfo.companyName || pData.companyName || '파트너사',
            partnerPhone: pInfo.contact || pData.phone || '-', partnerEmail: pData.email || '-',
            contractSupply: contract.supplyAmount, contractVat: contract.vatAmount, changeOrderTotal: changeTotal,
            contractStatus: contract.status || 'draft', contractRewriteStatus: contract.rewriteStatus || null,
            fullContractData
          });
        }
      }
      setMySites(sites);
    } catch (e) { console.error(e); } finally { setLoadingData(false); }
  };

  // --- Handlers ---
  const toggleExpand = (id: string) => setExpandedSiteId(prev => (prev === id ? null : id));
  
  // 계약 상태에 따른 UI 속성 반환 (God-tier Logic Abstraction)
  const getContractStatusProps = (site: MySiteData) => {
    if (site.contractRewriteStatus === 'requested') {
        return { label: '수정 요청됨', className: 'status-danger', iconClass: 'icon-danger', action: 'rewrite' };
    }
    if (site.contractStatus === 'signed') {
        return { label: '계약 체결 완료', className: 'status-success', iconClass: 'icon-success', action: 'view' };
    }
    if (site.contractStatus === 'requested') {
        return { label: '서명 필요', className: 'status-warn', iconClass: 'icon-warn', action: 'sign' };
    }
    return { label: '전자계약서', className: 'status-neutral', iconClass: '', action: 'none', disabled: true };
  };

  const handleContractAction = (site: MySiteData) => {
      const { action } = getContractStatusProps(site);
      if (action === 'rewrite') handleRewriteResponse(site);
      else if (action === 'view') setModalState({ type: 'view_contract', siteId: site.siteId, partnerUid: site.partnerUid, contractData: site.fullContractData });
      else if (action === 'sign') setModalState({ type: 'contract', siteId: site.siteId, partnerUid: site.partnerUid, contractData: site.fullContractData });
      else alert("파트너사가 아직 전자계약 체결을 요청하지 않았습니다.");
  };

  const handleRewriteResponse = async (site: MySiteData) => {
      if (!confirm("파트너가 계약서 재작성을 요청했습니다.\n\n[확인] 수락 (기존 계약 파기 후 재작성)\n[취소] 거절 (기존 계약 유지)")) {
          await updateDoc(doc(db, 'users', site.partnerUid, 'sites', site.siteId), { 'contract.rewriteStatus': 'rejected' });
          await sendSystemMessage(site.siteId, "고객님이 전자계약서 재작성을 거절하셨습니다.");
          alert("재작성 요청을 거절했습니다.");
          return;
      }
      try {
          await updateDoc(doc(db, 'users', site.partnerUid, 'sites', site.siteId), {
              'contract.status': 'draft', 'contract.rewriteStatus': 'accepted', 'contract.signatureUrl': null,
              'contract.idCardUrl': null, 'contract.clientRRN': null, 'contract.pdfUrl': null, 'contract.signedAt': null
          });
          await sendSystemMessage(site.siteId, "고객님이 전자계약서 재작성을 수락하셨습니다.");
          alert("재작성 요청을 수락했습니다.");
          if (auth.currentUser) fetchMyProjects(auth.currentUser.uid);
      } catch (e) { console.error(e); alert("처리 중 오류가 발생했습니다."); }
  };

  const openModal = (type: any, site: MySiteData) => {
      if (type === 'estimate' || type === 'insurance') return alert("준비 중인 기능입니다.");
      setModalState({ type, siteId: site.siteId, partnerUid: site.partnerUid });
  };

  return (
    <div className="mp-page">
      <div className="mp-container">
        {/* Header Section */}
        <header className="mp-header">
            <div className={`mp-title-wrap ${isPageLoaded ? 'in-view' : ''}`}>
                <h2 className="mp-title">MY LOUNGE</h2>
                <div className="mp-title-underline"></div>
            </div>
            <p className={`mp-subtitle ${isPageLoaded ? 'in-view' : ''}`}>
                진행 중인 프로젝트 현황을 실시간으로 확인하세요.
            </p>
        </header>

        {loadingData ? (
            <div className="mp-skeleton-loader">
                <div className="skeleton-card"></div><div className="skeleton-card"></div>
            </div>
        ) : (
            <div className="mp-list">
                {mySites.length === 0 ? (
                    <div className="mp-empty">
                        <p>진행 중인 프로젝트가 없습니다.</p>
                        <span>초대받은 링크를 통해 프로젝트를 시작해보세요.</span>
                    </div>
                ) : (
                    mySites.map((site, idx) => {
                        const isExpanded = expandedSiteId === site.siteId;
                        const changeAmt = site.changeOrderTotal || 0;
                        const contractProps = getContractStatusProps(site);
                        
                        return (
                            <article 
                                key={site.siteId} 
                                className={`mp-card ${isExpanded ? 'expanded' : ''}`}
                                style={{ animationDelay: `${idx * 100}ms` }}
                            >
                                {/* Card Header (Always Visible) */}
                                <div className="mp-card-head" onClick={() => toggleExpand(site.siteId)}>
                                    <div className="mp-head-info">
                                        <span className={`mp-badge ${site.status === 'completed' ? 'done' : 'ongoing'}`}>
                                            {site.status === 'completed' ? '완료' : '진행중'}
                                        </span>
                                        <h3 className="mp-site-title">{site.siteName}</h3>
                                        <p className="mp-site-addr">{site.address}</p>
                                    </div>
                                    <button className={`mp-toggle-btn ${isExpanded ? 'rotated' : ''}`} aria-label="Toggle Detail">
                                        <Icons.ArrowDown />
                                    </button>
                                </div>

                                {/* Card Body (Expandable) */}
                                <div className="mp-card-body">
                                    <div className="mp-body-content">
                                        
                                        {/* Info Grid */}
                                        <div className="mp-info-section">
                                            <div className="mp-info-group">
                                                <label>PROJECT INFO</label>
                                                <div className="mp-row"><span>공사유형</span><strong>{site.siteType === 'commercial' ? '상업공간' : '주거공간'}</strong></div>
                                                <div className="mp-row"><span>면적</span><strong>{site.area || '-'}</strong></div>
                                                <div className="mp-row"><span>기간</span><strong>{site.startDate} ~ {site.endDate || '미정'}</strong></div>
                                            </div>

                                            <div className="mp-info-group">
                                                <label>COST ESTIMATION</label>
                                                <div className="mp-row"><span>최초계약</span><strong>{(site.budget || 0).toLocaleString()} 원</strong></div>
                                                {changeAmt !== 0 && (
                                                    <div className="mp-row highlight">
                                                        <span>변경/추가</span><strong>{changeAmt > 0 ? '+' : ''}{changeAmt.toLocaleString()} 원</strong>
                                                    </div>
                                                )}
                                                <div className="mp-row total">
                                                    <span>예상 총액</span>
                                                    <strong>{((site.budget || 0) + changeAmt).toLocaleString()} 원</strong>
                                                </div>
                                            </div>

                                            <div className="mp-info-group partner">
                                                <label>PARTNER</label>
                                                <strong className="partner-name">{site.partnerName}</strong>
                                                <button className="mp-chat-btn" onClick={() => setIsChatOpen(true)}>
                                                    <Icons.Chat /> 1:1 문의
                                                </button>
                                            </div>
                                        </div>

                                        {/* Actions Grid (Dashboard Style) */}
                                        <div className="mp-actions-section">
                                            <label>QUICK ACTIONS</label>
                                            <div className="mp-action-grid">
                                                <button className="mp-action-item" onClick={() => openModal('schedule', site)}>
                                                    <div className="icon-wrapper"><Icons.Schedule /></div>
                                                    <span>공사 일정</span>
                                                </button>
                                                <button className="mp-action-item" onClick={() => openModal('worklog', site)}>
                                                    <div className="icon-wrapper"><Icons.Worklog /></div>
                                                    <span>작업 일지</span>
                                                </button>
                                                <button className="mp-action-item" onClick={() => openModal('files', site)}>
                                                    <div className="icon-wrapper"><Icons.Files /></div>
                                                    <span>공사 자료</span>
                                                </button>
                                                <button className="mp-action-item" onClick={() => openModal('changeOrder', site)}>
                                                    <div className="icon-wrapper"><Icons.Cost /></div>
                                                    <span>변경 견적</span>
                                                </button>
                                                
                                                {/* Contract Button (Dynamic Style) */}
                                                <button 
                                                    className={`mp-action-item ${contractProps.disabled ? 'disabled' : ''} ${contractProps.className}`}
                                                    onClick={() => handleContractAction(site)}
                                                >
                                                    <div className={`icon-wrapper ${contractProps.iconClass}`}>
                                                        <Icons.Contract />
                                                    </div>
                                                    <span>{contractProps.label}</span>
                                                </button>

                                                <button className="mp-action-item disabled">
                                                    <div className="icon-wrapper"><Icons.Estimate /></div>
                                                    <span>견적서</span>
                                                </button>
                                                <button className="mp-action-item disabled">
                                                    <div className="icon-wrapper"><Icons.Insurance /></div>
                                                    <span>보험 가입</span>
                                                </button>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            </article>
                        );
                    })
                )}
            </div>
        )}

        {/* Modals & Widgets */}
        {isChatOpen && <ChatWidget onClose={() => setIsChatOpen(false)} />}
        {modalState?.type === 'schedule' && <CustomerConstructionScheduleModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
        {modalState?.type === 'changeOrder' && <CustomerChangeOrderModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
        {modalState?.type === 'worklog' && <SiteWorkLogListModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
        {modalState?.type === 'files' && <CustomerSiteFilesModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} onClose={() => setModalState(null)} />}
        {modalState?.type === 'contract' && modalState.contractData && (
            <ElectronicContractSignModal siteId={modalState.siteId} partnerUid={modalState.partnerUid} data={modalState.contractData} onClose={() => setModalState(null)} onSignedSuccess={() => { setModalState(null); if(auth.currentUser) fetchMyProjects(auth.currentUser.uid); }} />
        )}
        {modalState?.type === 'view_contract' && modalState.contractData && (
            <SignedContractViewerModal data={modalState.contractData} onClose={() => setModalState(null)} />
        )}
      </div>
    </div>
  );
};

export default MyProjectPage;