import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import './MallCommon.css';

// [수정] 외부 import 대신 여기서 직접 정의 (오류 원천 차단)
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

const SupplierManagement: React.FC = () => {
    const db = getFirestore();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 입력 폼
    const [form, setForm] = useState({
        name: '', contactPerson: '', phone: '', email: '', address: '', memo: ''
    });

    const fetchSuppliers = async () => {
        try {
            const q = query(collection(db, 'suppliers'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchSuppliers(); }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name) return alert("거래처명은 필수입니다.");

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'suppliers'), {
                ...form,
                createdAt: serverTimestamp()
            });
            alert("거래처가 등록되었습니다.");
            setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', memo: '' });
            fetchSuppliers();
        } catch (e) {
            console.error(e);
            alert("등록 실패");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, 'suppliers', id));
        fetchSuppliers();
    };

    return (
        <div className="mall-sub-page">
            <h3>🏢 거래처(발주처) 관리</h3>
            
            <form className="mall-form" onSubmit={handleSubmit}>
                <div className="mall-form-full">
                    <div className="form-group-row">
                        <div className="form-group">
                            <label>거래처명 <span className="req">*</span></label>
                            <input name="name" value={form.name} onChange={handleChange} required placeholder="(주)ABC상사" />
                        </div>
                        <div className="form-group">
                            <label>담당자</label>
                            <input name="contactPerson" value={form.contactPerson} onChange={handleChange} placeholder="홍길동 과장" />
                        </div>
                    </div>
                    <div className="form-group-row">
                        <div className="form-group">
                            <label>연락처</label>
                            <input name="phone" value={form.phone} onChange={handleChange} placeholder="010-0000-0000" />
                        </div>
                        <div className="form-group">
                            <label>이메일</label>
                            <input name="email" value={form.email} onChange={handleChange} placeholder="abc@email.com" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>주소</label>
                        <input name="address" value={form.address} onChange={handleChange} placeholder="서울시 강남구..." />
                    </div>
                    <div className="form-group">
                        <label>메모</label>
                        <textarea name="memo" value={form.memo} onChange={handleChange} rows={2} />
                    </div>
                    <button type="submit" className="btn-submit" disabled={isSubmitting}>
                        {isSubmitting ? '저장 중...' : '거래처 등록'}
                    </button>
                </div>
            </form>

            <div className="list-area">
                <h4>등록된 거래처 ({suppliers.length})</h4>
                <table className="mall-table">
                    <thead>
                        <tr>
                            <th>거래처명</th><th>담당자</th><th>연락처</th><th>주소</th><th>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {suppliers.map(s => (
                            <tr key={s.id}>
                                <td>{s.name}</td>
                                <td>{s.contactPerson}</td>
                                <td>{s.phone}</td>
                                <td>{s.address}</td>
                                <td><button className="btn-del" onClick={() => handleDelete(s.id)}>삭제</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SupplierManagement;