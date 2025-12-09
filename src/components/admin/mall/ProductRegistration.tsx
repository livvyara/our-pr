import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import './MallCommon.css';

// [수정] 직접 정의 (오류 해결)
interface Supplier {
    id: string;
    name: string;      
    contactPerson: string; 
    phone: string;     
    email: string;     
    address: string;   
    memo: string;      
    createdAt: any;
}

interface Category {
    id: string;
    name: string;
    level: 1 | 2 | 3 | 4; 
    parentId: string | null; 
    path: string; 
}

const ProductRegistration: React.FC = () => {
    const db = getFirestore();
    const storage = getStorage();
    
    // 데이터 State
    const [categories, setCategories] = useState<Category[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    
    // 입력 State
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [description, setDescription] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    
    // 카테고리 선택 State
    const [selL1, setSelL1] = useState('');
    const [selL2, setSelL2] = useState('');
    const [selL3, setSelL3] = useState('');
    const [selL4, setSelL4] = useState('');

    // 거래처 선택 State
    const [supplierSearch, setSupplierSearch] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [showSupplierList, setShowSupplierList] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const loadData = async () => {
            const catQ = query(collection(db, 'categories'), orderBy('name', 'asc'));
            const catSnap = await getDocs(catQ);
            setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));

            const supQ = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
            const supSnap = await getDocs(supQ);
            setSuppliers(supSnap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
        };
        loadData();
    }, []);

    // 카테고리 필터링
    const listL1 = categories.filter(c => c.level === 1);
    const listL2 = categories.filter(c => c.level === 2 && c.parentId === selL1);
    const listL3 = categories.filter(c => c.level === 3 && c.parentId === selL2);
    const listL4 = categories.filter(c => c.level === 4 && c.parentId === selL3);

    // 거래처 검색 필터링
    const filteredSuppliers = suppliers.filter(s => s.name.includes(supplierSearch));

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setPreviewUrl(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !imageFile) return alert("상품명과 이미지는 필수입니다.");
        if (!selectedSupplier) return alert("발주 담당 거래처를 선택해주세요.");
        if (!selL1) return alert("최소한 대분류는 선택해야 합니다.");

        setIsSubmitting(true);
        try {
            const storageRef = ref(storage, `admin_products/${Date.now()}_${imageFile.name}`);
            await uploadBytes(storageRef, imageFile);
            const imageUrl = await getDownloadURL(storageRef);

            // 카테고리 경로 생성
            const c1 = categories.find(c => c.id === selL1);
            const c2 = categories.find(c => c.id === selL2);
            const c3 = categories.find(c => c.id === selL3);
            const c4 = categories.find(c => c.id === selL4);
            const categoryPath = [c1?.name, c2?.name, c3?.name, c4?.name].filter(Boolean).join(' > ');

            await addDoc(collection(db, 'products'), {
                name,
                price: Number(price.replace(/,/g, '')),
                description,
                imageUrl,
                supplierId: selectedSupplier.id,
                supplierName: selectedSupplier.name,
                categoryPath, // 검색용 전체 경로
                categoryIds: { l1: selL1, l2: selL2, l3: selL3, l4: selL4 },
                isPublic: true,
                registeredBy: 'admin',
                createdAt: serverTimestamp()
            });

            alert("상품이 등록되었습니다.");
            
            // 초기화
            setName(''); setPrice(''); setDescription('');
            setImageFile(null); setPreviewUrl(null);
            setSelL1(''); setSelL2(''); setSelL3(''); setSelL4('');
            setSelectedSupplier(null); setSupplierSearch('');
            if(fileInputRef.current) fileInputRef.current.value = '';
            
        } catch (e) { console.error(e); alert("등록 실패"); } 
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="mall-sub-page">
            <h3>📦 상품 신규 등록</h3>
            <form className="mall-form" onSubmit={handleSubmit}>
                <div className="mall-form-left">
                    <div className="img-upload-box" onClick={() => fileInputRef.current?.click()}>
                        {previewUrl ? <img src={previewUrl} alt="preview" /> : <span>+ 이미지 업로드</span>}
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" hidden />
                </div>
                
                <div className="mall-form-right">
                    {/* 카테고리 선택 (4단계) */}
                    <div className="form-group">
                        <label>카테고리 지정</label>
                        <div className="cat-select-row">
                            <select value={selL1} onChange={e=>{setSelL1(e.target.value); setSelL2(''); setSelL3(''); setSelL4('');}}>
                                <option value="">1차 분류</option>
                                {listL1.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select value={selL2} onChange={e=>{setSelL2(e.target.value); setSelL3(''); setSelL4('');}} disabled={!selL1}>
                                <option value="">2차 분류</option>
                                {listL2.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select value={selL3} onChange={e=>{setSelL3(e.target.value); setSelL4('');}} disabled={!selL2}>
                                <option value="">3차 분류</option>
                                {listL3.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select value={selL4} onChange={e=>setSelL4(e.target.value)} disabled={!selL3}>
                                <option value="">4차 분류</option>
                                {listL4.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* 거래처 검색 */}
                    <div className="form-group relative">
                        <label>발주 담당 업체 (거래처)</label>
                        <input 
                            type="text" 
                            value={supplierSearch} 
                            onChange={e => { setSupplierSearch(e.target.value); setShowSupplierList(true); }}
                            onFocus={() => setShowSupplierList(true)}
                            placeholder="거래처명 검색..." 
                            className={selectedSupplier ? 'input-selected' : ''}
                        />
                        {selectedSupplier && <span className="selected-badge">선택됨: {selectedSupplier.name}</span>}
                        
                        {showSupplierList && supplierSearch && (
                            <ul className="search-dropdown">
                                {filteredSuppliers.map(s => (
                                    <li key={s.id} onClick={() => { setSelectedSupplier(s); setSupplierSearch(s.name); setShowSupplierList(false); }}>
                                        {s.name} <span className="sub-text">({s.contactPerson})</span>
                                    </li>
                                ))}
                                {filteredSuppliers.length === 0 && <li className="no-result">결과 없음</li>}
                            </ul>
                        )}
                    </div>

                    <div className="form-group">
                        <label>상품명</label>
                        <input type="text" value={name} onChange={e=>setName(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>가격 (원)</label>
                        <input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group">
                        <label>상세 설명</label>
                        <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} />
                    </div>

                    <button type="submit" className="btn-submit" disabled={isSubmitting}>
                        {isSubmitting ? "저장 중..." : "상품 등록 완료"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ProductRegistration;