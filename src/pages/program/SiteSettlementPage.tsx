import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy, deleteDoc, doc, getDoc } from 'firebase/firestore'; 
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import './SiteSettlementPage.css';
import { 
    LayoutDashboard, UserCircle, Receipt, X, Maximize2, 
    Calendar, Building, Info, Search, ChevronDown, ChevronUp,
    TrendingUp, TrendingDown, DollarSign
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
    
    // 직원별 지출 기간 필터
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

    // 모바일 아코디언 상태 관리 (디자인 통일)
    const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

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
            const staffQuery = query(collection(db, 'users'), where('partnerInfo.ownerUid', '==', uid));
            const staffSnap = await getDocs(staffQuery);
            const nameSet = new Set<string>();
            staffSnap.forEach(doc => {
                const name = doc.data().name;
                if (name) nameSet.add(name.trim());
            });

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

    const getBestImageUrl = (data: any) => {
        if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('http')) return data.imageUrl;
        if (data.images && Array.isArray(data.images) && data.images.length > 0) return data.images[0];
        if (data.image && typeof data.image === 'string' && data.image.startsWith('http')) return data.image;
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

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedItemIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedItemIds(newSet);
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
        <div className="ssp-container">
            {/* Header */}
            <div className="ssp-header">
                <div className="ssp-title-area">
                    <h2>현장 결산 및 지출 관리</h2>
                    <p>현장별 통합 결산 및 직원별 지출 내역을 실시간으로 모니터링합니다.</p>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="ssp-filter-panel">
                <div className="ssp-filter-row top">
                    <div className="ssp-mode-group">
                        <button className={`ssp-mode-btn ${viewMode === 'site' ? 'active' : ''}`} onClick={() => setViewMode('site')}>
                            <LayoutDashboard size={14} style={{marginRight:4}} /> 현장별 결산
                        </button>
                        <button className={`ssp-mode-btn ${viewMode === 'staff' ? 'active' : ''}`} onClick={() => setViewMode('staff')}>
                            <UserCircle size={14} style={{marginRight:4}} /> 직원별 지출
                        </button>
                    </div>

                    {viewMode === 'site' && (
                         <div className="ssp-mode-group" style={{marginLeft: 'auto'}}>
                            <button className={`ssp-mode-btn ${statusFilter === '전체' ? 'active' : ''}`} onClick={() => setStatusFilter('전체')}>전체</button>
                            {SITE_STATUSES.map(s => (
                                <button key={s} className={`ssp-mode-btn ${statusFilter === s ? 'active' : ''}`} onClick={() => { setStatusFilter(s); setSelectedSiteId(''); }}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="ssp-filter-row">
                    {viewMode === 'site' ? (
                        <>
                            <div className="ssp-filter-item" style={{flex: 1}}>
                                <select value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)} className="ssp-select" style={{width: '100%', maxWidth: '400px'}}>
                                    <option value="">== 결산할 현장을 선택하세요 ==</option>
                                    {filteredSites.map(s => <option key={s.id} value={s.id}>[{s.status}] {s.siteName}</option>)}
                                </select>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="ssp-filter-item">
                                <select value={selectedStaffName} onChange={e => setSelectedStaffName(e.target.value)} className="ssp-select">
                                    <option value="">== 직원 선택 ==</option>
                                    {staffs.map(s => <option key={s.uid} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="ssp-date-range">
                                <input type="date" value={staffStartDate} onChange={e => setStaffStartDate(e.target.value)} className="ssp-input" />
                                <span className="ssp-tilde">~</span>
                                <input type="date" value={staffEndDate} onChange={e => setStaffEndDate(e.target.value)} className="ssp-input" />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Content Area */}
            {(selectedSiteId || (viewMode === 'staff' && selectedStaffName)) ? (
                <>
                    {/* Summary Cards */}
                    <div className="ssp-summary-grid">
                        <div className="ssp-card sales">
                            <div className="ssp-card-header">
                                <TrendingUp size={16} /> 총 {viewMode === 'site' ? '매출' : '승인'}
                            </div>
                            <div className="ssp-card-value">{summary.revenue.toLocaleString()} 원</div>
                        </div>
                        <div className="ssp-card purchase">
                            <div className="ssp-card-header">
                                <TrendingDown size={16} /> 총 지출
                            </div>
                            <div className="ssp-card-value">{summary.expense.toLocaleString()} 원</div>
                        </div>
                        {viewMode === 'site' && (
                            <div className={`ssp-card profit ${summary.profit >= 0 ? 'plus' : 'minus'}`}>
                                <div className="ssp-card-header">
                                    <DollarSign size={16} /> 현장 이익
                                </div>
                                <div className="ssp-card-value">{summary.profit.toLocaleString()} 원</div>
                            </div>
                        )}
                    </div>

                    {/* Table Filters (Secondary) */}
                    <div className="ssp-table-filter-bar">
                         <select value={categoryFilter} onChange={e => {setCategoryFilter(e.target.value); setSubCategoryFilter('전체');}} className="ssp-select mini">
                            <option value="전체">전체 공종</option>
                            {categoryOptions.map((c, i) => <option key={i} value={c.name}>{c.name}</option>)}
                            <option value="미지정">미지정</option>
                            <option value="매출">매출</option>
                        </select>
                        <select value={subCategoryFilter} onChange={e => setSubCategoryFilter(e.target.value)} className="ssp-select mini" disabled={categoryFilter === '전체'}>
                            <option value="전체">상세 분류 전체</option>
                            {categoryOptions.find(c => c.name === categoryFilter)?.subCategories.map((s, i) => <option key={i} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {/* Desktop View (Table) */}
                    <div className="ssp-desktop-view">
                        <div className="ssp-table-container">
                            <div className="ssp-table-wrapper">
                                <table className="ssp-table">
                                    <thead>
                                        <tr>
                                            <th style={{width:'100px'}}>날짜</th>
                                            <th style={{width:'80px', textAlign:'center'}}>구분</th>
                                            <th style={{width:'100px'}}>{viewMode === 'site' ? '유형' : '현장명'}</th>
                                            <th>1차 분류</th>
                                            <th>2차 분류</th>
                                            <th>거래처/사용처</th>
                                            <th className="ssp-text-right">금액</th>
                                            <th style={{width:'80px', textAlign:'center'}}>증빙</th>
                                            <th style={{width:'50px', textAlign:'center'}}>삭제</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dataLoading ? (
                                            <tr><td colSpan={9} className="ssp-no-data">데이터 분석 중...</td></tr>
                                        ) : filteredItems.length === 0 ? (
                                            <tr><td colSpan={9} className="ssp-no-data">해당 조건의 내역이 없습니다.</td></tr>
                                        ) : (
                                            filteredItems.map(item => (
                                                <tr key={item.id}>
                                                    <td className="ssp-text-center" style={{color:'#666'}}>{item.date}</td>
                                                    <td className="ssp-text-center">
                                                        <span className={`ssp-badge ${item.type === '매출' ? 'sales' : 'purchase'}`}>{item.type}</span>
                                                    </td>
                                                    <td className="ssp-text-center">
                                                        {viewMode === 'site' ? item.detailType : <span className="ssp-site-tag">{item.siteName}</span>}
                                                    </td>
                                                    <td>{item.category}</td>
                                                    <td>{item.subCategory || '-'}</td>
                                                    <td className="ssp-cell-vendor">{item.vendorName}</td>
                                                    <td className={`ssp-text-right ssp-font-bold ${item.type === '매출' ? 'text-blue' : 'text-red'}`}>
                                                        {item.amount.toLocaleString()}
                                                    </td>
                                                    <td className="ssp-text-center">
                                                        {item.imageUrl ? (
                                                            <button className="ssp-btn-icon" onClick={() => setPreviewImage(item.imageUrl!)}>
                                                                <Receipt size={14} />
                                                            </button>
                                                        ) : <span style={{color:'#ccc'}}>-</span>}
                                                    </td>
                                                    <td className="ssp-text-center">
                                                        <button className="ssp-btn-del" onClick={() => handleDelete(item.id, item.collectionName)}>
                                                            <X size={14}/>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Mobile View (Accordion List) */}
                    <div className="ssp-mobile-view">
                        <div className="ssp-mobile-list">
                            {filteredItems.length === 0 ? (
                                <div className="ssp-no-data">해당 조건의 내역이 없습니다.</div>
                            ) : (
                                filteredItems.map(item => {
                                    const isExpanded = expandedItemIds.has(item.id);
                                    return (
                                        <div key={item.id} className="ssp-mobile-card">
                                            {/* Header */}
                                            <div className="ssp-mobile-card-header" onClick={() => toggleExpand(item.id)}>
                                                <div className="ssp-mobile-header-left">
                                                    <span className="ssp-mobile-date">{item.date}</span>
                                                    <span className="ssp-mobile-vendor-title">
                                                        {item.vendorName || '(거래처 미지정)'}
                                                    </span>
                                                </div>
                                                <div className="ssp-mobile-header-right">
                                                    <div className="ssp-mobile-badge-group">
                                                        <span className={`ssp-badge ${item.type === '매출' ? 'sales' : 'purchase'}`}>{item.type}</span>
                                                    </div>
                                                    <span className={`ssp-mobile-amount ${item.type === '매출' ? 'text-blue' : 'text-red'}`}>
                                                        {item.amount.toLocaleString()}
                                                    </span>
                                                    <ChevronDown size={20} className={`ssp-mobile-chevron ${isExpanded ? 'open' : ''}`} />
                                                </div>
                                            </div>

                                            {/* Expanded Content */}
                                            {isExpanded && (
                                                <div className="ssp-mobile-expanded">
                                                    <div className="ssp-mobile-body">
                                                        <div className="ssp-mobile-row">
                                                            <span className="ssp-mobile-label">상세유형</span>
                                                            <span className="ssp-mobile-value">{item.detailType}</span>
                                                        </div>
                                                        <div className="ssp-mobile-row">
                                                            <span className="ssp-mobile-label">분류</span>
                                                            <span className="ssp-mobile-value">{item.category} {item.subCategory ? `> ${item.subCategory}` : ''}</span>
                                                        </div>
                                                        <div className="ssp-mobile-row">
                                                            <span className="ssp-mobile-label">메모</span>
                                                            <span className="ssp-mobile-value">{item.memo || '-'}</span>
                                                        </div>
                                                        
                                                        <div className="ssp-mobile-actions">
                                                            {item.imageUrl && (
                                                                <button className="ssp-btn full" onClick={() => setPreviewImage(item.imageUrl!)}>
                                                                    <Receipt size={14} /> 영수증 확인
                                                                </button>
                                                            )}
                                                            <button className="ssp-btn full delete" onClick={() => handleDelete(item.id, item.collectionName)}>
                                                                <X size={14} /> 내역 삭제
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div className="ssp-empty-state">
                    <div className="ssp-empty-icon">🔎</div>
                    <p>{viewMode === 'site' ? '결산할 현장을 선택해 주세요.' : '지출 내역을 확인할 직원을 선택해 주세요.'}</p>
                </div>
            )}

            {/* Receipt Viewer Modal */}
            {previewImage && (
                <div className="ssp-modal-overlay" onClick={() => setPreviewImage(null)}>
                    <div className="ssp-modal-paper image-viewer" onClick={e => e.stopPropagation()}>
                        <div className="ssp-modal-header">
                            <h3 className="ssp-modal-title">증빙 영수증</h3>
                            <button onClick={() => setPreviewImage(null)} className="ssp-btn-icon"><X size={20}/></button>
                        </div>
                        <div className="ssp-modal-body image-body">
                            <img src={previewImage} alt="Receipt" />
                        </div>
                        <div className="ssp-modal-footer">
                            <button onClick={() => window.open(previewImage, '_blank')} className="ssp-btn">
                                <Maximize2 size={14} /> 원본 보기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteSettlementPage;