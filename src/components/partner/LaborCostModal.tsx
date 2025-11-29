import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getFirestore, collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, query, where, getDoc, setDoc } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './LaborCostModal.css';

interface LaborData {
  id?: string; workerId: string; workerName: string; workerType: 'agency' | 'freelance'; companyName: string;
  siteId: string; siteName: string; paymentMonth: string; workedDays: number[]; totalDays: number;
  unitPrice: number; preTaxAmount: number; deductionAmount: number; finalAmount: number;
  paymentCycle: string[]; isTaxExempt: boolean; bankName?: string; accountNumber?: string;
  residentNumber?: string; // 주민번호 필드 포함
}

interface Props {
  isOpen: boolean; onClose: () => void; partnerUid: string; targetLabor: LaborData | null; currentMonth: string; onRefresh: () => void;
  userName?: string; // 로그용 (선택)
}

interface TaxConfig {
    freelance: number; agency: { dailyDeduction: number; incomeTaxRate: number; localTaxRate: number; eiRate: number; };
}

const ALL_SITE_STATUSES = ['미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소'];

const LaborCostModal: React.FC<Props> = ({ isOpen, onClose, partnerUid, targetLabor, currentMonth, onRefresh, userName }) => {
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
      return selectedDays.size >= 7 || preTaxAmount >= 2200000;
  }, [selectedDays.size, preTaxAmount]);

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
          setSelectedWorkerId(''); setSelectedSiteId('');
          setWorkerSearchQuery(''); 
      }
  }, [isOpen, partnerUid, targetLabor, currentMonth]);

  useEffect(() => {
      if (!isOpen || !partnerUid) return;
      const loadSites = async () => {
          if (siteStatusFilter.length === 0) {
              setSites([]);
              return;
          }
          const q = query(collection(db, 'users', partnerUid, 'sites'), where('status', 'in', siteStatusFilter));
          const sSnap = await getDocs(q);
          setSites(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      };
      loadSites();
  }, [isOpen, partnerUid, siteStatusFilter]);

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

          const data: any = {
              workerId: selectedWorkerId, workerName: worker.workerName, workerType: worker.workerType || 'freelance',
              companyName: worker.companyName, siteId: selectedSiteId, siteName: site.siteName,
              paymentMonth, workedDays: Array.from(selectedDays).sort((a, b) => a - b), totalDays: selectedDays.size,
              preTaxAmount, deductionAmount: calcResult.totalDeduction, finalAmount: calcResult.final,
              paymentCycle, isTaxExempt, bankName: worker.bankName || '', accountNumber: worker.accountNumber || '', 
              
              // [중요] 주민번호 저장 (누락 방지)
              residentNumber: worker.residentNumber || worker.rrn || '',

              updatedAt: serverTimestamp()
          };

          if (targetLabor?.id) {
              await updateDoc(doc(db, 'users', partnerUid, 'labor_costs', targetLabor.id), data);
          } else {
              data.createdAt = serverTimestamp(); data.isPaid = false; 
              await addDoc(collection(db, 'users', partnerUid, 'labor_costs'), data);
              
              if (userName) {
                  await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
                      text: `[노무등록] ${userName}님이 ${worker.workerName}님의 ${paymentMonth} 노무비(${calcResult.final.toLocaleString()}원)를 등록했습니다.`,
                      createdAt: serverTimestamp(), type: 'hr_labor_add'
                  });
              }
          }
          onRefresh(); onClose();
      } catch (e) { console.error(e); alert("오류 발생"); } finally { setIsSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="labor-modal-wrapper">
      <div className="lm-overlay" onClick={onClose}>
        <div className="lm-content" onClick={e => e.stopPropagation()}>
          <div className="lm-header">
            <h3>{targetLabor ? '노무비 내역 수정' : '노무비 등록'}</h3>
            <button className="lm-close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="lm-body lm-scroll">
            <div className="lm-row">
                <div className="lm-group half">
                    <label>작업자 검색</label>
                    <div className="lm-search-wrapper">
                        <input 
                            type="text" 
                            value={workerSearchQuery}
                            onChange={(e) => { setWorkerSearchQuery(e.target.value); setIsWorkerListVisible(true); }}
                            onFocus={() => setIsWorkerListVisible(true)}
                            placeholder="이름 입력"
                            disabled={!!targetLabor}
                        />
                        {isWorkerListVisible && !targetLabor && (
                            <ul className="lm-search-list">
                                {filteredWorkers.length > 0 ? filteredWorkers.map(w => (
                                    <li key={w.id} onMouseDown={() => handleSelectWorker(w)}>
                                        <span className="w-name">{w.workerName}</span>
                                        <span className="w-info">({w.companyName || '소속없음'} / {w.trade || '미지정'})</span>
                                    </li>
                                )) : <li className="no-result">검색 결과가 없습니다.</li>}
                            </ul>
                        )}
                    </div>
                </div>
                <div className="lm-group half">
                    <label style={{display:'flex', justifyContent:'space-between'}}>
                        현장 
                        <button className="btn-site-filter" onClick={(e) => { e.preventDefault(); setIsFilterOpen(true); }}>
                           ⚙️ 상태필터
                        </button>
                    </label>
                    <select value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)}>
                        <option value="">선택하세요 ({sites.length}개)</option>
                        {sites.map(s => <option key={s.id} value={s.id}>[{s.status}] {s.siteName}</option>)}
                    </select>
                </div>
            </div>

            <div className="lm-group">
                <label>작업월 / 근무일 ({selectedDays.size}일)</label>
                <input type="month" value={paymentMonth} onChange={e => setPaymentMonth(e.target.value)} style={{marginBottom:'10px'}} />
                <div className="lm-day-grid">
                    {Array.from({length: 31}, (_, i) => i + 1).map(day => (
                        <div key={day} className={`lm-day-chip ${selectedDays.has(day) ? 'selected' : ''}`} onClick={() => toggleDay(day)}>{day}</div>
                    ))}
                </div>
            </div>

            <div className="lm-group bg-box">
                <div className="lm-row baseline">
                    <div className="lm-group grow">
                        <label>세전 지급액 (총액)</label>
                        <input 
                            type="number" 
                            value={preTaxAmount || ''} 
                            onChange={e => setPreTaxAmount(Number(e.target.value))} 
                            placeholder="금액 입력" 
                            className="lm-input-amount"
                        />
                    </div>
                    <label className="lm-check-label"><input type="checkbox" checked={isTaxExempt} onChange={e => setIsTaxExempt(e.target.checked)} />세금 면제</label>
                </div>

                {!isTaxExempt && selectedWorkerId && (
                    <div className="lm-tax-detail">
                        {workers.find(w=>w.id===selectedWorkerId)?.workerType === 'agency' ? (
                            <>
                                <p><span>소득세:</span> <span>{calcResult.incomeTax.toLocaleString()}원</span></p>
                                <p><span>지방소득세:</span> <span>{calcResult.localTax.toLocaleString()}원</span></p>
                                <p><span>고용보험료:</span> <span>{calcResult.ei.toLocaleString()}원</span></p>
                                <hr/><p className="total"><span>공제계:</span> <span>{calcResult.totalDeduction.toLocaleString()}원</span></p>
                            </>
                        ) : (<p className="total"><span>원천징수(3.3%):</span> <span>{calcResult.totalDeduction.toLocaleString()}원</span></p>)}
                    </div>
                )}

                {isPensionRequired && (
                    <div className="lm-pension-warning">
                        ⚠️ 국민연금 가입 대상입니다. (월 7일 이상 또는 220만원 이상)
                    </div>
                )}
            </div>
            
            <div className="lm-result-bar"><span>실 지급액</span><strong>{calcResult.final.toLocaleString()} 원</strong></div>
            
            <div className="lm-group">
                <label>지급 예정일</label>
                <div className="lm-check-row">
                    <label><input type="checkbox" checked={pay15} onChange={e => setPay15(e.target.checked)} /> 15일 (1차)</label>
                    <label><input type="checkbox" checked={payEnd} onChange={e => setPayEnd(e.target.checked)} /> 말일 (2차)</label>
                </div>
            </div>
          </div>

          <div className="lm-footer">
            <button className="lm-btn-cancel" onClick={onClose}>취소</button>
            <button className="lm-btn-save" onClick={handleSave} disabled={isSubmitting}>저장</button>
          </div>
        </div>

        {isFilterOpen && (
            <div className="lm-filter-overlay" onClick={() => setIsFilterOpen(false)}>
                <div className="lm-filter-modal" onClick={(e) => e.stopPropagation()}>
                    <h4>현장 목록 필터</h4>
                    <div className="lm-filter-list">
                        {ALL_SITE_STATUSES.map(status => (
                            <label key={status} className="lm-filter-item">
                                <input type="checkbox" checked={siteStatusFilter.includes(status)} onChange={() => toggleFilterStatus(status)} />
                                {status}
                            </label>
                        ))}
                    </div>
                    <div className="lm-filter-footer">
                        <button onClick={() => setIsFilterOpen(false)}>닫기</button>
                        <button className="primary" onClick={handleSaveFilter}>적용하기</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
export default LaborCostModal;