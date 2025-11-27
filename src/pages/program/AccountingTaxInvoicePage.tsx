import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, getDoc,
  query, where, orderBy, limit, startAfter, 
  getAggregateFromServer, sum, count, DocumentSnapshot 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import './AccountingTaxInvoicePage.css'; 

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
  siteId?: string; category1?: string; category2?: string; remark2?: string;
  linkedTransactionId?: string; items?: any[]; approvalNo?: string;
}
interface Site { id: string; name: string; status: string; }

const LIMIT_PER_PAGE = 20;
const SITE_STATUSES = ['미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소', 'deleted'];
const PROCESS_CATEGORIES = ['목공', '전기', '설비', '타일', '도장', '도배', '바닥', '창호', '금속', '기타'];
const SALES_CATEGORIES = ['계약금', '중도금(기성)', '잔금', '설계비', '추가공사비', '기타'];

const AccountingTaxInvoicePage: React.FC = () => {
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
    const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 30); 
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUid(user.uid);
        
        // 유저 정보 가져오기
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if(userDoc.exists()) {
            const d = userDoc.data();
            // [수정] nickname 필드 사용
            setCurrentUserInfo({ 
                uid: user.uid, 
                name: d.nickname || d.email || '사용자' 
            });
        }

        fetchSites(user.uid);
        fetchExpenseCategories(user.uid); 
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

  // [NEW] 로그 함수 (정밀 포맷)
  const addDetailLog = async (item: TaxInvoice, actionSuffix: string) => {
      if (!currentUid) return;
      try {
          // 날짜 포맷: YYYY-MM-DD -> YYYY년 MM월 DD일
          const [y, m, d] = item.writeDate.split('-');
          const dateText = `${y}년 ${m}월 ${d}일`;
          
          const message = `[세금계산서] ${currentUserInfo.name}님이 ${dateText} 발행된 ${item.vendorName}의 ${item.inOut} 세금계산서${actionSuffix}`;
          
          await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), {
              text: message,
              createdAt: serverTimestamp(),
              type: 'tax_invoice_update'
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
            let q = query(colRef, where('writeDate', '>=', searchStartDate), where('writeDate', '<=', searchEndDate), orderBy('writeDate', 'desc'), limit(LIMIT_PER_PAGE * 2));
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
        const finalItems = newItems.slice(0, LIMIT_PER_PAGE);
        if (isReset) setList(finalItems); else setList(prev => [...prev, ...finalItems]);
        setLastSalesDoc(currentLastSales); setLastPurchaseDoc(currentLastPurchase);
        if (newItems.length === 0) setHasMore(false); else setHasMore(true);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const handleFieldChange = async (invoiceId: string, inOut: '매출'|'매입', field: string, value: string) => {
      if (!currentUid) return;
      
      // 변경 전 타겟 아이템 찾기 (로그용)
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
          
          // [LOG]
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
    const targetItem = list.find(item => item.id === invoiceId); // 로그용
    setList(prev => prev.map(item => item.id === invoiceId ? { ...item, linkedTransactionId: transactionId } : item));
    try {
        const collectionName = inOut === '매출' ? 'TAX_SALES' : 'TAX_PURCHASE';
        const docRef = doc(db, 'users', currentUid, collectionName, invoiceId);
        await updateDoc(docRef, { linkedTransactionId: transactionId });
        
        // [LOG]
        if (targetItem) await addDetailLog(targetItem, "를 이체내역과 연결 했습니다.");

        alert("결제 내역이 연결되었습니다.");
        setPaymentModalTarget(null);
    } catch (e) { console.error("연결 실패:", e); alert("오류 발생"); }
  };

  const yearOptions = Array.from({length: 21}, (_, i) => new Date().getFullYear() - i);
  const separatorStyle = { borderLeft: '1px solid #ccc', borderRight: '1px solid #ccc' };

  return (
    <div className="hometax-page-container">
      {/* UI는 기존과 100% 동일하므로 그대로 사용 */}
      <div className="hometax-header-wrapper">
          <div className="hometax-title"><h2>세금계산서 통합 조회</h2><p>매입/매출 내역을 조회하고 현장 및 공정을 분류할 수 있습니다. (기본: 최근 30일)</p></div>
          <div className="hometax-control-panel">
              <div className="mode-buttons">{['custom', 'month', 'quarter'].map(m => (<button key={m} className={`mode-btn ${dateMode === m ? 'active' : ''}`} onClick={() => setDateMode(m as any)}>{m === 'custom' ? '직접입력' : m === 'month' ? '월간' : '분기'}</button>))}</div>
              <div className="filter-row">
                  <div className="filter-item date-select">
                      {dateMode === 'custom' && (<><input type="date" value={searchStartDate} onChange={e=>setSearchStartDate(e.target.value)} /><span className="tilde">~</span><input type="date" value={searchEndDate} onChange={e=>setSearchEndDate(e.target.value)} /></>)}
                      {dateMode === 'month' && (<><select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}</select><select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}</select></>)}
                      {dateMode === 'quarter' && (<><select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}</select><select value={selQuarter} onChange={e=>setSelQuarter(Number(e.target.value))}>{[1,2,3,4].map(q => <option key={q} value={q}>{q}분기</option>)}</select></>)}
                  </div>
                  <div className="divider"></div>
                  <div className="filter-item"><select value={searchType} onChange={e=>setSearchType(e.target.value as any)}><option value="all">전체 구분</option><option value="매출">매출</option><option value="매입">매입</option></select></div>
                  <div className="filter-item" style={{marginLeft:'10px'}}><button onClick={() => setIsSiteModalOpen(true)} style={{padding:'0 15px', height:'38px', background:'#fff', border:'1px solid #ccc', borderRadius:'5px', cursor:'pointer', fontSize:'14px', display:'flex', alignItems:'center', gap:'5px'}}><span style={{fontSize:'16px'}}>🏗️</span> {searchSiteName}</button></div>
                  <div className="filter-item checkbox-group" style={{marginLeft:'10px', display:'flex', gap:'10px'}}><label style={{cursor:'pointer', fontSize:'14px', display:'flex', alignItems:'center'}}><input type="checkbox" checked={showUnassigned} onChange={e => setShowUnassigned(e.target.checked)} style={{marginRight:'5px'}} />미귀속</label><label style={{cursor:'pointer', fontSize:'14px', display:'flex', alignItems:'center'}}><input type="checkbox" checked={showAssigned} onChange={e => setShowAssigned(e.target.checked)} style={{marginRight:'5px'}} />귀속</label></div>
                  <div className="filter-item"><input type="text" placeholder="업체명 검색" value={searchVendor} onChange={e=>setSearchVendor(e.target.value)} style={{width: '150px'}} /></div>
                  <button className="btn-search" onClick={() => currentUid && fetchData(true)}>조회</button>
              </div>
          </div>
      </div>

      <div className="summary-section">
          <div className="summary-card sales"><div className="card-header">🔵 매출 합계 ({summary.salesCount}건)</div><div className="card-body"><div className="row"><span>공급가액</span> <strong>{summary.salesSupply.toLocaleString()}</strong></div><div className="row"><span>세액</span> <strong>{summary.salesTax.toLocaleString()}</strong></div><div className="row total"><span>합계금액</span> <strong>{summary.salesTotal.toLocaleString()}</strong></div></div></div>
          <div className="summary-card purchase"><div className="card-header">🔴 매입 합계 ({summary.purchaseCount}건)</div><div className="card-body"><div className="row"><span>공급가액</span> <strong>{summary.purchaseSupply.toLocaleString()}</strong></div><div className="row"><span>세액</span> <strong>{summary.purchaseTax.toLocaleString()}</strong></div><div className="row total"><span>합계금액</span> <strong>{summary.purchaseTotal.toLocaleString()}</strong></div></div></div>
      </div>

      <div className="hometax-result-section">
        <div className="result-table-wrapper">
          <table className="hometax-table">
            <thead>
              <tr>
                <th style={{width:'160px'}}>작성일자</th><th style={{width:'50px'}}>구분</th><th style={{width:'80px'}}>종류</th>
                <th style={{textAlign:'center', width:'140px'}}>거래처명</th>
                <th style={{textAlign:'center', width:'90px', ...separatorStyle, borderRight:'none'}}>공급가액</th>
                <th style={{textAlign:'center', width:'80px', ...separatorStyle, borderLeft:'none', borderRight:'none'}}>세액</th>
                <th style={{textAlign:'center', width:'90px', ...separatorStyle, borderLeft:'none'}}>합계금액</th>
                <th style={{width:'80px'}}>결제연결</th><th style={{width:'150px'}}>현장 귀속</th><th style={{width:'110px'}}>1차 분류</th><th style={{width:'110px'}}>2차 분류</th><th style={{width:'250px'}}>메모</th> 
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                loading ? (<tr><td colSpan={12} style={{textAlign:'center', padding:'50px'}}>데이터를 불러오는 중입니다...</td></tr>) : (<tr><td colSpan={12} className="no-data">조회된 내역이 없습니다.</td></tr>)
              ) : (
                list.map((item) => {
                  const isSiteAssigned = !!item.siteId; const isClassified = isSiteAssigned || (!!item.category1 && !!item.category2); const rowBgColor = isClassified ? '#e3f2fd' : '#ffebee';
                  const targetCategories = isSiteAssigned ? siteCategories : generalCategories;
                  const currentCat1 = targetCategories.find(c => c.name === item.category1);
                  const subCategories = currentCat1 ? currentCat1.subCategories : [];
                  const isPaid = !!item.linkedTransactionId;
                  return (
                    <tr key={item.id} style={{backgroundColor: rowBgColor}}>
                      <td style={{textAlign:'center'}}><div style={{display:'flex', alignItems:'center', justifyContent:'center'}}>{isPaid ? <span className="payment-status-badge paid">결제완료</span> : <span className="payment-status-badge unpaid">미결제</span>}<span style={{whiteSpace:'nowrap'}}>{item.writeDate}</span></div></td>
                      <td style={{textAlign:'center'}}><span className={`type-badge ${item.inOut === '매출' ? 'sales' : 'purchase'}`}>{item.inOut}</span></td>
                      <td style={{textAlign:'center', fontSize:'12px', color:'#666'}}>{item.type}</td>
                      <td className="vendor-name-cell" title={item.vendorName} onClick={() => setSelectedInvoice(item)} style={{textAlign: 'center', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{item.vendorName}</td>
                      <td style={{textAlign:'center', width:'90px', ...separatorStyle, borderRight:'none'}}>{item.supplyAmount.toLocaleString()}</td>
                      <td style={{textAlign:'center', width:'80px', color:'#888', ...separatorStyle, borderLeft:'none', borderRight:'none'}}>{item.taxAmount.toLocaleString()}</td>
                      <td style={{textAlign:'center', width:'90px', fontWeight:'bold', ...separatorStyle, borderLeft:'none'}}>{item.totalAmount.toLocaleString()}</td>
                      <td style={{textAlign:'center'}}><button className="btn-link-pay" onClick={() => setPaymentModalTarget(item)} style={{padding:'4px 8px', fontSize:'11px', borderRadius:'4px', border:'1px solid #ddd', background:'#fff', cursor:'pointer'}}>{item.linkedTransactionId ? '연결됨' : '연결'}</button></td>
                      <td style={{textAlign:'center'}}><select className="cell-select" value={item.siteId || ""} onChange={(e) => handleFieldChange(item.id, item.inOut, 'siteId', e.target.value)}><option value="">(미지정)</option>{siteList.map(site => (<option key={site.id} value={site.id}>{site.name}</option>))}</select></td>
                      <td style={{textAlign:'center'}}><select className="cell-select" value={item.category1 || ""} onChange={(e) => handleFieldChange(item.id, item.inOut, 'category1', e.target.value)} style={{fontSize:'13px'}}><option value="">{isSiteAssigned ? "(공정선택)" : "(계정선택)"}</option>{targetCategories.map(cat => (<option key={cat.name} value={cat.name}>{cat.name}</option>))}</select></td>
                      <td style={{textAlign:'center'}}><select className="cell-select" value={item.category2 || ""} onChange={(e) => handleFieldChange(item.id, item.inOut, 'category2', e.target.value)} style={{fontSize:'13px'}} disabled={!item.category1}><option value="">(상세)</option>{subCategories.map(sub => (<option key={sub} value={sub}>{sub}</option>))}</select></td>
                      <td><input type="text" className="cell-input memo" defaultValue={item.remark2 || ""} placeholder="메모 입력" onBlur={(e) => { if (e.target.value !== (item.remark2 || "")) handleFieldChange(item.id, item.inOut, 'remark2', e.target.value); }} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {hasMore && !loading && list.length > 0 && <div style={{display:'flex', justifyContent:'center', padding:'20px'}}><button onClick={() => fetchData(false)} style={{padding:'10px 40px', backgroundColor: K_BRAND_COLOR || '#1976d2', color:'#fff', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold', fontSize:'14px'}}>더보기 ({LIMIT_PER_PAGE}개 로드)</button></div>}
          {loading && list.length > 0 && <div style={{textAlign:'center', padding:'10px', color:'#666'}}>추가 데이터를 불러오는 중...</div>}
        </div>
      </div>

      {selectedInvoice && <TaxInvoiceModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} onUpdate={(field, value) => handleFieldChange(selectedInvoice.id, selectedInvoice.inOut, field, value)} />}
      {isSiteModalOpen && <SiteSelectionModal sites={siteList} onClose={() => setIsSiteModalOpen(false)} onSelect={(siteId, siteName) => { setSearchSiteId(siteId); setSearchSiteName(siteName); setIsSiteModalOpen(false); }} />}
      {paymentModalTarget && <PaymentConnectionModal invoice={paymentModalTarget} currentUserUid={currentUid || ''} onClose={() => setPaymentModalTarget(null)} onConfirm={(txId) => handleLinkTransaction(paymentModalTarget.id, paymentModalTarget.inOut, txId)} />}
    </div>
  );
};

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
            <div className="invoice-paper" onClick={e => e.stopPropagation()} style={{width: '700px', height:'600px', display:'flex', flexDirection:'column'}}>
                <div style={{borderBottom:'1px solid #eee', paddingBottom:'15px', marginBottom:'15px'}}><h3 style={{margin:0}}>결제 내역 연결</h3><p style={{margin:'5px 0 0 0', fontSize:'13px', color:'#666'}}>세금계산서: <strong>{invoice.writeDate} / {invoice.vendorName} / {invoice.totalAmount.toLocaleString()}원</strong></p></div>
                <div style={{background:'#f8f9fa', padding:'15px', borderRadius:'5px', marginBottom:'15px'}}>
                    <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}><input type="date" value={searchDateStart} onChange={e=>setSearchDateStart(e.target.value)} style={{padding:'5px', border:'1px solid #ddd', borderRadius:'4px'}} /><span>~</span><input type="date" value={searchDateEnd} onChange={e=>setSearchDateEnd(e.target.value)} style={{padding:'5px', border:'1px solid #ddd', borderRadius:'4px'}} /><button onClick={fetchTransactions} style={{padding:'5px 15px', background:'#333', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer'}}>조회</button></div>
                    <div style={{display:'flex', gap:'10px'}}><input type="text" placeholder="예금주/적요" value={searchKeyword} onChange={e=>setSearchKeyword(e.target.value)} style={{padding:'5px', border:'1px solid #ddd', borderRadius:'4px', flex:1}} /><input type="number" placeholder="금액" value={searchAmount} onChange={e=>setSearchAmount(e.target.value)} style={{padding:'5px', border:'1px solid #ddd', borderRadius:'4px', width:'120px'}} /></div>
                </div>
                <div style={{flex:1, overflowY:'auto', border:'1px solid #eee', borderRadius:'5px'}}><table className="hometax-table" style={{border:'none'}}><thead style={{position:'sticky', top:0, background:'#f1f1f1'}}><tr><th style={{width:'40px'}}>선택</th><th>거래일자</th><th>은행</th><th>적요/예금주</th><th>입/출금</th><th>금액</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={6} style={{textAlign:'center', padding:'30px'}}>조회 중...</td></tr> : transactions.length === 0 ? <tr><td colSpan={6} style={{textAlign:'center', padding:'30px'}}>조회된 거래내역이 없습니다.</td></tr> : transactions.map(tx => (<tr key={tx.id} onClick={() => setSelectedTxId(tx.id)} style={{cursor:'pointer', backgroundColor: selectedTxId === tx.id ? '#e3f2fd' : 'transparent'}}><td style={{textAlign:'center'}}><input type="radio" checked={selectedTxId === tx.id} onChange={() => setSelectedTxId(tx.id)} /></td><td style={{textAlign:'center'}}>{tx.date}</td><td style={{textAlign:'center'}}>{tx.bankName}</td><td style={{textAlign:'center'}}>{tx.content}</td><td style={{textAlign:'center', color: tx.inOut === '입금' ? 'blue' : 'red'}}>{tx.inOut}</td><td style={{textAlign:'right', fontWeight:'bold'}}>{tx.amount.toLocaleString()}</td></tr>))}</tbody></table></div>
                <div style={{marginTop:'20px', textAlign:'right', display:'flex', justifyContent:'flex-end', gap:'10px'}}><button onClick={onClose} className="btn-cancel">취소</button><button onClick={() => selectedTxId && onConfirm(selectedTxId)} className="btn-save" style={{background: K_BRAND_COLOR, opacity: selectedTxId ? 1 : 0.5, cursor: selectedTxId ? 'pointer' : 'not-allowed'}} disabled={!selectedTxId}>연결 확인</button></div>
            </div>
        </div>
    );
};

const SiteSelectionModal: React.FC<{ sites: Site[], onClose: () => void, onSelect: (id: string, name: string) => void }> = ({ sites, onClose, onSelect }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['공사중', '공사전', '미팅중', '계약대기', '계약완료']);
    const filteredSites = sites.filter(site => { const matchesSearch = site.name.toLowerCase().includes(searchTerm.toLowerCase()); const matchesStatus = selectedStatuses.includes(site.status); return matchesSearch && matchesStatus; });
    const handleStatusChange = (status: string) => { setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]); };
    return (
        <div className="invoice-modal-backdrop" onClick={onClose} style={{zIndex: 2000}}>
            <div className="invoice-paper" onClick={e => e.stopPropagation()} style={{width: '500px', maxHeight: '80vh', padding: '20px'}}>
                <div style={{borderBottom:'1px solid #eee', paddingBottom:'10px', marginBottom:'15px', display:'flex', justifyContent:'space-between', alignItems:'center'}}><h3 style={{margin:0}}>현장 선택</h3><button onClick={onClose} style={{border:'none', background:'transparent', fontSize:'20px', cursor:'pointer'}}>×</button></div>
                <div style={{marginBottom:'15px'}}><input type="text" placeholder="현장명 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{width:'100%', padding:'8px', borderRadius:'5px', border:'1px solid #ddd'}} /></div>
                <div style={{marginBottom:'15px', display:'flex', flexWrap:'wrap', gap:'8px'}}>{SITE_STATUSES.map(status => (<label key={status} style={{fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', padding:'4px 8px', background:'#f5f5f5', borderRadius:'15px'}}><input type="checkbox" checked={selectedStatuses.includes(status)} onChange={() => handleStatusChange(status)} style={{marginRight:'4px'}} />{status}</label>))}</div>
                <div style={{height:'300px', overflowY:'auto', border:'1px solid #eee', borderRadius:'5px'}}><div onClick={() => onSelect('', '전체 현장')} style={{padding:'10px', borderBottom:'1px solid #eee', cursor:'pointer', fontWeight:'bold', background:'#f9f9f9'}}>🏢 전체 현장 보기</div>{filteredSites.length > 0 ? (filteredSites.map(site => (<div key={site.id} onClick={() => onSelect(site.id, site.name)} style={{padding:'10px', borderBottom:'1px solid #f0f0f0', cursor:'pointer', display:'flex', justifyContent:'space-between'}} onMouseOver={(e) => e.currentTarget.style.background = '#f0f8ff'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}><span>{site.name}</span><span style={{fontSize:'11px', color:'#888', background:'#eee', padding:'2px 6px', borderRadius:'4px'}}>{site.status}</span></div>))) : <div style={{padding:'20px', textAlign:'center', color:'#999'}}>검색된 현장이 없습니다.</div>}</div>
            </div>
        </div>
    );
};

const TaxInvoiceModal: React.FC<{ invoice: TaxInvoice; onClose: () => void; onUpdate: (field: string, value: string) => void; }> = ({ invoice, onClose, onUpdate }) => {
    const colorClass = invoice.inOut === '매출' ? 'red-theme' : 'blue-theme';
    const [memo, setMemo] = useState(invoice.remark2 || "");
    return (
        <div className="invoice-modal-backdrop" onClick={onClose}>
            <div className={`invoice-paper ${colorClass}`} onClick={e => e.stopPropagation()}>
                <div className="invoice-header"><h2>전자세금계산서 ({invoice.inOut})</h2><div className="approval-no">승인번호: {invoice.approvalNo} <br/><span style={{fontSize:'11px', color:'#888'}}>({invoice.issueType})</span></div></div>
                <div className="invoice-body">
                    <table className="invoice-table info-table"><tbody><tr><td rowSpan={4} className="center-header writing-mode-vertical">공<br/>급<br/>자</td><td className="label">등록번호</td><td className="content highlight">{invoice.vendorRegNo}</td><td rowSpan={4} className="center-header writing-mode-vertical">공<br/>급<br/>받<br/>는<br/>자</td><td className="label">등록번호</td><td className="content highlight">{invoice.buyerRegNo}</td></tr><tr><td className="label">상호</td><td className="content">{invoice.vendorName}</td><td className="label">상호</td><td className="content">{invoice.buyerName}</td></tr><tr><td className="label">성명</td><td className="content">{invoice.vendorCeo}</td><td className="label">성명</td><td className="content">{invoice.buyerCeo}</td></tr><tr><td className="label">주소</td><td className="content" style={{fontSize:'11px'}}>{invoice.vendorAddr}</td><td className="label">주소</td><td className="content" style={{fontSize:'11px'}}>{invoice.buyerAddr}</td></tr></tbody></table>
                    <table className="invoice-table sum-table"><thead><tr><th>작성일자</th><th>공급가액</th><th>세액</th><th>비고 (홈택스)</th></tr></thead><tbody><tr><td style={{textAlign:'center'}}>{invoice.writeDate}</td><td style={{textAlign:'right'}}>{invoice.supplyAmount.toLocaleString()}</td><td style={{textAlign:'right'}}>{invoice.taxAmount.toLocaleString()}</td><td>{invoice.remark}</td></tr></tbody></table>
                    <div className="items-container"><table className="invoice-table items-table"><thead><tr><th style={{width:'50px'}}>월/일</th><th>품목</th><th style={{width:'60px'}}>규격</th><th style={{width:'40px'}}>수량</th><th style={{width:'70px'}}>단가</th><th style={{width:'90px'}}>공급가액</th><th style={{width:'70px'}}>세액</th><th>비고</th></tr></thead><tbody>{invoice.items && invoice.items.length > 0 ? (invoice.items.map((item, idx) => (<tr key={idx}><td style={{textAlign:'center'}}>{item.date ? item.date.substring(5) : ''}</td><td>{item.itemName}</td><td style={{textAlign:'center'}}>{item.spec}</td><td style={{textAlign:'right'}}>{item.qty !== '0' ? item.qty : ''}</td><td style={{textAlign:'right'}}>{item.unitPrice > 0 ? item.unitPrice.toLocaleString() : ''}</td><td style={{textAlign:'right'}}>{item.supplyAmount.toLocaleString()}</td><td style={{textAlign:'right'}}>{item.taxAmount.toLocaleString()}</td><td>{item.remark}</td></tr>))) : (<tr><td style={{textAlign:'center'}}>{invoice.writeDate.substring(5)}</td><td>(품목상세 없음)</td><td></td><td></td><td></td><td style={{textAlign:'right'}}>{invoice.supplyAmount.toLocaleString()}</td><td style={{textAlign:'right'}}>{invoice.taxAmount.toLocaleString()}</td><td></td></tr>)}</tbody></table></div>
                    <div className="invoice-footer-section"><div className="total-row"><span>합계금액</span><strong>{invoice.totalAmount.toLocaleString()} 원</strong></div><div className="remarks-row"><div className="remark-box"><label>비고 (홈택스)</label><div className="text-content">{invoice.remark || "(비고 없음)"}</div></div><div className="remark-box user-memo"><label>메모</label><textarea className="memo-input" placeholder="사용자 메모 입력..." value={memo} onChange={(e) => setMemo(e.target.value)} onBlur={() => { if (memo !== invoice.remark2) onUpdate('remark2', memo); }} /></div></div></div>
                </div>
                <div className="modal-close-btn"><button onClick={onClose}>닫기</button></div>
            </div>
        </div>
    );
};

export default AccountingTaxInvoicePage;