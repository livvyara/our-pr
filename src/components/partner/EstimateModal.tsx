import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, doc, getDoc, collection, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useReactToPrint } from 'react-to-print'; 
import { auth } from '../../firebase-config';
import './EstimateModal.css';

// --- [타입 정의] ---
interface BasicConfig {
    companyName: string;
    address: string;
    bizNum: string;
    ownerName: string;
    logoUrl: string;
    notices: string[];
}

interface RateConfig {
    indirectMaterial: number; 
    indirectLabor: number;    
    industrialAccident: number; 
    employment: number;       
    health: number;           
    pension: number;          
    oldAge: number;           
    safety: number;           
    otherExp: number;         
    generalAdmin: number;     
    profit: number;           
}

interface EstimateItem {
    name: string; spec: string; unit: string; 
    qty: string;
    matPrice: string; 
    labPrice: string; 
    expPrice: string; 
    note: string;
}

interface ProcessGroup {
    id: string; name: string; items: EstimateItem[];
}

interface TextStyle {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
    lineHeight?: number;
}

interface DocStyles {
    title: TextStyle;      
    tableHeader: TextStyle; 
    tableBody: TextStyle;   
    sumRow: TextStyle;      
}

interface EstimateTemplate {
    id: string; name: string; 
    basicConfig: BasicConfig; 
    rateConfig: RateConfig; 
    processes: ProcessGroup[]; 
    colWidths?: number[]; 
    docStyles?: DocStyles; 
    createdAt: any;
}

interface Props {
    siteId: string;
    siteName: string;
    partnerUid: string;
    onClose: () => void;
}

const INITIAL_RATES: RateConfig = {
    indirectMaterial: 0, indirectLabor: 0, industrialAccident: 0, employment: 0,
    health: 0, pension: 0, oldAge: 0, safety: 0, otherExp: 0, generalAdmin: 5, profit: 10
};

const INITIAL_STYLES: DocStyles = {
    title: { fontSize: 24, fontWeight: '800', color: '#000000', fontFamily: 'Pretendard', lineHeight: 1.4 },
    tableHeader: { fontSize: 13, fontWeight: '700', color: '#333333', fontFamily: 'Pretendard', lineHeight: 1.4 },
    tableBody: { fontSize: 12, fontWeight: '400', color: '#000000', fontFamily: 'Pretendard', lineHeight: 1.6 },
    sumRow: { fontSize: 13, fontWeight: '700', color: '#000000', fontFamily: 'Pretendard', lineHeight: 1.4 },
};

const ITEMS_PER_PAGE = 18; 

// [수정] 0 또는 '0'이면 빈 문자열 반환 (화면 표시용)
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
    const [configMode, setConfigMode] = useState<'none' | 'basic' | 'rate' | 'process' | 'save' | 'load' | 'column' | 'style'>('none');

    const [basicConfig, setBasicConfig] = useState<BasicConfig>({
        companyName: '', address: '', bizNum: '', ownerName: '', logoUrl: '', notices: []
    });
    const [rateConfig, setRateConfig] = useState<RateConfig>(INITIAL_RATES);
    const [processes, setProcesses] = useState<ProcessGroup[]>([]);
    const [colWidths, setColWidths] = useState<number[]>([200, 100, 50, 50, 80, 90, 80, 90, 80, 90, 100, 100]);

    const [docStyles, setDocStyles] = useState<DocStyles>(INITIAL_STYLES);
    const [editingTarget, setEditingTarget] = useState<keyof DocStyles>('tableBody');

    const [templates, setTemplates] = useState<EstimateTemplate[]>([]);
    const [saveName, setSaveName] = useState('');
    const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `${siteName}_견적서`,
    });

    useEffect(() => {
        const fetchPartnerInfo = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', partnerUid));
                if (userDoc.exists()) {
                    const d = userDoc.data();
                    const p = d.partnerInfo || {};
                    setBasicConfig(prev => ({
                        ...prev,
                        companyName: p.companyName || d.companyName || '',
                        address: p.address || d.address || '',
                        bizNum: p.bizNum || '',
                        ownerName: p.ownerName || d.name || ''
                    }));
                }
            } catch (e) { console.error(e); }
        };
        fetchPartnerInfo();
    }, [partnerUid, db]);

    // --- [계산 로직] ---
    const getProcessSum = (items: EstimateItem[]) => {
        return items.reduce((acc, item) => {
            const q = parseNumber(item.qty);
            const m = parseNumber(item.matPrice);
            const l = parseNumber(item.labPrice);
            const e = parseNumber(item.expPrice);
            
            acc.mat += q * m; acc.lab += q * l; acc.exp += q * e;
            acc.total += q * (m + l + e);
            return acc;
        }, { mat: 0, lab: 0, exp: 0, total: 0 });
    };

    const totalDirect = processes.reduce((acc, proc) => {
        const s = getProcessSum(proc.items);
        acc.mat += s.mat; acc.lab += s.lab; acc.exp += s.exp; acc.total += s.total;
        return acc;
    }, { mat: 0, lab: 0, exp: 0, total: 0 });

    const calc = (b: number, r: number) => Math.floor(b * (r / 100));
    const indirectMat = calc(totalDirect.mat, rateConfig.indirectMaterial);
    const indirectLab = calc(totalDirect.lab, rateConfig.indirectLabor);
    const expenses = calc(totalDirect.total, rateConfig.industrialAccident + rateConfig.employment + rateConfig.health + rateConfig.pension + rateConfig.oldAge + rateConfig.safety + rateConfig.otherExp);
    const genAdmin = calc(totalDirect.total + indirectMat + indirectLab + expenses, rateConfig.generalAdmin);
    const profit = calc(totalDirect.total + indirectMat + indirectLab + expenses + genAdmin, rateConfig.profit);
    const grandTotalNoVat = totalDirect.total + indirectMat + indirectLab + expenses + genAdmin + profit;
    const vat = Math.floor(grandTotalNoVat * 0.1);
    const finalTotal = grandTotalNoVat + vat;

    const addProcess = (name: string) => {
        if (!name.trim()) return;
        setProcesses(prev => [...prev, { id: Date.now().toString(), name, items: [] }]);
    };
    const addItemToProcess = (procId: string) => {
        setProcesses(prev => prev.map(p => p.id === procId ? { ...p, items: [...p.items, { name: '', spec: '', unit: '', qty: '', matPrice: '', labPrice: '', expPrice: '', note: '' }] } : p));
    };

    const updateItem = (procId: string, idx: number, field: keyof EstimateItem, value: string) => {
        let formattedValue = value;
        if (['qty', 'matPrice', 'labPrice', 'expPrice'].includes(field)) {
            const num = value.replace(/[^\d]/g, '');
            // [수정] 0 입력 시 빈값으로 저장
            formattedValue = (num && parseInt(num, 10) !== 0) ? Number(num).toLocaleString('ko-KR') : '';
        }

        setProcesses(prev => prev.map(p => p.id === procId ? { ...p, items: p.items.map((it, i) => i === idx ? { ...it, [field]: formattedValue } : it) } : p));
    };
    
    const deleteItem = (procId: string, idx: number) => {
        setProcesses(prev => prev.map(p => p.id === procId ? { ...p, items: p.items.filter((_, i) => i !== idx) } : p));
    };

    const handleNewEstimate = () => {
        if (confirm("새로운 견적서를 작성하시겠습니까?")) {
            setRateConfig(INITIAL_RATES); setProcesses([]); setColWidths([200, 100, 50, 50, 80, 90, 80, 90, 80, 90, 100, 100]);
            setDocStyles(INITIAL_STYLES); setCurrentTemplateId(null); setSaveName('');
        }
    };

    const handleSaveClick = () => {
        if (currentTemplateId) overwriteTemplate();
        else setConfigMode('save');
    };

    const createNewTemplate = async () => {
        if (!saveName.trim()) return alert("이름 입력 필요");
        try {
            const docRef = await addDoc(collection(db, 'users', partnerUid, 'estimateTemplates'), {
                name: saveName, basicConfig, rateConfig, processes, colWidths, docStyles, createdAt: serverTimestamp()
            });
            setCurrentTemplateId(docRef.id); alert("저장되었습니다."); setConfigMode('none');
        } catch (e) { alert("저장 실패"); }
    };

    const overwriteTemplate = async () => {
        if (!currentTemplateId) return;
        try {
            await updateDoc(doc(db, 'users', partnerUid, 'estimateTemplates', currentTemplateId), {
                basicConfig, rateConfig, processes, colWidths, docStyles, updatedAt: serverTimestamp()
            });
            alert("저장(덮어쓰기)되었습니다.");
        } catch (e) { alert("저장 실패"); }
    };

    const loadTemplates = async () => {
        const q = query(collection(db, 'users', partnerUid, 'estimateTemplates'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as EstimateTemplate)));
    };

    const applyTemplate = (tmpl: EstimateTemplate) => {
        setBasicConfig(tmpl.basicConfig); setRateConfig(tmpl.rateConfig); setProcesses(tmpl.processes);
        if(tmpl.colWidths) setColWidths(tmpl.colWidths);
        if(tmpl.docStyles) setDocStyles(tmpl.docStyles);
        setCurrentTemplateId(tmpl.id); setSaveName(tmpl.name); setConfigMode('none');
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            const storageRef = ref(storage, `users/${partnerUid}/estimateLogo_${Date.now()}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setBasicConfig(prev => ({ ...prev, logoUrl: url }));
        }
    };

    const handleStyleChange = (field: keyof TextStyle, value: any) => {
        setDocStyles(prev => ({
            ...prev,
            [editingTarget]: { ...prev[editingTarget], [field]: value }
        }));
    };

    const getStyle = (target: keyof DocStyles) => {
        const s = docStyles[target];
        return {
            fontSize: `${s.fontSize}px`,
            fontWeight: s.fontWeight,
            color: s.color,
            fontFamily: s.fontFamily,
            lineHeight: s.lineHeight || 1.5,
        };
    };

    const inputStyle = (target: keyof DocStyles) => {
        const s = docStyles[target];
        return {
            fontSize: `${s.fontSize}px`,
            fontWeight: s.fontWeight,
            color: s.color,
            fontFamily: s.fontFamily,
            width: '100%', border: 'none', background: 'transparent'
        };
    };

    const handleFocus = (target: keyof DocStyles) => {
        setEditingTarget(target);
        if (configMode !== 'style') setConfigMode('style');
    };

    const getTargetLabel = () => {
        switch(editingTarget) {
            case 'title': return '문서 제목';
            case 'tableHeader': return '표 머리글';
            case 'tableBody': return '표 본문';
            case 'sumRow': return '합계/소계';
            default: return '';
        }
    };

    return (
        <div className="EstimateModal">
            <div className="est-modal-content">
                
                <div className="est-header">
                    <div className="est-title">견적서 작성: {siteName} (가로)</div>
                    <div className="est-controls">
                        <button className="est-btn primary" onClick={handlePrint}>인쇄 / PDF</button>
                        <button className="est-btn" onClick={() => setConfigMode(configMode === 'style' ? 'none' : 'style')}>🎨 텍스트 설정</button>
                        <button className="est-btn" onClick={() => setConfigMode('process')}>공정 설정</button>
                        <button className="est-btn" onClick={() => setConfigMode('column')}>너비 설정</button>
                        <button className="est-btn" onClick={handleNewEstimate}>새 견적서</button>
                        <button className="est-btn" onClick={handleSaveClick}>견적서 저장</button>
                        <button className="est-btn" onClick={() => { setConfigMode('load'); loadTemplates(); }}>불러오기</button>
                        <button className="est-btn" onClick={() => setConfigMode('rate')}>요율</button>
                        <button className="est-btn" onClick={() => setConfigMode('basic')}>기본</button>
                        <button className="est-btn close" onClick={onClose}>닫기</button>
                    </div>
                </div>

                {configMode === 'style' && (
                    <div className="est-style-toolbar">
                        <div className="style-group">
                            <span className="current-target-label">선택됨: {getTargetLabel()}</span>
                            <span style={{fontSize:'11px', color:'#666'}}>* 표의 내용을 클릭하면 대상이 변경됩니다.</span>
                        </div>
                        <div className="style-group">
                            <label>폰트:</label>
                            <select value={docStyles[editingTarget].fontFamily} onChange={e => handleStyleChange('fontFamily', e.target.value)}>
                                <option value="Pretendard">Pretendard</option>
                                <option value="Malgun Gothic">맑은 고딕</option>
                                <option value="Gulim">굴림</option>
                                <option value="Batang">바탕</option>
                            </select>
                        </div>
                        <div className="style-group">
                            <label>크기:</label>
                            <input type="number" value={docStyles[editingTarget].fontSize} onChange={e => handleStyleChange('fontSize', Number(e.target.value))} style={{width:'50px'}} /> px
                        </div>
                        <div className="style-group">
                            <label>굵기:</label>
                            <select value={docStyles[editingTarget].fontWeight} onChange={e => handleStyleChange('fontWeight', e.target.value)}>
                                <option value="400">보통</option>
                                <option value="700">굵게</option>
                                <option value="900">매우 굵게</option>
                            </select>
                        </div>
                        <div className="style-group">
                            <label>행 높이:</label>
                            <input type="number" step="0.1" value={docStyles[editingTarget].lineHeight || 1.5} onChange={e => handleStyleChange('lineHeight', Number(e.target.value))} style={{width:'50px'}} />
                        </div>
                        <div className="style-group">
                            <label>색상:</label>
                            <input type="color" value={docStyles[editingTarget].color} onChange={e => handleStyleChange('color', e.target.value)} />
                        </div>
                        <button className="est-btn small" onClick={() => setConfigMode('none')}>완료</button>
                    </div>
                )}

                <div className="est-body">
                    <div className="est-page-nav">
                        <div className={`est-nav-item ${activePage==='cover'?'active':''}`} onClick={()=>setActivePage('cover')}>1. 표지 (갑)</div>
                        <div className={`est-nav-item ${activePage==='cost'?'active':''}`} onClick={()=>setActivePage('cost')}>2. 원가계산서 (을)</div>
                        <div className={`est-nav-item ${activePage==='summary'?'active':''}`} onClick={()=>setActivePage('summary')}>3. 총괄표 (병)</div>
                        <div className="est-divider"></div>
                        {processes.map((proc, idx) => (
                            <div key={proc.id} className={`est-nav-item ${activePage===proc.id?'active':''}`} onClick={()=>setActivePage(proc.id)}>
                                {idx + 4}. {proc.name}
                            </div>
                        ))}
                        <div className="est-nav-item-add" onClick={() => setConfigMode('process')}>+ 공종 추가</div>
                    </div>

                    <div className="est-preview-area">
                        <div className="est-print-container" ref={printRef}>
                            
                            {/* 1. 표지 */}
                            {(activePage === 'cover' || activePage === 'all') && (
                                <div className="est-sheet cover-sheet">
                                    {basicConfig.logoUrl && (
                                        <div className="cover-logo-wrapper">
                                            <img src={basicConfig.logoUrl} alt="logo" className="cover-logo" />
                                        </div>
                                    )}
                                    <div className="cover-title-box" onClick={() => handleFocus('title')} style={{cursor:'pointer'}}>
                                        <h1 style={{...getStyle('title'), fontSize: Number(docStyles.title.fontSize) * 1.5}}>견  적  서</h1>
                                        <h3 style={getStyle('title')}>공 사 명 : {siteName}</h3>
                                    </div>
                                    <div className="cover-bottom">
                                        <div className="cover-info-box" style={getStyle('tableBody')} onClick={() => handleFocus('tableBody')}>
                                            {basicConfig.companyName && <div className="info-row"><span className="label">상 호</span> : {basicConfig.companyName}</div>}
                                            {basicConfig.ownerName && <div className="info-row"><span className="label">대 표</span> : {basicConfig.ownerName} (인)</div>}
                                            {basicConfig.bizNum && <div className="info-row"><span className="label">등록번호</span> : {basicConfig.bizNum}</div>}
                                            {basicConfig.address && <div className="info-row"><span className="label">주 소</span> : {basicConfig.address}</div>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 2. 원가계산서 */}
                            {(activePage === 'cost' || activePage === 'all') && (
                                <div className="est-sheet">
                                    <h2 className="doc-title" style={getStyle('title')} onClick={() => handleFocus('title')}>공사 원가 계산서</h2>
                                    <table className="doc-table">
                                        <colgroup><col width="30%" /><col width="30%" /><col width="40%" /></colgroup>
                                        <thead style={getStyle('tableHeader')} onClick={() => handleFocus('tableHeader')}>
                                            <tr><th>비 목</th><th>금 액</th><th>구성비 / 산출식</th></tr>
                                        </thead>
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
                                            <tr style={getStyle('sumRow')} onClick={(e) => { e.stopPropagation(); handleFocus('sumRow'); }}>
                                                <td>총 공사비</td><td className="right">{grandTotalNoVat.toLocaleString()}</td><td className="center">-</td>
                                            </tr>
                                            <tr><td>부가가치세</td><td className="right">{vat.toLocaleString()}</td><td className="center">10%</td></tr>
                                            <tr style={{...getStyle('sumRow'), backgroundColor:'#f9f9f9'}} onClick={(e) => { e.stopPropagation(); handleFocus('sumRow'); }}>
                                                <td>합 계</td><td className="right">{finalTotal.toLocaleString()}</td><td className="center">-</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* 3. 총괄표 */}
                            {(activePage === 'summary' || activePage === 'all') && (
                                <div className="est-sheet">
                                    <h2 className="doc-title" style={getStyle('title')} onClick={() => handleFocus('title')}>공종별 집계표 (총괄)</h2>
                                    <table className="doc-table">
                                        <thead style={getStyle('tableHeader')} onClick={() => handleFocus('tableHeader')}>
                                            <tr><th style={{width:'50px'}}>순번</th><th>공종명</th><th>재료비</th><th>노무비</th><th>경비</th><th>합계</th><th>비고</th></tr>
                                        </thead>
                                        <tbody style={getStyle('tableBody')} onClick={() => handleFocus('tableBody')}>
                                            {processes.map((proc, idx) => {
                                                const s = getProcessSum(proc.items);
                                                return (
                                                    <tr key={proc.id}>
                                                        <td className="center">{idx + 1}</td>
                                                        <td>{proc.name}</td>
                                                        {/* [수정] 0 값 숨김 처리 */}
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

                            {/* 4. 내역서 */}
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
                                    <div key={`${proc.id}-${pageIdx}`} className="est-sheet">
                                        <h2 className="doc-title" style={getStyle('title')} onClick={() => handleFocus('title')}>{proc.name} 내역서 ({pageIdx + 1}/{chunks.length})</h2>
                                        <div className="est-table-scroll">
                                            <table className="doc-table detail-table">
                                                <colgroup>
                                                    {colWidths.map((w, i) => <col key={i} width={w} />)}
                                                </colgroup>
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
                                                        
                                                        // [수정] value에 displayMoney 적용하여 0을 숨김
                                                        return (
                                                            <tr key={realIdx}>
                                                                <td><input value={item.name} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'name', e.target.value)} style={inputStyle('tableBody')} /></td>
                                                                <td><input value={item.spec} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'spec', e.target.value)} style={inputStyle('tableBody')} /></td>
                                                                <td className="center"><input value={item.unit} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'unit', e.target.value)} className="center" style={inputStyle('tableBody')} /></td>
                                                                <td className="center"><input type="text" value={displayMoney(item.qty)} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'qty', e.target.value)} className="right" style={inputStyle('tableBody')} /></td>
                                                                
                                                                <td className="right"><input type="text" value={displayMoney(item.matPrice)} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'matPrice', e.target.value)} className="right" style={inputStyle('tableBody')} /></td>
                                                                <td className="right">{displayMoney(q * m)}</td>
                                                                
                                                                <td className="right"><input type="text" value={displayMoney(item.labPrice)} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'labPrice', e.target.value)} className="right" style={inputStyle('tableBody')} /></td>
                                                                <td className="right">{displayMoney(q * l)}</td>

                                                                <td className="right"><input type="text" value={displayMoney(item.expPrice)} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'expPrice', e.target.value)} className="right" style={inputStyle('tableBody')} /></td>
                                                                <td className="right">{displayMoney(q * e)}</td>
                                                                
                                                                <td className="right font-bold">{displayMoney(q * (m + l + e))}</td>
                                                                <td><input value={item.note} onFocus={() => handleFocus('tableBody')} onChange={e=>updateItem(proc.id, realIdx, 'note', e.target.value)} style={inputStyle('tableBody')} /></td>
                                                                <td className="no-print"><button onClick={()=>deleteItem(proc.id, realIdx)} className="est-btn-del">x</button></td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {pageIdx === chunks.length - 1 && (
                                                        <tr style={getStyle('sumRow')} className="sub-total-row" onClick={() => handleFocus('sumRow')}>
                                                            <td colSpan={4} className="center">소 계</td>
                                                            <td colSpan={2} className="right">{displayMoney(getProcessSum(proc.items).mat)}</td>
                                                            <td colSpan={2} className="right">{displayMoney(getProcessSum(proc.items).lab)}</td>
                                                            <td colSpan={2} className="right">{displayMoney(getProcessSum(proc.items).exp)}</td>
                                                            <td className="right">{displayMoney(getProcessSum(proc.items).total)}</td>
                                                            <td></td>
                                                            <td className="no-print"></td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                            {pageIdx === chunks.length - 1 && (
                                                <div className="no-print" style={{marginTop:'10px', textAlign:'right'}}>
                                                    <button className="est-btn" onClick={() => addItemToProcess(proc.id)}>+ 행 추가</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ));
                            })}
                        </div>
                    </div>
                </div>

                {/* 설정 패널들 (이전과 동일) */}
                {configMode === 'save' && (
                    <div className="est-config-panel">
                        <div className="est-panel-title">견적서 양식 저장</div>
                        <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="양식 이름 입력" className="est-input" />
                        <button className="est-btn primary" onClick={createNewTemplate} style={{marginTop:'10px'}}>저장하기</button>
                        <button className="est-btn" onClick={() => setConfigMode('none')} style={{marginTop:'5px'}}>취소</button>
                    </div>
                )}
                {configMode === 'load' && (
                    <div className="est-config-panel">
                        <div className="est-panel-title">저장된 견적서</div>
                        {templates.length === 0 ? <p style={{fontSize:'12px', color:'#666'}}>저장된 양식이 없습니다.</p> : 
                            templates.map(t => (
                                <div key={t.id} className="est-list-item">
                                    <span>{t.name}</span>
                                    <div>
                                        <button className="est-btn small" onClick={() => applyTemplate(t)} style={{marginRight:'5px'}}>불러오기</button>
                                        <button className="est-btn-del" onClick={async () => {
                                            if(confirm("삭제하시겠습니까?")) {
                                                await deleteDoc(doc(db, 'users', partnerUid, 'estimateTemplates', t.id));
                                                loadTemplates();
                                            }
                                        }}>삭제</button>
                                    </div>
                                </div>
                            ))
                        }
                        <button className="est-btn" onClick={() => setConfigMode('none')} style={{marginTop:'10px'}}>닫기</button>
                    </div>
                )}
                {configMode === 'rate' && (
                    <div className="est-config-panel" style={{height:'500px', overflowY:'auto'}}>
                        <div className="est-panel-title">제경비 요율 설정 (%)</div>
                        <div className="est-field"><label>간접재료비</label><input type="number" value={rateConfig.indirectMaterial} onChange={e => setRateConfig({...rateConfig, indirectMaterial: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>간접노무비</label><input type="number" value={rateConfig.indirectLabor} onChange={e => setRateConfig({...rateConfig, indirectLabor: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>산재보험료</label><input type="number" value={rateConfig.industrialAccident} onChange={e => setRateConfig({...rateConfig, industrialAccident: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>고용보험료</label><input type="number" value={rateConfig.employment} onChange={e => setRateConfig({...rateConfig, employment: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>국민건강보험료</label><input type="number" value={rateConfig.health} onChange={e => setRateConfig({...rateConfig, health: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>국민연금보험료</label><input type="number" value={rateConfig.pension} onChange={e => setRateConfig({...rateConfig, pension: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>노인장기요양보험료</label><input type="number" value={rateConfig.oldAge} onChange={e => setRateConfig({...rateConfig, oldAge: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>산업안전보건관리비</label><input type="number" value={rateConfig.safety} onChange={e => setRateConfig({...rateConfig, safety: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>기타경비</label><input type="number" value={rateConfig.otherExp} onChange={e => setRateConfig({...rateConfig, otherExp: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>일반관리비</label><input type="number" value={rateConfig.generalAdmin} onChange={e => setRateConfig({...rateConfig, generalAdmin: Number(e.target.value)})} /></div>
                        <div className="est-field"><label>이윤</label><input type="number" value={rateConfig.profit} onChange={e => setRateConfig({...rateConfig, profit: Number(e.target.value)})} /></div>
                        <button className="est-btn" onClick={() => setConfigMode('none')}>닫기</button>
                    </div>
                )}
                {configMode === 'basic' && (
                    <div className="est-config-panel">
                        <div className="est-panel-title">기본 설정</div>
                        <div className="est-field"><label>상호명</label><input value={basicConfig.companyName} onChange={e => setBasicConfig({...basicConfig, companyName: e.target.value})} /></div>
                        <div className="est-field"><label>대표자명</label><input value={basicConfig.ownerName} onChange={e => setBasicConfig({...basicConfig, ownerName: e.target.value})} /></div>
                        <div className="est-field"><label>사업자번호</label><input value={basicConfig.bizNum} onChange={e => setBasicConfig({...basicConfig, bizNum: e.target.value})} /></div>
                        <div className="est-field"><label>주소</label><input value={basicConfig.address} onChange={e => setBasicConfig({...basicConfig, address: e.target.value})} /></div>
                        <div className="est-field"><label>로고 이미지</label><input type="file" accept="image/*" onChange={handleLogoUpload} /></div>
                        <button className="est-btn" onClick={() => setConfigMode('none')}>닫기</button>
                    </div>
                )}
                {configMode === 'column' && (
                    <div className="est-config-panel">
                        <div className="est-panel-title">열 너비 설정 (px)</div>
                        <div className="est-field"><label>명칭</label><input type="number" value={colWidths[0]} onChange={e=> { const n = [...colWidths]; n[0] = Number(e.target.value); setColWidths(n); }} /></div>
                        <div className="est-field"><label>규격</label><input type="number" value={colWidths[1]} onChange={e=> { const n = [...colWidths]; n[1] = Number(e.target.value); setColWidths(n); }} /></div>
                        <button className="est-btn" onClick={() => setConfigMode('none')}>닫기</button>
                    </div>
                )}
                {configMode === 'process' && (
                    <div className="est-config-panel">
                        <div className="est-panel-title">공종(페이지) 추가</div>
                        <div className="est-field"><input id="newProcName" placeholder="예: 철거공사" /><button className="est-btn primary" onClick={() => { const el = document.getElementById('newProcName') as HTMLInputElement; addProcess(el.value); el.value = ''; }}>추가</button></div>
                        <div style={{maxHeight:'200px', overflowY:'auto', marginTop:'10px'}}>
                            {processes.map((p, i) => (<div key={p.id} className="est-list-item"><span>{i+1}. {p.name}</span><button className="est-btn-del" onClick={() => setProcesses(prev => prev.filter(x => x.id !== p.id))}>삭제</button></div>))}
                        </div>
                        <button className="est-btn" onClick={() => setConfigMode('none')} style={{marginTop:'10px'}}>닫기</button>
                    </div>
                )}

            </div>
        </div>
    );
};

export default EstimateModal;