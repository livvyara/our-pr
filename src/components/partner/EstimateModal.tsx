import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, doc, getDoc, collection, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useReactToPrint } from 'react-to-print'; 
import './a_partnerprogrammodal.css'; // 공용 디자인 시스템

// --- [Premium SVG Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Print: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>,
  Settings: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Save: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Plus: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Menu: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
};

// ... (인터페이스 및 Constants는 기존 코드와 동일하여 생략, 그대로 유지하세요) ...
interface BasicConfig { companyName: string; address: string; bizNum: string; ownerName: string; logoUrl: string; notices: string[]; }
interface RateConfig { indirectMaterial: number; indirectLabor: number; industrialAccident: number; employment: number; health: number; pension: number; oldAge: number; safety: number; otherExp: number; generalAdmin: number; profit: number; }
interface EstimateItem { name: string; spec: string; unit: string; qty: string; matPrice: string; labPrice: string; expPrice: string; note: string; }
interface ProcessGroup { id: string; name: string; items: EstimateItem[]; }
interface TextStyle { fontSize: number; fontWeight: string; color: string; fontFamily: string; lineHeight?: number; }
interface DocStyles { title: TextStyle; tableHeader: TextStyle; tableBody: TextStyle; sumRow: TextStyle; }
interface EstimateTemplate { id: string; name: string; basicConfig: BasicConfig; rateConfig: RateConfig; processes: ProcessGroup[]; colWidths?: number[]; docStyles?: DocStyles; createdAt: any; }
interface Props { siteId: string; siteName: string; partnerUid: string; onClose: () => void; }

const INITIAL_RATES: RateConfig = { indirectMaterial: 0, indirectLabor: 0, industrialAccident: 0, employment: 0, health: 0, pension: 0, oldAge: 0, safety: 0, otherExp: 0, generalAdmin: 5, profit: 10 };
const INITIAL_STYLES: DocStyles = {
    title: { fontSize: 24, fontWeight: '800', color: '#000000', fontFamily: 'Pretendard', lineHeight: 1.4 },
    tableHeader: { fontSize: 13, fontWeight: '700', color: '#333333', fontFamily: 'Pretendard', lineHeight: 1.4 },
    tableBody: { fontSize: 12, fontWeight: '400', color: '#000000', fontFamily: 'Pretendard', lineHeight: 1.6 },
    sumRow: { fontSize: 13, fontWeight: '700', color: '#000000', fontFamily: 'Pretendard', lineHeight: 1.4 },
};
const ITEMS_PER_PAGE = 18;

const displayMoney = (val: number | string) => {
    if (val === 0 || val === '0' || val === '') return '';
    const num = typeof val === 'string' ? parseInt(val.replace(/,/g, ''), 10) : val;
    return isNaN(num) || num === 0 ? '' : num.toLocaleString('ko-KR');
};
const parseNumber = (val: string | number) => {
    if (!val) return 0;
    const num = typeof val === 'string' ? parseInt(val.replace(/,/g, ''), 10) : val;
    return isNaN(num) ? 0 : num;
};

const EstimateModal: React.FC<Props> = ({ siteId, siteName, partnerUid, onClose }) => {
    const db = getFirestore();
    const storage = getStorage();
    const printRef = useRef<HTMLDivElement>(null);

    const [activePage, setActivePage] = useState<'cover' | 'cost' | 'summary' | string>('cover'); 
    const [configMode, setConfigMode] = useState<'none' | 'basic' | 'rate' | 'process' | 'save' | 'load' | 'column' | 'style' | 'mobile_menu'>('none');

    const [basicConfig, setBasicConfig] = useState<BasicConfig>({ companyName: '', address: '', bizNum: '', ownerName: '', logoUrl: '', notices: [] });
    const [rateConfig, setRateConfig] = useState<RateConfig>(INITIAL_RATES);
    const [processes, setProcesses] = useState<ProcessGroup[]>([]);
    const [colWidths, setColWidths] = useState<number[]>([200, 100, 50, 50, 80, 90, 80, 90, 80, 90, 100, 100]);
    const [docStyles, setDocStyles] = useState<DocStyles>(INITIAL_STYLES);
    const [editingTarget, setEditingTarget] = useState<keyof DocStyles>('tableBody');
    const [templates, setTemplates] = useState<EstimateTemplate[]>([]);
    const [saveName, setSaveName] = useState('');
    const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);

    // [핵심 수정] 인쇄 설정: A4 Landscape 강제 적용
const handlePrint = useReactToPrint({ 
      contentRef: printRef, 
      documentTitle: `${siteName}_견적서`,
      // pageStyle을 통해 인쇄 시 적용될 CSS를 직접 주입합니다.
      pageStyle: `
        @page { 
          size: A4 landscape !important; 
          margin: 10mm !important; 
        }
        @media print {
          html, body { 
            width: 297mm !important; 
            height: 210mm !important; 
            overflow: visible !important; 
          }
          /* 인쇄 영역 강제 가로 설정 */
          .ppm-est-paper-wrapper { 
            width: 100% !important; 
            height: 100% !important; 
            margin: 0 !important; 
            padding: 0 !important;
            box-shadow: none !important;
            transform: none !important; 
            page-break-after: always;
          }
          /* 인쇄 시 불필요한 요소 숨김 (한 번 더 안전장치) */
          .ppm-overlay, .ppm-header, .ppm-est-sidebar, 
          .ppm-est-style-bar, .no-print, .ppm-est-actions {
            display: none !important; 
          }
        }
      `
  });
    useEffect(() => {
        // ... (기존 useEffect 로직 동일) ...
        const fetchPartnerInfo = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', partnerUid));
                if (userDoc.exists()) {
                    const d = userDoc.data();
                    const p = d.partnerInfo || {};
                    setBasicConfig(prev => ({ ...prev, companyName: p.companyName || d.companyName || '', address: p.address || d.address || '', bizNum: p.bizNum || '', ownerName: p.ownerName || d.name || '' }));
                }
            } catch (e) { console.error(e); }
        };
        fetchPartnerInfo();
    }, [partnerUid, db]);

    // ... (모든 계산 로직 및 핸들러 함수들 기존과 동일하게 유지) ...
    const getProcessSum = (items: EstimateItem[]) => items.reduce((acc, item) => { const q=parseNumber(item.qty), m=parseNumber(item.matPrice), l=parseNumber(item.labPrice), e=parseNumber(item.expPrice); acc.mat+=q*m; acc.lab+=q*l; acc.exp+=q*e; acc.total+=q*(m+l+e); return acc; }, { mat:0, lab:0, exp:0, total:0 });
    const totalDirect = processes.reduce((acc, proc) => { const s=getProcessSum(proc.items); acc.mat+=s.mat; acc.lab+=s.lab; acc.exp+=s.exp; acc.total+=s.total; return acc; }, { mat:0, lab:0, exp:0, total:0 });
    const calc = (b: number, r: number) => Math.floor(b * (r / 100));
    const indirectMat = calc(totalDirect.mat, rateConfig.indirectMaterial);
    const indirectLab = calc(totalDirect.lab, rateConfig.indirectLabor);
    const expenses = calc(totalDirect.total, rateConfig.industrialAccident + rateConfig.employment + rateConfig.health + rateConfig.pension + rateConfig.oldAge + rateConfig.safety + rateConfig.otherExp);
    const genAdmin = calc(totalDirect.total + indirectMat + indirectLab + expenses, rateConfig.generalAdmin);
    const profit = calc(totalDirect.total + indirectMat + indirectLab + expenses + genAdmin, rateConfig.profit);
    const grandTotalNoVat = totalDirect.total + indirectMat + indirectLab + expenses + genAdmin + profit;
    const vat = Math.floor(grandTotalNoVat * 0.1);
    const finalTotal = grandTotalNoVat + vat;

    const addProcess = (name: string) => { if(!name.trim())return; setProcesses(prev => [...prev, { id: Date.now().toString(), name, items: [] }]); };
    const addItemToProcess = (procId: string) => { setProcesses(prev => prev.map(p => p.id === procId ? { ...p, items: [...p.items, { name: '', spec: '', unit: '', qty: '', matPrice: '', labPrice: '', expPrice: '', note: '' }] } : p)); };
    const updateItem = (procId: string, idx: number, field: keyof EstimateItem, value: string) => {
        let formattedValue = value;
        if (['qty', 'matPrice', 'labPrice', 'expPrice'].includes(field)) {
            const num = value.replace(/[^\d]/g, '');
            formattedValue = (num && parseInt(num, 10) !== 0) ? Number(num).toLocaleString('ko-KR') : '';
        }
        setProcesses(prev => prev.map(p => p.id === procId ? { ...p, items: p.items.map((it, i) => i === idx ? { ...it, [field]: formattedValue } : it) } : p));
    };
    const deleteItem = (procId: string, idx: number) => { setProcesses(prev => prev.map(p => p.id === procId ? { ...p, items: p.items.filter((_, i) => i !== idx) } : p)); };

    const handleNewEstimate = () => { if(confirm("새로운 견적서를 작성하시겠습니까?")) { setRateConfig(INITIAL_RATES); setProcesses([]); setColWidths([200, 100, 50, 50, 80, 90, 80, 90, 80, 90, 100, 100]); setDocStyles(INITIAL_STYLES); setCurrentTemplateId(null); setSaveName(''); }};
    const handleSaveClick = () => { if(currentTemplateId) overwriteTemplate(); else setConfigMode('save'); };
    const createNewTemplate = async () => { if(!saveName.trim())return alert("이름 입력 필요"); try { const docRef = await addDoc(collection(db, 'users', partnerUid, 'estimateTemplates'), { name: saveName, basicConfig, rateConfig, processes, colWidths, docStyles, createdAt: serverTimestamp() }); setCurrentTemplateId(docRef.id); alert("저장되었습니다."); setConfigMode('none'); } catch(e){alert("저장 실패");} };
    const overwriteTemplate = async () => { if(!currentTemplateId)return; try { await updateDoc(doc(db, 'users', partnerUid, 'estimateTemplates', currentTemplateId), { basicConfig, rateConfig, processes, colWidths, docStyles, updatedAt: serverTimestamp() }); alert("저장(덮어쓰기)되었습니다."); } catch(e){alert("저장 실패");} };
    const loadTemplates = async () => { const q = query(collection(db, 'users', partnerUid, 'estimateTemplates'), orderBy('createdAt', 'desc')); const snap = await getDocs(q); setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as EstimateTemplate))); };
    const applyTemplate = (tmpl: EstimateTemplate) => { setBasicConfig(tmpl.basicConfig); setRateConfig(tmpl.rateConfig); setProcesses(tmpl.processes); if(tmpl.colWidths) setColWidths(tmpl.colWidths); if(tmpl.docStyles) setDocStyles(tmpl.docStyles); setCurrentTemplateId(tmpl.id); setSaveName(tmpl.name); setConfigMode('none'); };
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { if(e.target.files?.[0]) { const file = e.target.files[0]; const storageRef = ref(storage, `users/${partnerUid}/estimateLogo_${Date.now()}`); await uploadBytes(storageRef, file); const url = await getDownloadURL(storageRef); setBasicConfig(prev => ({ ...prev, logoUrl: url })); }};
    const handleStyleChange = (field: keyof TextStyle, value: any) => { setDocStyles(prev => ({ ...prev, [editingTarget]: { ...prev[editingTarget], [field]: value } })); };
    const getStyle = (target: keyof DocStyles) => { const s = docStyles[target]; return { fontSize: `${s.fontSize}px`, fontWeight: s.fontWeight, color: s.color, fontFamily: s.fontFamily, lineHeight: s.lineHeight || 1.5 }; };
    const inputStyle = (target: keyof DocStyles) => { const s = docStyles[target]; return { fontSize: `${s.fontSize}px`, fontWeight: s.fontWeight, color: s.color, fontFamily: s.fontFamily, width: '100%', border: 'none', background: 'transparent' }; };
    const handleFocus = (target: keyof DocStyles) => { setEditingTarget(target); if (configMode !== 'style') setConfigMode('style'); };
    const getTargetLabel = () => { switch(editingTarget) { case 'title': return '문서 제목'; case 'tableHeader': return '표 머리글'; case 'tableBody': return '표 본문'; case 'sumRow': return '합계/소계'; default: return ''; } };

    return (
        <div className="ppm-overlay">
            <div className="ppm-container" style={{maxWidth:'1600px', width:'95%', height:'95vh'}}>
                
                <div className="ppm-header">
                    <div className="ppm-title">
                        <h3>견적서 작성</h3>
                        <span className="ppm-badge">{siteName}</span>
                    </div>
                    
                    {/* [Desktop Toolbar] 1280px 이상에서만 보임 */}
                    <div className="ppm-est-actions desktop-only">
                        <button className="ppm-btn-secondary small" onClick={() => setConfigMode('basic')}><Icons.Settings/> 기본</button>
                        <button className="ppm-btn-secondary small" onClick={() => setConfigMode('rate')}><Icons.Settings/> 요율</button>
                        <button className="ppm-btn-secondary small" onClick={() => setConfigMode(configMode === 'style' ? 'none' : 'style')}>🎨 스타일</button>
                        <button className="ppm-btn-secondary small" onClick={() => setConfigMode('process')}>공정 관리</button>
                        <div className="ppm-divider-vertical"></div>
                        <button className="ppm-btn-secondary small" onClick={handleSaveClick}><Icons.Save/> 저장</button>
                        <button className="ppm-btn-secondary small" onClick={() => { setConfigMode('load'); loadTemplates(); }}>불러오기</button>
                        <button className="ppm-btn-secondary small" onClick={handleNewEstimate}>초기화</button>
                        <button className="ppm-btn-primary small" onClick={handlePrint}><Icons.Print/> 인쇄/PDF</button>
                    </div>

                    {/* [Tablet/Mobile Fold Menu] 1280px 이하에서 보임 */}
                    <div className="ppm-est-actions mobile-only">
                        <button className="ppm-btn-secondary small icon-only" onClick={() => setConfigMode('mobile_menu')}>
                            <Icons.Menu /> 설정
                        </button>
                    </div>

                    <button className="ppm-close-btn" onClick={onClose}><Icons.Close /></button>
                </div>

                <div className="ppm-est-body">
                    {/* Left Sidebar (Desktop Only) */}
                    <div className="ppm-est-sidebar desktop-only">
                        <div className="ppm-est-nav-title">페이지 목록</div>
                        <div className={`ppm-est-nav-item ${activePage==='cover'?'active':''}`} onClick={()=>setActivePage('cover')}>1. 표지 (갑)</div>
                        <div className={`ppm-est-nav-item ${activePage==='cost'?'active':''}`} onClick={()=>setActivePage('cost')}>2. 원가계산서 (을)</div>
                        <div className={`ppm-est-nav-item ${activePage==='summary'?'active':''}`} onClick={()=>setActivePage('summary')}>3. 총괄표 (병)</div>
                        <div className="ppm-divider"></div>
                        {processes.map((proc, idx) => (
                            <div key={proc.id} className={`ppm-est-nav-item ${activePage===proc.id?'active':''}`} onClick={()=>setActivePage(proc.id)}>
                                {idx + 4}. {proc.name}
                            </div>
                        ))}
                        <button className="ppm-est-add-btn" onClick={() => setConfigMode('process')}><Icons.Plus/> 공종 추가</button>
                    </div>

                    {/* Mobile Navigation Bar */}
                    <div className="ppm-est-mobile-nav mobile-only">
                        <select className="ppm-select small" value={activePage} onChange={(e) => setActivePage(e.target.value)}>
                            <option value="cover">1. 표지 (갑)</option>
                            <option value="cost">2. 원가계산서 (을)</option>
                            <option value="summary">3. 총괄표 (병)</option>
                            {processes.map((p, i) => <option key={p.id} value={p.id}>{i+4}. {p.name}</option>)}
                        </select>
                    </div>

                    {/* Main Content */}
                    <div className="ppm-est-content">
                        {/* (스타일 툴바 - PC/모바일 공통, 필요시 표시) */}
                        {configMode === 'style' && (
                            <div className="ppm-est-style-bar">
                                <span className="label">대상: <strong>{getTargetLabel()}</strong></span>
                                <select value={docStyles[editingTarget].fontFamily} onChange={e => handleStyleChange('fontFamily', e.target.value)} className="ppm-select small">
                                    <option value="Pretendard">Pretendard</option><option value="Malgun Gothic">맑은 고딕</option><option value="Gulim">굴림</option><option value="Batang">바탕</option>
                                </select>
                                <input type="number" value={docStyles[editingTarget].fontSize} onChange={e => handleStyleChange('fontSize', Number(e.target.value))} className="ppm-input small" style={{width:'60px'}} /> px
                                <select value={docStyles[editingTarget].fontWeight} onChange={e => handleStyleChange('fontWeight', e.target.value)} className="ppm-select small">
                                    <option value="400">보통</option><option value="700">굵게</option><option value="900">매우 굵게</option>
                                </select>
                                <input type="color" value={docStyles[editingTarget].color} onChange={e => handleStyleChange('color', e.target.value)} />
                                <button className="ppm-close-btn small" onClick={()=>setConfigMode('none')}><Icons.Close/></button>
                            </div>
                        )}

                        <div className="ppm-est-paper-wrapper" ref={printRef}>
                            {/* [표지] */}
                            {(activePage === 'cover' || activePage === 'all') && (
                                <div className="ppm-est-sheet cover">
                                    {basicConfig.logoUrl && <img src={basicConfig.logoUrl} alt="logo" className="cover-logo" />}
                                    <div className="cover-title" onClick={() => handleFocus('title')} style={{...getStyle('title'), fontSize: Number(docStyles.title.fontSize) * 1.5, cursor:'pointer'}}>
                                        견 적 서
                                    </div>
                                    <div className="cover-sub" style={getStyle('title')}>공 사 명 : {siteName}</div>
                                    <div className="cover-info" style={getStyle('tableBody')} onClick={() => handleFocus('tableBody')}>
                                        <div className="info-row"><span className="lbl">상 호</span> : {basicConfig.companyName}</div>
                                        <div className="info-row"><span className="lbl">대 표</span> : {basicConfig.ownerName} (인)</div>
                                        <div className="info-row"><span className="lbl">등록번호</span> : {basicConfig.bizNum}</div>
                                        <div className="info-row"><span className="lbl">주 소</span> : {basicConfig.address}</div>
                                    </div>
                                </div>
                            )}

                            {/* [원가계산서] */}
                            {(activePage === 'cost' || activePage === 'all') && (
                                <div className="ppm-est-sheet">
                                    <h2 style={getStyle('title')} onClick={() => handleFocus('title')}>공사 원가 계산서</h2>
                                    <table className="ppm-est-table">
                                        <colgroup><col width="30%" /><col width="30%" /><col width="40%" /></colgroup>
                                        <thead style={getStyle('tableHeader')} onClick={() => handleFocus('tableHeader')}><tr><th>비 목</th><th>금 액</th><th>구성비 / 산출식</th></tr></thead>
                                        <tbody style={getStyle('tableBody')} onClick={() => handleFocus('tableBody')}>
                                            <tr><td>순공사비</td><td className="right">{totalDirect.total.toLocaleString()}</td><td className="center">-</td></tr>
                                            <tr><td>간접재료비</td><td className="right">{indirectMat.toLocaleString()}</td><td className="center">{rateConfig.indirectMaterial}%</td></tr>
                                            <tr><td>간접노무비</td><td className="right">{indirectLab.toLocaleString()}</td><td className="center">{rateConfig.indirectLabor}%</td></tr>
                                            <tr><td>산재보험료</td><td className="right">{calc(totalDirect.total, rateConfig.industrialAccident).toLocaleString()}</td><td className="center">{rateConfig.industrialAccident}%</td></tr>
                                            <tr><td>고용보험료</td><td className="right">{calc(totalDirect.total, rateConfig.employment).toLocaleString()}</td><td className="center">{rateConfig.employment}%</td></tr>
                                            <tr><td>건강보험료</td><td className="right">{calc(totalDirect.total, rateConfig.health).toLocaleString()}</td><td className="center">{rateConfig.health}%</td></tr>
                                            <tr><td>국민연금</td><td className="right">{calc(totalDirect.total, rateConfig.pension).toLocaleString()}</td><td className="center">{rateConfig.pension}%</td></tr>
                                            <tr><td>노인장기요양</td><td className="right">{calc(totalDirect.total, rateConfig.oldAge).toLocaleString()}</td><td className="center">{rateConfig.oldAge}%</td></tr>
                                            <tr><td>안전관리비</td><td className="right">{calc(totalDirect.total, rateConfig.safety).toLocaleString()}</td><td className="center">{rateConfig.safety}%</td></tr>
                                            <tr><td>기타경비</td><td className="right">{calc(totalDirect.total, rateConfig.otherExp).toLocaleString()}</td><td className="center">{rateConfig.otherExp}%</td></tr>
                                            <tr><td>일반관리비</td><td className="right">{genAdmin.toLocaleString()}</td><td className="center">{rateConfig.generalAdmin}%</td></tr>
                                            <tr><td>이윤</td><td className="right">{profit.toLocaleString()}</td><td className="center">{rateConfig.profit}%</td></tr>
                                            <tr style={getStyle('sumRow')} onClick={(e)=>{e.stopPropagation(); handleFocus('sumRow')}}><td>총 공사비</td><td className="right">{grandTotalNoVat.toLocaleString()}</td><td className="center">-</td></tr>
                                            <tr><td>부가가치세</td><td className="right">{vat.toLocaleString()}</td><td className="center">10%</td></tr>
                                            <tr style={{...getStyle('sumRow'), backgroundColor:'#f9fafb'}} onClick={(e)=>{e.stopPropagation(); handleFocus('sumRow')}}><td>합 계</td><td className="right">{finalTotal.toLocaleString()}</td><td className="center">-</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* [총괄표] */}
                            {(activePage === 'summary' || activePage === 'all') && (
                                <div className="ppm-est-sheet">
                                    <h2 style={getStyle('title')} onClick={() => handleFocus('title')}>공종별 집계표 (총괄)</h2>
                                    <table className="ppm-est-table">
                                        <thead style={getStyle('tableHeader')} onClick={() => handleFocus('tableHeader')}><tr><th>순번</th><th>공종명</th><th>재료비</th><th>노무비</th><th>경비</th><th>합계</th><th>비고</th></tr></thead>
                                        <tbody style={getStyle('tableBody')} onClick={() => handleFocus('tableBody')}>
                                            {processes.map((proc, idx) => {
                                                const s = getProcessSum(proc.items);
                                                return (
                                                    <tr key={proc.id}>
                                                        <td className="center">{idx + 1}</td>
                                                        <td>{proc.name}</td>
                                                        <td className="right">{displayMoney(s.mat)}</td>
                                                        <td className="right">{displayMoney(s.lab)}</td>
                                                        <td className="right">{displayMoney(s.exp)}</td>
                                                        <td className="right" style={{fontWeight:'bold'}}>{displayMoney(s.total)}</td>
                                                        <td></td>
                                                    </tr>
                                                );
                                            })}
                                            <tr style={getStyle('sumRow')} onClick={(e) => { e.stopPropagation(); handleFocus('sumRow'); }}>
                                                <td colSpan={2} className="center">소 계</td>
                                                <td className="right">{displayMoney(totalDirect.mat)}</td>
                                                <td className="right">{displayMoney(totalDirect.lab)}</td>
                                                <td className="right">{displayMoney(totalDirect.exp)}</td>
                                                <td className="right">{displayMoney(totalDirect.total)}</td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* [내역서] */}
                            {processes.map(proc => {
                                if (activePage !== proc.id && activePage !== 'all') return null;
                                const chunks: EstimateItem[][] = [];
                                if (proc.items.length === 0) chunks.push([]);
                                else {
                                    for (let i = 0; i < proc.items.length; i += ITEMS_PER_PAGE) {
                                        chunks.push(proc.items.slice(i, i + ITEMS_PER_PAGE));
                                    }
                                }

                                return chunks.map((chunk, pageIdx) => (
                                    <div key={`${proc.id}-${pageIdx}`} className="ppm-est-sheet">
                                        <h2 style={getStyle('title')} onClick={() => handleFocus('title')}>{proc.name} 내역서 ({pageIdx + 1}/{chunks.length})</h2>
                                        <div style={{overflowX:'auto'}}>
                                            <table className="ppm-est-table detail">
                                                <colgroup>{colWidths.map((w, i) => <col key={i} width={w} />)}</colgroup>
                                                <thead style={getStyle('tableHeader')} onClick={() => handleFocus('tableHeader')}>
                                                    <tr>
                                                        <th rowSpan={2}>명칭</th><th rowSpan={2}>규격</th><th rowSpan={2}>단위</th><th rowSpan={2}>수량</th>
                                                        <th colSpan={2}>재료비</th><th colSpan={2}>노무비</th><th colSpan={2}>경비</th>
                                                        <th rowSpan={2}>합계</th><th rowSpan={2}>비고</th><th className="no-print" rowSpan={2}>삭제</th>
                                                    </tr>
                                                    <tr><th>단가</th><th>금액</th><th>단가</th><th>금액</th><th>단가</th><th>금액</th></tr>
                                                </thead>
                                                <tbody style={getStyle('tableBody')}>
                                                    {chunk.map((item, i) => {
                                                        const realIdx = pageIdx * ITEMS_PER_PAGE + i;
                                                        const q = parseNumber(item.qty);
                                                        const m = parseNumber(item.matPrice);
                                                        const l = parseNumber(item.labPrice);
                                                        const e = parseNumber(item.expPrice);
                                                        return (
                                                            <tr key={realIdx}>
                                                                <td><input value={item.name} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'name', e.target.value)} style={inputStyle('tableBody')} /></td>
                                                                <td><input value={item.spec} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'spec', e.target.value)} style={inputStyle('tableBody')} /></td>
                                                                <td className="center"><input value={item.unit} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'unit', e.target.value)} style={inputStyle('tableBody')} className="center"/></td>
                                                                <td className="center"><input value={displayMoney(item.qty)} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'qty', e.target.value)} style={inputStyle('tableBody')} className="right"/></td>
                                                                <td className="right"><input value={displayMoney(item.matPrice)} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'matPrice', e.target.value)} style={inputStyle('tableBody')} className="right"/></td>
                                                                <td className="right">{displayMoney(q * m)}</td>
                                                                <td className="right"><input value={displayMoney(item.labPrice)} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'labPrice', e.target.value)} style={inputStyle('tableBody')} className="right"/></td>
                                                                <td className="right">{displayMoney(q * l)}</td>
                                                                <td className="right"><input value={displayMoney(item.expPrice)} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'expPrice', e.target.value)} style={inputStyle('tableBody')} className="right"/></td>
                                                                <td className="right">{displayMoney(q * e)}</td>
                                                                <td className="right bold">{displayMoney(q * (m + l + e))}</td>
                                                                <td><input value={item.note} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'note', e.target.value)} style={inputStyle('tableBody')} /></td>
                                                                <td className="no-print"><button onClick={()=>deleteItem(proc.id, realIdx)} className="ppm-btn-icon-del"><Icons.Trash/></button></td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {pageIdx === chunks.length - 1 && (
                                                        <tr style={getStyle('sumRow')} onClick={() => handleFocus('sumRow')}>
                                                            <td colSpan={4} className="center">소 계</td>
                                                            <td colSpan={2} className="right">{displayMoney(getProcessSum(proc.items).mat)}</td>
                                                            <td colSpan={2} className="right">{displayMoney(getProcessSum(proc.items).lab)}</td>
                                                            <td colSpan={2} className="right">{displayMoney(getProcessSum(proc.items).exp)}</td>
                                                            <td className="right">{displayMoney(getProcessSum(proc.items).total)}</td>
                                                            <td colSpan={2}></td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                            {pageIdx === chunks.length - 1 && (
                                                <div className="no-print" style={{marginTop:'10px', textAlign:'right'}}>
                                                    <button className="ppm-btn-secondary small" onClick={() => addItemToProcess(proc.id)}><Icons.Plus/> 행 추가</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ));
                            })}
                        </div>
                    </div>
                </div>

                {/* [Mobile] Fold Menu Modal (Unified Menu) */}
                {configMode === 'mobile_menu' && (
                    <div className="ppm-overlay" style={{zIndex:10002}} onClick={()=>setConfigMode('none')}>
                        <div className="ppm-container" style={{width:'85%', maxWidth:'320px', height:'auto'}} onClick={e=>e.stopPropagation()}>
                            <div className="ppm-header">
                                <h3 className="ppm-title">견적서 설정</h3>
                            </div>
                            <div className="ppm-body" style={{padding:'20px', gap:'12px'}}>
                                <button className="ppm-btn-secondary" onClick={() => setConfigMode('basic')}>기본 정보 설정</button>
                                <button className="ppm-btn-secondary" onClick={() => setConfigMode('rate')}>요율 설정</button>
                                <button className="ppm-btn-secondary" onClick={() => setConfigMode('process')}>공정 관리</button>
                                <button className="ppm-btn-secondary" onClick={() => setConfigMode('style')}>텍스트 스타일</button>
                                <button className="ppm-btn-secondary" onClick={() => setConfigMode('column')}>너비 설정</button>
                                <div className="ppm-divider"></div>
                                <button className="ppm-btn-secondary" onClick={handleSaveClick}>저장</button>
                                <button className="ppm-btn-secondary" onClick={() => { setConfigMode('load'); loadTemplates(); }}>불러오기</button>
                                <button className="ppm-btn-secondary" onClick={handleNewEstimate}>초기화</button>
                                <button className="ppm-btn-primary" onClick={handlePrint}><Icons.Print/> 인쇄 / PDF</button>
                            </div>
                            <div className="ppm-footer">
                                <button className="ppm-btn-primary" onClick={()=>setConfigMode('none')}>닫기</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Config Modals (Basic, Rate, Process, Save, Load, Column) - Reused from before */}
                {configMode !== 'none' && configMode !== 'style' && configMode !== 'mobile_menu' && (
                    <div className="ppm-overlay" style={{zIndex:10001}} onClick={()=>setConfigMode('none')}>
                        <div className="ppm-container" style={{maxWidth:'400px', height:'auto'}} onClick={e=>e.stopPropagation()}>
                            <div className="ppm-header">
                                <h3 className="ppm-title">{configMode === 'basic' ? '기본 정보' : configMode === 'rate' ? '요율 설정' : configMode === 'process' ? '공정 관리' : configMode === 'column' ? '너비 설정' : configMode === 'save' ? '저장' : '불러오기'}</h3>
                            </div>
                            <div className="ppm-body" style={{padding:'20px'}}>
                                {/* ... [Configuration Inputs Reuse] ... */}
                                {configMode === 'basic' && (
                                    <>
                                        <div className="ppm-col"><label className="ppm-label">상호명</label><input className="ppm-input" value={basicConfig.companyName} onChange={e=>setBasicConfig({...basicConfig, companyName:e.target.value})}/></div>
                                        <div className="ppm-col"><label className="ppm-label">대표자</label><input className="ppm-input" value={basicConfig.ownerName} onChange={e=>setBasicConfig({...basicConfig, ownerName:e.target.value})}/></div>
                                        <div className="ppm-col"><label className="ppm-label">사업자번호</label><input className="ppm-input" value={basicConfig.bizNum} onChange={e=>setBasicConfig({...basicConfig, bizNum:e.target.value})}/></div>
                                        <div className="ppm-col"><label className="ppm-label">주소</label><input className="ppm-input" value={basicConfig.address} onChange={e=>setBasicConfig({...basicConfig, address:e.target.value})}/></div>
                                        <div className="ppm-col"><label className="ppm-label">로고</label><input type="file" onChange={handleLogoUpload} style={{marginTop:'5px'}}/></div>
                                    </>
                                )}
                                {configMode === 'rate' && (
                                    <div style={{height:'300px', overflowY:'auto'}}>
                                        <div className="ppm-col"><label className="ppm-label">이윤 (%)</label><input type="number" className="ppm-input" value={rateConfig.profit} onChange={e=>setRateConfig({...rateConfig, profit:Number(e.target.value)})}/></div>
                                        <div className="ppm-col"><label className="ppm-label">일반관리비 (%)</label><input type="number" className="ppm-input" value={rateConfig.generalAdmin} onChange={e=>setRateConfig({...rateConfig, generalAdmin:Number(e.target.value)})}/></div>
                                        <div className="ppm-col"><label className="ppm-label">간접노무비 (%)</label><input type="number" className="ppm-input" value={rateConfig.indirectLabor} onChange={e=>setRateConfig({...rateConfig, indirectLabor:Number(e.target.value)})}/></div>
                                        {/* Need to list all rate fields if you want full editing */}
                                    </div>
                                )}
                                {configMode === 'process' && (
                                    <div className="ppm-col">
                                        <div style={{display:'flex', gap:'8px'}}>
                                            <input id="newProc" className="ppm-input" placeholder="예: 철거공사" />
                                            <button className="ppm-btn-primary" style={{width:'80px'}} onClick={()=>{ const el = document.getElementById('newProc') as HTMLInputElement; addProcess(el.value); el.value=''; }}>추가</button>
                                        </div>
                                        <div className="ppm-list" style={{marginTop:'10px', maxHeight:'200px', overflowY:'auto'}}>
                                            {processes.map((p,i)=>(<div key={p.id} className="ppm-card" style={{padding:'10px', flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>{i+1}. {p.name} <button className="ppm-btn-icon-del" onClick={()=>setProcesses(prev=>prev.filter(x=>x.id!==p.id))}><Icons.Trash/></button></div>))}
                                        </div>
                                    </div>
                                )}
                                {configMode === 'column' && (
                                    <>
                                        <div className="ppm-col"><label className="ppm-label">명칭 너비</label><input type="number" className="ppm-input" value={colWidths[0]} onChange={e=>{const n=[...colWidths]; n[0]=Number(e.target.value); setColWidths(n);}}/></div>
                                        <div className="ppm-col"><label className="ppm-label">규격 너비</label><input type="number" className="ppm-input" value={colWidths[1]} onChange={e=>{const n=[...colWidths]; n[1]=Number(e.target.value); setColWidths(n);}}/></div>
                                    </>
                                )}
                                {configMode === 'save' && (
                                    <>
                                        <div className="ppm-col"><label className="ppm-label">견적서 이름</label><input className="ppm-input" value={saveName} onChange={e=>setSaveName(e.target.value)}/></div>
                                        <button className="ppm-btn-primary" onClick={createNewTemplate}>저장하기</button>
                                    </>
                                )}
                                {configMode === 'load' && (
                                    <div className="ppm-list" style={{maxHeight:'300px', overflowY:'auto'}}>
                                        {templates.length===0 ? <p className="ppm-no-data">저장된 양식이 없습니다.</p> : templates.map(t=>(
                                            <div key={t.id} className="ppm-card" style={{padding:'12px', flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                                                <span>{t.name}</span>
                                                <div>
                                                    <button className="ppm-btn-secondary small" onClick={()=>applyTemplate(t)} style={{marginRight:'5px'}}>선택</button>
                                                    <button className="ppm-btn-icon-del" onClick={async ()=>{if(confirm("삭제?")){await deleteDoc(doc(db,'users',partnerUid,'estimateTemplates',t.id)); loadTemplates();}}}><Icons.Trash/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="ppm-footer">
                                <button className="ppm-btn-primary" onClick={()=>setConfigMode('none')}>닫기</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default EstimateModal;