import React, { useEffect, useState, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, getDoc,
  query, where, orderBy, limit, startAfter, DocumentSnapshot 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom'; 
import { firebaseConfig } from '../../firebase-config';
import './AccountingTaxInvoicePage.css'; 

import AccountingManualSalesPage from './AccountingManualSalesPage';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

interface CategoryData { name: string; subCategories: string[]; }
export interface BankTransaction { id: string; date: string; content: string; amount: number; inOut: '입금' | '출금'; bankName: string; }
export interface TaxInvoice {
  id: string; writeDate: string; type: string; inOut: '매출' | '매입'; issueType?: string;
  vendorName: string; vendorRegNo?: string; vendorCeo?: string; vendorAddr?: string;
  buyerName?: string; buyerRegNo?: string; buyerCeo?: string; buyerAddr?: string;
  supplyAmount: number; taxAmount: number; totalAmount: number; remark: string;
  siteId?: string; category1?: string; category2?: string; category2_manual?: string; remark2?: string;
  linkedTransactionId?: string; items?: any[]; approvalNo?: string;
}
interface Site { id: string; name: string; status: string; }

const LIMIT_PER_PAGE = 100;

const AccountingTaxInvoicePage: React.FC = () => {
  const navigate = useNavigate(); 
  const [list, setList] = useState<TaxInvoice[]>([]);
  const [siteList, setSiteList] = useState<Site[]>([]);
  const [siteCategories, setSiteCategories] = useState<CategoryData[]>([]);
  const [generalCategories, setGeneralCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});
  
  const [lastSalesDoc, setLastSalesDoc] = useState<DocumentSnapshot | null>(null);
  const [lastPurchaseDoc, setLastPurchaseDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const getDefaultDates = () => {
    const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 90); 
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  };
  const [searchStartDate, setSearchStartDate] = useState(getDefaultDates().start);
  const [searchEndDate, setSearchEndDate] = useState(getDefaultDates().end);
  
  const [searchType, setSearchType] = useState<'all' | '매출' | '매입'>('all');
  const [searchVendor, setSearchVendor] = useState('');
  const [searchSiteId, setSearchSiteId] = useState<string>(''); 
  const [searchSiteName, setSearchSiteName] = useState<string>('전체 현장');
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [showAssigned, setShowAssigned] = useState(true);
  const [dateMode, setDateMode] = useState<'custom' | 'month' | 'quarter'>('custom');
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1);
  const [selQuarter, setSelQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));

  const [selectedInvoice, setSelectedInvoice] = useState<TaxInvoice | null>(null);
  const [paymentModalTarget, setPaymentModalTarget] = useState<TaxInvoice | null>(null);
  const [summary, setSummary] = useState({ salesCount: 0, salesSupply: 0, salesTax: 0, salesTotal: 0, purchaseCount: 0, purchaseSupply: 0, purchaseTax: 0, purchaseTotal: 0 });

  const [isManualSelectOpen, setIsManualSelectOpen] = useState(false);
  const [manualModalType, setManualModalType] = useState<'sales' | 'purchase' | null>(null);

  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!loading && list.length > 0) {
      setTimeout(() => {
        observerRef.current = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add('ati-active');
          });
        }, { threshold: 0.05 });

        const targets = document.querySelectorAll('.ati-fade-up');
        targets.forEach(el => observerRef.current?.observe(el));
      }, 100);
    }
    return () => observerRef.current?.disconnect();
  }, [loading, list]);

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
        } catch (e) { console.error("사용자 정보 로드 실패", e); }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => { if (currentUid) { fetchData(true); fetchSummary(); } }, [currentUid, searchStartDate, searchEndDate, searchType, showUnassigned, showAssigned, searchSiteId]);
  useEffect(() => { if(currentUid) fetchData(true); }, [searchVendor]);

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

  const addDetailLog = async (item: TaxInvoice, actionSuffix: string) => {
      if (!currentUid) return;
      try {
          const [y, m, d] = item.writeDate.split('-');
          const dateText = `${y}년 ${m}월 ${d}일`;
          const message = `[세금계산서] ${currentUserInfo.name}님이 ${dateText} 발행된 ${item.vendorName}의 ${item.inOut} 세금계산서${actionSuffix}`;
          await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), {
              text: message, createdAt: serverTimestamp(), type: 'tax_invoice_update'
          });
      } catch (e) {}
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
  
  const fetchSummary = async () => { if (!currentUid) return; await calculateSummaryManually(); };
  
  const calculateSummaryManually = async () => {
      if (!currentUid) return;
      const createQuery = (colName: string) => query(collection(db, 'users', currentUid, colName), where('writeDate', '>=', searchStartDate), where('writeDate', '<=', searchEndDate));
      let sCount=0, sSupply=0, sTax=0, sTotal=0; let pCount=0, pSupply=0, pTax=0, pTotal=0;
      const calc = (snap: any, isSales: boolean) => {
          snap.forEach((d: any) => {
              const v = d.data();
              const itemSiteId = v.siteId || '';
              const isAssigned = !!itemSiteId; 
              const isCompleted = isAssigned || (!!v.category1 && !!v.category2);
              if (searchSiteId && itemSiteId !== searchSiteId) return;
              if (!searchSiteId) {
                  if (!showUnassigned && !isCompleted) return; 
                  if (!showAssigned && isCompleted) return;    
              }
              const supply = Number(v.supplyAmount) || 0; const tax = Number(v.taxAmount) || 0; const total = Number(v.totalAmount) || 0;
              if (isSales) { sCount++; sSupply+=supply; sTax+=tax; sTotal+=total; } else { pCount++; pSupply+=supply; pTax+=tax; pTotal+=total; }
          });
      };
      if (searchType === 'all' || searchType === '매출') { const snap = await getDocs(createQuery('TAX_SALES')); calc(snap, true); }
      if (searchType === 'all' || searchType === '매입') { const snap = await getDocs(createQuery('TAX_PURCHASE')); calc(snap, false); }
      setSummary({ salesCount: sCount, salesSupply: sSupply, salesTax: sTax, salesTotal: sTotal, purchaseCount: pCount, purchaseSupply: pSupply, purchaseTax: pTax, purchaseTotal: pTotal });
  };

  const fetchData = async (isReset: boolean) => {
    if (!currentUid) return;
    setLoading(true);
    try {
        const newItems: TaxInvoice[] = [];
        let currentLastSales = isReset ? null : lastSalesDoc;
        let currentLastPurchase = isReset ? null : lastPurchaseDoc;
        if (isReset) { setList([]); setHasMore(true); }

        const createListQuery = (collectionName: string, lastDoc: DocumentSnapshot | null) => {
            const colRef = collection(db, 'users', currentUid, collectionName);
            let q = query(colRef, where('writeDate', '>=', searchStartDate), where('writeDate', '<=', searchEndDate), orderBy('writeDate', 'desc'), limit(LIMIT_PER_PAGE));
            if (lastDoc) q = query(q, startAfter(lastDoc));
            return q;
        };
        const processSnapshot = (snap: any, inOut: '매출' | '매입') => {
            const items: TaxInvoice[] = [];
            snap.forEach((doc: any) => {
                const d = doc.data();
                if (searchVendor && !d.vendorName.includes(searchVendor)) return;
                if (searchSiteId && d.siteId !== searchSiteId) return;
                const isCompleted = !!d.siteId || (!!d.category1 && !!d.category2);
                if (!searchSiteId) {
                    if (!showUnassigned && !isCompleted) return;
                    if (!showAssigned && isCompleted) return;
                }
                items.push({
                    id: doc.id, writeDate: d.writeDate, type: d.type, inOut: inOut, vendorName: d.vendorName, vendorRegNo: d.vendorRegNo,
                    vendorCeo: d.vendorCeo, vendorAddr: d.vendorAddr, buyerName: d.buyerName, buyerRegNo: d.buyerRegNo, buyerCeo: d.buyerCeo, buyerAddr: d.buyerAddr,
                    approvalNo: d.approvalNo, items: d.items || [], supplyAmount: Number(d.supplyAmount), taxAmount: Number(d.taxAmount), totalAmount: Number(d.totalAmount),
                    remark: d.remark, siteId: d.siteId || '', category1: d.category1 || '', category2: d.category2 || '', remark2: d.remark2 || '', issueType: d.issueType, linkedTransactionId: d.linkedTransactionId || ''
                } as TaxInvoice);
            });
            return items;
        };
        if (searchType === 'all' || searchType === '매출') {
            const sSnap = await getDocs(createListQuery('TAX_SALES', currentLastSales)); 
            if (!sSnap.empty) currentLastSales = sSnap.docs[sSnap.docs.length - 1];
            newItems.push(...processSnapshot(sSnap, '매출'));
        }
        if (searchType === 'all' || searchType === '매입') {
            const pSnap = await getDocs(createListQuery('TAX_PURCHASE', currentLastPurchase)); 
            if (!pSnap.empty) currentLastPurchase = pSnap.docs[pSnap.docs.length - 1];
            newItems.push(...processSnapshot(pSnap, '매입'));
        }
        newItems.sort((a, b) => new Date(b.writeDate).getTime() - new Date(a.writeDate).getTime());
        
        const finalItems = newItems; 
        
        if (isReset) setList(finalItems); else setList(prev => [...prev, ...finalItems]);
        setLastSalesDoc(currentLastSales); setLastPurchaseDoc(currentLastPurchase);
        if (newItems.length === 0) setHasMore(false); else setHasMore(true);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const handleFieldChange = async (invoiceId: string, inOut: '매출'|'매입', field: string, value: string) => {
      if (!currentUid) return;
      
      const targetItem = list.find(item => item.id === invoiceId);

      setList(prev => prev.map(item => {
          if (item.id !== invoiceId) return item;
          const newItem = { ...item, [field]: value };
          if (field === 'category1') newItem.category2 = ''; 
          if (field === 'siteId') { newItem.category1 = ''; newItem.category2 = ''; }
          return newItem;
      }));
      try {
          const collectionName = inOut === '매출' ? 'TAX_SALES' : 'TAX_PURCHASE';
          const docRef = doc(db, 'users', currentUid, collectionName, invoiceId);
          const updateData: any = { [field]: value };
          if (field === 'category1') updateData.category2 = '';
          if (field === 'siteId') { updateData.category1 = ''; updateData.category2 = ''; }
          await updateDoc(docRef, updateData);
          
          if (targetItem) {
              if (field === 'siteId') await addDetailLog(targetItem, "에 현장 귀속을 지정했습니다.");
              if (field === 'category1') await addDetailLog(targetItem, "의 1차 분류를 지정했습니다.");
              if (field === 'category2') await addDetailLog(targetItem, "의 2차 분류를 지정했습니다.");
              if (field === 'remark2') await addDetailLog(targetItem, "에 메모를 남겼습니다.");
          }

          if (field === 'siteId' || field === 'category1' || field === 'category2') fetchSummary();
      } catch (e) { console.error("저장 실패:", e); }
  };

  const handleLinkTransaction = async (invoiceId: string, inOut: '매출'|'매입', transactionId: string) => {
    if (!currentUid) return;
    const targetItem = list.find(item => item.id === invoiceId); 
    setList(prev => prev.map(item => item.id === invoiceId ? { ...item, linkedTransactionId: transactionId } : item));
    try {
        const collectionName = inOut === '매출' ? 'TAX_SALES' : 'TAX_PURCHASE';
        const docRef = doc(db, 'users', currentUid, collectionName, invoiceId);
        await updateDoc(docRef, { linkedTransactionId: transactionId });
        if (targetItem) await addDetailLog(targetItem, "를 이체내역과 연결 했습니다.");
        alert("결제 내역이 연결되었습니다.");
        setPaymentModalTarget(null);
    } catch (e) { console.error("연결 실패:", e); alert("오류 발생"); }
  };

  const yearOptions = Array.from({length: 21}, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="ati-container">
      <div className="ati-header">
          <div className="ati-title-area">
            <h2>세금계산서 통합 조회</h2>
            <p>매입/매출 내역 조회 및 분류 관리</p>
          </div>
          
          <div className="ati-controls">
              <div className="ati-filter-bar">
                  <div className="filter-group date-group">
                     <div className="mode-select">
                       {['custom', 'month', 'quarter'].map(m => (
                         <button key={m} className={`mode-btn ${dateMode === m ? 'active' : ''}`} onClick={() => setDateMode(m as any)}>
                           {m === 'custom' ? '직접' : m === 'month' ? '월간' : '분기'}
                         </button>
                       ))}
                     </div>
                     <div className="date-inputs">
                        {dateMode === 'custom' && (<><input type="date" value={searchStartDate} onChange={e=>setSearchStartDate(e.target.value)} /><span>~</span><input type="date" value={searchEndDate} onChange={e=>setSearchEndDate(e.target.value)} /></>)}
                        {dateMode === 'month' && (<><select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}</select><select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}</select></>)}
                        {dateMode === 'quarter' && (<><select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}</select><select value={selQuarter} onChange={e=>setSelQuarter(Number(e.target.value))}>{[1,2,3,4].map(q => <option key={q} value={q}>{q}분기</option>)}</select></>)}
                     </div>
                  </div>

                  <div className="filter-group option-group">
                      <select value={searchType} onChange={e=>setSearchType(e.target.value as any)} className="filter-select">
                        <option value="all">전체 구분</option><option value="매출">매출</option><option value="매입">매입</option>
                      </select>
                      
                      <button onClick={() => setIsSiteModalOpen(true)} className="btn-site-select">
                        🏢 {searchSiteName}
                      </button>
                      
                      <div className="check-group">
                         <label><input type="checkbox" checked={showUnassigned} onChange={e => setShowUnassigned(e.target.checked)} />미귀속</label>
                         <label><input type="checkbox" checked={showAssigned} onChange={e => setShowAssigned(e.target.checked)} />귀속</label>
                      </div>
                      
                      <input type="text" className="search-input" placeholder="업체명 검색" value={searchVendor} onChange={e=>setSearchVendor(e.target.value)} />
                  </div>

                  <div className="filter-group action-group">
                     <button className="btn-manual" onClick={() => setIsManualSelectOpen(true)}>+ 수기 등록</button>
                     <button className="btn-search" onClick={() => currentUid && fetchData(true)}>조회</button>
                  </div>
              </div>
          </div>
      </div>

      {/* 요약 카드 */}
      <div className="ati-summary">
          <div className="summary-card sales">
              <div className="card-icon">🔵</div>
              <div className="card-content">
                 <span className="card-label">매출 합계 ({summary.salesCount}건)</span>
                 <div className="card-values">
                    <div>공급: {summary.salesSupply.toLocaleString()}</div>
                    <div>세액: {summary.salesTax.toLocaleString()}</div>
                 </div>
                 <strong className="card-total">{summary.salesTotal.toLocaleString()} 원</strong>
              </div>
          </div>
          <div className="summary-card purchase">
              <div className="card-icon">🔴</div>
              <div className="card-content">
                 <span className="card-label">매입 합계 ({summary.purchaseCount}건)</span>
                 <div className="card-values">
                    <div>공급: {summary.purchaseSupply.toLocaleString()}</div>
                    <div>세액: {summary.purchaseTax.toLocaleString()}</div>
                 </div>
                 <strong className="card-total">{summary.purchaseTotal.toLocaleString()} 원</strong>
              </div>
          </div>
      </div>

      {/* 메인 테이블/리스트 */}
      <div className="ati-list-wrapper">
        <div className="ati-table-container">
           <table className="ati-table">
             <thead>
               <tr>
                 <th className="th-date">작성일</th>
                 <th className="th-type">구분</th>
                 {/* [수정] 상호명 헤더 */}
                 <th className="th-vendor">상호(거래처)</th>
                 <th className="th-supply">공급가액</th>
                 <th className="th-tax">세액</th>
                 <th className="th-total">합계금액</th>
                 <th className="th-link">결제</th>
                 <th className="th-site">현장</th>
                 <th className="th-cat1">1차분류</th>
                 <th className="th-cat2">2차분류</th>
                 <th className="th-memo">메모</th>
               </tr>
             </thead>
             <tbody>
               {list.length === 0 ? (
                 loading ? <tr><td colSpan={11} className="ati-msg">데이터 로딩 중...</td></tr> : <tr><td colSpan={11} className="ati-msg">조회된 내역이 없습니다.</td></tr>
               ) : (
                 list.map((item, index) => {
                   const isSiteAssigned = !!item.siteId; 
                   const isClassified = isSiteAssigned || (!!item.category1 && !!item.category2);
                   
                   const targetCategories = isSiteAssigned ? siteCategories : generalCategories;
                   const currentCat1 = targetCategories.find(c => c.name === item.category1);
                   const subCategories = currentCat1 ? currentCat1.subCategories : [];
                   const isPaid = !!item.linkedTransactionId;
                   
                   // [수정] 리스트 상호명 결정 로직 (매출->공급받는자, 매입->공급자)
                   const displayCompanyName = item.inOut === '매출' ? (item.buyerName || '이름없음') : (item.vendorName || '이름없음');

                   // [수정] 배경색 클래스 결정 (귀속/미귀속)
                   const rowClass = isClassified ? 'row-assigned' : 'row-unassigned';

                   return (
                     <tr 
                        key={item.id} 
                        className={`ati-fade-up ${rowClass}`} 
                        style={{transitionDelay: `${index * 0.01}s`}}
                     >
                        <td data-label="작성일" className="td-date">
                            <div className="date-wrap">
                                <span className={`status-dot ${isPaid ? 'paid' : 'unpaid'}`}></span>
                                {item.writeDate}
                            </div>
                        </td>
                        <td data-label="구분" className="td-type">
                           <span className={`badge-type ${item.inOut === '매출' ? 'sales' : 'purchase'}`}>{item.inOut}</span>
                           <span className="sub-type">{item.type}</span>
                        </td>
                        
                        <td data-label="상호" className="td-vendor" onClick={() => setSelectedInvoice(item)} title={displayCompanyName}>
                           {displayCompanyName}
                        </td>
                        
                        <td data-label="공급가액" className="td-right">{item.supplyAmount.toLocaleString()}</td>
                        <td data-label="세액" className="td-right text-gray">{item.taxAmount.toLocaleString()}</td>
                        <td data-label="합계" className="td-right font-bold">{item.totalAmount.toLocaleString()}</td>
                        <td data-label="결제" className="td-center">
                            <button className={`btn-link ${item.linkedTransactionId ? 'linked' : ''}`} onClick={() => setPaymentModalTarget(item)}>
                                {item.linkedTransactionId ? '완료' : '연결'}
                            </button>
                        </td>
                        <td data-label="현장" className="td-site">
                            <select className="ati-select" value={item.siteId || ""} onChange={(e) => handleFieldChange(item.id, item.inOut, 'siteId', e.target.value)}>
                                <option value="">(미지정)</option>
                                {siteList.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                            </select>
                        </td>
                        <td data-label="1차분류" className="td-cat1">
                            <select className="ati-select" value={item.category1 || ""} onChange={(e) => handleFieldChange(item.id, item.inOut, 'category1', e.target.value)}>
                                <option value="">{isSiteAssigned ? "공정선택" : "계정선택"}</option>
                                {targetCategories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                            </select>
                        </td>
                        <td data-label="2차분류" className="td-cat2">
                            <select className="ati-select" value={item.category2 || ""} onChange={(e) => handleFieldChange(item.id, item.inOut, 'category2', e.target.value)} disabled={!item.category1}>
                                <option value="">상세</option>
                                {subCategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                            </select>
                        </td>
                        <td data-label="메모" className="td-memo">
                            <input type="text" className="ati-input" defaultValue={item.remark2 || ""} placeholder="입력.." onBlur={(e) => { if (e.target.value !== (item.remark2 || "")) handleFieldChange(item.id, item.inOut, 'remark2', e.target.value); }} />
                        </td>
                     </tr>
                   );
                 })
               )}
             </tbody>
           </table>
        </div>
        
        {hasMore && !loading && list.length > 0 && (
            <div className="ati-more-btn-wrap">
                <button className="btn-more" onClick={() => fetchData(false)}>+ 더보기</button>
            </div>
        )}
      </div>

      {/* 세금계산서 상세 모달 (복구됨) */}
      {selectedInvoice && <TaxInvoiceModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} onUpdate={(field, value) => handleFieldChange(selectedInvoice.id, selectedInvoice.inOut, field, value)} />}
      
      {isSiteModalOpen && <SiteSelectionModal sites={siteList} onClose={() => setIsSiteModalOpen(false)} onSelect={(siteId, siteName) => { setSearchSiteId(siteId); setSearchSiteName(siteName); setIsSiteModalOpen(false); }} />}
      {paymentModalTarget && <PaymentConnectionModal invoice={paymentModalTarget} currentUserUid={currentUid || ''} onClose={() => setPaymentModalTarget(null)} onConfirm={(txId) => handleLinkTransaction(paymentModalTarget.id, paymentModalTarget.inOut, txId)} />}
      
      {isManualSelectOpen && (
        <div className="invoice-modal-backdrop" onClick={() => setIsManualSelectOpen(false)}>
            <div className="invoice-paper manual-select-modal" onClick={e => e.stopPropagation()}>
                <h3>수기 자료 등록</h3>
                <div className="manual-btns">
                    <button onClick={() => { setIsManualSelectOpen(false); setManualModalType('sales'); }} className="manual-btn sales">매출 자료</button>
                    <button onClick={() => { setIsManualSelectOpen(false); setManualModalType('purchase'); }} className="manual-btn purchase">매입 자료</button>
                </div>
            </div>
        </div>
      )}

      {manualModalType && currentUid && (
        <AccountingManualSalesPage 
          isOpen={true} onClose={() => setManualModalType(null)}
          currentUserUid={currentUid} userName={currentUserInfo.name} type={manualModalType}
        />
      )}
    </div>
  );
};

// [수정] 종이 세금계산서 스타일 모달
const TaxInvoiceModal: React.FC<{ invoice: TaxInvoice; onClose: () => void; onUpdate: (field: string, value: string) => void; }> = ({ invoice, onClose, onUpdate }) => {
    const colorTheme = invoice.inOut === '매출' ? 'red-theme' : 'blue-theme';
    const [memo, setMemo] = useState(invoice.remark2 || "");

    return (
        <div className="invoice-modal-backdrop" onClick={onClose}>
            <div className={`invoice-paper ${colorTheme}`} onClick={e => e.stopPropagation()}>
                
                <div className="invoice-header-row">
                   <h2 className="invoice-title">전자세금계산서 ({invoice.inOut === '매출' ? '공급자 보관용' : '공급받는자 보관용'})</h2>
                   <div className="invoice-approval">
                       <span>책 번 호: {invoice.approvalNo}</span><br/>
                       <span>일련번호: {invoice.issueType || ''}</span>
                   </div>
                </div>

                <div className="invoice-body-content">
                    <div className="invoice-parties">
                        {/* 공급자 */}
                        <table className="party-table">
                            <tbody>
                                <tr>
                                    <td rowSpan={4} className="vertical-text center">공<br/>급<br/>자</td>
                                    <td className="label">등록번호</td>
                                    <td colSpan={3} className="value highlight">{invoice.vendorRegNo}</td>
                                </tr>
                                <tr>
                                    <td className="label">상 호</td>
                                    <td className="value">{invoice.vendorName}</td>
                                    <td className="label">성 명</td>
                                    <td className="value">{invoice.vendorCeo}</td>
                                </tr>
                                <tr>
                                    <td className="label">주 소</td>
                                    <td colSpan={3} className="value">{invoice.vendorAddr}</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* 공급받는자 */}
                        <table className="party-table">
                            <tbody>
                                <tr>
                                    <td rowSpan={4} className="vertical-text center">공<br/>급<br/>받<br/>는<br/>자</td>
                                    <td className="label">등록번호</td>
                                    <td colSpan={3} className="value highlight">{invoice.buyerRegNo}</td>
                                </tr>
                                <tr>
                                    <td className="label">상 호</td>
                                    <td className="value">{invoice.buyerName}</td>
                                    <td className="label">성 명</td>
                                    <td className="value">{invoice.buyerCeo}</td>
                                </tr>
                                <tr>
                                    <td className="label">주 소</td>
                                    <td colSpan={3} className="value">{invoice.buyerAddr}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <table className="summary-table">
                        <thead>
                            <tr>
                                <th>작성일자</th><th>공급가액</th><th>세 액</th><th>비 고</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="center">{invoice.writeDate}</td>
                                <td className="right">{invoice.supplyAmount.toLocaleString()}</td>
                                <td className="right">{invoice.taxAmount.toLocaleString()}</td>
                                <td className="center">{invoice.remark}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="items-wrapper">
                        <table className="items-table">
                            <thead>
                                <tr>
                                    <th>월/일</th><th>품 목</th><th>규 격</th><th>수 량</th><th>단 가</th><th>공급가액</th><th>세 액</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoice.items && invoice.items.length > 0 ? (
                                    invoice.items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="center">{item.date ? item.date.substring(5) : ''}</td>
                                            <td>{item.itemName}</td>
                                            <td className="center">{item.spec}</td>
                                            <td className="right">{item.qty !== '0' ? item.qty : ''}</td>
                                            <td className="right">{item.unitPrice > 0 ? Number(item.unitPrice).toLocaleString() : ''}</td>
                                            <td className="right">{Number(item.supplyAmount).toLocaleString()}</td>
                                            <td className="right">{Number(item.taxAmount).toLocaleString()}</td>
                                        </tr>
                                    ))
                                ) : (
                                    Array.from({length: 4}).map((_, i) => (
                                        <tr key={i}><td className="center"></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="invoice-bottom">
                        <div className="total-box">
                            <span>합계금액 (현금/수표/어음/외상미수금)</span>
                            <strong>{invoice.totalAmount.toLocaleString()}</strong>
                        </div>
                        <div className="user-memo-box">
                            <label>사용자 메모</label>
                            <textarea 
                                className="memo-area" 
                                placeholder="여기에 메모를 입력하세요..." 
                                value={memo} 
                                onChange={(e) => setMemo(e.target.value)} 
                                onBlur={() => { if (memo !== invoice.remark2) onUpdate('remark2', memo); }} 
                            />
                        </div>
                    </div>
                </div>

                <div className="modal-close-btn">
                    <button onClick={onClose}>닫기</button>
                </div>
            </div>
        </div>
    );
};

// ... (PaymentConnectionModal, SiteSelectionModal 등은 기존과 동일하여 생략하거나 그대로 두셔도 됩니다) ...
// (전체 코드가 필요하면 이전 응답의 하단부 컴포넌트를 그대로 붙여넣으시면 됩니다.)
const PaymentConnectionModal: React.FC<{ invoice: TaxInvoice, currentUserUid: string, onClose: () => void, onConfirm: (transactionId: string) => void }> = ({ invoice, currentUserUid, onClose, onConfirm }) => {
    const [transactions, setTransactions] = useState<BankTransaction[]>([]);
    const [searchDateStart, setSearchDateStart] = useState(invoice.writeDate);
    const [searchDateEnd, setSearchDateEnd] = useState(invoice.writeDate);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchAmount, setSearchAmount] = useState<number | string>(invoice.totalAmount);
    const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    useEffect(() => { fetchTransactions(); }, []);
    const fetchTransactions = async () => {
        if (!currentUserUid) return;
        setIsLoading(true);
        try {
            const bankRef = collection(db, 'users', currentUserUid, 'BANK_TRANSACTIONS');
            let q = query(bankRef, where('date', '>=', searchDateStart), where('date', '<=', searchDateEnd));
            const snap = await getDocs(q);
            const list: BankTransaction[] = [];
            snap.forEach(doc => {
                const d = doc.data();
                if (searchAmount && Number(d.amount) !== Number(searchAmount)) return;
                if (searchKeyword && !d.content.includes(searchKeyword)) return;
                list.push({ id: doc.id, ...d } as BankTransaction);
            });
            setTransactions(list);
        } catch(e) { console.error(e); } finally { setIsLoading(false); }
    };
    return (
        <div className="invoice-modal-backdrop" onClick={onClose} style={{zIndex: 3000}}>
            <div className="invoice-paper" onClick={e => e.stopPropagation()} style={{width: '700px', height:'600px', display:'flex', flexDirection:'column', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'}}>
                <div style={{borderBottom:'1px solid #eee', paddingBottom:'15px', marginBottom:'15px'}}><h3 style={{margin:0}}>결제 내역 연결</h3></div>
                <div className="ati-filter-bar" style={{marginBottom:'15px'}}>
                    <input type="date" value={searchDateStart} onChange={e=>setSearchDateStart(e.target.value)} /> ~ <input type="date" value={searchDateEnd} onChange={e=>setSearchDateEnd(e.target.value)} />
                    <button onClick={fetchTransactions} className="btn-search" style={{padding:'5px 10px', height:'34px'}}>조회</button>
                </div>
                <div style={{flex:1, overflowY:'auto', border:'1px solid #eee'}}><table className="ati-table"><thead><tr><th style={{width:'40px'}}></th><th>날짜</th><th>은행</th><th>적요</th><th>금액</th></tr></thead><tbody>{transactions.map(tx => (<tr key={tx.id} onClick={() => setSelectedTxId(tx.id)} className={selectedTxId === tx.id ? 'selected-row' : ''}><td><input type="radio" checked={selectedTxId === tx.id} readOnly /></td><td>{tx.date}</td><td>{tx.bankName}</td><td>{tx.content}</td><td style={{textAlign:'right'}}>{tx.amount.toLocaleString()}</td></tr>))}</tbody></table></div>
                <div style={{marginTop:'20px', textAlign:'right'}}><button onClick={onClose} className="btn-cancel">취소</button><button onClick={() => selectedTxId && onConfirm(selectedTxId)} className="btn-save" disabled={!selectedTxId} style={{marginLeft:'10px'}}>확인</button></div>
            </div>
        </div>
    );
};

const SiteSelectionModal: React.FC<{ sites: Site[], onClose: () => void, onSelect: (id: string, name: string) => void }> = ({ sites, onClose, onSelect }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredSites = sites.filter(site => site.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return (
        <div className="invoice-modal-backdrop" onClick={onClose}>
            <div className="invoice-paper" onClick={e => e.stopPropagation()} style={{width: '400px', maxHeight: '70vh', display:'flex', flexDirection:'column', border: 'none'}}>
                 <h3>현장 선택</h3>
                 <input type="text" placeholder="현장명 검색" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="ati-input" style={{marginBottom:'10px'}} />
                 <div style={{flex:1, overflowY:'auto'}}>
                    <div onClick={() => onSelect('', '전체 현장')} className="site-item">🏢 전체 현장</div>
                    {filteredSites.map(s => <div key={s.id} onClick={() => onSelect(s.id, s.name)} className="site-item">{s.name}</div>)}
                 </div>
            </div>
        </div>
    );
};

export default AccountingTaxInvoicePage;