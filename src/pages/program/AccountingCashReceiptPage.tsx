import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, updateDoc, 
  query, where, orderBy, limit, startAfter, 
  getAggregateFromServer, sum, count, DocumentSnapshot 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import './AccountingTaxInvoicePage.css'; // CSS 재사용

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// =============================================================================
// [Interfaces]
// =============================================================================

export interface CashReceipt {
  id: string; 
  tradeDate: string;        
  type: string;             
  inOut: '매출' | '매입'; 
  
  approvalNo: string;       
  
  franchiseName: string;    
  franchiseRegNo?: string;  
  
  supplyAmount: number;     
  taxAmount: number;        
  serviceAmount: number;    
  totalAmount: number;      
  
  remark?: string;          
  
  siteId?: string; 
  processCategory?: string;
  salesCategory?: string;
  remark2?: string;         
}

// [수정] status 추가
interface Site {
  id: string;
  name: string;
  status: string;
}

// 현장 상태 목록
const SITE_STATUSES = ['미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소', 'deleted'];

const PROCESS_CATEGORIES = ['식대', '자재', '잡비', '회식', '교통비', '비품', '기타'];
const SALES_CATEGORIES = ['현금매출', '기타'];
const LIMIT_PER_PAGE = 20;

// =============================================================================
// [Main Component]
// =============================================================================

const AccountingCashReceiptPage: React.FC = () => {
  const [list, setList] = useState<CashReceipt[]>([]);
  const [siteList, setSiteList] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  const [lastSalesDoc, setLastSalesDoc] = useState<DocumentSnapshot | null>(null);
  const [lastPurchaseDoc, setLastPurchaseDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30); 
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
    };
  };

  const [searchStartDate, setSearchStartDate] = useState(getDefaultDates().start);
  const [searchEndDate, setSearchEndDate] = useState(getDefaultDates().end);
  const [searchType, setSearchType] = useState<'all' | '매출' | '매입'>('all');
  const [searchVendor, setSearchVendor] = useState('');

  // [NEW] 현장 선택 관련 상태
  const [searchSiteId, setSearchSiteId] = useState<string>(''); 
  const [searchSiteName, setSearchSiteName] = useState<string>('전체 현장');
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);

  // 귀속/미귀속 필터
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [showAssigned, setShowAssigned] = useState(true);

  const [dateMode, setDateMode] = useState<'custom' | 'month' | 'quarter'>('custom');
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1);
  const [selQuarter, setSelQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));

  const [selectedReceipt, setSelectedReceipt] = useState<CashReceipt | null>(null);

  const [summary, setSummary] = useState({
    salesCount: 0, salesSupply: 0, salesTax: 0, salesTotal: 0,
    purchaseCount: 0, purchaseSupply: 0, purchaseTax: 0, purchaseTotal: 0
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUid(user.uid);
        fetchSites(user.uid);
      } else {
        setCurrentUid(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // 필터 변경 시 재조회 (현장 필터 추가됨)
  useEffect(() => {
    if (currentUid) {
        fetchData(true);    
        fetchSummary();     
    }
  }, [currentUid, searchStartDate, searchEndDate, searchType, showUnassigned, showAssigned, searchSiteId]);

  useEffect(() => {
      if(currentUid) fetchData(true);
  }, [searchVendor]);

  useEffect(() => {
    if (dateMode === 'custom') return;
    let start = '';
    let end = '';
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

    setSearchStartDate(start);
    setSearchEndDate(end);
  }, [dateMode, selYear, selMonth, selQuarter]);

  const fetchSites = async (uid: string) => {
    try {
      const userSitesRef = collection(db, 'users', uid, 'sites');
      const snap = await getDocs(userSitesRef);
      const sites: Site[] = [];
      snap.forEach(doc => {
        // status 필드 추가
        sites.push({ id: doc.id, name: doc.data().siteName, status: doc.data().status || '공사중' });
      });
      setSiteList(sites);
    } catch (e) { console.error(e); }
  };

  // ==================================================================
  // 합계 계산
  // ==================================================================
  const fetchSummary = async () => {
      if (!currentUid) return;

      // 현장 선택됨 OR 부분 필터링 -> 직접 계산
      const useManualCalc = searchSiteId !== '' || !showUnassigned || !showAssigned;

      try {
          if (!useManualCalc) {
              await calculateSummaryServer();
          } else {
              await calculateSummaryManually();
          }
      } catch (e) {
          await calculateSummaryManually();
      }
  };

  // [서버 집계]
  const calculateSummaryServer = async () => {
      if (!currentUid) return;
      const createSumQuery = (collectionName: string) => {
          return query(
              collection(db, 'users', currentUid, collectionName),
              where('tradeDate', '>=', searchStartDate),
              where('tradeDate', '<=', searchEndDate)
          );
      };

      let sCount=0, sSupply=0, sTax=0, sTotal=0;
      let pCount=0, pSupply=0, pTax=0, pTotal=0;

      if (searchType === 'all' || searchType === '매출') {
          const salesSnapshot = await getAggregateFromServer(createSumQuery('CASH_SALES'), {
              count: count(), totalSupply: sum('supplyAmount'), totalTax: sum('taxAmount'), totalAmt: sum('totalAmount')
          });
          const d = salesSnapshot.data();
          sCount=d.count; sSupply=d.totalSupply; sTax=d.totalTax; sTotal=d.totalAmt;
      }
      if (searchType === 'all' || searchType === '매입') {
          const purchaseSnapshot = await getAggregateFromServer(createSumQuery('CASH_PURCHASE'), {
              count: count(), totalSupply: sum('supplyAmount'), totalTax: sum('taxAmount'), totalAmt: sum('totalAmount')
          });
          const d = purchaseSnapshot.data();
          pCount=d.count; pSupply=d.totalSupply; pTax=d.totalTax; pTotal=d.totalAmt;
      }
      setSummary({ salesCount: sCount, salesSupply: sSupply, salesTax: sTax, salesTotal: sTotal, purchaseCount: pCount, purchaseSupply: pSupply, purchaseTax: pTax, purchaseTotal: pTotal });
  };

  // [직접 계산]
  const calculateSummaryManually = async () => {
      if (!currentUid) return;
      
      const createQuery = (colName: string) => query(
          collection(db, 'users', currentUid, colName),
          where('tradeDate', '>=', searchStartDate),
          where('tradeDate', '<=', searchEndDate)
      );

      let sCount=0, sSupply=0, sTax=0, sTotal=0;
      let pCount=0, pSupply=0, pTax=0, pTotal=0;

      const calc = (snap: any, isSales: boolean) => {
          snap.forEach((d: any) => {
              const v = d.data();
              const itemSiteId = v.siteId || '';
              const isAssigned = !!itemSiteId; 

              // 1. 현장 필터
              if (searchSiteId && itemSiteId !== searchSiteId) return;

              // 2. 귀속/미귀속 필터 (전체 현장일 때만)
              if (!searchSiteId) {
                  if (!showUnassigned && !isAssigned) return; 
                  if (!showAssigned && isAssigned) return;    
              }

              const supply = Number(v.supplyAmount) || 0;
              const tax = Number(v.taxAmount) || 0;
              const total = Number(v.totalAmount) || 0;

              if (isSales) {
                  sCount++; sSupply+=supply; sTax+=tax; sTotal+=total;
              } else {
                  pCount++; pSupply+=supply; pTax+=tax; pTotal+=total;
              }
          });
      };

      if (searchType === 'all' || searchType === '매출') {
          const snap = await getDocs(createQuery('CASH_SALES'));
          calc(snap, true);
      }
      if (searchType === 'all' || searchType === '매입') {
          const snap = await getDocs(createQuery('CASH_PURCHASE'));
          calc(snap, false);
      }
      setSummary({ salesCount: sCount, salesSupply: sSupply, salesTax: sTax, salesTotal: sTotal, purchaseCount: pCount, purchaseSupply: pSupply, purchaseTax: pTax, purchaseTotal: pTotal });
  };

  // ==================================================================
  // [Pagination] 리스트 데이터 로드
  // ==================================================================
  const fetchData = async (isReset: boolean) => {
    if (!currentUid) return;
    setLoading(true);

    try {
        const newItems: CashReceipt[] = [];
        let currentLastSales = isReset ? null : lastSalesDoc;
        let currentLastPurchase = isReset ? null : lastPurchaseDoc;
        
        if (isReset) {
            setList([]);
            setHasMore(true);
        }

        const createListQuery = (collectionName: string, lastDoc: DocumentSnapshot | null) => {
            const colRef = collection(db, 'users', currentUid, collectionName);
            let q = query(
                colRef,
                where('tradeDate', '>=', searchStartDate),
                where('tradeDate', '<=', searchEndDate),
                orderBy('tradeDate', 'desc'),
                limit(LIMIT_PER_PAGE * 2) // 필터링 고려 넉넉히
            );
            if (lastDoc) q = query(q, startAfter(lastDoc));
            return q;
        };

        const processSnapshot = (snap: any, inOut: '매출' | '매입') => {
            const items: CashReceipt[] = [];
            snap.forEach((doc: any) => {
                const d = doc.data();
                
                // 1. 검색어
                if (searchVendor && !d.franchiseName.includes(searchVendor)) return;

                // 2. 현장 필터
                if (searchSiteId && d.siteId !== searchSiteId) return;

                // 3. 귀속/미귀속 필터
                const isAssigned = !!d.siteId;
                if (!searchSiteId) {
                    if (!showUnassigned && !isAssigned) return;
                    if (!showAssigned && isAssigned) return;
                }

                items.push({
                    id: doc.id,
                    tradeDate: d.tradeDate,
                    type: d.type,
                    inOut: inOut,
                    franchiseName: d.franchiseName,
                    franchiseRegNo: d.franchiseRegNo || '',
                    approvalNo: d.approvalNo,
                    supplyAmount: Number(d.supplyAmount) || 0,
                    taxAmount: Number(d.taxAmount) || 0,
                    serviceAmount: Number(d.serviceAmount) || 0,
                    totalAmount: Number(d.totalAmount) || 0,
                    remark: d.remark || '',
                    siteId: d.siteId || '',
                    processCategory: d.processCategory || '',
                    salesCategory: d.salesCategory || '',
                    remark2: d.remark2 || ''
                } as CashReceipt);
            });
            return items;
        };

        if (searchType === 'all' || searchType === '매출') {
            const salesQuery = createListQuery('CASH_SALES', currentLastSales);
            const salesSnap = await getDocs(salesQuery);
            if (!salesSnap.empty) currentLastSales = salesSnap.docs[salesSnap.docs.length - 1];
            newItems.push(...processSnapshot(salesSnap, '매출'));
        }

        if (searchType === 'all' || searchType === '매입') {
            const purchaseQuery = createListQuery('CASH_PURCHASE', currentLastPurchase);
            const purchaseSnap = await getDocs(purchaseQuery);
            if (!purchaseSnap.empty) currentLastPurchase = purchaseSnap.docs[purchaseSnap.docs.length - 1];
            newItems.push(...processSnapshot(purchaseSnap, '매입'));
        }

        newItems.sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime());

        // 페이지네이션 컷
        const finalItems = newItems.slice(0, LIMIT_PER_PAGE);

        if (isReset) setList(finalItems);
        else setList(prev => [...prev, ...finalItems]);

        setLastSalesDoc(currentLastSales);
        setLastPurchaseDoc(currentLastPurchase);

        if (newItems.length === 0) setHasMore(false);
        else setHasMore(true);

    } catch (error) {
        console.error("Data Load Error:", error);
    } finally {
        setLoading(false);
    }
  };

  const handleFieldChange = async (id: string, inOut: '매출'|'매입', field: string, value: string) => {
      if (!currentUid) return;
      setList(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
      try {
          const collectionName = inOut === '매출' ? 'CASH_SALES' : 'CASH_PURCHASE';
          const docRef = doc(db, 'users', currentUid, collectionName, id);
          await updateDoc(docRef, { [field]: value });
          
          if (field === 'siteId') fetchSummary();

      } catch (e) { console.error("저장 실패:", e); }
  };

  const yearOptions = Array.from({length: 21}, (_, i) => new Date().getFullYear() - i);
  const separatorStyle = { borderLeft: '1px solid #ccc', borderRight: '1px solid #ccc' };

  return (
    <div className="hometax-page-container">
      
      <div className="hometax-header-wrapper">
          <div className="hometax-title">
            <h2>현금영수증 조회</h2>
            <p>홈택스 현금영수증(매출/매입) 내역을 조회하고 관리합니다. (기본: 최근 30일)</p>
          </div>
          <div className="hometax-control-panel">
              <div className="mode-buttons">
                  {['custom', 'month', 'quarter'].map(m => (
                      <button key={m} className={`mode-btn ${dateMode === m ? 'active' : ''}`} onClick={() => setDateMode(m as any)}>
                         {m === 'custom' ? '직접입력' : m === 'month' ? '월간' : '분기'}
                      </button>
                  ))}
              </div>
              <div className="filter-row">
                  <div className="filter-item date-select">
                      {dateMode === 'custom' && (
                          <>
                             <input type="date" value={searchStartDate} onChange={e=>setSearchStartDate(e.target.value)} />
                             <span className="tilde">~</span>
                             <input type="date" value={searchEndDate} onChange={e=>setSearchEndDate(e.target.value)} />
                          </>
                      )}
                      {dateMode === 'month' && (
                          <>
                             <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}</select>
                             <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
                          </>
                      )}
                      {dateMode === 'quarter' && (
                          <>
                             <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}</select>
                             <select value={selQuarter} onChange={e=>setSelQuarter(Number(e.target.value))}>{[1,2,3,4].map(q => <option key={q} value={q}>{q}분기</option>)}</select>
                          </>
                      )}
                  </div>
                  <div className="divider"></div>
                  <div className="filter-item">
                      <select value={searchType} onChange={e=>setSearchType(e.target.value as any)}>
                          <option value="all">전체 구분</option>
                          <option value="매출">매출</option>
                          <option value="매입">매입</option>
                      </select>
                  </div>

                  {/* [NEW] 현장 선택 버튼 */}
                  <div className="filter-item" style={{marginLeft:'10px'}}>
                      <button 
                        onClick={() => setIsSiteModalOpen(true)}
                        style={{
                            padding:'0 15px', height:'38px', 
                            background:'#fff', border:'1px solid #ccc', borderRadius:'5px',
                            cursor:'pointer', fontSize:'14px', display:'flex', alignItems:'center', gap:'5px'
                        }}
                      >
                          <span style={{fontSize:'16px'}}>🏗️</span> {searchSiteName}
                      </button>
                  </div>

                  <div className="filter-item checkbox-group" style={{marginLeft:'10px', display:'flex', gap:'10px'}}>
                      <label style={{cursor:'pointer', fontSize:'14px', display:'flex', alignItems:'center'}}>
                          <input 
                            type="checkbox" 
                            checked={showUnassigned} 
                            onChange={e => setShowUnassigned(e.target.checked)}
                            style={{marginRight:'5px'}}
                          />
                          미귀속
                      </label>
                      <label style={{cursor:'pointer', fontSize:'14px', display:'flex', alignItems:'center'}}>
                          <input 
                            type="checkbox" 
                            checked={showAssigned} 
                            onChange={e => setShowAssigned(e.target.checked)}
                            style={{marginRight:'5px'}}
                          />
                          귀속
                      </label>
                  </div>

                  <div className="filter-item">
                      <input type="text" placeholder="가맹점명 검색" value={searchVendor} onChange={e=>setSearchVendor(e.target.value)} style={{width: '150px'}} />
                  </div>
                  <button className="btn-search" onClick={() => currentUid && fetchData(true)}>조회</button>
              </div>
          </div>
      </div>

      {/* 요약 카드 */}
      <div className="summary-section">
          <div className="summary-card sales">
              <div className="card-header">🔵 현금 매출 ({summary.salesCount}건)</div>
              <div className="card-body">
                  <div className="row"><span>공급가액</span> <strong>{summary.salesSupply.toLocaleString()}</strong></div>
                  <div className="row"><span>세액</span> <strong>{summary.salesTax.toLocaleString()}</strong></div>
                  <div className="row total"><span>합계금액</span> <strong>{summary.salesTotal.toLocaleString()}</strong></div>
              </div>
          </div>
          <div className="summary-card purchase">
              <div className="card-header">🔴 현금 매입 ({summary.purchaseCount}건)</div>
              <div className="card-body">
                  <div className="row"><span>공급가액</span> <strong>{summary.purchaseSupply.toLocaleString()}</strong></div>
                  <div className="row"><span>세액</span> <strong>{summary.purchaseTax.toLocaleString()}</strong></div>
                  <div className="row total"><span>합계금액</span> <strong>{summary.purchaseTotal.toLocaleString()}</strong></div>
              </div>
          </div>
      </div>

      <div className="hometax-result-section">
        <div className="result-table-wrapper">
          <table className="hometax-table">
            <thead>
              <tr>
                <th style={{width:'110px'}}>거래일시</th>
                <th style={{width:'50px'}}>구분</th>
                <th style={{width:'80px'}}>유형</th>
                <th style={{textAlign:'center', width:'140px'}}>가맹점(거래처)</th>
                <th style={{textAlign:'center', width:'90px', ...separatorStyle, borderRight:'none'}}>공급가액</th>
                <th style={{textAlign:'center', width:'80px', ...separatorStyle, borderLeft:'none', borderRight:'none'}}>세액</th>
                <th style={{textAlign:'center', width:'90px', ...separatorStyle, borderLeft:'none'}}>합계금액</th>
                <th style={{width:'150px'}}>현장 귀속</th>
                <th style={{width:'100px'}}>공정/구분</th>
                <th style={{width:'250px'}}>메모(비고2)</th> 
                <th style={{width:'120px'}}>비고</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                loading ? (
                    <tr><td colSpan={11} style={{textAlign:'center', padding:'50px'}}>데이터를 불러오는 중입니다...</td></tr>
                ) : (
                    <tr><td colSpan={11} className="no-data">조회된 내역이 없습니다.</td></tr>
                )
              ) : (
                list.map((item) => (
                  <tr key={item.id}>
                    <td style={{textAlign:'center'}}>{item.tradeDate}</td>
                    <td style={{textAlign:'center'}}>
                        <span className={`type-badge ${item.inOut === '매출' ? 'sales' : 'purchase'}`}>{item.inOut}</span>
                    </td>
                    <td style={{textAlign:'center', fontSize:'12px', color:'#666'}}>{item.type}</td>
                    <td className="vendor-name-cell" title={item.franchiseName} onClick={() => setSelectedReceipt(item)} style={{textAlign: 'center', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                        {item.franchiseName}
                    </td>
                    <td style={{textAlign:'center', width:'90px', ...separatorStyle, borderRight:'none'}}>
                        {item.supplyAmount.toLocaleString()}
                    </td>
                    <td style={{textAlign:'center', width:'80px', color:'#888', ...separatorStyle, borderLeft:'none', borderRight:'none'}}>
                        {item.taxAmount.toLocaleString()}
                    </td>
                    <td style={{textAlign:'center', width:'90px', fontWeight:'bold', ...separatorStyle, borderLeft:'none'}}>
                        {item.totalAmount.toLocaleString()}
                    </td>
                    <td style={{textAlign:'center'}}>
                        <select className="cell-select" value={item.siteId || ""} onChange={(e) => handleFieldChange(item.id, item.inOut, 'siteId', e.target.value)}>
                            <option value="">(미지정)</option>
                            {siteList.map(site => (<option key={site.id} value={site.id}>{site.name}</option>))}
                        </select>
                    </td>
                    <td style={{textAlign:'center'}}>
                        {item.inOut === '매입' ? (
                            <select className="cell-select" value={item.processCategory || ""} onChange={(e) => handleFieldChange(item.id, '매입', 'processCategory', e.target.value)}>
                                <option value="">(용도/공정)</option>
                                {PROCESS_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        ) : (
                            <select className="cell-select" value={item.salesCategory || ""} onChange={(e) => handleFieldChange(item.id, '매출', 'salesCategory', e.target.value)}>
                                <option value="">(구분)</option>
                                {SALES_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        )}
                    </td>
                    <td>
                        <input 
                            type="text" className="cell-input memo"
                            defaultValue={item.remark2 || ""}
                            placeholder="메모 입력"
                            onBlur={(e) => {
                                if (e.target.value !== (item.remark2 || "")) {
                                    handleFieldChange(item.id, item.inOut, 'remark2', e.target.value);
                                }
                            }}
                        />
                    </td>
                    <td style={{fontSize:'12px', color:'#999', maxWidth:'120px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={item.remark}>
                        {item.remark}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {hasMore && !loading && list.length > 0 && (
              <div style={{display:'flex', justifyContent:'center', padding:'20px'}}>
                  <button 
                    onClick={() => fetchData(false)}
                    style={{
                        padding: '10px 40px',
                        backgroundColor: K_BRAND_COLOR || '#1976d2',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '5px', 
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '14px'
                    }}
                  >
                      더보기 ({LIMIT_PER_PAGE}개 로드)
                  </button>
              </div>
          )}
          
          {loading && list.length > 0 && (
              <div style={{textAlign:'center', padding:'10px', color:'#666'}}>
                  추가 데이터를 불러오는 중...
              </div>
          )}
        </div>
      </div>

      {selectedReceipt && (
        <CashReceiptModal 
          receipt={selectedReceipt} 
          onClose={() => setSelectedReceipt(null)} 
          onUpdate={(field, value) => handleFieldChange(selectedReceipt.id, selectedReceipt.inOut, field, value)}
        />
      )}

      {/* [NEW] 현장 선택 모달 */}
      {isSiteModalOpen && (
        <SiteSelectionModal
            sites={siteList}
            onClose={() => setIsSiteModalOpen(false)}
            onSelect={(siteId, siteName) => {
                setSearchSiteId(siteId);
                setSearchSiteName(siteName);
                setIsSiteModalOpen(false);
            }}
        />
      )}
    </div>
  );
};

// =============================================================================
// [Sub Component] SiteSelectionModal (현장 선택 팝업 - 재사용)
// =============================================================================
const SiteSelectionModal: React.FC<{
    sites: Site[],
    onClose: () => void,
    onSelect: (id: string, name: string) => void
}> = ({ sites, onClose, onSelect }) => {
    
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['공사중', '공사전', '미팅중', '계약대기', '계약완료']);

    const filteredSites = sites.filter(site => {
        const matchesSearch = site.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = selectedStatuses.includes(site.status);
        return matchesSearch && matchesStatus;
    });

    const handleStatusChange = (status: string) => {
        setSelectedStatuses(prev => 
            prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
        );
    };

    return (
        <div className="invoice-modal-backdrop" onClick={onClose} style={{zIndex: 2000}}>
            <div className="invoice-paper" onClick={e => e.stopPropagation()} style={{width: '500px', maxHeight: '80vh', padding: '20px'}}>
                <div style={{borderBottom:'1px solid #eee', paddingBottom:'10px', marginBottom:'15px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <h3 style={{margin:0}}>현장 선택</h3>
                    <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:'20px', cursor:'pointer'}}>×</button>
                </div>

                {/* 1. 검색창 */}
                <div style={{marginBottom:'15px'}}>
                    <input 
                        type="text" 
                        placeholder="현장명 검색..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{width:'100%', padding:'8px', borderRadius:'5px', border:'1px solid #ddd'}}
                    />
                </div>

                {/* 2. 상태 필터 */}
                <div style={{marginBottom:'15px', display:'flex', flexWrap:'wrap', gap:'8px'}}>
                    {SITE_STATUSES.map(status => (
                        <label key={status} style={{fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', padding:'4px 8px', background:'#f5f5f5', borderRadius:'15px'}}>
                            <input 
                                type="checkbox" 
                                checked={selectedStatuses.includes(status)}
                                onChange={() => handleStatusChange(status)}
                                style={{marginRight:'4px'}}
                            />
                            {status}
                        </label>
                    ))}
                </div>

                {/* 3. 현장 리스트 */}
                <div style={{height:'300px', overflowY:'auto', border:'1px solid #eee', borderRadius:'5px'}}>
                    {/* 전체 선택 버튼 */}
                    <div 
                        onClick={() => onSelect('', '전체 현장')}
                        style={{padding:'10px', borderBottom:'1px solid #eee', cursor:'pointer', fontWeight:'bold', background:'#f9f9f9'}}
                    >
                        🏢 전체 현장 보기
                    </div>

                    {filteredSites.length > 0 ? (
                        filteredSites.map(site => (
                            <div 
                                key={site.id} 
                                onClick={() => onSelect(site.id, site.name)}
                                style={{padding:'10px', borderBottom:'1px solid #f0f0f0', cursor:'pointer', display:'flex', justifyContent:'space-between'}}
                                onMouseOver={(e) => e.currentTarget.style.background = '#f0f8ff'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <span>{site.name}</span>
                                <span style={{fontSize:'11px', color:'#888', background:'#eee', padding:'2px 6px', borderRadius:'4px'}}>{site.status}</span>
                            </div>
                        ))
                    ) : (
                        <div style={{padding:'20px', textAlign:'center', color:'#999'}}>검색된 현장이 없습니다.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

// (CashReceiptModal 컴포넌트는 기존과 동일 - 생략하지 않고 포함)
const CashReceiptModal: React.FC<{ 
    receipt: CashReceipt; 
    onClose: () => void;
    onUpdate: (field: string, value: string) => void;
}> = ({ receipt, onClose, onUpdate }) => {
    const colorClass = receipt.inOut === '매출' ? 'red-theme' : 'blue-theme';
    const [memo, setMemo] = useState(receipt.remark2 || "");
    return (
        <div className="invoice-modal-backdrop" onClick={onClose}>
            <div className={`invoice-paper ${colorClass}`} onClick={e => e.stopPropagation()} style={{width:'600px'}}> 
                <div className="invoice-header">
                    <h2>현금영수증 ({receipt.inOut})</h2>
                    <div className="approval-no">
                        승인번호: {receipt.approvalNo} <br/>
                        <span style={{fontSize:'11px', color:'#888'}}>({receipt.type})</span>
                    </div>
                </div>
                <div className="invoice-body">
                    <table className="invoice-table info-table">
                        <tbody>
                            <tr><td className="label">거래일시</td><td className="content">{receipt.tradeDate}</td></tr>
                            <tr><td className="label">가맹점명</td><td className="content highlight">{receipt.franchiseName}</td></tr>
                            <tr><td className="label">사업자번호</td><td className="content">{receipt.franchiseRegNo}</td></tr>
                        </tbody>
                    </table>
                    <table className="invoice-table sum-table" style={{marginTop:'20px'}}>
                        <thead><tr><th>공급가액</th><th>부가세</th><th>봉사료</th><th>합계금액</th></tr></thead>
                        <tbody>
                            <tr>
                                <td style={{textAlign:'right'}}>{receipt.supplyAmount.toLocaleString()}</td>
                                <td style={{textAlign:'right'}}>{receipt.taxAmount.toLocaleString()}</td>
                                <td style={{textAlign:'right'}}>{receipt.serviceAmount.toLocaleString()}</td>
                                <td style={{textAlign:'right', fontWeight:'bold'}}>{receipt.totalAmount.toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="invoice-footer-section">
                        <div className="remarks-row">
                            <div className="remark-box">
                                <label>비고 (홈택스)</label><div className="text-content">{receipt.remark || "-"}</div>
                            </div>
                            <div className="remark-box user-memo">
                                <label>메모 (비고2)</label>
                                <textarea className="memo-input" placeholder="사용자 메모 입력..." value={memo} onChange={(e) => setMemo(e.target.value)} onBlur={() => { if (memo !== receipt.remark2) onUpdate('remark2', memo); }} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="modal-close-btn"><button onClick={onClose}>닫기</button></div>
            </div>
        </div>
    );
};

export default AccountingCashReceiptPage;