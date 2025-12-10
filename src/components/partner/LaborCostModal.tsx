import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, query, where, getDoc, setDoc } from 'firebase/firestore';
import './a_partnerprogrammodal.css'; // [변경] 공용 디자인 시스템 Import

// --- [Premium Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  User: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Home: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Filter: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  Check: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>,
  Calendar: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
};

interface LaborData {
  id?: string; 
  workerId: string; workerName: string; workerType: 'agency' | 'freelance'; 
  companyName: string; siteId: string; siteName: string; 
  paymentMonth: string; workedDays: number[]; totalDays: number;
  unitPrice: number; preTaxAmount: number; deductionAmount: number; finalAmount: number;
  paymentCycle: string[]; isTaxExempt: boolean; 
  bankName?: string; accountNumber?: string; residentNumber?: string; 
}

interface Props {
  isOpen: boolean; onClose: () => void; partnerUid: string; targetLabor: LaborData | null; 
  currentMonth: string; onRefresh: () => void; userName?: string; 
  defaultSiteId?: string; defaultSiteName?: string;
}

interface TaxConfig {
    freelance: number; 
    agency: { dailyDeduction: number; incomeTaxRate: number; localTaxRate: number; eiRate: number; };
}

const ALL_SITE_STATUSES = ['미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소'];

const LaborCostModal: React.FC<Props> = ({ 
    isOpen, onClose, partnerUid, targetLabor, currentMonth, onRefresh, userName,
    defaultSiteId, defaultSiteName 
}) => {
  const db = getFirestore();
  
  // Data States
  const [workers, setWorkers] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  
  // Form States
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  
  const [workerSearchQuery, setWorkerSearchQuery] = useState('');
  const [isWorkerListVisible, setIsWorkerListVisible] = useState(false);

  const [paymentMonth, setPaymentMonth] = useState(currentMonth);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [preTaxAmount, setPreTaxAmount] = useState<number>(0);
  const [isTaxExempt, setIsTaxExempt] = useState(false);
  
  const [pay15, setPay15] = useState(false);
  const [payEnd, setPayEnd] = useState(false);
  
  const [calcResult, setCalcResult] = useState({ incomeTax: 0, localTax: 0, ei: 0, totalDeduction: 0, final: 0 });
  const [taxConfig, setTaxConfig] = useState<TaxConfig>({ freelance: 3.3, agency: { dailyDeduction: 150000, incomeTaxRate: 2.7, localTaxRate: 10, eiRate: 0.9 } });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [siteStatusFilter, setSiteStatusFilter] = useState<string[]>(['공사중']); 
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const isPensionRequired = useMemo(() => {
      return selectedDays.size >= 8 || preTaxAmount >= 2200000;
  }, [selectedDays.size, preTaxAmount]);

  // --- Load Data Logic (기존 로직 유지) ---
  useEffect(() => {
      if (!isOpen || !partnerUid) return;
      const loadBasics = async () => {
          const wSnap = await getDocs(query(collection(db, 'users', partnerUid, 'workers')));
          setWorkers(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          
          const taxSnap = await getDoc(doc(db, 'users', partnerUid, 'settings', 'taxRates'));
          if (taxSnap.exists()) {
              const tData = taxSnap.data();
              if (typeof tData.agency !== 'number') setTaxConfig(tData as TaxConfig);
          }
          const filterSnap = await getDoc(doc(db, 'users', partnerUid, 'settings', 'laborSiteFilter'));
          if (filterSnap.exists()) {
              const savedFilter = filterSnap.data().statuses;
              if (savedFilter && savedFilter.length > 0) setSiteStatusFilter(savedFilter);
          }
      };
      loadBasics();

      if (targetLabor) {
          setSelectedWorkerId(targetLabor.workerId);
          setWorkerSearchQuery(targetLabor.workerName); 
          setSelectedSiteId(targetLabor.siteId);
          setPaymentMonth(targetLabor.paymentMonth);
          setSelectedDays(new Set(targetLabor.workedDays));
          setPreTaxAmount(targetLabor.preTaxAmount);
          setIsTaxExempt(targetLabor.isTaxExempt);
          setPay15(targetLabor.paymentCycle.includes('15일'));
          setPayEnd(targetLabor.paymentCycle.includes('말일'));
      } else {
          setPaymentMonth(currentMonth);
          setSelectedDays(new Set());
          setPreTaxAmount(0);
          setIsTaxExempt(false);
          setPay15(false); setPayEnd(false);
          setSelectedWorkerId(''); 
          setSelectedSiteId(defaultSiteId || '');
          setWorkerSearchQuery(''); 
      }
  }, [isOpen, partnerUid, targetLabor, currentMonth, defaultSiteId]);

  useEffect(() => {
      if (!isOpen || !partnerUid) return;
      const loadSites = async () => {
          if (siteStatusFilter.length === 0) { setSites([]); return; }
          const q = query(collection(db, 'users', partnerUid, 'sites'), where('status', 'in', siteStatusFilter));
          const sSnap = await getDocs(q);
          const loadedSites: any[] = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (defaultSiteId && defaultSiteName && !loadedSites.find(s => s.id === defaultSiteId)) {
             loadedSites.push({ id: defaultSiteId, siteName: defaultSiteName, status: 'unknown' }); 
          }
          setSites(loadedSites);
      };
      loadSites();
  }, [isOpen, partnerUid, siteStatusFilter, defaultSiteId, defaultSiteName]);

  const filteredWorkers = useMemo(() => {
      if (!workerSearchQuery) return workers;
      const lower = workerSearchQuery.toLowerCase();
      return workers.filter(w => w.workerName.toLowerCase().includes(lower));
  }, [workers, workerSearchQuery]);

  const handleSelectWorker = (worker: any) => {
      setSelectedWorkerId(worker.id);
      setWorkerSearchQuery(worker.workerName);
      setIsWorkerListVisible(false); 
  };

  const handleSaveFilter = async () => {
      try {
          await setDoc(doc(db, 'users', partnerUid, 'settings', 'laborSiteFilter'), { statuses: siteStatusFilter });
          setIsFilterOpen(false);
      } catch (e) { console.error("필터 저장 실패", e); }
  };

  const toggleFilterStatus = (status: string) => {
      setSiteStatusFilter(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };

  useEffect(() => { calculate(); }, [preTaxAmount, isTaxExempt, selectedWorkerId, selectedDays, taxConfig]);

  const calculate = () => {
      const worker = workers.find(w => w.id === selectedWorkerId);
      if (!worker) return;
      const type = worker.workerType || 'freelance';
      const daysCount = selectedDays.size;
      
      if (isTaxExempt) {
          setCalcResult({ incomeTax: 0, localTax: 0, ei: 0, totalDeduction: 0, final: preTaxAmount });
          return;
      }

      if (type === 'freelance') {
          const rate = taxConfig.freelance || 3.3;
          const deduction = Math.floor(preTaxAmount * (rate / 100)); 
          setCalcResult({ incomeTax: 0, localTax: 0, ei: 0, totalDeduction: deduction, final: preTaxAmount - deduction });
      } else {
          const dailyDed = taxConfig.agency.dailyDeduction || 150000;
          const taxBase = preTaxAmount - (daysCount * dailyDed);
          let incomeTax = 0;
          if (taxBase > 0) incomeTax = Math.floor(taxBase * ((taxConfig.agency.incomeTaxRate || 2.7) / 100));
          if (incomeTax < 1000) incomeTax = 0;
          const localTax = Math.floor(incomeTax * ((taxConfig.agency.localTaxRate || 10) / 100));
          const ei = Math.floor(preTaxAmount * ((taxConfig.agency.eiRate || 0.9) / 100));
          const totalDeduction = incomeTax + localTax + ei;
          setCalcResult({ incomeTax, localTax, ei, totalDeduction, final: preTaxAmount - totalDeduction });
      }
  };

  const toggleDay = (day: number) => {
      const newSet = new Set(selectedDays);
      if (newSet.has(day)) newSet.delete(day); else newSet.add(day);
      setSelectedDays(newSet);
  };

  const handleSave = async () => {
      if (!selectedWorkerId || !selectedSiteId) return alert("작업자와 현장을 선택해주세요.");
      if (selectedDays.size === 0) return alert("작업일을 하루 이상 선택해주세요.");
      if (preTaxAmount === 0) return alert("지급액을 입력해주세요.");
      if (!pay15 && !payEnd) return alert("지급기일을 선택해주세요.");
      
      const worker = workers.find(w => w.id === selectedWorkerId);
      const site = sites.find(s => s.id === selectedSiteId);

      setIsSubmitting(true);
      try {
          const paymentCycle = [];
          if (pay15) paymentCycle.push('15일');
          if (payEnd) paymentCycle.push('말일');
          const residentNumber = worker.residentNumber || worker.rrn || '';

          const data: any = {
              workerId: selectedWorkerId, workerName: worker.workerName, workerType: worker.workerType || 'freelance',
              companyName: worker.companyName, siteId: selectedSiteId, siteName: site ? site.siteName : defaultSiteName || '알수없음',
              paymentMonth, workedDays: Array.from(selectedDays).sort((a, b) => a - b), totalDays: selectedDays.size,
              preTaxAmount, deductionAmount: calcResult.totalDeduction, finalAmount: calcResult.final,
              paymentCycle, isTaxExempt, bankName: worker.bankName || '', accountNumber: worker.accountNumber || '',
              residentNumber, updatedAt: serverTimestamp()
          };

          if (targetLabor?.id) {
              await updateDoc(doc(db, 'users', partnerUid, 'labor_costs', targetLabor.id), data);
              if (userName) await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), { text: `[노무수정] ${userName}님이 ${worker.workerName}님의 ${paymentMonth} 노무 내역을 수정했습니다.`, createdAt: serverTimestamp(), type: 'hr_labor_update' });
          } else {
              data.createdAt = serverTimestamp(); data.isPaid = false; 
              await addDoc(collection(db, 'users', partnerUid, 'labor_costs'), data);
              if (userName) await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), { text: `[노무등록] ${userName}님이 ${worker.workerName}님의 ${paymentMonth} 노무비(${calcResult.final.toLocaleString()}원)를 등록했습니다.`, createdAt: serverTimestamp(), type: 'hr_labor_add' });
          }
          onRefresh(); onClose();
      } catch (e) { console.error(e); alert("오류 발생"); } 
      finally { setIsSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="ppm-overlay">
      <div className="ppm-container">
        
        {/* Header */}
        <div className="ppm-header">
          <div className="ppm-title">
            <h3>{targetLabor ? '노무비 내역 수정' : '노무비 등록'}</h3>
            <span className="ppm-badge">{paymentMonth}</span>
          </div>
          <button className="ppm-close-btn" onClick={onClose}><Icons.Close /></button>
        </div>
        
        <div className="ppm-body">
            {/* 1. Worker & Site Selection */}
            <div className="ppm-grid-row">
                <div className="ppm-col">
                    <label className="ppm-label"><Icons.User /> 작업자 검색</label>
                    <div style={{position:'relative'}}>
                        <input 
                            type="text" 
                            value={workerSearchQuery}
                            onChange={(e) => { setWorkerSearchQuery(e.target.value); setIsWorkerListVisible(true); }}
                            onFocus={() => setIsWorkerListVisible(true)}
                            placeholder="이름 입력"
                            disabled={!!targetLabor}
                            className="ppm-input"
                        />
                        {isWorkerListVisible && !targetLabor && (
                            <ul className="ppm-search-dropdown">
                                {filteredWorkers.length > 0 ? filteredWorkers.map(w => (
                                    <li key={w.id} onMouseDown={() => handleSelectWorker(w)} className="ppm-search-item">
                                        <span className="name">{w.workerName}</span>
                                        <span className="info">({w.companyName || '소속없음'} / {w.trade || '미지정'})</span>
                                    </li>
                                )) : <li className="ppm-search-no-result">검색 결과가 없습니다.</li>}
                            </ul>
                        )}
                    </div>
                </div>
                <div className="ppm-col">
                    <label className="ppm-label" style={{display:'flex', justifyContent:'space-between'}}>
                        <span><Icons.Home /> 현장 선택</span>
                        <button className="ppm-icon-btn-mini" onClick={() => setIsFilterOpen(true)} title="현장 목록 필터">
                            <Icons.Filter /> 필터
                        </button>
                    </label>
                    <div className="ppm-select-wrapper">
                        <select 
                            value={selectedSiteId} 
                            onChange={e => setSelectedSiteId(e.target.value)}
                            disabled={!!defaultSiteId} 
                            className="ppm-select"
                            style={defaultSiteId ? {backgroundColor: '#f3f4f6'} : {}}
                        >
                            <option value="">선택하세요 ({sites.length}개)</option>
                            {sites.map(s => <option key={s.id} value={s.id}>[{s.status}] {s.siteName}</option>)}
                            {defaultSiteId && !sites.find(s=>s.id===defaultSiteId) && (
                                 <option value={defaultSiteId}>{defaultSiteName}</option>
                            )}
                        </select>
                    </div>
                </div>
            </div>

            {/* 2. Month & Days */}
            <div className="ppm-col">
                <label className="ppm-label"><Icons.Calendar /> 작업월 / 근무일 ({selectedDays.size}일)</label>
                <div className="ppm-month-input-wrapper">
                    <input type="month" value={paymentMonth} onChange={e => setPaymentMonth(e.target.value)} className="ppm-input" />
                </div>
                <div className="ppm-day-grid">
                    {Array.from({length: 31}, (_, i) => i + 1).map(day => (
                        <div key={day} className={`ppm-day-chip ${selectedDays.has(day) ? 'selected' : ''}`} onClick={() => toggleDay(day)}>
                            {day}
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Amount & Tax */}
            <div className="ppm-box">
                <div className="ppm-grid-row" style={{alignItems:'flex-end'}}>
                    <div className="ppm-col">
                        <label className="ppm-label">세전 지급액 (총액)</label>
                        <input 
                            type="number" 
                            value={preTaxAmount || ''} 
                            onChange={e => setPreTaxAmount(Number(e.target.value))} 
                            placeholder="금액 입력" 
                            className="ppm-input text-right bg-white"
                        />
                    </div>
                    <div className="ppm-check-wrapper">
                        <input type="checkbox" id="taxExempt" checked={isTaxExempt} onChange={e => setIsTaxExempt(e.target.checked)} />
                        <label htmlFor="taxExempt">세금 면제</label>
                    </div>
                </div>

                {!isTaxExempt && selectedWorkerId && (
                    <div className="ppm-tax-detail">
                        {workers.find(w=>w.id===selectedWorkerId)?.workerType === 'agency' ? (
                            <>
                                <div className="ppm-tax-row"><span>소득세</span> <span>{calcResult.incomeTax.toLocaleString()}원</span></div>
                                <div className="ppm-tax-row"><span>지방소득세</span> <span>{calcResult.localTax.toLocaleString()}원</span></div>
                                <div className="ppm-tax-row"><span>고용보험료</span> <span>{calcResult.ei.toLocaleString()}원</span></div>
                                <div className="ppm-divider"></div>
                                <div className="ppm-tax-row total"><span>공제계</span> <span>{calcResult.totalDeduction.toLocaleString()}원</span></div>
                            </>
                        ) : (
                            <div className="ppm-tax-row total"><span>원천징수(3.3%)</span> <span>{calcResult.totalDeduction.toLocaleString()}원</span></div>
                        )}
                    </div>
                )}
                
                {isPensionRequired && (
                    <div className="ppm-warning-box">
                        ⚠️ 국민연금 가입 대상 (월 8일 이상 or 220만원↑)
                    </div>
                )}
            </div>
            
            {/* 4. Final Amount & Cycle */}
            <div className="ppm-final-bar">
                <span>실 지급액</span>
                <strong>{calcResult.final.toLocaleString()} 원</strong>
            </div>
            
            <div className="ppm-col">
                <label className="ppm-label">지급 예정일</label>
                <div className="ppm-tabs">
                    <button className={`ppm-tab-item ${pay15 ? 'active' : ''}`} onClick={() => setPay15(!pay15)}>
                        15일 (1차)
                    </button>
                    <button className={`ppm-tab-item ${payEnd ? 'active' : ''}`} onClick={() => setPayEnd(!payEnd)}>
                        말일 (2차)
                    </button>
                </div>
            </div>
        </div>

        <div className="ppm-footer">
            <button className="ppm-btn-primary" onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? '저장 중...' : <><Icons.Check /> 저장하기</>}
            </button>
        </div>

        {/* Filter Modal Overlay */}
        {isFilterOpen && (
            <div className="ppm-overlay" style={{zIndex: 10000}} onClick={() => setIsFilterOpen(false)}>
                <div className="ppm-container" style={{maxWidth:'300px', height:'auto'}} onClick={(e) => e.stopPropagation()}>
                    <div className="ppm-header">
                        <div className="ppm-title"><h3>현장 필터</h3></div>
                    </div>
                    <div className="ppm-body" style={{gap:'10px', padding:'16px'}}>
                        {ALL_SITE_STATUSES.map(status => (
                            <label key={status} className="ppm-filter-item">
                                <input 
                                    type="checkbox" 
                                    checked={siteStatusFilter.includes(status)} 
                                    onChange={() => toggleFilterStatus(status)} 
                                />
                                {status}
                            </label>
                        ))}
                    </div>
                    <div className="ppm-footer">
                        <button className="ppm-btn-primary" onClick={handleSaveFilter}>적용</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
export default LaborCostModal;