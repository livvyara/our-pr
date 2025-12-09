import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import './MallCommon.css';

// [수정] 직접 정의
interface Category {
    id: string;
    name: string;
    level: 1 | 2 | 3 | 4; 
    parentId: string | null; 
    path: string; 
}

const CategoryManagement: React.FC = () => {
    const db = getFirestore();
    const [categories, setCategories] = useState<Category[]>([]);
    
    // 선택된 상위 카테고리들
    const [selL1, setSelL1] = useState<string>('');
    const [selL2, setSelL2] = useState<string>('');
    const [selL3, setSelL3] = useState<string>('');
    
    // 신규 추가 입력
    const [newName, setNewName] = useState('');

    const fetchCategories = async () => {
        try {
            const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
            const snap = await getDocs(q);
            setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchCategories(); }, []);

    // 등록 핸들러
    const handleAdd = async () => {
        if (!newName.trim()) return alert("카테고리명을 입력해주세요.");
        
        let parentId: string | null = null;
        let level: 1|2|3|4 = 1;
        let path = newName;

        // 레벨 결정 로직
        if (!selL1) {
            level = 1;
        } else if (!selL2) {
            level = 2; parentId = selL1;
            path = `${categories.find(c => c.id === selL1)?.name} > ${newName}`;
        } else if (!selL3) {
            level = 3; parentId = selL2;
            path = `${categories.find(c => c.id === selL1)?.name} > ${categories.find(c => c.id === selL2)?.name} > ${newName}`;
        } else {
            level = 4; parentId = selL3;
            path = `${categories.find(c => c.id === selL1)?.name} > ${categories.find(c => c.id === selL2)?.name} > ${categories.find(c => c.id === selL3)?.name} > ${newName}`;
        }

        try {
            await addDoc(collection(db, 'categories'), {
                name: newName,
                level,
                parentId,
                path,
                createdAt: serverTimestamp()
            });
            setNewName('');
            fetchCategories();
        } catch (e) { alert("추가 실패"); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, 'categories', id));
        fetchCategories();
    };

    // 필터링된 목록
    const listL1 = categories.filter(c => c.level === 1);
    const listL2 = categories.filter(c => c.level === 2 && c.parentId === selL1);
    const listL3 = categories.filter(c => c.level === 3 && c.parentId === selL2);
    const listL4 = categories.filter(c => c.level === 4 && c.parentId === selL3);

    return (
        <div className="mall-sub-page">
            <h3>🗂️ 카테고리 관리 (4단계)</h3>
            <p className="guide-text">상위 카테고리를 선택 후 하위 카테고리를 추가하거나 삭제하세요.</p>

            <div className="cat-manager-grid">
                {/* 1단계 */}
                <div className="cat-column">
                    <h4>대분류 (1)</h4>
                    <div className="cat-list">
                        {listL1.map(c => (
                            <div key={c.id} className={`cat-item ${selL1 === c.id ? 'active' : ''}`} onClick={() => { setSelL1(c.id); setSelL2(''); setSelL3(''); }}>
                                {c.name} <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>x</button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2단계 */}
                <div className="cat-column">
                    <h4>소분류 (2)</h4>
                    {selL1 ? (
                        <div className="cat-list">
                            {listL2.map(c => (
                                <div key={c.id} className={`cat-item ${selL2 === c.id ? 'active' : ''}`} onClick={() => { setSelL2(c.id); setSelL3(''); }}>
                                    {c.name} <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>x</button>
                                </div>
                            ))}
                        </div>
                    ) : <div className="cat-placeholder">대분류를 선택하세요</div>}
                </div>

                {/* 3단계 */}
                <div className="cat-column">
                    <h4>소소분류 (3)</h4>
                    {selL2 ? (
                        <div className="cat-list">
                            {listL3.map(c => (
                                <div key={c.id} className={`cat-item ${selL3 === c.id ? 'active' : ''}`} onClick={() => setSelL3(c.id)}>
                                    {c.name} <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>x</button>
                                </div>
                            ))}
                        </div>
                    ) : <div className="cat-placeholder">소분류를 선택하세요</div>}
                </div>

                {/* 4단계 */}
                <div className="cat-column">
                    <h4>소소소분류 (4)</h4>
                    {selL3 ? (
                        <div className="cat-list">
                            {listL4.map(c => (
                                <div key={c.id} className="cat-item">
                                    {c.name} <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>x</button>
                                </div>
                            ))}
                        </div>
                    ) : <div className="cat-placeholder">소소분류를 선택하세요</div>}
                </div>
            </div>

            <div className="cat-add-box">
                <span className="add-target">
                    {!selL1 ? "대분류(1단계)" : !selL2 ? "소분류(2단계)" : !selL3 ? "소소분류(3단계)" : "소소소분류(4단계)"}
                    추가 : 
                </span>
                <input 
                    type="text" 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)} 
                    placeholder="카테고리명 입력" 
                />
                <button onClick={handleAdd} className="btn-add-cat">추가</button>
            </div>
        </div>
    );
};

export default CategoryManagement;