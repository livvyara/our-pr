import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, updateDoc, getDoc,
  query, where, orderBy 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom'; 
import { firebaseConfig } from '../../firebase-config';
import './AccountingIntegratedPage.css'; 
import { 
  Search, ChevronDown, ChevronUp,
  Plus, X, TrendingUp, TrendingDown 
} from 'lucide-react'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- 인터페이스 ---
interface CategoryData { name: string; subCategories: string[]; }
interface Site { id: string; name: string; status: string; }

export interface UnifiedItem {
    id: string;
    source: 'tax_invoice' | 'cash_receipt'; 
    collectionName: string; 
    date: string;       
    type: string;       
    inOut: '매출' | '매입';
    traderName: string; 
    regNo: string;      
    supplyAmount: number;
    taxAmount: number;
    totalAmount: number;
    siteId?: string;
    category1?: string;
    category2?: string;
    remark: string;     
    remark2?: string;   
    linkedTransactionId?: string;
    approvalNo?: string;
    originalData: any; 
}

const AccountingIntegratedPage: React.FC = () => {
  const navigate = useNavigate(); 
  
  const [list, setList] = useState<UnifiedItem[]>([]);
  const [siteList, setSiteList] = useState<Site[]>([]);
  const [siteCategories, setSiteCategories] = useState<CategoryData[]>([]);
  const [generalCategories, setGeneralCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});
  
  // 모바일 아코디언 상태 관리
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  // 필터 State
  const getDefaultDates = () => {
    const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 30); 
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  };
  const [searchStartDate, setSearchStartDate] = useState(getDefaultDates().start);
  const [searchEndDate, setSearchEndDate] = useState(getDefaultDates().end);
  const [evidenceType, setEvidenceType] = useState<'all' | 'tax_invoice' | 'cash_receipt'>('all');
  const [searchType, setSearchType] = useState<'all' | '매출' | '매입'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchSiteId, setSearchSiteId] = useState<string>(''); 
  const [searchSiteName, setSearchSiteName] = useState<string>('전체 현장');
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [showAssigned, setShowAssigned] = useState(true);
  
  const [dateMode, setDateMode] = useState<'custom' | 'month' | 'quarter'>('custom');
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1);
  const [selQuarter, setSelQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));

  // 모달 State
  const [selectedItem, setSelectedItem] = useState<UnifiedItem | null>(null);
  const [paymentModalTarget, setPaymentModalTarget] = useState<UnifiedItem | null>(null);
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [isManualSelectOpen, setIsManualSelectOpen] = useState(false);
  const [manualModalType, setManualModalType] = useState<'sales' | 'purchase' | null>(null);

  const [summary, setSummary] = useState({ salesCount: 0, salesTotal: 0, purchaseCount: 0, purchaseTotal: 0 });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if(userDoc.exists()) {
                const d = userDoc.data();
                setCurrentUserInfo({ uid: user.uid, name: d.nickname || d.email || '사용자' });
                let targetUid = user.uid;
                if (d.role === 'sub_partner' && d.partnerInfo && d.partnerInfo.ownerUid) {
                    targetUid = d.partnerInfo.ownerUid;
                }
                setCurrentUid(targetUid);
                fetchSites(targetUid);
                fetchExpenseCategories(targetUid);
            }
        } catch (e) { console.error(e); }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => { 
      if (currentUid) fetchDataAndSummary(); 
  }, [currentUid, searchStartDate, searchEndDate, evidenceType, searchType, showUnassigned, showAssigned, searchSiteId]);

  useEffect(() => {
    if (dateMode === 'custom') return;
    let start = '', end = '';
    const y = selYear;
    if (dateMode === 'month') {
        const lastDay = new Date(y, selMonth, 0).getDate();
        start = `${y}-${String(selMonth).padStart(2,'0')}-01`;
        end = `${y}-${String(selMonth).padStart(2,'0')}-${lastDay}`;
    } else if (dateMode === 'quarter') {
        const qStartMonth = (selQuarter - 1) * 3 + 1;
        const qEndMonth = selQuarter * 3;
        const lastDay = new Date(y, qEndMonth, 0).getDate();
        start = `${y}-${String(qStartMonth).padStart(2,'0')}-01`;
        end = `${y}-${String(qEndMonth).padStart(2,'0')}-${lastDay}`;
    }
    setSearchStartDate(start); setSearchEndDate(end);
  }, [dateMode, selYear, selMonth, selQuarter]);

  const fetchDataAndSummary = async () => {
    if (!currentUid) return;
    setLoading(true);
    let allItems: UnifiedItem[] = [];
    
    const fetchCollection = async (colName: string, source: 'tax_invoice'|'cash_receipt', inOut: '매출'|'매입', dateField: string) => {
        try {
            const q = query(
                collection(db, 'users', currentUid, colName),
                where(dateField, '>=', searchStartDate),
                where(dateField, '<=', searchEndDate)
            );
            const snap = await getDocs(q);
            snap.forEach(doc => {
                const d = doc.data();
                const itemSiteId = d.siteId || '';
                const isCompleted = !!itemSiteId || (!!d.category1 && !!d.category2);
                
                if (searchSiteId && itemSiteId !== searchSiteId) return;
                if (!searchSiteId) {
                    if (!showUnassigned && !isCompleted) return;
                    if (!showAssigned && isCompleted) return;
                }

                const unified: UnifiedItem = {
                    id: doc.id,
                    source,
                    collectionName: colName,
                    date: d[dateField],
                    type: d.type || (source === 'tax_invoice' ? '전자세금계산서' : '현금영수증'),
                    inOut,
                    traderName: source === 'tax_invoice' ? (inOut === '매출' ? d.buyerName : d.vendorName) : d.franchiseName,
                    regNo: source === 'tax_invoice' ? (inOut === '매출' ? d.buyerRegNo : d.vendorRegNo) : d.franchiseRegNo,
                    supplyAmount: Number(d.supplyAmount) || 0,
                    taxAmount: Number(d.taxAmount) || 0,
                    totalAmount: Number(d.totalAmount) || 0,
                    siteId: d.siteId || '',
                    category1: d.category1 || '',
                    category2: d.category2 || '',
                    remark: d.remark || '',
                    remark2: d.remark2 || '',
                    linkedTransactionId: d.linkedTransactionId || '',
                    approvalNo: d.approvalNo,
                    originalData: d 
                };
                if (searchKeyword && !unified.traderName.includes(searchKeyword)) return;
                allItems.push(unified);
            });
        } catch (e) { console.error(e); }
    };

    const promises = [];
    if (evidenceType === 'all' || evidenceType === 'tax_invoice') {
        if (searchType === 'all' || searchType === '매출') promises.push(fetchCollection('TAX_SALES', 'tax_invoice', '매출', 'writeDate'));
        if (searchType === 'all' || searchType === '매입') promises.push(fetchCollection('TAX_PURCHASE', 'tax_invoice', '매입', 'writeDate'));
    }
    if (evidenceType === 'all' || evidenceType === 'cash_receipt') {
        if (searchType === 'all' || searchType === '매출') promises.push(fetchCollection('CASH_SALES', 'cash_receipt', '매출', 'tradeDate'));
        if (searchType === 'all' || searchType === '매입') promises.push(fetchCollection('CASH_PURCHASE', 'cash_receipt', '매입', 'tradeDate'));
    }

    await Promise.all(promises);
    allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setList(allItems);
    
    let sCount=0, sTotal=0, pCount=0, pTotal=0;
    allItems.forEach(item => {
        if (item.inOut === '매출') { sCount++; sTotal += item.totalAmount; }
        else { pCount++; pTotal += item.totalAmount; }
    });
    setSummary({ salesCount: sCount, salesTotal: sTotal, purchaseCount: pCount, purchaseTotal: pTotal });
    setLoading(false);
  };

  const handleFieldChange = async (item: UnifiedItem, field: string, value: string) => {
      if (!currentUid) return;
      setList(prev => prev.map(prevItem => {
          if (prevItem.id !== item.id) return prevItem;
          const updated = { ...prevItem, [field]: value };
          if (field === 'category1') updated.category2 = '';
          if (field === 'siteId') { updated.category1 = ''; updated.category2 = ''; }
          return updated;
      }));

      try {
          const docRef = doc(db, 'users', currentUid, item.collectionName, item.id);
          const updateData: any = { [field]: value };
          if (field === 'category1') updateData.category2 = '';
          if (field === 'siteId') { updateData.category1 = ''; updateData.category2 = ''; }
          await updateDoc(docRef, updateData);
      } catch (e) { console.error(e); }
  };

  const handleLinkTransaction = async (item: UnifiedItem, transactionId: string) => {
      if (!currentUid) return;
      try {
          const docRef = doc(db, 'users', currentUid, item.collectionName, item.id);
          await updateDoc(docRef, { linkedTransactionId: transactionId });
          setList(prev => prev.map(p => p.id === item.id ? { ...p, linkedTransactionId: transactionId } : p));
          alert("연결되었습니다.");
          setPaymentModalTarget(null);
      } catch (e) { alert("연결 실패"); }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItemIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItemIds(newSet);
  };

  const fetchSites = async (uid: string) => {
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'sites'));
      const list: Site[] = [];
      snap.forEach(d => list.push({ id: d.id, name: d.data().siteName, status: d.data().status||'공사중' }));
      setSiteList(list);
    } catch (e) {}
  };
  
  const fetchExpenseCategories = async (uid: string) => {
      try {
        const sSnap = await getDocs(query(collection(db, 'users', uid, 'EXPENSE_CATEGORIES_SITE'), orderBy('order', 'asc')));
        const sList: CategoryData[] = []; sSnap.forEach(d => sList.push(d.data() as CategoryData));
        setSiteCategories(sList);
        const gSnap = await getDocs(query(collection(db, 'users', uid, 'EXPENSE_CATEGORIES_GENERAL'), orderBy('order', 'asc')));
        const gList: CategoryData[] = []; gSnap.forEach(d => gList.push(d.data() as CategoryData));
        setGeneralCategories(gList);
      } catch(e) {}
  };

  const yearOptions = Array.from({length: 21}, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="aip-container">
      <div className="aip-header">
        <div className="aip-title-area">
          <h2>세금계산서/현금영수증 통합 관리</h2>
          <p>매입/매출 증빙 내역을 조회하고 현장별로 분류하세요.</p>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="aip-filter-panel">
        <div className="aip-filter-row top">
          <div className="aip-mode-group">
            {['custom', 'month', 'quarter'].map(m => (
              <button key={m} className={`aip-mode-btn ${dateMode === m ? 'active' : ''}`} onClick={() => setDateMode(m as any)}>
                {m === 'custom' ? '직접입력' : m === 'month' ? '월간' : '분기'}
              </button>
            ))}
          </div>
          <div className="aip-date-range">
            {dateMode === 'custom' && (
              <>
                <input type="date" className="aip-input" value={searchStartDate} onChange={e=>setSearchStartDate(e.target.value)} />
                <span className="aip-tilde">~</span>
                <input type="date" className="aip-input" value={searchEndDate} onChange={e=>setSearchEndDate(e.target.value)} />
              </>
            )}
            {dateMode === 'month' && (
              <>
                <select className="aip-select" value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}</select>
                <select className="aip-select" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
              </>
            )}
            {dateMode === 'quarter' && (
              <>
                <select className="aip-select" value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}</select>
                <select className="aip-select" value={selQuarter} onChange={e=>setSelQuarter(Number(e.target.value))}>{[1,2,3,4].map(q => <option key={q} value={q}>{q}분기</option>)}</select>
              </>
            )}
          </div>
        </div>

        <div className="aip-filter-row">
          <div className="aip-filter-item">
            <select className="aip-select" value={evidenceType} onChange={e=>setEvidenceType(e.target.value as any)}>
              <option value="all">전체 증빙</option>
              <option value="tax_invoice">세금계산서</option>
              <option value="cash_receipt">현금영수증</option>
            </select>
          </div>
          <div className="aip-filter-item">
            <select className="aip-select" value={searchType} onChange={e=>setSearchType(e.target.value as any)}>
              <option value="all">매입/매출 전체</option>
              <option value="매출">매출</option>
              <option value="매입">매입(지출)</option>
            </select>
          </div>
          <button onClick={() => setIsSiteModalOpen(true)} className="aip-btn aip-btn-site">
             <span>🏗️ {searchSiteName}</span> <ChevronDown size={14} />
          </button>
          <div className="aip-checkbox-group">
            <label className="aip-checkbox-label">
              <input type="checkbox" className="aip-checkbox-input" checked={showUnassigned} onChange={e => setShowUnassigned(e.target.checked)} /> 미귀속
            </label>
            <label className="aip-checkbox-label">
              <input type="checkbox" className="aip-checkbox-input" checked={showAssigned} onChange={e => setShowAssigned(e.target.checked)} /> 귀속
            </label>
          </div>
          <div className="aip-filter-item" style={{flex: 1, minWidth: '200px'}}>
            <input type="text" placeholder="거래처명 검색" value={searchKeyword} onChange={e=>setSearchKeyword(e.target.value)} className="aip-input aip-search-input" style={{width:'100%'}} />
          </div>
          <button className="aip-btn aip-btn-search" onClick={() => fetchDataAndSummary()}>
            <Search size={16} /> 조회
          </button>
          <button className="aip-btn aip-btn-manual" onClick={() => setIsManualSelectOpen(true)}>
            <Plus size={16} /> 수기 등록
          </button>
        </div>
      </div>

      <div className="aip-summary-grid">
        <div className="aip-card sales">
          <div className="aip-card-header"><TrendingUp size={16} /> 매출 합계 ({summary.salesCount}건)</div>
          <div className="aip-card-value">{summary.salesTotal.toLocaleString()}원</div>
        </div>
        <div className="aip-card purchase">
          <div className="aip-card-header"><TrendingDown size={16} /> 매입 합계 ({summary.purchaseCount}건)</div>
          <div className="aip-card-value">{summary.purchaseTotal.toLocaleString()}원</div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. PC VIEW (TABLE) */}
      {/* ========================================================================= */}
      <div className="aip-desktop-view">
        <div className="aip-table-container">
          <div className="aip-table-wrapper">
            <table className="aip-table">
              <thead>
                <tr>
                  <th className="col-date">작성일</th>
                  <th className="col-badge" style={{textAlign:'center'}}>증빙</th>
                  <th className="col-type" style={{textAlign:'center'}}>구분</th>
                  <th className="col-vendor">거래처</th>
                  <th className="col-money aip-text-right">공급가액</th>
                  <th className="col-money aip-text-right">세액</th>
                  <th className="col-money aip-text-right">합계금액</th>
                  <th className="col-pay" style={{textAlign:'center'}}>결제</th>
                  <th className="col-site">현장 귀속</th>
                  <th className="col-cat">1차 분류</th>
                  <th className="col-cat">2차 분류</th>
                  <th className="col-memo">메모</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr><td colSpan={12} className="aip-no-data">{loading ? '데이터를 불러오는 중입니다...' : '조회된 내역이 없습니다.'}</td></tr>
                ) : (
                  list.map((item) => {
                    const isSiteAssigned = !!item.siteId; 
                    const isClassified = isSiteAssigned || (!!item.category1 && !!item.category2); 
                    const rowBgColor = isClassified ? 'var(--aip-bg-assigned)' : 'var(--aip-bg-white)';
                    const targetCategories = isSiteAssigned ? siteCategories : generalCategories;
                    const currentCat1 = targetCategories.find(c => c.name === item.category1);
                    const subCategories = currentCat1 ? currentCat1.subCategories : [];
                    const isPaid = !!item.linkedTransactionId;
                    
                    return (
                      <tr key={item.id} style={{backgroundColor: rowBgColor}}>
                        <td className="aip-text-center" style={{color:'#666'}}>{item.date}</td>
                        <td className="aip-text-center">
                          <span className={`aip-badge ${item.source === 'tax_invoice' ? 'tax' : 'cash'}`}>
                            {item.source === 'tax_invoice' ? '세금' : '현금'}
                          </span>
                        </td>
                        <td className="aip-text-center">
                          <span className={`aip-badge ${item.inOut === '매출' ? 'sales' : 'purchase'}`}>{item.inOut}</span>
                        </td>
                        {/* [복원] PC 테이블 상호명 클릭 이벤트 */}
                        <td>
                          <div className="aip-cell-vendor" onClick={() => setSelectedItem(item)} title={item.traderName}>
                              {item.traderName}
                          </div>
                        </td>
                        <td className="aip-text-right">{item.supplyAmount.toLocaleString()}</td>
                        <td className="aip-text-right" style={{color:'#888'}}>{item.taxAmount.toLocaleString()}</td>
                        <td className="aip-text-right aip-font-bold">{item.totalAmount.toLocaleString()}</td>
                        <td className="aip-text-center">
                          <button className={`aip-btn-link ${isPaid ? 'done' : ''}`} onClick={() => setPaymentModalTarget(item)}>
                            {isPaid ? '완료' : '연결'}
                          </button>
                        </td>
                        <td>
                          <select className="aip-table-select" value={item.siteId || ""} onChange={(e) => handleFieldChange(item, 'siteId', e.target.value)}>
                              <option value="">(미지정)</option>
                              {siteList.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="aip-table-select" value={item.category1 || ""} onChange={(e) => handleFieldChange(item, 'category1', e.target.value)}>
                              <option value="">{isSiteAssigned ? "공정선택" : "계정선택"}</option>
                              {targetCategories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="aip-table-select" value={item.category2 || ""} onChange={(e) => handleFieldChange(item, 'category2', e.target.value)} disabled={!item.category1}>
                              <option value="">(상세)</option>
                              {subCategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                          </select>
                        </td>
                        <td>
                          <input type="text" className="aip-table-select aip-input memo" defaultValue={item.remark2 || ""} placeholder="메모" onBlur={(e) => { if (e.target.value !== (item.remark2 || "")) handleFieldChange(item, 'remark2', e.target.value); }} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MOBILE VIEW (ACCORDION) */}
      {/* ========================================================================= */}
      <div className="aip-mobile-view">
        <div className="aip-mobile-list">
            {list.length === 0 ? (
                <div className="aip-no-data">{loading ? '데이터를 불러오는 중입니다...' : '조회된 내역이 없습니다.'}</div>
            ) : (
                list.map((item) => {
                    const isSiteAssigned = !!item.siteId; 
                    const isClassified = isSiteAssigned || (!!item.category1 && !!item.category2); 
                    const targetCategories = isSiteAssigned ? siteCategories : generalCategories;
                    const currentCat1 = targetCategories.find(c => c.name === item.category1);
                    const subCategories = currentCat1 ? currentCat1.subCategories : [];
                    const isPaid = !!item.linkedTransactionId;
                    const isExpanded = expandedItemIds.has(item.id);

                    return (
                        <div key={item.id} className="aip-mobile-card" style={isClassified ? {backgroundColor: 'var(--aip-bg-assigned)'} : {}}>
                            {/* Header */}
                            <div className="aip-mobile-card-header" onClick={() => toggleExpand(item.id)}>
                                <div className="aip-mobile-header-left">
                                    <span className="aip-mobile-date">{item.date}</span>
                                    {/* [복원] 모바일 상호명 클릭 이벤트 (stopPropagation 사용) */}
                                    <span 
                                        className="aip-mobile-vendor-title" 
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            setSelectedItem(item); 
                                        }}
                                    >
                                        {item.traderName}
                                    </span>
                                </div>
                                <div className="aip-mobile-header-right">
                                    <div className="aip-mobile-badge-group">
                                        <span className={`aip-badge ${item.source === 'tax_invoice' ? 'tax' : 'cash'}`}>
                                            {item.source === 'tax_invoice' ? '세금' : '현금'}
                                        </span>
                                        <span className={`aip-badge ${item.inOut === '매출' ? 'sales' : 'purchase'}`}>{item.inOut}</span>
                                    </div>
                                    <ChevronDown size={20} className={`aip-mobile-chevron ${isExpanded ? 'open' : ''}`} />
                                </div>
                            </div>
                            
                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="aip-mobile-expanded">
                                    <div className="aip-mobile-body">
                                        <div className="aip-mobile-row">
                                            <span className="aip-mobile-label">공급가액</span>
                                            <span className="aip-mobile-value">{item.supplyAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="aip-mobile-row">
                                            <span className="aip-mobile-label">세액</span>
                                            <span className="aip-mobile-value" style={{color:'#888'}}>{item.taxAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="aip-mobile-row" style={{marginTop:'4px'}}>
                                            <span className="aip-mobile-label">합계</span>
                                            <span className="aip-mobile-value total">{item.totalAmount.toLocaleString()}원</span>
                                        </div>
                                    </div>

                                    <div className="aip-mobile-actions">
                                        <div className="aip-mobile-input-group">
                                            <span className="aip-mobile-input-label">결제</span>
                                            <button className={`aip-btn-link ${isPaid ? 'done' : ''}`} style={{width:'100%'}} onClick={() => setPaymentModalTarget(item)}>
                                                {isPaid ? '연결완료' : '결제연결'}
                                            </button>
                                        </div>
                                        <div className="aip-mobile-input-group">
                                            <span className="aip-mobile-input-label">현장</span>
                                            <select className="aip-mobile-select" value={item.siteId || ""} onChange={(e) => handleFieldChange(item, 'siteId', e.target.value)}>
                                                <option value="">(미지정)</option>
                                                {siteList.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="aip-mobile-input-group">
                                            <span className="aip-mobile-input-label">분류</span>
                                            <div style={{display:'flex', gap:'5px', flex:1}}>
                                                <select className="aip-mobile-select" value={item.category1 || ""} onChange={(e) => handleFieldChange(item, 'category1', e.target.value)}>
                                                    <option value="">{isSiteAssigned ? "공정" : "계정"}</option>
                                                    {targetCategories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                                                </select>
                                                <select className="aip-mobile-select" value={item.category2 || ""} onChange={(e) => handleFieldChange(item, 'category2', e.target.value)} disabled={!item.category1}>
                                                    <option value="">상세</option>
                                                    {subCategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="aip-mobile-input-group">
                                            <span className="aip-mobile-input-label">메모</span>
                                            <input type="text" className="aip-mobile-select" defaultValue={item.remark2 || ""} placeholder="메모 입력" onBlur={(e) => { if (e.target.value !== (item.remark2 || "")) handleFieldChange(item, 'remark2', e.target.value); }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
      </div>

      {/* --- Modals --- */}
      {selectedItem && (
        selectedItem.source === 'tax_invoice' 
          ? <TaxInvoiceDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
          : <CashReceiptDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      {isSiteModalOpen && <SiteSelectionModal sites={siteList} onClose={() => setIsSiteModalOpen(false)} onSelect={(id, name) => { setSearchSiteId(id); setSearchSiteName(name); setIsSiteModalOpen(false); }} />}
      {paymentModalTarget && currentUid && <PaymentConnectionModal item={paymentModalTarget} currentUserUid={currentUid} onClose={() => setPaymentModalTarget(null)} onConfirm={(txId) => handleLinkTransaction(paymentModalTarget, txId)} />}
      
      {isManualSelectOpen && (
        <div className="aip-modal-overlay" onClick={() => setIsManualSelectOpen(false)}>
            <div className="aip-modal-paper" style={{maxWidth:'500px', height: 'auto'}} onClick={e => e.stopPropagation()}>
                <div className="aip-modal-header">
                    <h3 className="aip-modal-title">자료 등록 방식 선택</h3>
                    <button onClick={() => setIsManualSelectOpen(false)} style={{border:'none', background:'none', cursor:'pointer'}}><X size={24} /></button>
                </div>
                <div className="aip-modal-body">
                    <div className="aip-upload-zone">
                        <div className="aip-upload-btn" onClick={() => { setIsManualSelectOpen(false); setManualModalType('sales'); }}>
                            <TrendingUp size={32} />
                            <h4>매출 자료 등록</h4>
                            <p>종이 세금계산서 및 기타 매출</p>
                        </div>
                        <div className="aip-upload-btn" onClick={() => { setIsManualSelectOpen(false); setManualModalType('purchase'); }}>
                            <TrendingDown size={32} />
                            <h4>매입 자료 등록</h4>
                            <p>종이 세금계산서 및 기타 지출</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// --- Modals ---
const TaxInvoiceDetailModal: React.FC<{ item: UnifiedItem, onClose: () => void }> = ({ item, onClose }) => {
    const d = item.originalData;
    const themeClass = item.inOut === '매출' ? 'aip-theme-red' : 'aip-theme-blue';

    return (
        <div className="aip-modal-overlay" onClick={onClose}>
            <div className={`aip-modal-paper ${themeClass}`} onClick={e => e.stopPropagation()} style={{maxWidth:'720px'}}>
                <div className="aip-modal-header">
                    <h2 className="aip-modal-title">전자세금계산서 상세</h2>
                    <button onClick={onClose} style={{border:'none', background:'none', cursor:'pointer'}}><X size={24} /></button>
                </div>
                <div className="aip-modal-body">
                    <div style={{display:'flex', gap:'20px', flexDirection: 'column'}}>
                        <table className="aip-invoice-table">
                            <tbody>
                                <tr><th rowSpan={4} style={{width:'40px', textAlign:'center'}}>공급자</th><th>등록번호</th><td>{d.vendorRegNo}</td></tr>
                                <tr><th>상호</th><td>{d.vendorName}</td></tr>
                                <tr><th>성명</th><td>{d.vendorCeo}</td></tr>
                                <tr><th>주소</th><td>{d.vendorAddr}</td></tr>
                            </tbody>
                        </table>
                        <table className="aip-invoice-table">
                            <tbody>
                                <tr><th rowSpan={4} style={{width:'40px', textAlign:'center'}}>받는자</th><th>등록번호</th><td>{d.buyerRegNo}</td></tr>
                                <tr><th>상호</th><td>{d.buyerName}</td></tr>
                                <tr><th>성명</th><td>{d.buyerCeo}</td></tr>
                                <tr><th>주소</th><td>{d.buyerAddr}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <table className="aip-invoice-table" style={{marginTop:'20px'}}>
                        <thead><tr><th>작성일</th><th>품목</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th></tr></thead>
                        <tbody>
                            {d.items && d.items.length > 0 ? d.items.map((it: any, i: number) => (
                                <tr key={i}>
                                    <td className="aip-text-center">{it.date}</td>
                                    <td>{it.itemName}</td>
                                    <td className="aip-text-right">{it.qty}</td>
                                    <td className="aip-text-right">{Number(it.unitPrice).toLocaleString()}</td>
                                    <td className="aip-text-right">{Number(it.supplyAmount).toLocaleString()}</td>
                                    <td className="aip-text-right">{Number(it.taxAmount).toLocaleString()}</td>
                                </tr>
                            )) : <tr><td colSpan={6} className="aip-text-center">상세 품목 없음</td></tr>}
                        </tbody>
                        <tfoot>
                            <tr style={{background:'#f2f4f6', fontWeight:'bold'}}>
                                <td colSpan={4} className="aip-text-center">합계</td>
                                <td className="aip-text-right">{Number(d.supplyAmount).toLocaleString()}</td>
                                <td className="aip-text-right">{Number(d.taxAmount).toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div style={{marginTop:'10px', fontSize:'14px', textAlign:'right'}}>
                        <strong>총 합계금액: </strong> <span style={{fontSize:'18px', color:'#333'}}>{Number(d.totalAmount).toLocaleString()}원</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CashReceiptDetailModal: React.FC<{ item: UnifiedItem, onClose: () => void }> = ({ item, onClose }) => {
    const d = item.originalData;
    const themeClass = item.inOut === '매출' ? 'aip-theme-red' : 'aip-theme-blue';

    return (
        <div className="aip-modal-overlay" onClick={onClose}>
            <div className={`aip-modal-paper ${themeClass}`} onClick={e => e.stopPropagation()} style={{maxWidth:'400px'}}>
                <div className="aip-modal-header">
                    <h2 className="aip-modal-title">현금영수증 상세</h2>
                    <button onClick={onClose} style={{border:'none', background:'none', cursor:'pointer'}}><X size={24} /></button>
                </div>
                <div className="aip-modal-body">
                    <table className="aip-invoice-table">
                        <tbody>
                            <tr><th>승인번호</th><td>{item.approvalNo || '-'}</td></tr>
                            <tr><th>거래일시</th><td>{d.tradeDate}</td></tr>
                            <tr><th>가맹점</th><td>{d.franchiseName}</td></tr>
                            <tr><th>사업자번호</th><td>{d.franchiseRegNo}</td></tr>
                            <tr><th>공급가액</th><td className="aip-text-right">{Number(d.supplyAmount).toLocaleString()}</td></tr>
                            <tr><th>부가세</th><td className="aip-text-right">{Number(d.taxAmount).toLocaleString()}</td></tr>
                            <tr style={{background:'#f9fafb', fontWeight:'bold'}}><th>합계금액</th><td className="aip-text-right" style={{fontSize:'16px'}}>{Number(d.totalAmount).toLocaleString()}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const SiteSelectionModal: React.FC<{ sites: Site[], onClose: () => void, onSelect: (id: string, name: string) => void }> = ({ sites, onClose, onSelect }) => {
    return (
        <div className="aip-modal-overlay" onClick={onClose}>
            <div className="aip-modal-paper" style={{maxWidth:'360px'}} onClick={e=>e.stopPropagation()}>
                <div className="aip-modal-header">
                    <h3 className="aip-modal-title">현장 선택</h3>
                    <button onClick={onClose} style={{border:'none', background:'none', cursor:'pointer'}}><X size={20} /></button>
                </div>
                <div className="aip-modal-body" style={{padding:'0'}}>
                    {sites.map(s => (
                        <div key={s.id} onClick={()=>onSelect(s.id, s.name)} style={{padding:'16px 20px', borderBottom:'1px solid #eee', cursor:'pointer', transition:'background 0.2s'}} onMouseOver={e=>e.currentTarget.style.background='#f9fafb'} onMouseOut={e=>e.currentTarget.style.background='#fff'}>
                            <div style={{fontWeight:'bold', marginBottom:'4px'}}>{s.name}</div>
                            <div style={{fontSize:'12px', color:'#888'}}>{s.status}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const PaymentConnectionModal: React.FC<{ item: UnifiedItem, currentUserUid: string, onClose: () => void, onConfirm: (txId: string) => void }> = ({ item, currentUserUid, onClose, onConfirm }) => {
    return (
        <div className="aip-modal-overlay" onClick={onClose}>
            <div className="aip-modal-paper" style={{maxWidth:'400px'}}>
                <div className="aip-modal-header">
                    <h3 className="aip-modal-title">결제 연결</h3>
                    <button onClick={onClose} style={{border:'none', background:'none', cursor:'pointer'}}><X size={20} /></button>
                </div>
                <div className="aip-modal-body">
                    <p style={{color:'#666', marginBottom:'20px'}}>이 거래내역과 연결할 입출금 내역을 선택해주세요.</p>
                    <div style={{textAlign:'center', padding:'20px', background:'#f2f4f6', borderRadius:'8px', color:'#888'}}>
                        (뱅킹 연결 목록 컴포넌트 자리)
                    </div>
                </div>
                <div className="aip-modal-footer">
                    <button className="aip-btn" onClick={onClose} style={{background:'#fff', border:'1px solid #ddd', marginRight:'10px'}}>취소</button>
                </div>
            </div>
        </div>
    );
};

export default AccountingIntegratedPage;