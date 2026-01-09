import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy, deleteDoc, doc, getDoc } from 'firebase/firestore'; 
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import './SiteSettlementPage.css';
import { 
    LayoutDashboard, UserCircle, Receipt, X, Maximize2, 
    Calendar, Building, Info, Search
} from 'lucide-react';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- [Interfaces] ---
interface SiteData { id: string; siteName: string; status: string; }
interface SettlementItem { 
    id: string; date: string; type: '매출' | '매입' | '지출' | '현금영수증'; 
    detailType: string; category: string; subCategory: string; 
    vendorName: string; amount: number; memo: string; 
    collectionName: string; imageUrl?: string; siteName?: string;
}
interface CategoryOption { name: string; subCategories: string[]; }
interface StaffData { uid: string; name: string; }

const SITE_STATUSES = ['미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소'];

const SiteSettlementPage: React.FC = () => {
    const [currentUid, setCurrentUid] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'site' | 'staff'>('site');
    
    const [sites, setSites] = useState<SiteData[]>([]);
    const [staffs, setStaffs] = useState<StaffData[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [statusFilter, setStatusFilter] = useState<string>('공사중'); 
    const [selectedSiteId, setSelectedSiteId] = useState<string>('');
    const [selectedStaffName, setSelectedStaffName] = useState<string>('');
    
    // 직원별 지출 기간 필터 (기본값: 최근 3개월)
    const [staffStartDate, setStaffStartDate] = useState<string>(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        return d.toISOString().split('T')[0];
    });
    const [staffEndDate, setStaffEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
    
    const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
    const [categoryFilter, setCategoryFilter] = useState<string>('전체'); 
    const [subCategoryFilter, setSubCategoryFilter] = useState<string>('전체');
    
    const [items, setItems] = useState<SettlementItem[]>([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
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
                    fetchStaffs(targetUid);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchSites = async (uid: string) => {
        const q = query(collection(db, 'users', uid, 'sites'), orderBy('siteName'));
        const snap = await getDocs(q);
        setSites(snap.docs.map(d => ({ id: d.id, siteName: d.data().siteName, status: d.data().status })));
        setLoading(false);
    };

    const fetchStaffs = async (uid: string) => {
        try {
            // 1. 유저 목록에서 이름 추출
            const staffQuery = query(collection(db, 'users'), where('partnerInfo.ownerUid', '==', uid));
            const staffSnap = await getDocs(staffQuery);
            const nameSet = new Set<string>();
            staffSnap.forEach(doc => {
                const name = doc.data().name;
                if (name) nameSet.add(name.trim());
            });

            // 2. 과거 지출 내역에서 이름 추출 (과거 데이터 누락 방지)
            const expenseQuery = query(collection(db, 'users', uid, 'expenses'));
            const expenseSnap = await getDocs(expenseQuery);
            expenseSnap.forEach(doc => {
                const name = doc.data().cardName;
                if (name) nameSet.add(name.trim());
            });

            setStaffs(Array.from(nameSet).sort().map(name => ({ uid: name, name: name })));
        } catch (e) { console.error("직원 목록 통합 로드 실패", e); }
    };

    const fetchCategories = async (uid: string) => {
        const q = query(collection(db, 'users', uid, 'EXPENSE_CATEGORIES_SITE'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        setCategoryOptions(snap.docs.map(d => ({ name: d.data().name, subCategories: d.data().subCategories || [] })));
    };

    useEffect(() => {
        if (viewMode === 'site' && currentUid && selectedSiteId) fetchSiteSettlement(currentUid, selectedSiteId);
    }, [selectedSiteId, viewMode, currentUid]);

    useEffect(() => {
        if (viewMode === 'staff' && currentUid && selectedStaffName) fetchStaffExpenses(currentUid, selectedStaffName);
    }, [selectedStaffName, viewMode, currentUid, staffStartDate, staffEndDate]);

    // 🛡️ 영수증 데이터 유연 탐색 로직 (핵심 해결책)
    const getBestImageUrl = (data: any) => {
        // 명시적 필드 우선 확인
        if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('http')) return data.imageUrl;
        if (data.images && Array.isArray(data.images) && data.images.length > 0) return data.images[0];
        if (data.image && typeof data.image === 'string' && data.image.startsWith('http')) return data.image;

        // 지능형 스캔: 모든 필드 중 URL 구조를 가진 필드 탐색
        for (const key in data) {
            const val = data[key];
            if (typeof val === 'string' && val.startsWith('http') && val.includes('firebase')) return val;
        }
        return undefined;
    };

    const fetchSiteSettlement = async (uid: string, siteId: string) => {
        setDataLoading(true);
        try {
            const [expSnap, saleSnap, purchSnap, cashSnap] = await Promise.all([
                getDocs(query(collection(db, 'users', uid, 'expenses'), where('siteId', '==', siteId))),
                getDocs(query(collection(db, 'users', uid, 'TAX_SALES'), where('siteId', '==', siteId))),
                getDocs(query(collection(db, 'users', uid, 'TAX_PURCHASE'), where('siteId', '==', siteId))),
                getDocs(query(collection(db, 'users', uid, 'CASH_RECEIPTS'), where('siteId', '==', siteId)))
            ]);

            const unifiedList: SettlementItem[] = [];
            expSnap.forEach(d => {
                const data = d.data();
                unifiedList.push({
                    id: d.id, date: data.useDate, type: '지출', detailType: data.cardName,
                    category: data.category, subCategory: data.subCategory,
                    vendorName: data.vendorName, amount: data.amount, memo: data.memo,
                    collectionName: 'expenses', imageUrl: getBestImageUrl(data)
                });
            });

            saleSnap.forEach(d => unifiedList.push({ id: d.id, date: d.data().writeDate, type: '매출', detailType: '세금계산서', category: d.data().category1 || '매출', subCategory: d.data().category2 || '', vendorName: d.data().buyerName, amount: d.data().totalAmount, memo: d.data().remark, collectionName: 'TAX_SALES' }));
            purchSnap.forEach(d => unifiedList.push({ id: d.id, date: d.data().writeDate, type: '매입', detailType: '세금계산서', category: d.data().category1, subCategory: d.data().category2, vendorName: d.data().vendorName, amount: d.data().totalAmount, memo: d.data().remark, collectionName: 'TAX_PURCHASE' }));
            cashSnap.forEach(d => unifiedList.push({ id: d.id, date: d.data().tradeDate, type: '현금영수증', detailType: d.data().type, category: d.data().category1, subCategory: d.data().category2, vendorName: d.data().franchiseName, amount: d.data().totalAmount, memo: d.data().remark, collectionName: 'CASH_RECEIPTS' }));

            setItems(unifiedList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        } catch (e) { console.error(e); } finally { setDataLoading(false); }
    };

    const fetchStaffExpenses = async (uid: string, staffName: string) => {
        setDataLoading(true);
        try {
            let q = query(collection(db, 'users', uid, 'expenses'), where('cardName', '==', staffName));
            if (staffStartDate) q = query(q, where('useDate', '>=', staffStartDate));
            if (staffEndDate) q = query(q, where('useDate', '<=', staffEndDate));

            const snap = await getDocs(q);
            const list = snap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id, date: data.useDate, type: '지출' as const,
                    detailType: data.cardName, category: data.category,
                    subCategory: data.subCategory || '', vendorName: data.vendorName,
                    amount: Number(data.amount), memo: data.memo, collectionName: 'expenses',
                    imageUrl: getBestImageUrl(data), siteName: data.siteName
                };
            });
            setItems(list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        } catch (e) { console.error(e); } finally { setDataLoading(false); }
    };

    const handleDelete = async (id: string, collectionName: string) => {
        if (!confirm("해당 내역을 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, 'users', currentUid!, collectionName, id));
            setItems(prev => prev.filter(item => item.id !== id));
        } catch (e) { alert("삭제 실패"); }
    };

    const filteredSites = useMemo(() => statusFilter === '전체' ? sites : sites.filter(s => s.status === statusFilter), [sites, statusFilter]);
    const filteredItems = useMemo(() => {
        let result = items;
        if (categoryFilter !== '전체') result = result.filter(item => item.category === categoryFilter);
        if (subCategoryFilter !== '전체') result = result.filter(item => item.subCategory === subCategoryFilter);
        return result;
    }, [items, categoryFilter, subCategoryFilter]);

    const summary = useMemo(() => {
        let rev = 0, exp = 0;
        filteredItems.forEach(i => i.type === '매출' ? rev += i.amount : exp += i.amount);
        return { revenue: rev, expense: exp, profit: rev - exp };
    }, [filteredItems]);

    return (
        <div className="settlement-page-container">
            <div className="settlement-header-wrapper">
                <div className="settlement-title">
                    <h2>현장 결산 및 지출 관리</h2>
                    <p>현장별 통합 결산 및 직원별 지출 내역을 실시간으로 모니터링합니다.</p>
                </div>
                <div className="view-mode-tabs">
                    <button className={`mode-tab ${viewMode === 'site' ? 'active' : ''}`} onClick={() => setViewMode('site')}><LayoutDashboard size={18} /> 현장별 결산</button>
                    <button className={`mode-tab ${viewMode === 'staff' ? 'active' : ''}`} onClick={() => setViewMode('staff')}><UserCircle size={18} /> 직원별 지출</button>
                </div>
                <div className="settlement-control-panel">
                    {viewMode === 'site' ? (
                        <>
                            <div className="filter-row top-row">
                                <span className="label">현장 상태:</span>
                                <div className="status-buttons">
                                    <button className={`status-btn ${statusFilter === '전체' ? 'active' : ''}`} onClick={() => setStatusFilter('전체')}>전체</button>
                                    {SITE_STATUSES.map(s => <button key={s} className={`status-btn ${statusFilter === s ? 'active' : ''}`} onClick={() => { setStatusFilter(s); setSelectedSiteId(''); }}>{s}</button>)}
                                </div>
                            </div>
                            <div className="filter-row"><select value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)} className="main-select"><option value="">== 결산할 현장을 선택하세요 ==</option>{filteredSites.map(s => <option key={s.id} value={s.id}>[{s.status}] {s.siteName}</option>)}</select></div>
                        </>
                    ) : (
                        <div className="staff-filter-container">
                            <div className="filter-row">
                                <span className="label">직원 선택:</span>
                                <select value={selectedStaffName} onChange={e => setSelectedStaffName(e.target.value)} className="main-select">
                                    <option value="">== 직원을 선택하세요 ==</option>
                                    {staffs.map(s => <option key={s.uid} value={s.name}>{s.name} 매니저</option>)}
                                </select>
                            </div>
                            <div className="filter-row date-range-row">
                                <span className="label">조회 기간:</span>
                                <div className="date-input-group">
                                    <input type="date" value={staffStartDate} onChange={e => setStaffStartDate(e.target.value)} className="date-input" />
                                    <span className="date-sep">~</span>
                                    <input type="date" value={staffEndDate} onChange={e => setStaffEndDate(e.target.value)} className="date-input" />
                                </div>
                                <div className="info-tip"><Info size={14}/> 최근 3개월 지출이 기본 조회됩니다.</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="settlement-content">
                {(selectedSiteId || (viewMode === 'staff' && selectedStaffName)) ? (
                    <>
                        <div className="summary-section">
                            <div className="summary-card sales"><div className="card-header">🔵 총 {viewMode === 'site' ? '매출' : '승인'}</div><strong className="card-total">{summary.revenue.toLocaleString()} 원</strong></div>
                            <div className="summary-divider">-</div>
                            <div className="summary-card purchase"><div className="card-header">🔴 총 지출</div><strong className="card-total">{summary.expense.toLocaleString()} 원</strong></div>
                            {viewMode === 'site' && <><div className="summary-divider">=</div><div className="summary-card profit"><div className="card-header">🟢 현장 이익</div><strong className={`card-total ${summary.profit < 0 ? 'negative' : ''}`}>{summary.profit.toLocaleString()} 원</strong></div></>}
                        </div>
                        <div className="table-filter-bar">
                            <div className="filter-group">
                                <select value={categoryFilter} onChange={e => {setCategoryFilter(e.target.value); setSubCategoryFilter('전체');}} className="sub-select"><option value="전체">전체 공종</option>{categoryOptions.map((c, i) => <option key={i} value={c.name}>{c.name}</option>)}<option value="미지정">미지정</option><option value="매출">매출</option></select>
                                <select value={subCategoryFilter} onChange={e => setSubCategoryFilter(e.target.value)} className="sub-select" disabled={categoryFilter === '전체'}><option value="전체">상세 분류 전체</option>{categoryOptions.find(c => c.name === categoryFilter)?.subCategories.map((s, i) => <option key={i} value={s}>{s}</option>)}</select>
                            </div>
                        </div>
                        <div className="settlement-table-wrapper">
                            <table className="settlement-table">
                                <thead><tr><th>날짜</th><th>{viewMode === 'site' ? '구분' : '현장명'}</th><th>담당자</th><th>1차 분류</th><th>2차 분류</th><th>거래처/사용처</th><th className="text-right">금액</th><th>증빙</th><th style={{width:'60px'}}>관리</th></tr></thead>
                                <tbody>
                                    {dataLoading ? (<tr><td colSpan={9} className="loading-td">데이터 분석 중...</td></tr>) : filteredItems.length === 0 ? (<tr><td colSpan={9} className="no-data">해당 조건의 내역이 없습니다.</td></tr>) : (
                                        filteredItems.map(item => (
                                            <tr key={item.id} className={item.type === '매출' ? 'row-revenue' : ''}>
                                                <td className="text-center">{item.date}</td>
                                                <td className="text-center">{viewMode === 'site' ? <span className={`type-badge ${item.type === '매출' ? 'sales' : 'expense'}`}>{item.type}</span> : <span className="site-name-cell">{item.siteName}</span>}</td>
                                                <td className="text-center">{item.detailType}</td>
                                                <td className="text-center font-bold">{item.category}</td>
                                                <td className="text-center">{item.subCategory || '-'}</td>
                                                <td>{item.vendorName}</td>
                                                <td className={`text-right font-bold ${item.type === '매출' ? 'text-blue' : 'text-red'}`}>{item.amount.toLocaleString()}</td>
                                                <td className="text-center">
                                                    {item.imageUrl ? (
                                                        <button className="receipt-btn" onClick={() => setPreviewImage(item.imageUrl!)}>
                                                            <Receipt size={14} /> 영수증
                                                        </button>
                                                    ) : '-'}
                                                </td>
                                                <td className="text-center"><button className="btn-del-icon" onClick={() => handleDelete(item.id, item.collectionName)}><X size={14}/></button></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (<div className="empty-state"><div className="empty-icon">🔎</div><p>{viewMode === 'site' ? '결산할 현장을 선택해 주세요.' : '지출 내역을 확인할 직원을 선택해 주세요.'}</p></div>)}
            </div>

            {previewImage && (
                <div className="receipt-viewer-overlay" onClick={() => setPreviewImage(null)}>
                    <div className="receipt-viewer-content" onClick={e => e.stopPropagation()}>
                        <div className="viewer-header"><h4>증빙 영수증 확인</h4><button onClick={() => setPreviewImage(null)}><X /></button></div>
                        <div className="viewer-body"><img src={previewImage} alt="Receipt" /></div>
                        <div className="viewer-footer"><button onClick={() => window.open(previewImage, '_blank')} className="external-btn"><Maximize2 size={14} /> 원본 보기</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteSettlementPage;