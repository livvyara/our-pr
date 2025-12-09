import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy, deleteDoc, doc, getDoc } from 'firebase/firestore'; 
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import './SiteSettlementPage.css'; // [수정] 스타일 파일 교체

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 인터페이스 유지
interface SiteData { id: string; siteName: string; status: string; }
interface SettlementItem { id: string; date: string; type: '매출' | '매입' | '지출' | '현금영수증'; detailType: string; category: string; subCategory: string; vendorName: string; amount: number; memo: string; collectionName: string; }
interface CategoryOption { name: string; subCategories: string[]; }
const SITE_STATUSES = ['미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소'];

const SiteSettlementPage: React.FC = () => {
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('공사중'); 
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('전체'); 
  const [subCategoryFilter, setSubCategoryFilter] = useState<string>('전체');
  const [items, setItems] = useState<SettlementItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                let targetUid = user.uid;
                if (data.role === 'sub_partner' && data.partnerInfo?.ownerUid) {
                    targetUid = data.partnerInfo.ownerUid;
                }
                setCurrentUid(targetUid);
                fetchSites(targetUid);
                fetchCategories(targetUid);
            }
        } catch (e) { console.error("사용자 정보 로드 실패", e); }
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchSites = async (uid: string) => {
    try {
      const q = query(collection(db, 'users', uid, 'sites'), orderBy('siteName'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, siteName: d.data().siteName, status: d.data().status }));
      setSites(list);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchCategories = async (uid: string) => {
      try {
          const q = query(collection(db, 'users', uid, 'EXPENSE_CATEGORIES_SITE'), orderBy('order', 'asc'));
          const snap = await getDocs(q);
          const list: CategoryOption[] = snap.docs.map(d => ({
              name: d.data().name,
              subCategories: d.data().subCategories || []
          }));
          setCategoryOptions(list);
      } catch (e) { console.error(e); }
  };

  const filteredSites = useMemo(() => {
    if (statusFilter === '전체') return sites;
    return sites.filter(s => s.status === statusFilter);
  }, [sites, statusFilter]);

  useEffect(() => {
    if (!currentUid || !selectedSiteId) {
        setItems([]);
        return;
    }
    fetchAllData(currentUid, selectedSiteId);
  }, [selectedSiteId, currentUid]);

  const fetchAllData = async (uid: string, siteId: string) => {
      setDataLoading(true);
      setCategoryFilter('전체'); 
      setSubCategoryFilter('전체');

      try {
          const expQ = query(collection(db, 'users', uid, 'expenses'), where('siteId', '==', siteId));
          const saleQ = query(collection(db, 'users', uid, 'TAX_SALES'), where('siteId', '==', siteId));
          const purchQ = query(collection(db, 'users', uid, 'TAX_PURCHASE'), where('siteId', '==', siteId));
          const cashQ = query(collection(db, 'users', uid, 'CASH_RECEIPTS'), where('siteId', '==', siteId));

          const [expSnap, saleSnap, purchSnap, cashSnap] = await Promise.all([
              getDocs(expQ), getDocs(saleQ), getDocs(purchQ), getDocs(cashQ)
          ]);

          const unifiedList: SettlementItem[] = [];

          expSnap.forEach(doc => {
              const d = doc.data();
              unifiedList.push({
                  id: doc.id, date: d.useDate, type: '지출', detailType: d.cardName || '기타',
                  category: d.category || '미지정', subCategory: '', 
                  vendorName: d.vendorName, amount: Number(d.amount), memo: d.memo, collectionName: 'expenses'
              });
          });

          saleSnap.forEach(doc => {
              const d = doc.data();
              unifiedList.push({
                  id: doc.id, date: d.writeDate, type: '매출', detailType: '세금계산서',
                  category: d.category1 || '매출', subCategory: d.category2 || '',
                  vendorName: d.buyerName, amount: Number(d.totalAmount), memo: d.remark2 || d.remark, collectionName: 'TAX_SALES'
              });
          });

          purchSnap.forEach(doc => {
              const d = doc.data();
              unifiedList.push({
                  id: doc.id, date: d.writeDate, type: '매입', detailType: '세금계산서',
                  category: d.category1 || '미지정', subCategory: d.category2 || '',
                  vendorName: d.vendorName, amount: Number(d.totalAmount), memo: d.remark2 || d.remark, collectionName: 'TAX_PURCHASE'
              });
          });

          cashSnap.forEach(doc => {
              const d = doc.data();
              unifiedList.push({
                  id: doc.id, date: d.tradeDate, type: '현금영수증', detailType: d.type || '지출증빙',
                  category: d.category1 || '미지정', subCategory: d.category2 || '',
                  vendorName: d.franchiseName || d.useStoreName, amount: Number(d.totalAmount), memo: d.remark, collectionName: 'CASH_RECEIPTS'
              });
          });

          unifiedList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setItems(unifiedList);

      } catch (e) { console.error("로딩 실패", e); } 
      finally { setDataLoading(false); }
  };

  const handleDelete = async (id: string, collectionName: string) => {
      if (!confirm("해당 내역을 삭제하시겠습니까?")) return;
      if (!currentUid) return;
      try {
          await deleteDoc(doc(db, 'users', currentUid, collectionName, id));
          setItems(prev => prev.filter(item => item.id !== id));
      } catch (e) { alert("삭제 실패"); }
  };

  const currentSubOptions = useMemo(() => {
      const target = categoryOptions.find(c => c.name === categoryFilter);
      return target ? target.subCategories : [];
  }, [categoryOptions, categoryFilter]);

  const filteredItems = useMemo(() => {
      let result = items;
      if (categoryFilter !== '전체') {
          result = result.filter(item => item.category === categoryFilter);
      }
      if (subCategoryFilter !== '전체') {
          result = result.filter(item => item.subCategory === subCategoryFilter);
      }
      return result;
  }, [items, categoryFilter, subCategoryFilter]);

  const summary = useMemo(() => {
      let totalRevenue = 0;
      let totalExpense = 0;
      filteredItems.forEach(item => {
          if (item.type === '매출') totalRevenue += item.amount;
          else totalExpense += item.amount;
      });
      return { revenue: totalRevenue, expense: totalExpense, profit: totalRevenue - totalExpense };
  }, [filteredItems]);

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      setCategoryFilter(e.target.value);
      setSubCategoryFilter('전체');
  };

  return (
    <div className="settlement-page-container">
        {/* [스타일 통일] 헤더 영역 */}
        <div className="settlement-header-wrapper">
            <div className="settlement-title">
                <h2>현장 결산 관리</h2>
                <p>현장별 매출/매입/지출 내역을 통합하여 확인합니다.</p>
            </div>

            <div className="settlement-control-panel">
                <div className="filter-row top-row">
                    <span className="label">현장 상태:</span>
                    <div className="status-buttons">
                        <button className={`status-btn ${statusFilter === '전체' ? 'active' : ''}`} onClick={() => setStatusFilter('전체')}>전체</button>
                        {SITE_STATUSES.map(status => (
                            <button key={status} className={`status-btn ${statusFilter === status ? 'active' : ''}`} onClick={() => { setStatusFilter(status); setSelectedSiteId(''); }}>{status}</button>
                        ))}
                    </div>
                </div>

                <div className="filter-row">
                    <div className="filter-item site-select-box">
                         <select value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)} className="site-select" disabled={loading}>
                            <option value="">{loading ? "로딩 중..." : "== 현장을 선택하세요 =="}</option>
                            {filteredSites.map(site => (
                                <option key={site.id} value={site.id}>[{site.status}] {site.siteName}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </div>

        <div className="settlement-content">
            {selectedSiteId ? (
                <>
                    {/* [스타일 통일] 요약 카드 */}
                    <div className="summary-section">
                         <div className="summary-card sales">
                             <div className="card-header">🔵 총 매출</div>
                             <div className="card-body">
                                 <strong className="card-total">{summary.revenue.toLocaleString()} 원</strong>
                             </div>
                         </div>
                         <div className="summary-divider">-</div>
                         <div className="summary-card purchase">
                             <div className="card-header">🔴 총 지출</div>
                             <div className="card-body">
                                 <strong className="card-total">{summary.expense.toLocaleString()} 원</strong>
                             </div>
                         </div>
                         <div className="summary-divider">=</div>
                         <div className="summary-card profit">
                             <div className="card-header">🟢 예상 수익</div>
                             <div className="card-body">
                                 <strong className={`card-total ${summary.profit < 0 ? 'negative' : ''}`}>{summary.profit.toLocaleString()} 원</strong>
                             </div>
                         </div>
                    </div>

                    <div className="category-filter-bar">
                        <span className="filter-group">
                            <span className="label">📂 공종(1차): </span>
                            <select value={categoryFilter} onChange={handleCategoryChange} className="category-select">
                                <option value="전체">전체 보기</option>
                                {categoryOptions.map((cat, idx) => (
                                    <option key={idx} value={cat.name}>{cat.name}</option>
                                ))}
                                <option value="미지정">미지정</option>
                                <option value="매출">매출 (수입)</option>
                            </select>
                        </span>

                        <span className="filter-group">
                            <span className="label">📑 상세(2차): </span>
                            <select 
                                value={subCategoryFilter} 
                                onChange={(e) => setSubCategoryFilter(e.target.value)} 
                                className="category-select"
                                disabled={currentSubOptions.length === 0}
                            >
                                <option value="전체">전체 보기</option>
                                {currentSubOptions.map((sub, idx) => (
                                    <option key={idx} value={sub}>{sub}</option>
                                ))}
                            </select>
                        </span>
                    </div>

                    <div className="settlement-table-wrapper">
                        <table className="settlement-table">
                            <thead>
                                <tr>
                                    <th style={{width:'100px'}}>날짜</th>
                                    <th style={{width:'80px'}}>구분</th>
                                    <th style={{width:'100px'}}>상세</th>
                                    <th style={{width:'120px'}}>1차분류</th>
                                    <th style={{width:'120px'}}>2차분류</th>
                                    <th>거래처/사용처</th>
                                    <th style={{width:'120px', textAlign:'right'}}>금액</th>
                                    <th>메모</th>
                                    <th style={{width:'60px'}}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dataLoading ? (
                                    <tr><td colSpan={9} className="loading-td">데이터를 불러오는 중...</td></tr>
                                ) : filteredItems.length === 0 ? (
                                    <tr><td colSpan={9} className="no-data">내역이 없습니다.</td></tr>
                                ) : (
                                    filteredItems.map(item => (
                                        <tr key={item.id} className={item.type === '매출' ? 'row-revenue' : ''}>
                                            <td style={{textAlign:'center'}}>{item.date}</td>
                                            <td style={{textAlign:'center'}}>
                                                <span className={`type-badge ${item.type === '매출' ? 'sales' : 'expense'}`}>
                                                    {item.type}
                                                </span>
                                            </td>
                                            <td style={{textAlign:'center', fontSize:'12px', color:'#666'}}>{item.detailType}</td>
                                            <td style={{textAlign:'center', fontWeight:'bold'}}>{item.category}</td>
                                            <td style={{textAlign:'center'}}>{item.subCategory || '-'}</td>
                                            <td>{item.vendorName}</td>
                                            <td style={{textAlign:'right', fontWeight:'bold', color: item.type === '매출' ? '#1976d2' : '#c62828'}}>
                                                {item.amount.toLocaleString()}
                                            </td>
                                            <td style={{fontSize:'12px'}}>{item.memo}</td>
                                            <td style={{textAlign:'center'}}>
                                                <button className="btn-del-mini" onClick={() => handleDelete(item.id, item.collectionName)}>삭제</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                <div className="empty-state">
                    <p>☝️ 상단에서 현장을 선택해주세요.</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default SiteSettlementPage;