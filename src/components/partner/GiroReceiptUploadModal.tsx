import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, query, getDocs, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../firebase-config';
import './GiroReceiptUploadModal.css';

interface Props {
    partnerUid: string;
    onClose: () => void;
    onSuccess: () => void;
}

const EXPENSE_CATEGORIES: { [key: string]: string[] } = {
    '자재비': ['건축자재', '철물/공구', '목재/석재', '타일/도기', '전기/조명', '페인트/방수', '기타자재'],
    '노무비': ['일용직임금', '용역비', '식대(노무)', '간식비'],
    '경비': ['식대(직원)', '회식비', '유류비', '통행료', '주차비', '숙박비', '접대비', '비품/소모품', '통신비', '공과금', '임차료', '보험료', '수수료', '기타경비'],
    '외주비': ['외주용역', '운반비', '장비사용료', '폐기물처리비'],
};

interface SiteOption {
    id: string;
    siteName: string;
}

const GiroReceiptUploadModal: React.FC<Props> = ({ partnerUid, onClose, onSuccess }) => {
    const db = getFirestore();
    const storage = getStorage();
    
    const [sites, setSites] = useState<SiteOption[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState('');
    
    const [category1, setCategory1] = useState('');
    const [category2, setCategory2] = useState('');
    
    const [usage, setUsage] = useState(''); 
    const [amount, setAmount] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountOwner, setAccountOwner] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchSites = async () => {
            try {
                const q = query(collection(db, 'users', partnerUid, 'sites'), orderBy('createdAt', 'desc'));
                const snap = await getDocs(q);
                const list = snap.docs.map(d => ({ 
                    id: d.id, 
                    siteName: d.data().siteName || '이름 없음' 
                }));
                setSites(list);
            } catch (e) {
                console.error("현장 로딩 실패:", e);
            }
        };
        fetchSites();
    }, [partnerUid, db]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result as string);
            reader.readAsDataURL(f);
        }
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        setAmount(val ? Number(val).toLocaleString() : '');
    };

    const handleSubmit = async () => {
        if (!amount || !bankName || !accountNumber || !file) return alert("필수 정보(금액, 계좌, 사진)를 입력해주세요.");
        if (!selectedSiteId) return alert("귀속될 현장을 선택해주세요. (현장이 없다면 '미지정' 선택)");
        if (!category1 || !category2) return alert("지출 카테고리(1차, 2차)를 선택해주세요.");

        if (!confirm("지출 등록을 요청하시겠습니까?")) return;

        setIsSubmitting(true);
        try {
            const storageRef = ref(storage, `users/${partnerUid}/giro_receipts/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const imageUrl = await getDownloadURL(storageRef);

            // [수정] 현장 이름 결정 로직
            let siteNameStr = '';
            if (selectedSiteId === 'unassigned') {
                siteNameStr = '미지정 (공통)';
            } else {
                const targetSite = sites.find(s => s.id === selectedSiteId);
                siteNameStr = targetSite ? targetSite.siteName : '알수없음';
            }

            await addDoc(collection(db, 'users', partnerUid, 'GIRO_REQUESTS'), {
                requesterName: auth.currentUser?.displayName || '직원',
                requesterUid: auth.currentUser?.uid,
                
                siteId: selectedSiteId,
                siteName: siteNameStr,
                
                category1,
                category2,
                usage,
                
                amount: parseInt(amount.replace(/,/g, ''), 10),
                bankName,
                accountNumber,
                accountOwner,
                imageUrl,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            alert("등록되었습니다.");
            onSuccess();
        } catch (e) {
            console.error(e);
            alert("등록 중 오류가 발생했습니다.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="giro-modal-wrapper">
            <div className="grm-overlay">
                <div className="grm-content">
                    <div className="grm-header">
                        <h3>🧾 지출 증빙/결제 요청</h3>
                        <button className="grm-close" onClick={onClose}>×</button>
                    </div>
                    <div className="grm-body">
                        <div className="grm-row">
                            <div className="grm-upload-box">
                                {preview ? (
                                    <img src={preview} alt="preview" />
                                ) : (
                                    <div className="grm-placeholder">
                                        <span>📸</span>
                                        <p>영수증/지로 사진 첨부</p>
                                    </div>
                                )}
                                <input type="file" accept="image/*" onChange={handleFileChange} />
                            </div>

                            <div className="grm-inputs">
                                {/* [수정] 현장 선택 + 미지정 옵션 추가 */}
                                <div className="grm-group">
                                    <label>현장 귀속 <span className="req">*</span></label>
                                    <select 
                                        value={selectedSiteId} 
                                        onChange={e => setSelectedSiteId(e.target.value)}
                                        className="grm-select"
                                    >
                                        <option value="">현장을 선택하세요</option>
                                        <option value="unassigned">미지정 (공통/본사)</option>
                                        {sites.map(site => (
                                            <option key={site.id} value={site.id}>{site.siteName}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grm-group-row">
                                    <div className="grm-group flex-1">
                                        <label>1차 분류 <span className="req">*</span></label>
                                        <select 
                                            value={category1} 
                                            onChange={e => { setCategory1(e.target.value); setCategory2(''); }}
                                            className="grm-select"
                                        >
                                            <option value="">선택</option>
                                            {Object.keys(EXPENSE_CATEGORIES).map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grm-group flex-1">
                                        <label>2차 분류 <span className="req">*</span></label>
                                        <select 
                                            value={category2} 
                                            onChange={e => setCategory2(e.target.value)}
                                            className="grm-select"
                                            disabled={!category1}
                                        >
                                            <option value="">선택</option>
                                            {category1 && EXPENSE_CATEGORIES[category1]?.map(sub => (
                                                <option key={sub} value={sub}>{sub}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grm-group">
                                    <label>상세 내용 (적요)</label>
                                    <input type="text" value={usage} onChange={e => setUsage(e.target.value)} placeholder="예: 타일 자재비 (을지로상사)" />
                                </div>

                                <div className="grm-group">
                                    <label>결제 요청 금액 <span className="req">*</span></label>
                                    <input type="text" value={amount} onChange={handleAmountChange} placeholder="0" className="right bold-input" />
                                </div>
                            </div>
                        </div>
                        
                        <div className="grm-divider"></div>
                        
                        <div className="grm-bank-section">
                            <h4>입금 계좌 정보</h4>
                            <div className="grm-bank-row">
                                <input type="text" placeholder="은행명" value={bankName} onChange={e => setBankName(e.target.value)} style={{width:'80px'}} />
                                <input type="text" placeholder="계좌번호" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} style={{flex:1}} />
                                <input type="text" placeholder="예금주" value={accountOwner} onChange={e => setAccountOwner(e.target.value)} style={{width:'100px'}} />
                            </div>
                        </div>
                    </div>

                    <div className="grm-footer">
                        <button className="btn-cancel" onClick={onClose}>취소</button>
                        <button className="btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting ? '처리 중...' : '등록 요청'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GiroReceiptUploadModal;